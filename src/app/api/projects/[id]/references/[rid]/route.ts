import { authed, ApiError } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { deleteReferenceImage } from "@/lib/services/artifacts";

export const DELETE = authed<{ id: string; rid: string }>(async (_req, user, { id, rid }) => {
  const project = await requireProject(user.id, id);
  if (!/^[0-9a-f-]{36}$/i.test(rid)) throw new ApiError(404, "Reference not found.");
  await deleteReferenceImage(user.id, project, rid);
  return { ok: true };
});
