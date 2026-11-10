import { z } from "zod";
import { authedOrToken, parseBody } from "@/lib/api";
import { PLATFORM_IDS } from "@/lib/refine/platforms";
import { limits } from "@/lib/security/ratelimit";
import { recordTokenEvent } from "@/lib/tokens/service";

const count = z.number().int().min(0).max(500_000);
const Body = z
  .object({
    method: z.literal("compress-local"),
    platform: z.enum(PLATFORM_IDS).default("other"),
    source: z.enum(["extension", "web"]).default("web"),
    before: count,
    after: count,
  })
  .refine((b) => b.after <= b.before, "after must not exceed before");

/** Records a local (in-browser) compression: two numbers, never the prompt. */
export const POST = authedOrToken(async (req, user) => {
  const body = await parseBody(req, Body);
  await limits.tokenEvent(user.id);
  await recordTokenEvent({ userId: user.id, ...body });
  return { ok: true };
});
