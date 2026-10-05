import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { generateBrief } from "@/lib/services/intent";
import { limits } from "@/lib/security/ratelimit";
import { providerStatus } from "@/lib/ai/provider";

const Body = z.object({ prompt: z.string().max(20000).default(""), useModel: z.boolean().default(true) });

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const project = await requireProject(user.id, id);
  const body = await parseBody(req, Body);
  if (body.useModel && providerStatus().configured) await limits.model(user.id);
  const brief = await generateBrief(user.id, project, body);
  return { brief };
});

export const maxDuration = 120;
