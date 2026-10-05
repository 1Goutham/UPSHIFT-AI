import { z } from "zod";
import { authedOrToken, errorResponse, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { refinePrompt } from "@/lib/refine/engine";
import { MODES, PLATFORM_IDS } from "@/lib/refine/platforms";
import { limits } from "@/lib/security/ratelimit";

const Body = z.object({
  prompt: z.string().max(12_000),
  platform: z.enum(PLATFORM_IDS).default("other"),
  mode: z.enum(MODES).default("quick"),
  /** Store this refinement in the user's history (off unless the user turned it on). */
  save: z.boolean().default(false),
  source: z.enum(["extension", "web"]).default("web"),
  /** Stream the refined prompt as it is written (newline-delimited JSON). */
  stream: z.boolean().default(false),
});

type Input = z.infer<typeof Body>;
type User = { id: string; isGuest: boolean };

async function run(body: Input, user: User, onRefined?: (soFar: string) => void) {
  const result = await refinePrompt({ prompt: body.prompt, platform: body.platform, mode: body.mode, userId: user.id }, onRefined);
  let id: string | null = null;
  if (body.save && !user.isGuest) {
    const db = await getDb();
    const [row] = await db
      .insert(schema.refinements)
      .values({ userId: user.id, platform: body.platform, mode: body.mode, source: body.source, original: body.prompt.trim(), refined: result.refined, result: result as unknown as Record<string, unknown>, model: result.model })
      .returning({ id: schema.refinements.id });
    id = row.id;
  }
  return { ...result, id };
}

/**
 * Analyse + refine a prompt. Used by the extension (bearer token) and the web
 * Prompt Lab (session). With `stream: true` the response is NDJSON:
 *   {"type":"delta","refined":"..."}  the refined prompt so far (display only)
 *   {"type":"done","result":{...}}    the validated result
 *   {"type":"error","status":502,"error":"..."}
 * Validation and rate limits run first, so those still fail with a normal status.
 */
export const POST = authedOrToken(async (req, user) => {
  const body = await parseBody(req, Body);
  await (user.isGuest ? limits.guestModel(user.id) : limits.model(user.id));
  if (!body.stream) return run(body, user);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      let last = 0;
      let lastText = "";
      try {
        const result = await run(body, user, (soFar) => {
          // At most ~20 updates a second; the final text always arrives in "done".
          const now = Date.now();
          if (now - last < 50 || soFar === lastText) return;
          last = now;
          lastText = soFar;
          send({ type: "delta", refined: soFar });
        });
        send({ type: "done", result });
      } catch (err) {
        const res = errorResponse(err);
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        send({ type: "error", status: res.status, error: data.error ?? "Couldn't refine this prompt right now. Try again." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
});

export const maxDuration = 120;
