import { after } from "next/server";
import { z } from "zod";
import { authed, ApiError, parseBody } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { addFileArtifact, addTextArtifact, addUrlArtifact } from "@/lib/services/artifacts";
import { runEvaluation, startEvaluation } from "@/lib/services/audit";
import { limits } from "@/lib/security/ratelimit";

const Json = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().trim().min(4).max(2000), label: z.string().max(120).default(""), note: z.string().max(2000).default("") }),
  z.object({
    kind: z.enum(["text", "code"]),
    text: z.string().max(600_000),
    label: z.string().max(120).default(""),
    note: z.string().max(2000).default(""),
  }),
]);

/**
 * Add a new version of the output and start auditing it. The audit runs after
 * the response is sent; the client polls the evaluation.
 */
export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const project = await requireProject(user.id, id);
  await (user.isGuest ? limits.guestAudit(user.id) : limits.audit(user.id));
  const type = req.headers.get("content-type") ?? "";
  let artifact;
  if (type.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No file received.");
    const label = String(form?.get("label") ?? "").slice(0, 120);
    const note = String(form?.get("note") ?? "").slice(0, 2000);
    artifact = await addFileArtifact(user.id, project, file, { label, note });
  } else {
    const body = await parseBody(req, Json);
    artifact =
      body.kind === "url"
        ? await addUrlArtifact(user.id, project, body.url, body)
        : await addTextArtifact(user.id, project, body.text, body, body.kind);
  }
  const { evaluation } = await startEvaluation(user.id, project.id, artifact.id);
  after(() => runEvaluation(user.id, evaluation.id));
  return { artifact, evaluation };
});

// Audits continue after the response (after()); allow time for the browser and model.
export const maxDuration = 300;
