import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { setHumanVerdict } from "@/lib/services/audit";

const Body = z.object({ verdict: z.enum(["verified_pass", "verified_fail"]), note: z.string().max(1000).default("") });

/** Record the user's own review of a finding. */
export const POST = authed<{ id: string; fid: string }>(async (req, user, { id, fid }) => {
  const project = await requireProject(user.id, id);
  const body = await parseBody(req, Body);
  await setHumanVerdict(user.id, project.id, fid, body.verdict, body.note);
  return { ok: true };
});
