import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { refinePrompt } from "@/lib/services/prompts";
import { limits } from "@/lib/security/ratelimit";

const Body = z.object({ instruction: z.string().trim().min(3).max(2000) });

export const POST = authed<{ id: string; pid: string }>(async (req, user, { id, pid }) => {
  const project = await requireProject(user.id, id);
  const { instruction } = await parseBody(req, Body);
  await limits.model(user.id);
  return { prompt: await refinePrompt(user.id, project, pid, instruction) };
});

export const maxDuration = 120;
