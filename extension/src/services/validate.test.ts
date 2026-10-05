import { describe, expect, it } from "vitest";
import { parseRefineResult } from "./validate";
import { normaliseServer } from "./settings";
import manifest from "../../manifest.base.json";

describe("refine response validation", () => {
  it("rejects malformed replies", () => {
    expect(parseRefineResult(null)).toBeNull();
    expect(parseRefineResult("text")).toBeNull();
    expect(parseRefineResult({ refined: "" })).toBeNull();
    expect(parseRefineResult({ refined: 42 })).toBeNull();
  });
  it("keeps valid fields and drops wrong-typed ones", () => {
    const r = parseRefineResult({
      refined: "Do X",
      analysis: { intent: "x", ambiguities: [{ phrase: "cool", why: "vague" }, { phrase: 3 }, "junk"], missingContext: "nope", strengths: ["a", 1] },
      changes: [{ change: "c", reason: "r" }],
      checks: { originalWords: 3, refinedWords: 9, tooLong: "yes", intent: { kept: 2, terms: 3, missing: ["x", {}], ratio: 0.66 } },
      platformNotes: ["<img src=x onerror=alert(1)>"],
    })!;
    expect(r.analysis.ambiguities).toEqual([{ phrase: "cool", why: "vague" }]);
    expect(r.analysis.missingContext).toEqual([]);
    expect(r.analysis.strengths).toEqual(["a"]);
    expect(r.checks.tooLong).toBe(false);
    expect(r.checks.intent.missing).toEqual(["x"]);
    // Kept as plain text: the overlay renders it with textContent, never as HTML.
    expect(r.platformNotes[0]).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("server address", () => {
  it("accepts https and localhost only", () => {
    expect(normaliseServer("https://upshift.app/app/settings")).toBe("https://upshift.app");
    expect(normaliseServer("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normaliseServer("http://upshift.app")).toBeNull();
    expect(normaliseServer("javascript:alert(1)")).toBeNull();
  });
});

describe("manifest", () => {
  it("asks for the minimum", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage", "scripting"]);
    // Required host access is exactly the sites the content script runs on (no extra install warning).
    expect(manifest.host_permissions).toEqual(manifest.content_scripts[0].matches);
    expect(manifest.content_scripts[0].matches.every((m: string) => /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|grok\.com)\/\*$/.test(m))).toBe(true);
  });
});
