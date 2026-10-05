import { z } from "zod";
import { authedOrToken, parseBody } from "@/lib/api";
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
});

/** Analyse + refine a prompt. Used by the extension (bearer token) and the web Prompt Lab (session). */
export const POST = authedOrToken(async (req, user) => {
  const body = await parseBody(req, Body);
  await (user.isGuest ? limits.guestModel(user.id) : limits.model(user.id));
  const result = await refinePrompt({ prompt: body.prompt, platform: body.platform, mode: body.mode, userId: user.id });
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
});

export const maxDuration = 120;
