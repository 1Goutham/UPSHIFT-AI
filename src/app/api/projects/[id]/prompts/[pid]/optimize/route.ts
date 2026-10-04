import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { optimizePrompt } from "@/lib/services/prompts";
import { providerStatus } from "@/lib/ai/provider";
import { limits } from "@/lib/security/ratelimit";

const Body = z.object({ useModel: z.boolean().default(true) });

export const POST = authed<{ id: string; pid: string }>(async (req, user, { id, pid }) => {
  const project = await requireProject(user.id, id);
  const { useModel } = await parseBody(req, Body);
  if (useModel && providerStatus().configured) limits.model(user.id);
  return { prompt: await optimizePrompt(user.id, project, pid, useModel) };
});
