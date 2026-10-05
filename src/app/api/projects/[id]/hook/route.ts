import { authed } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { createHook, deleteHook } from "@/lib/services/hooks";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const project = await requireProject(user.id, id);
  return { path: `/api/hooks/${await createHook(user.id, project.id)}` };
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  const project = await requireProject(user.id, id);
  await deleteHook(user.id, project.id);
  return { ok: true };
});
