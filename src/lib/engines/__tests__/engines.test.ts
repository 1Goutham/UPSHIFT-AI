import { describe, expect, it } from "vitest";
import { lintPrompt } from "../prompt-lint";
import { deterministicBrief, splitClauses } from "../intent";
import { assemblePrompt } from "../prompt-builder";
import { compareFindings } from "../compare";
import { buildCorrectionPrompt, prioritise } from "../improve";
import { runHtmlChecks } from "../audit/html-checks";
import { runTextChecks } from "../audit/text-checks";
import { linkRequirements, modelFindings } from "../audit/requirements";
import { enforceStatus } from "../audit/types";

describe("prompt lint", () => {
  it("flags vague, short website prompts", () => {
    const ids = lintPrompt("Make my portfolio premium, modern and interactive.", { contentType: "website" }).map((w) => w.id);
    expect(ids).toContain("too_short");
    expect(ids).toContain("vague_qualities");
    expect(ids).toContain("no_responsive");
    expect(ids).toContain("no_audience");
  });
  it("does not flag what a specific prompt covers", () => {
    const p =
      "Build a responsive single-page portfolio in Next.js for recruiters hiring product designers. Use a dark palette with #9DFF50 accents and Outfit font. Must include About, Projects and Contact sections. Do not use gradients. Done when it has no horizontal scroll on mobile and meets WCAG AA contrast.";
    const ids = lintPrompt(p, { contentType: "website" }).map((w) => w.id);
    expect(ids).not.toContain("too_short");
    expect(ids).not.toContain("no_audience");
    expect(ids).not.toContain("no_responsive");
    expect(ids).not.toContain("no_exclusions");
    expect(ids).not.toContain("no_success_criteria");
    expect(ids).not.toContain("no_accessibility");
  });
  it("returns nothing for empty input", () => {
    expect(lintPrompt("   ")).toEqual([]);
  });
});

describe("deterministic brief", () => {
  it("splits clauses and keeps the user's words", () => {
    const clauses = splitClauses("Make a landing page for my bakery. Add an online order form. Don't use stock photos.");
    expect(clauses).toEqual(["Make a landing page for my bakery", "Add an online order form", "Don't use stock photos"]);
  });
  it("labels baseline requirements separately and never invents an audience", () => {
    const { brief, requirements } = deterministicBrief({ goal: "Make my portfolio premium and modern", prompt: "", contentType: "website" });
    expect(requirements.some((r) => r.origin === "baseline")).toBe(true);
    expect(requirements.filter((r) => r.origin === "explicit").map((r) => r.text)).toEqual(["Make my portfolio premium and modern"]);
    expect(brief.questions?.length).toBeGreaterThan(0);
    expect(brief).not.toHaveProperty("audience");
  });
});

describe("prompt assembly", () => {
  const reqs = [
    { category: "content", text: "Include a projects section", acceptance: "Projects section lists 3 projects", priority: "must" },
    { category: "exclusion", text: "Don't use gradients", acceptance: "", priority: "must" },
    { category: "visual", text: "Animated background", acceptance: "", priority: "could" },
  ];
  it("keeps the original prompt verbatim and structures requirements", () => {
    const out = assemblePrompt({ goal: "Portfolio", original: "make it pop", targetTool: "Lovable", requirements: reqs });
    expect(out).toContain("make it pop");
    expect(out).toContain("[MUST] Include a projects section");
    expect(out).toContain("## Do not\n- use gradients");
    expect(out).toContain("Projects section lists 3 projects");
    expect(out).toContain("Lovable");
  });
  it("concise variant drops nice-to-haves and is shorter", () => {
    const full = assemblePrompt({ goal: "Portfolio", original: "make it pop", targetTool: "", requirements: reqs });
    const concise = assemblePrompt({ goal: "Portfolio", original: "make it pop", targetTool: "", requirements: reqs, variant: "concise" });
    expect(concise.length).toBeLessThan(full.length);
    expect(concise).not.toContain("Animated background");
  });
});

describe("html checks", () => {
  const bad = `<html><head></head><body><h1>Hi</h1><h3>Skip</h3><img src="a.png"><a href="#missing">Go</a><a href="#"></a><p>Lorem ipsum dolor</p><input type="text"></body></html>`;
  const good = `<!doctype html><html lang="en"><head><title>Site</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="A site"></head><body><h1>Hi</h1><h2>Sub</h2><img src="a.png" alt="A"><a href="#sub">Go</a><section id="sub"></section><label for="e">Email</label><input id="e" type="email"></body></html>`;
  const status = (html: string, key: string) => runHtmlChecks(html, "https://x.test/", 200).findings.find((f) => f.checkKey === key)?.status;
  it("fails the right checks on bad markup", () => {
    for (const k of ["check:title", "check:viewport", "check:lang", "check:img_alt", "check:heading_order", "check:form_labels", "check:dead_links", "check:placeholder_content", "check:control_names"])
      expect(status(bad, k), k).toBe("verified_fail");
  });
  it("passes them on good markup", () => {
    for (const k of ["check:title", "check:viewport", "check:lang", "check:img_alt", "check:heading_order", "check:form_labels", "check:dead_links", "check:placeholder_content"])
      expect(status(good, k), k).toBe("verified_pass");
  });
  it("only ever produces deterministic findings", () => {
    expect(runHtmlChecks(bad, "http://x.test/", 404).findings.every((f) => f.method === "deterministic")).toBe(true);
  });
});

describe("text checks", () => {
  it("detects and masks secrets", () => {
    const f = runTextChecks('const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456";', "code").find((x) => x.checkKey === "check:secrets")!;
    expect(f.status).toBe("verified_fail");
    expect(f.evidence).not.toContain("abcdefghijklmnop");
  });
});

describe("honesty rules", () => {
  it("a model cannot produce verified results", () => {
    const d = enforceStatus({ checkKey: "x", title: "t", detail: "", status: "verified_pass", severity: "info", method: "model", category: "other" });
    expect(d.status).toBe("likely_pass");
  });
  it("a model cannot override a requirement already settled by a check", () => {
    const reqs = [{ id: "r1", text: "No JavaScript errors on load", priority: "must", category: "technical", acceptance: "" }];
    const checks = [{ checkKey: "browser:console_errors", title: "No JS errors", detail: "2 errors", status: "verified_fail" as const, severity: "high" as const, method: "browser" as const, category: "technical" }];
    const { linked, settled } = linkRequirements(reqs, checks);
    expect(linked[0].status).toBe("verified_fail");
    const mf = modelFindings(
      { requirementResults: [{ requirementId: "r1", verdict: "met", evidence: "", recommendation: "", severity: "info" }], additionalIssues: [], injectionAttempt: false },
      reqs,
      settled,
    );
    expect(mf).toHaveLength(0);
  });
  it("partial links can fail a requirement but never pass it", () => {
    const reqs = [{ id: "r1", text: "Layout works on mobile", priority: "must", category: "responsive", acceptance: "" }];
    const pass = [{ checkKey: "browser:overflow_mobile", title: "o", detail: "", status: "verified_pass" as const, severity: "info" as const, method: "browser" as const, category: "responsive" }];
    const r = linkRequirements(reqs, pass);
    expect(r.linked).toHaveLength(0);
    expect(r.hints.get("r1")).toBeTruthy();
  });
});

describe("version comparison", () => {
  const f = (checkKey: string, status: string) => ({ checkKey, title: checkKey, status, severity: "medium", method: "deterministic" });
  it("classifies transitions", () => {
    const { summary, changes } = compareFindings(
      [f("req:a", "verified_fail"), f("req:b", "verified_pass"), f("req:c", "likely_issue"), f("check:d", "verified_fail")],
      [f("req:a", "verified_pass"), f("req:b", "verified_fail"), f("req:c", "likely_issue"), f("check:e", "verified_fail")],
    );
    expect(summary.improved).toBe(1);
    expect(summary.regressed).toBe(1);
    expect(summary.still_failing).toBe(1);
    expect(summary.new_issue).toBe(1);
    expect(summary.resolved_or_removed).toBe(1);
    expect(changes[0].kind).toBe("regressed");
  });
});

describe("correction prompts", () => {
  const base = { detail: "", evidence: "", recommendation: "", verification: "", method: "deterministic", category: "other", requirementId: null as string | null };
  it("orders by severity and lists what to keep", () => {
    const fs = [
      { ...base, id: "1", title: "Low thing", status: "likely_issue", severity: "low" },
      { ...base, id: "2", title: "Mobile overflow", status: "verified_fail", severity: "high", recommendation: "Constrain the hero image" },
      { ...base, id: "3", title: "Has contact form", status: "verified_pass", severity: "info", requirementId: "r" },
    ];
    const ordered = prioritise(fs, new Map());
    expect(ordered.map((x) => x.id)).toEqual(["2", "1"]);
    const out = buildCorrectionPrompt({ goal: "g", targetTool: "", artifactLabel: "website", selected: ordered, passing: fs });
    expect(out.indexOf("Mobile overflow")).toBeLessThan(out.indexOf("Low thing"));
    expect(out).toContain("Keep working");
    expect(out).toContain("Has contact form");
    expect(out).toContain("Do not redesign");
  });
});
