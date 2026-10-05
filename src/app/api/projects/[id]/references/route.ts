import { authed, ApiError } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { addReferenceImage } from "@/lib/services/artifacts";

/** Upload one or more reference images (multipart, field "file"). */
export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const project = await requireProject(user.id, id);
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) throw new ApiError(400, "Send images as multipart form data.");
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) throw new ApiError(400, "No image received.");
  const references = [];
  for (const f of files.slice(0, 6)) references.push(await addReferenceImage(user.id, project, f));
  return { references };
});
