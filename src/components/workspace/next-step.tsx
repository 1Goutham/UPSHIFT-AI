"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isFailing } from "@/lib/engines/taxonomy";
import { Asterisk } from "../ui";
import { latestEvaluation, type Ctx, type Tab } from "./types";

type Step = { title: string; tab?: Tab; action?: string };

function nextStep(ctx: Ctx): Step {
  const { ws } = ctx;
  const confirmed = ws.requirements.filter((r) => r.status === "confirmed");
  const proposed = ws.requirements.filter((r) => r.status === "proposed");
  const original = ws.prompts.find((p) => p.kind === "original");
  const improved = ws.prompts.find((p) => p.kind === "optimized" || p.kind === "refined");
  const latest = ws.artifacts[0];
  const ev = latest ? latestEvaluation(ws, latest.id) : null;
  const correction = ws.prompts.find((p) => p.kind === "correction");

  if (!ws.project.goal.trim() && !original) return { title: "Describe the result you want", tab: "brief", action: "Brief" };
  if (!ws.project.brief.generatedAt && !confirmed.length) return { title: "Build the brief", tab: "brief", action: "Brief" };
  if (proposed.length) return { title: `Review ${proposed.length} suggested requirement${proposed.length === 1 ? "" : "s"}`, tab: "brief", action: "Review" };
  if (!confirmed.length) return { title: "Confirm at least one requirement", tab: "brief", action: "Brief" };
  if (!latest && original && !improved) return { title: "Improve your prompt", tab: "prompt", action: "Prompt" };
  if (!latest) return { title: "Add what the AI produced", tab: "outputs", action: "Add output" };
  if (ev?.status === "running") return { title: `Auditing v${latest.version}…` };
  if (ev?.status === "failed") return { title: `Audit of v${latest.version} failed`, tab: "outputs", action: "Retry" };
  if (ev?.status === "complete") {
    const failing = ws.findings.filter((f) => f.evaluationId === ev.id && isFailing(f.status));
    const untested = ws.findings.filter((f) => f.evaluationId === ev.id && f.checkKey.startsWith("req:") && f.status === "not_tested");
    const correctionIsNewer = correction && new Date(correction.createdAt) > new Date(latest.createdAt);
    if (failing.length && correctionIsNewer) return { title: `Run the correction, then add v${latest.version + 1}`, tab: "outputs", action: "Add version" };
    if (failing.length) return { title: `Fix ${failing.length} issue${failing.length === 1 ? "" : "s"} in v${latest.version}`, tab: "outputs", action: "Findings" };
    if (untested.length) return { title: `Check ${untested.length} untested requirement${untested.length === 1 ? "" : "s"}`, tab: "outputs", action: "Review" };
    if (ws.artifacts.length > 1) return { title: "Compare versions", tab: "compare", action: "Compare" };
    return { title: "Nothing failing" };
  }
  return { title: "Run the audit", tab: "outputs", action: "Outputs" };
}

/** One line: what to do next. */
export function NextStep({ ctx }: { ctx: Ctx }) {
  const step = nextStep(ctx);
  return (
    <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <Asterisk className="text-accent" />
      <span className="text-ink">{step.title}</span>
      {step.tab && step.action ? (
        <button type="button" className="group inline-flex items-center gap-1 text-ink-3 hover:text-ink" onClick={() => ctx.setTab(step.tab!)}>
          {step.action} <ArrowRight className="nudge-x h-3.5 w-3.5" />
        </button>
      ) : null}
      {!ctx.provider.configured ? (
        <Link href="/app/settings" className="ml-auto font-mono text-[11px] text-ink-3 hover:text-ink" title="No AI provider configured. Rule-based and browser checks still run.">
          model off
        </Link>
      ) : null}
    </div>
  );
}
