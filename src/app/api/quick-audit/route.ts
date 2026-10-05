import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { ApiError, assertSameOrigin, errorResponse, parseBody } from "@/lib/api";
import { createGuest, currentUser } from "@/lib/auth/session";
import { cleanupGuests, logEvent } from "@/lib/repo/projects";
import { addUrlArtifact } from "@/lib/services/artifacts";
import { runEvaluation, startEvaluation } from "@/lib/services/audit";
import { limits } from "@/lib/security/ratelimit";

const Body = z.object({ url: z.string().trim().min(4).max(2000), goal: z.string().max(4000).default("") });

/**
 * The front door: paste a URL, get an audit. Works without an account by
 * creating a temporary guest; sign-up later keeps everything.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const body = await parseBody(req, Body);
    const raw = /^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`;

    let user = await currentUser();
    if (!user) {
      await limits.guest(ip);
      user = await createGuest();
      if (Math.random() < 0.1) after(() => cleanupGuests().catch(() => {}));
    }
    if (user.isGuest) await limits.guestAudit(user.id);
    else await limits.audit(user.id);

    let host = raw;
    try {
      host = new URL(raw).hostname;
    } catch {
      throw new ApiError(400, "That is not a valid URL.");
    }
    const db = await getDb();
    const [project] = await db
      .insert(schema.projects)
      .values({ userId: user.id, name: host.replace(/^www\./, ""), goal: body.goal, contentType: "website" })
      .returning();
    await logEvent(user.id, project.id, "project.created", { via: "quick-audit" });
    const artifact = await addUrlArtifact(user.id, project, raw, { label: "", note: "" }).catch(async (err) => {
      await db.delete(schema.projects).where((await import("drizzle-orm")).eq(schema.projects.id, project.id));
      throw err;
    });
    const { evaluation } = await startEvaluation(user.id, project.id, artifact.id);
    after(() => runEvaluation(user.id, evaluation.id));
    return NextResponse.json({ projectId: project.id });
  } catch (err) {
    return errorResponse(err);
  }
}

export const maxDuration = 300;
