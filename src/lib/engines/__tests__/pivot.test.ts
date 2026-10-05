import { describe, expect, it } from "vitest";
import { crawlFindings, extractInternalLinks } from "../audit/html-checks";
import { buildCorrectionPrompts, fixOutcome } from "../improve";
import { builderFor } from "../builders";

describe("crawl", () => {
  const html = `<a href="/about">A</a><a href="/about/">dup</a><a href="#x">x</a><a href="mailto:a@b.c">m</a>
    <a href="https://other.com/x">ext</a><a href="/file.pdf">pdf</a><a href="pricing?ref=1">p</a><a href="/">home</a>`;
  it("keeps same-origin pages once, skips anchors, mail, files, external and self", () => {
    expect(extractInternalLinks(html, "https://site.test/")).toEqual(["https://site.test/about", "https://site.test/pricing?ref=1"]);
  });
  it("flags broken pages, placeholders and reused titles", () => {
    const f = crawlFindings("Home", [
      { url: "https://s.test/a", status: 404 },
      { url: "https://s.test/b", status: 200, title: "Home", placeholders: ['Lorem ipsum: "…"'] },
    ]);
    const by = Object.fromEntries(f.map((x) => [x.checkKey, x.status]));
    expect(by["check:internal_links"]).toBe("verified_fail");
    expect(by["check:inner_placeholders"]).toBe("verified_fail");
    expect(by["check:distinct_titles"]).toBe("verified_fail");
  });
});

describe("builder-specific fix prompts", () => {
  const issue = (i: number) => ({ id: `${i}`, title: `Issue ${i}`, detail: "", status: "verified_fail", severity: "high", evidence: "", recommendation: "Do it", verification: "Check it", method: "deterministic", category: "technical", requirementId: null });
  const nine = Array.from({ length: 9 }, (_, i) => issue(i + 1));
  it("splits into small messages for chat builders", () => {
    const parts = buildCorrectionPrompts({ goal: "g", targetTool: "Lovable", artifactLabel: "website", selected: nine, passing: [] });
    expect(parts).toHaveLength(3);
    expect(parts[0]).toContain("message 1 of 3");
    expect(parts[1]).toContain("Continue");
    expect(parts[2]).toContain("Issue 9");
  });
  it("keeps one task with self-checks for coding agents", () => {
    const parts = buildCorrectionPrompts({ goal: "g", targetTool: "cursor", artifactLabel: "website", selected: nine, passing: [] });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("390px and 1440px");
    expect(parts[0]).toContain("Verify: Check it");
  });
  it("recognises builders loosely and falls back for unknown tools", () => {
    expect(builderFor("Claude Code").kind).toBe("agent");
    expect(builderFor("lovable.dev").id).toBe("lovable");
    expect(builderFor("Framer AI")).toMatchObject({ kind: "generic", label: "Framer AI" });
  });
});

describe("fix tracking", () => {
  it("counts resolved and still-failing by check key; missing keys are unknown", () => {
    expect(
      fixOutcome(["a", "b", "c", "d"], [
        { checkKey: "a", status: "verified_pass" },
        { checkKey: "b", status: "likely_issue" },
        { checkKey: "c", status: "likely_pass" },
      ]),
    ).toEqual({ attempted: 4, resolved: 2, stillFailing: 1 });
  });
});
