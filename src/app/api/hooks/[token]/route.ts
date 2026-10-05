import { after, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { fireHook } from "@/lib/services/hooks";
import { runEvaluation } from "@/lib/services/audit";

/** POST after each deploy. The token in the URL is the credential. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const run = await fireHook(token);
    after(() => runEvaluation(run.userId, run.evaluationId));
    return NextResponse.json({ ok: true, version: run.version });
  } catch (err) {
    return errorResponse(err);
  }
}

export const maxDuration = 300;
