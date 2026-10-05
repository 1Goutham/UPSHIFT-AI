import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { intentCoverage, keyTerms, wordDiff } from "./intent-check";
import { partialStringField } from "./partial";

describe("intent check", () => {
  it("extracts meaningful terms and tracks which survive", () => {
    // "cool" is a vague quality word: replacing it with specifics is the point, not drift.
    expect(keyTerms("Build me a portfolio website with a cool dark design")).toEqual(["portfolio", "website", "dark", "design"]);
    const c = intentCoverage("portfolio website, dark design, animations", "A dark-themed portfolio site with subtle animation and a strong design system");
    expect(c.missing).toEqual(["website"]);
    expect(c.kept).toBe(4);
  });
  it("diffs by word", () => {
    const d = wordDiff("cool dark design", "premium dark design");
    expect(d.find((p) => p.type === "del")?.text).toBe("cool");
    expect(d.find((p) => p.type === "add")?.text).toBe("premium");
  });
});

describe("partial JSON field", () => {
  it("reads a string field while the JSON is still being written", () => {
    expect(partialStringField('{"refined":"Build a por', "refined")).toBe("Build a por");
    expect(partialStringField('{"refined": "Line one\\nLine \\"two\\"", "changes": [', "refined")).toBe('Line one\nLine "two"');
    expect(partialStringField('{"refined":"caf\\u00e9 and \\u00', "refined")).toBe("café and ");
    expect(partialStringField('{"refined":"ends with \\', "refined")).toBe("ends with ");
    expect(partialStringField('{"changes":[', "refined")).toBeNull();
  });
});

const completion = (content: string, extra: Record<string, unknown> = {}) => ({
  model: "grok-test",
  choices: [{ finish_reason: "stop", message: { content, ...extra } }],
  usage: { prompt_tokens: 100, completion_tokens: 80 },
});

const valid = {
  analysis: { intent: "Portfolio site", taskType: "website build", strengths: [], ambiguities: [{ phrase: "cool", why: "vague" }], missingContext: [{ item: "Audience", why: "tone" }], assumptions: [] },
  refined: "Build a portfolio website with a dark design and subtle animations for recruiters. {{your name}}",
  changes: [{ change: "Defined cool", reason: "clarity" }],
  assumptions: ["Audience is recruiters"],
  placeholders: ["{{your name}}"],
  platformNotes: ["General practice: state the output format."],
};

describe("refine engine (stubbed provider)", () => {
  let reply: () => Response = () => new Response("{}");
  const bodies: Record<string, unknown>[] = [];
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.XAI_API_KEY = "test";
    (await import("@/lib/ai/provider")).__setProviderFetchForTests(async (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return reply();
    });
  });
  afterAll(async () => {
    delete process.env.XAI_API_KEY;
    (await import("@/lib/ai/provider")).__setProviderFetchForTests(undefined);
  });
  const user = async () => {
    const { getDb, schema } = await import("@/lib/db");
    const [u] = await (await getDb()).insert(schema.users).values({ email: `r-${Math.random()}@x.test`, name: "r", passwordHash: "x" }).returning();
    return u.id;
  };

  it("refines, runs the intent check, and drops platform notes outside expert mode", async () => {
    const { refinePrompt } = await import("./engine");
    reply = () => new Response(JSON.stringify(completion(JSON.stringify(valid))), { status: 200 });
    const r = await refinePrompt({ prompt: "Build me a portfolio website with a cool dark design and some animations", platform: "grok", mode: "quick", userId: await user() });
    expect(r.refined).toContain("portfolio website");
    expect(r.checks.intent.missing).not.toContain("cool");
    expect(r.checks.intent.ratio).toBe(1);
    expect(r.platformNotes).toEqual([]);
    expect(r.checks.gaps.length).toBeGreaterThan(0);
    const sys = (bodies.at(-1)!.messages as { content: string }[])[0].content;
    expect(sys).toContain("Mode QUICK");
    expect(JSON.stringify(bodies.at(-1)!.messages)).toContain("Target platform: Grok");
  });

  it("keeps platform notes in expert mode and flags quick edits that balloon", async () => {
    const { refinePrompt } = await import("./engine");
    reply = () => new Response(JSON.stringify(completion(JSON.stringify(valid))), { status: 200 });
    const expert = await refinePrompt({ prompt: "Write a landing page", platform: "claude", mode: "expert", userId: await user() });
    expect(expert.platformNotes.length).toBe(1);
    const long = { ...valid, refined: Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ") };
    reply = () => new Response(JSON.stringify(completion(JSON.stringify(long))), { status: 200 });
    const quick = await refinePrompt({ prompt: "Write a landing page", platform: "claude", mode: "quick", userId: await user() });
    expect(quick.checks.tooLong).toBe(true);
  });

  it("rejects empty prompts without calling the model", async () => {
    const { refinePrompt } = await import("./engine");
    const n = bodies.length;
    await expect(refinePrompt({ prompt: "   ", platform: "grok", mode: "quick", userId: await user() })).rejects.toThrow("Add a prompt first.");
    expect(bodies.length).toBe(n);
  });

  it("handles malformed model output and provider failures honestly", async () => {
    const { refinePrompt } = await import("./engine");
    const uid = await user();
    reply = () => new Response(JSON.stringify(completion("not json")), { status: 200 });
    await expect(refinePrompt({ prompt: "x y z", platform: "grok", mode: "deep", userId: uid })).rejects.toThrow(/not valid JSON/);
    reply = () => new Response(JSON.stringify(completion(JSON.stringify({ refined: "only this" }))), { status: 200 });
    await expect(refinePrompt({ prompt: "x y z", platform: "grok", mode: "deep", userId: uid })).rejects.toThrow(/expected structure/);
    reply = () => new Response(JSON.stringify({ error: "down" }), { status: 503 });
    await expect(refinePrompt({ prompt: "x y z", platform: "grok", mode: "deep", userId: uid })).rejects.toThrow(/returned an error/);
  });

  it("uses the fast model, and falls back to the configured one if the key can't use it", async () => {
    const { refinePrompt } = await import("./engine");
    const uid = await user();
    bodies.length = 0;
    let calls = 0;
    reply = () => (++calls === 1 ? new Response(JSON.stringify({ error: "The model grok-4-fast-non-reasoning does not exist" }), { status: 404 }) : new Response(JSON.stringify(completion(JSON.stringify(valid))), { status: 200 }));
    const r = await refinePrompt({ prompt: "Build me a portfolio website", platform: "grok", mode: "quick", userId: uid });
    expect(r.refined).toContain("portfolio");
    expect(bodies.map((b) => b.model)).toEqual(["grok-4-fast-non-reasoning", "grok-4-fast"]);
  });

  it("streams the refined text as it is written, then validates the whole result", async () => {
    const { refinePrompt } = await import("./engine");
    const uid = await user();
    const text = JSON.stringify(valid);
    reply = () => {
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < text.length; i += 17) c.enqueue(enc.encode(`data: ${JSON.stringify({ model: "grok-test", choices: [{ delta: { content: text.slice(i, i + 17) } }] })}\n\n`));
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 9, completion_tokens: 9 } })}\n\ndata: [DONE]\n\n`));
          c.close();
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    bodies.length = 0;
    const seen: string[] = [];
    const r = await refinePrompt({ prompt: "Build me a portfolio website", platform: "grok", mode: "quick", userId: uid }, (t) => seen.push(t));
    expect(bodies[0].stream).toBe(true);
    expect(seen.length).toBeGreaterThan(2);
    expect(valid.refined.startsWith(seen[0])).toBe(true);
    expect(seen.at(-1)).toBe(valid.refined);
    expect(r.refined).toBe(valid.refined);

    // A stream that ends in malformed JSON still fails validation, however good the partial text looked.
    reply = () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"refined":"half' } }] })}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
    await expect(refinePrompt({ prompt: "x y z", platform: "grok", mode: "quick", userId: uid }, () => {})).rejects.toThrow(/not valid JSON/);
  });
});
