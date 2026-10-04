"use client";

import { ArrowRight } from "lucide-react";
import { isFailing } from "@/lib/engines/taxonomy";
import { Asterisk } from "../ui";
import { latestEvaluation, type Ctx, type Tab } from "./types";

type Step = { title: string; body: string; tab?: Tab; action?: string };

function nextStep(ctx: Ctx): Step {
  const { ws } = ctx;
  const confirmed = ws.requirements.filter((r) => r.status === "confirmed");
  const proposed = ws.requirements.filter((r) => r.status === "proposed");
  const original = ws.prompts.find((p) => p.kind === "original");
  const improved = ws.prompts.find((p) => p.kind === "optimized" || p.kind === "refined");
  const latest = ws.artifacts[0];
  const ev = latest ? latestEvaluation(ws, latest.id) : null;
  const correction = ws.prompts.find((p) => p.kind === "correction");

  if (!ws.project.goal.trim() && !original) return { title: "Describe the result you want", body: "A sentence or two is enough. Who it's for and what it should do matter most.", tab: "brief", action: "Open brief" };
  if (!ws.project.brief.generatedAt && !confirmed.length) return { title: "Build the brief", body: "Turn your goal into checkable requirements. Everything later is measured against them.", tab: "brief", action: "Open brief" };
  if (proposed.length) return { title: `Review ${proposed.length} suggested requirement${proposed.length === 1 ? "" : "s"}`, body: "Suggestions do not count until you accept them. Edit anything that's not quite right.", tab: "brief", action: "Review" };
  if (!confirmed.length) return { title: "Confirm at least one requirement", body: "Audits and the structured prompt use confirmed requirements only.", tab: "brief", action: "Open brief" };
  if (!latest && original && !improved) return { title: "Improve your prompt", body: "See what's missing and get a sharper version before you run it.", tab: "prompt", action: "Open prompt" };
  if (!latest) return { title: "Add what the AI produced", body: "A live URL, a screenshot, or the text/code. It will be audited against your requirements.", tab: "outputs", action: "Add output" };
  if (ev?.status === "running") return { title: `Auditing v${latest.version}`, body: "Checks are running. Results appear here automatically.", tab: "outputs" };
  if (ev?.status === "failed") return { title: `Audit of v${latest.version} failed`, body: ev.error ?? "Retry from the Outputs tab.", tab: "outputs", action: "Open outputs" };
  if (ev?.status === "complete") {
    const failing = ws.findings.filter((f) => f.evaluationId === ev.id && isFailing(f.status));
    const untested = ws.findings.filter((f) => f.evaluationId === ev.id && f.checkKey.startsWith("req:") && f.status === "not_tested");
    const correctionIsNewer = correction && new Date(correction.createdAt) > new Date(latest.createdAt);
    if (failing.length && correctionIsNewer)
      return { title: `Run the correction, then add v${latest.version + 1}`, body: `Paste the correction prompt into ${ws.project.targetTool || "your AI tool"}, then add the new result to see what changed.`, tab: "outputs", action: "Add next version" };
    if (failing.length) return { title: `Fix ${failing.length} issue${failing.length === 1 ? "" : "s"} in v${latest.version}`, body: "Select issues and create a targeted correction prompt. It preserves what already works.", tab: "outputs", action: "Open findings" };
    if (untested.length) return { title: `${untested.length} requirement${untested.length === 1 ? "" : "s"} not tested`, body: "No automated method covered them. Check them yourself and mark them met or not met.", tab: "outputs", action: "Review" };
    if (ws.artifacts.length > 1) return { title: "Compare versions", body: "See what improved and what regressed since the last version.", tab: "compare", action: "Compare" };
    return { title: "Nothing failing", body: "Every tested requirement passed. Consider saving this as a playbook for next time.", tab: "outputs" };
  }
  return { title: "Run the audit", body: "This version has not been audited yet.", tab: "outputs", action: "Open outputs" };
}

export function NextStep({ ctx, compact = false }: { ctx: Ctx; compact?: boolean }) {
  const step = nextStep(ctx);
  const { ws, provider } = ctx;
  const confirmed = ws.requirements.filter((r) => r.status === "confirmed").length;

  if (compact)
    return (
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-line p-3">
        <Asterisk className="mt-1 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">{step.title}</p>
          <p className="text-xs text-ink-3">{step.body}</p>
        </div>
        {step.tab && step.action ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => ctx.setTab(step.tab!)}>
            {step.action}
          </button>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow mb-3">Next step</p>
        <p className="text-[15px] leading-snug text-ink">{step.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{step.body}</p>
        {step.tab && step.action ? (
          <button type="button" className="btn btn-ghost btn-sm group mt-3" onClick={() => ctx.setTab(step.tab!)}>
            {step.action} <ArrowRight className="nudge-x h-3.5 w-3.5" />
          </button>
        ) : null}
      </section>

      <section>
        <p className="eyebrow mb-3">Project</p>
        <dl className="space-y-2 text-sm">
          <Row k="Confirmed requirements" v={String(confirmed)} />
          <Row k="Prompt versions" v={String(ws.prompts.length)} />
          <Row k="Output versions" v={String(ws.artifacts.length)} />
        </dl>
      </section>

      <section>
        <p className="eyebrow mb-3">Reading results</p>
        <ul className="space-y-2 text-xs leading-relaxed text-ink-3">
          <li>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-pass align-middle" /> Filled marks come from deterministic checks, a real browser, or you.
          </li>
          <li>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full border-[1.5px] border-pass align-middle" /> Rings are model judgements: leads, not proof.
          </li>
          <li>
            <Asterisk className="mr-1.5 align-middle text-accent" /> The asterisk marks AI suggestions you haven&apos;t accepted.
          </li>
        </ul>
      </section>

      {!provider.configured ? (
        <section className="rounded-md border border-dashed border-line-strong p-3 text-xs leading-relaxed text-ink-3">
          No AI provider configured. Rule-based checks, browser checks, structured prompts and corrections still work. Add <code className="font-mono text-ink-2">ANTHROPIC_API_KEY</code> on the server for model briefs, rewrites and visual review.
        </section>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="font-mono text-ink">{v}</dd>
    </div>
  );
}
