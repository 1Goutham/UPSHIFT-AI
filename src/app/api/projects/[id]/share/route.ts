import { authed } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { createShare, revokeShare } from "@/lib/services/share";

/** Create (or rotate) the read-only report link. */
export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const project = await requireProject(user.id, id);
  const token = await createShare(user.id, project.id);
  return { path: `/r/${token}` };
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  const project = await requireProject(user.id, id);
  await revokeShare(user.id, project.id);
  return { ok: true };
});
