import "server-only";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Artifact, EvaluationSummary } from "@/lib/db/schema";
import { fixOutcome } from "@/lib/engines/improve";
import { ApiError } from "@/lib/api";
import { generateStructured, INJECTION_RULE, ProviderError, ProviderNotConfiguredError, providerStatus, untrusted, type ContentBlock } from "@/lib/ai/provider";
import { getObject, putObject } from "@/lib/storage";
import { safeFetch, UnsafeUrlError } from "@/lib/security/ssrf";
import { crawlFindings, extractInternalLinks, pageFacts, runHtmlChecks, type CrawledPage } from "@/lib/engines/audit/html-checks";
import { runImageChecks, runTextChecks } from "@/lib/engines/audit/text-checks";
import { browserFindings, runBrowser } from "@/lib/engines/audit/browser";
import { linkRequirements, ModelAuditSchema, modelFindings, untestedFindings, type ReqSnapshot } from "@/lib/engines/audit/requirements";
import { enforceStatus, type FindingDraft } from "@/lib/engines/audit/types";
import { FINDING_STATUSES, SEVERITY_RANK, isFailing } from "@/lib/engines/taxonomy";
import { getRequirements, logEvent, touchProject } from "@/lib/repo/projects";
import { referenceBlocks } from "@/lib/services/artifacts";

const AUDIT_SYSTEM = `You are the output intelligence engine of UPSHIFT. You evaluate an AI-generated artefact against the user's confirmed requirements.

Rules:
- Judge only what you can actually see in the material provided. If something cannot be judged from it (e.g. hover states in a static screenshot, behaviour behind a login), use verdict "cannot_determine" and say what would be needed.
- Evidence must point at specific content: quote text, describe the location in the screenshot, or name the element.
- "partially_met" means some but not all of the requirement is satisfied; say which part is missing.
- Recommendations must be minimal and targeted: fix the specific issue, preserve everything else. Never recommend a full redesign unless the requirement cannot be met otherwise.
- Do not give an overall quality score.
- If reference images are attached after the artefact, they show the look the user wants. Judge visual requirements against them and report clear inconsistencies (colour, type, layout, density) as additional issues. Do not confuse references with the artefact.
- Some requirements were already settled by automated checks and are not listed; do not re-judge them.
- additionalIssues: only significant problems a reviewer would flag (broken layout, unreadable text, visual artefacts, inconsistent styling, wrong content). Mark matters of taste as "suggestion".
${INJECTION_RULE}`;

export async function startEvaluation(userId: string, projectId: string, artifactId: string) {
  const db = await getDb();
  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.projectId, projectId)))
    .limit(1);
  if (!artifact) throw new ApiError(404, "Output not found.");
  const reqs = (await getRequirements(projectId)).filter((r) => r.status === "confirmed");
  const [evaluation] = await db
    .insert(schema.evaluations)
    .values({
      projectId,
      artifactId,
      status: "running",
      requirementSnapshot: reqs.map((r) => ({ id: r.id, text: r.text, priority: r.priority, category: r.category, acceptance: r.acceptance })),
    })
    .returning();
  await logEvent(userId, projectId, "evaluation.started", { evaluationId: evaluation.id, version: artifact.version });
  return { evaluation, artifact };
}

/** Runs the whole pipeline; records failure on the evaluation instead of throwing. */
export async function runEvaluation(userId: string, evaluationId: string) {
  const db = await getDb();
  const [evaluation] = await db.select().from(schema.evaluations).where(eq(schema.evaluations.id, evaluationId)).limit(1);
  if (!evaluation) return;
  const [artifact] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, evaluation.artifactId)).limit(1);
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, evaluation.projectId)).limit(1);
  try {
    const result = await evaluate(userId, project.goal, project.contentType, artifact, evaluation.requirementSnapshot);
    const drafts = result.findings.map(enforceStatus);
    const counts = Object.fromEntries(FINDING_STATUSES.map((s) => [s, 0])) as Record<string, number>;
    for (const f of drafts) counts[f.status]++;
    const reqFindings = drafts.filter((f) => f.requirementId);
    const summary: EvaluationSummary = {
      counts,
      requirementCoverage: {
        total: evaluation.requirementSnapshot.length,
        verifiedPass: reqFindings.filter((f) => f.status === "verified_pass").length,
        likelyPass: reqFindings.filter((f) => f.status === "likely_pass").length,
        failing: reqFindings.filter((f) => isFailing(f.status)).length,
        untested: reqFindings.filter((f) => ["not_tested", "unable_to_verify", "subjective"].includes(f.status)).length,
      },
      methods: result.methods,
      limitations: result.limitations,
      screenshots: result.screenshots,
      model: result.model,
      pages: result.pages,
    };
    summary.fixTracking = await trackFix(project.id, project.targetTool, artifact, drafts);
    const ordered = drafts.sort(
      (a, b) =>
        Number(!isFailing(a.status)) - Number(!isFailing(b.status)) ||
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        Number(!a.requirementId) - Number(!b.requirementId),
    );
    await db.transaction(async (tx) => {
      if (ordered.length)
        await tx.insert(schema.findings).values(
          ordered.map((f, i) => ({
            evaluationId,
            checkKey: f.checkKey,
            requirementId: f.requirementId ?? null,
            title: f.title.slice(0, 500),
            detail: f.detail ?? "",
            status: f.status,
            severity: f.severity,
            evidence: (f.evidence ?? "").slice(0, 4000),
            recommendation: f.recommendation ?? "",
            verification: f.verification ?? "",
            method: f.method,
            category: f.category,
            position: i,
          })),
        );
      await tx.update(schema.evaluations).set({ status: "complete", summary, completedAt: new Date() }).where(eq(schema.evaluations.id, evaluationId));
    });
    await logEvent(userId, project.id, "evaluation.completed", { evaluationId, version: artifact.version, failing: summary.requirementCoverage?.failing });
  } catch (err) {
    const message = err instanceof UnsafeUrlError || err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Evaluation failed.";
    console.error("[audit] failed", err);
    await db.update(schema.evaluations).set({ status: "failed", error: message.slice(0, 500), completedAt: new Date() }).where(eq(schema.evaluations.id, evaluationId));
    await logEvent(userId, project.id, "evaluation.failed", { evaluationId, error: message.slice(0, 200) });
  }
  await touchProject(project.id);
}

type EvalResult = {
  findings: FindingDraft[];
  methods: { id: string; label: string; ran: boolean; note?: string }[];
  limitations: string[];
  screenshots: { name: string; width: number; key: string }[];
  model?: string;
  pages?: { url: string; status: number }[];
};

async function evaluate(userId: string, goal: string, contentType: string, artifact: Artifact, reqs: ReqSnapshot[]): Promise<EvalResult> {
  const findings: FindingDraft[] = [];
  const methods: EvalResult["methods"] = [];
  const limitations: string[] = [];
  const screenshots: EvalResult["screenshots"] = [];
  const modelContent: ContentBlock[] = [];
  let materialNote = "";
  let crawled: { url: string; status: number }[] | undefined;

  if (artifact.kind === "url") {
    const fetched = await safeFetch(artifact.sourceUrl!);
    const isHtml = /html|xml/i.test(fetched.contentType) || /^\s*<(!doctype|html)/i.test(fetched.body.subarray(0, 200).toString());
    let pageText = "";
    if (isHtml) {
      const html = fetched.body.toString("utf8");
      const { findings: hf, facts } = runHtmlChecks(html, fetched.finalUrl, fetched.status);
      findings.push(...hf);
      pageText = facts.text;
      methods.push({ id: "html", label: "Markup checks on served HTML", ran: true });
      if (fetched.truncated) limitations.push("The page was larger than 3 MB; only the first 3 MB of HTML was checked.");
      if (facts.clientRendered) limitations.push("The served HTML is mostly empty (client-rendered). Markup checks only saw the initial shell.");
    } else {
      methods.push({ id: "html", label: "Markup checks on served HTML", ran: false, note: `Response was ${fetched.contentType || "not HTML"}.` });
    }

    if (isHtml) {
      const html = fetched.body.toString("utf8");
      const links = extractInternalLinks(html, fetched.finalUrl, 8);
      if (links.length) {
        const pages = await crawl(links);
        findings.push(...crawlFindings(runHtmlChecks(html, fetched.finalUrl, fetched.status).facts.title, pages));
        crawled = pages.map((p) => ({ url: p.url, status: p.status }));
        methods.push({ id: "crawl", label: `${pages.length} linked page${pages.length === 1 ? "" : "s"} checked`, ran: true });
      }
    }

    const run = await runBrowser(fetched.finalUrl);
    findings.push(...browserFindings(run));
    methods.push({ id: "browser", label: "Headless Chromium at 390px and 1440px", ran: run.available, note: run.reason });
    if (run.renderedText) pageText = run.renderedText;
    for (const vp of run.viewports) {
      if (!vp.screenshot) continue;
      const key = await putObject(vp.screenshot, "jpg");
      screenshots.push({ name: vp.name, width: vp.width, key });
      modelContent.push({ type: "text", text: `Screenshot at ${vp.width}px wide (${vp.name}), top of page, full height up to 5000px:` });
      modelContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: vp.screenshot.toString("base64") } });
    }
    if (!run.available) limitations.push("No browser run: responsive layout, console errors and visual review of the rendered page were not tested.");
    materialNote = `Website ${fetched.finalUrl} (HTTP ${fetched.status}).`;
    if (pageText) modelContent.push({ type: "text", text: untrusted("visible page text", pageText.slice(0, 20_000)) });
    limitations.push("Logged-in areas, form submissions and hover states were not exercised.");
  } else if (artifact.kind === "image") {
    const data = await getObject(artifact.storageKey!);
    findings.push(...runImageChecks(artifact.meta, artifact.sizeBytes ?? data.length));
    methods.push({ id: "image", label: "Image file checks", ran: true });
    modelContent.push({ type: "image", source: { type: "base64", media_type: artifact.mime as "image/png", data: data.toString("base64") } });
    materialNote = `Image ${artifact.meta.width}×${artifact.meta.height}px.`;
    limitations.push("A static image cannot show interaction, motion or responsive behaviour.");
  } else {
    const text = artifact.textContent ?? "";
    findings.push(...runTextChecks(text, artifact.kind === "code" ? "code" : "text"));
    methods.push({ id: "text", label: artifact.kind === "code" ? "Static code checks" : "Text checks", ran: true });
    modelContent.push({ type: "text", text: untrusted(artifact.kind === "code" ? "code" : "text output", text.slice(0, 60_000)) });
    if (text.length > 60_000) limitations.push("Only the first 60,000 characters were sent for review.");
    if (artifact.kind === "code") limitations.push("Code was read, not executed. Runtime behaviour and tests were not run.");
    materialNote = artifact.kind === "code" ? "Source code." : "Text output.";
  }

  const { linked, settled, hints } = linkRequirements(reqs, findings);
  findings.push(...linked);
  const covered = new Set(settled);
  let model: string | undefined;

  const pending = reqs.filter((r) => !settled.has(r.id));
  const provider = providerStatus();
  let modelError = "";
  if (provider.configured && (pending.length || modelContent.length)) {
    const reviewed = await generateStructured({
      operation: "audit.evaluate",
      userId,
      projectId: artifact.projectId,
      system: AUDIT_SYSTEM,
      effort: "medium",
      schema: ModelAuditSchema,
      content: [
        {
          type: "text",
          text: [
            `Output type: ${contentType}. ${materialNote}`,
            untrusted("user goal", goal || "(none)"),
            pending.length
              ? `Requirements to judge (use these exact ids):\n${pending.map((r) => `- id=${r.id} [${r.priority}] ${r.text}${r.acceptance ? ` | check: ${r.acceptance}` : ""}${hints.get(r.id) ? ` | automated evidence: ${hints.get(r.id)!.replace(/\n/g, "; ")}` : ""}`).join("\n")}`
              : "All requirements were settled by automated checks; only report additional issues.",
            "The artefact follows.",
          ].join("\n\n"),
        },
        ...modelContent,
        ...(artifact.kind === "url" || artifact.kind === "image" ? await referenceBlocks(artifact.projectId, 3) : []),
      ],
    }).catch((err: unknown) => {
      // Keep every automated result; record why the model part is missing.
      if (err instanceof ProviderError || err instanceof ProviderNotConfiguredError) {
        modelError = err.message;
        return null;
      }
      throw err;
    });
    if (reviewed) {
      model = reviewed.model;
      const mf = modelFindings(reviewed.data, reqs, settled);
      findings.push(...mf);
      for (const f of mf) if (f.requirementId) covered.add(f.requirementId);
      methods.push({ id: "model", label: `Model review (${reviewed.model})`, ran: true, note: "Judgements are labelled 'likely'; they are not verification." });
    } else {
      methods.push({ id: "model", label: "Model review", ran: false, note: `Failed: ${modelError} Automated results below are unaffected; re-run the audit to retry.` });
      limitations.push("The model review failed, so requirements without an automated check are marked 'not tested'.");
    }
  } else {
    methods.push({
      id: "model",
      label: "Model review",
      ran: false,
      note: provider.configured ? "Nothing left to review." : "No AI provider configured. Requirements without an automated check are marked 'not tested'; you can mark them yourself.",
    });
  }

  findings.push(
    ...untestedFindings(
      reqs,
      covered,
      provider.configured && !modelError ? "The review could not assess this requirement." : "No automated check covers this. Review it yourself or configure a model.",
      hints,
    ),
  );
  if (!reqs.length) limitations.push("No confirmed requirements, so findings are generic checks only. Confirm requirements in the brief for a targeted audit.");
  return { findings, methods, limitations, screenshots, model, pages: crawled };
}

/** Fetch linked pages (same rules as the main fetch), four at a time. */
async function crawl(urls: string[]): Promise<CrawledPage[]> {
  const out: CrawledPage[] = [];
  for (let i = 0; i < urls.length; i += 4) {
    const batch = await Promise.all(
      urls.slice(i, i + 4).map(async (url): Promise<CrawledPage> => {
        try {
          const r = await safeFetch(url, { maxBytes: 1024 * 1024, timeoutMs: 12_000 });
          if (/html/i.test(r.contentType) && r.status < 400) return { url, status: r.status, ...pageFacts(r.body.toString("utf8")) };
          return { url, status: r.status };
        } catch (err) {
          return { url, status: 0, error: (err as Error).message.slice(0, 120) };
        }
      }),
    );
    out.push(...batch);
  }
  return out;
}

/** A human verdict on a finding. Stored as method "human" so it is never confused with automated results. */
export async function setHumanVerdict(userId: string, projectId: string, findingId: string, verdict: "verified_pass" | "verified_fail", note: string) {
  const db = await getDb();
  const [row] = await db
    .select({ f: schema.findings, e: schema.evaluations })
    .from(schema.findings)
    .innerJoin(schema.evaluations, eq(schema.evaluations.id, schema.findings.evaluationId))
    .where(and(eq(schema.findings.id, findingId), eq(schema.evaluations.projectId, projectId)))
    .limit(1);
  if (!row) throw new ApiError(404, "Finding not found.");
  await db
    .update(schema.findings)
    .set({ status: verdict, method: "human", evidence: note ? `Your review: ${note}` : "Checked by you.", severity: verdict === "verified_fail" ? "medium" : "info" })
    .where(eq(schema.findings.id, findingId));
  await logEvent(userId, projectId, "finding.reviewed", { findingId, verdict, previous: row.f.status });
}

/**
 * If a correction prompt was created after the previous version and before
 * this one, record how many of its issues this version resolved.
 */
async function trackFix(projectId: string, tool: string, artifact: Artifact, drafts: FindingDraft[]): Promise<EvaluationSummary["fixTracking"]> {
  const db = await getDb();
  const [prev] = await db
    .select()
    .from(schema.artifacts)
    .where(and(eq(schema.artifacts.projectId, projectId), lt(schema.artifacts.version, artifact.version)))
    .orderBy(desc(schema.artifacts.version))
    .limit(1);
  if (!prev) return undefined;
  const [correction] = await db
    .select()
    .from(schema.prompts)
    .where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.kind, "correction"), gt(schema.prompts.createdAt, prev.createdAt), lt(schema.prompts.createdAt, artifact.createdAt)))
    .orderBy(desc(schema.prompts.createdAt))
    .limit(1);
  const keys = correction?.analysis.checkKeys;
  if (!correction || !keys?.length) return undefined;
  const outcome = fixOutcome(keys, drafts.map((d) => ({ checkKey: d.checkKey, status: enforceStatus(d).status })));
  return { correctionId: correction.id, fromVersion: correction.analysis.sourceVersion ?? prev.version, tool, ...outcome };
}
