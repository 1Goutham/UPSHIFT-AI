import { z } from "zod";
import { authedOrToken, parseBody } from "@/lib/api";
import { PLATFORM_IDS } from "@/lib/refine/platforms";
import { limits } from "@/lib/security/ratelimit";
import { compressWithAI, recordTokenEvent } from "@/lib/tokens/service";

const Body = z.object({
  prompt: z.string().max(12_000),
  platform: z.enum(PLATFORM_IDS).default("other"),
  source: z.enum(["extension", "web"]).default("web"),
});

/** "Compress more": a model shortens the prompt; the result is checked for anything lost. */
export const POST = authedOrToken(async (req, user) => {
  const body = await parseBody(req, Body);
  await (user.isGuest ? limits.guestModel(user.id) : limits.model(user.id));
  const r = await compressWithAI({ prompt: body.prompt, platform: body.platform, userId: user.id });
  if (r.saved > 0) await recordTokenEvent({ userId: user.id, method: "compress-ai", platform: body.platform, source: body.source, before: r.before, after: r.after }).catch(() => {});
  return r;
});

export const maxDuration = 60;
