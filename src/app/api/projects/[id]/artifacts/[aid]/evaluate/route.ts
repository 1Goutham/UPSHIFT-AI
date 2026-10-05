import { after } from "next/server";
import { authed } from "@/lib/api";
import { requireProject } from "@/lib/repo/projects";
import { runEvaluation, startEvaluation } from "@/lib/services/audit";
import { limits } from "@/lib/security/ratelimit";

/** Re-run the audit on an existing version (e.g. after requirements changed). */
export const POST = authed<{ id: string; aid: string }>(async (_req, user, { id, aid }) => {
  const project = await requireProject(user.id, id);
  await (user.isGuest ? limits.guestAudit(user.id) : limits.audit(user.id));
  const { evaluation } = await startEvaluation(user.id, project.id, aid);
  after(() => runEvaluation(user.id, evaluation.id));
  return { evaluation };
});

// Audits continue after the response (after()); allow time for the browser and model.
export const maxDuration = 300;
