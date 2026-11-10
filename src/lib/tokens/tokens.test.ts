import { describe, expect, it } from "vitest";
import { encode } from "gpt-tokenizer";
import { estimateTokens, formatTokens } from "./estimate";
import { checkPreserved, compressLocal } from "./compress";

const CORPUS = [
  "Build me a portfolio website with a cool dark design and some animations.",
  "Hi! Could you please help me write a professional email to my landlord about the broken heating? I would really appreciate it if you could keep it polite but firm. Thanks in advance!",
  "Write a Python function that takes a list of integers and returns the second largest unique value. Handle empty lists and lists with one unique value by returning None. Include type hints and 3 pytest tests.",
  "Summarise https://example.com/blog/2024/10/ai-agents-in-production for a non-technical audience in 150 words or fewer.",
  "```ts\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n```\nRefactor this to support bigint as well, without changing the public signature for numbers.",
  "I am now planning to create an application where users can upload their receipts and the system automatically categorises expenses, shows monthly summaries, and exports to CSV. It should work on mobile, use React Native, and store data locally first with optional cloud sync. Avoid paid APIs.",
  "1. Research competitors\n2. List 5 differentiators\n3. Draft a positioning statement under 40 words\n4. Suggest 3 taglines",
  "Analyse the following quarterly revenue numbers: Q1 $1,240,000; Q2 $1,315,500; Q3 $998,200; Q4 $1,602,750. Identify trends, the biggest quarter-over-quarter change, and give two hypotheses for the Q3 dip.",
  "Translate this into French, keeping the informal tone: 'Hey team, quick heads-up: the deploy is moving to Thursday because of the database migration. Ping me if that breaks anything for you.'",
  "You are an expert UX researcher. Interview me one question at a time to understand my onboarding flow problems, then propose 3 experiments ranked by impact and effort. Don't ask more than 8 questions.",
];

describe("token estimate", () => {
  it("tracks a real tokenizer (o200k) closely on varied prompts", () => {
    let est = 0;
    let real = 0;
    for (const t of CORPUS) {
      const e = estimateTokens(t);
      const r = encode(t).length;
      expect(Math.abs(e - r) / r).toBeLessThan(0.15);
      est += e;
      real += r;
    }
    expect(Math.abs(est - real) / real).toBeLessThan(0.06);
  });
  it("formats compactly", () => {
    expect(formatTokens(340)).toBe("340");
    expect(formatTokens(1200)).toBe("1.2k");
    expect(formatTokens(12_400)).toBe("12k");
    expect(estimateTokens("")).toBe(0);
  });
});

describe("local compression", () => {
  it("removes politeness and wrappers, keeps every instruction", () => {
    const c = compressLocal(CORPUS[1]);
    expect(c.text).toBe("Help me write a professional email to my landlord about the broken heating? Keep it polite but firm.");
    expect(c.saved).toBeGreaterThan(10);
    expect(c.check.ok).toBe(true);
  });

  it("replaces wordy phrases with exact equivalents and drops repeated sentences", () => {
    const c = compressLocal("In order to ship faster, basically we need a CI pipeline. Due to the fact that tests are slow, run them in parallel. Keep the whole run under 10 minutes. Keep the whole run under 10 minutes.");
    expect(c.text).toBe("To ship faster, we need a CI pipeline. Because tests are slow, run them in parallel. Keep the whole run under 10 minutes.");
    expect(c.edits.map((e) => e.kind).sort()).toEqual(["duplicate", "filler", "wordy"]);
  });

  it("never touches code, URLs, quotes, numbers, placeholders or the material after a colon", () => {
    for (const t of [CORPUS[3], CORPUS[4], CORPUS[8]]) {
      const c = compressLocal(t);
      expect(c.check.ok).toBe(true);
    }
    // The greeting being translated is content, not a greeting to the model.
    const tr = compressLocal("Could you please translate this:\nHi John, thanks so much for your help!\nThanks!");
    expect(tr.text).toBe("Translate this:\nHi John, thanks so much for your help!\nThanks!");
    const code = "Please fix this:\n```js\n// please   keep   spacing\nconst a  =  1;\n```";
    expect(compressLocal(code).text).toContain("// please   keep   spacing\nconst a  =  1;");
    const q = compressLocal('Please reply with exactly "Thanks in advance!" and nothing else. Use {{name}}, 3 bullets, https://x.dev/a.');
    expect(q.text).toBe('Reply with exactly "Thanks in advance!" and nothing else. Use {{name}}, 3 bullets, https://x.dev/a.');
  });

  it("keeps verbs that look like filler, nested indentation and negations", () => {
    expect(compressLocal("Design a landing page to please first-time visitors, and don't use stock photos.").saved).toBe(0);
    const nested = compressLocal("Please build:\n- pages\n  - home\n  - about");
    expect(nested.text).toBe("Build:\n- pages\n  - home\n  - about");
  });

  it("returns the original when nothing can be removed", () => {
    const c = compressLocal(CORPUS[6]);
    expect(c.text).toBe(CORPUS[6]);
    expect(c.saved).toBe(0);
  });
});

describe("preservation check", () => {
  it("flags dropped numbers, terms, URLs and negations in a shorter version", () => {
    const original = "Write 3 tweets about https://acme.dev for developers. Don't use hashtags. Mention the free tier.";
    expect(checkPreserved(original, "Write 3 tweets on https://acme.dev for developers. No hashtags. Mention free tier.").ok).toBe(true);
    const bad = checkPreserved(original, "Write tweets about acme for developers. Use hashtags.");
    const kinds = bad.issues.map((i) => i.kind);
    expect(bad.ok).toBe(false);
    expect(kinds).toEqual(expect.arrayContaining(["number", "url", "negation", "term"]));
  });
});
