import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { saveOriginalPrompt } from "@/lib/services/prompts";

const Body = z.object({ content: z.string().trim().min(1).max(20000) });

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const project = await requireProject(user.id, id);
  const { content } = await parseBody(req, Body);
  return { prompt: await saveOriginalPrompt(user.id, project, content) };
});
