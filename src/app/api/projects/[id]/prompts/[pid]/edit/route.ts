import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { saveEditedPrompt } from "@/lib/services/prompts";

const Body = z.object({ content: z.string().trim().min(1).max(30000) });

export const POST = authed<{ id: string; pid: string }>(async (req, user, { id, pid }) => {
  const project = await requireProject(user.id, id);
  const { content } = await parseBody(req, Body);
  return { prompt: await saveEditedPrompt(user.id, project, pid, content) };
});
