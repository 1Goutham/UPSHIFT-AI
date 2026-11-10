import { afterAll, beforeAll, describe, expect, it } from "vitest";

const completion = (content: unknown) => ({ model: "grok-test", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 40, completion_tokens: 20 } });

describe("token service", () => {
  let reply: () => Response = () => new Response("{}");
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.XAI_API_KEY = "test";
    (await import("@/lib/ai/provider")).__setProviderFetchForTests(async () => reply());
  });
  afterAll(async () => {
    delete process.env.XAI_API_KEY;
    (await import("@/lib/ai/provider")).__setProviderFetchForTests(undefined);
  });
  const user = async () => {
    const { getDb, schema } = await import("@/lib/db");
    const [u] = await (await getDb()).insert(schema.users).values({ email: `t-${Math.random()}@x.test`, name: "t", passwordHash: "x" }).returning();
    return u.id;
  };
  const prompt =
    "Hello! I hope you are doing well. I would like you to write a short product description for our new running shoe, the Aero 2, for people training for their first marathon. Please keep it under 80 words and don't mention the price. Thank you so much!";

  it("compresses with the model and checks that nothing was lost", async () => {
    const { compressWithAI } = await import("./service");
    const uid = await user();
    reply = () => new Response(JSON.stringify(completion({ compressed: "Write a short product description for our new running shoe, the Aero 2, for people training for their first marathon. Under 80 words; don't mention the price.", cut: ["Greeting", "Politeness"] })));
    const r = await compressWithAI({ prompt, platform: "chatgpt", userId: uid });
    expect(r.saved).toBeGreaterThan(20);
    expect(r.check.ok).toBe(true);
    expect(r.cut).toEqual(["Greeting", "Politeness"]);
    expect(r.by).toBe("ai");

    // A shorter answer that drops a number and a negation is reported, not hidden.
    reply = () => new Response(JSON.stringify(completion({ compressed: "Write a short product description for the Aero 2 running shoe for first-time marathon trainees.", cut: [] })));
    const lossy = await compressWithAI({ prompt, platform: "chatgpt", userId: uid });
    expect(lossy.check.ok).toBe(false);
    expect(lossy.check.issues.map((i) => i.kind)).toEqual(expect.arrayContaining(["number", "negation"]));

    reply = () => new Response(JSON.stringify(completion({ compressed: prompt + " Also add a tagline and three bullet points about comfort.", cut: [] })));
    const longer = await compressWithAI({ prompt, platform: "chatgpt", userId: uid });
    // A longer answer never replaces the original; the free local pass is used instead, and labelled as such.
    expect(longer.by).toBe("local");
    expect(longer.after).toBeLessThan(longer.before);
    expect(longer.text).not.toContain("tagline");
  });

  it("adds up this month's workload from counts only", async () => {
    const { recordTokenEvent, tokenStats } = await import("./service");
    const uid = await user();
    await recordTokenEvent({ userId: uid, method: "compress-local", platform: "chatgpt", source: "extension", before: 120, after: 90 });
    await recordTokenEvent({ userId: uid, method: "compress-ai", platform: "claude", source: "web", before: 200, after: 120 });
    await recordTokenEvent({ userId: uid, method: "refine", platform: "chatgpt", source: "extension", before: 20, after: 70 });
    const s = await tokenStats(uid);
    expect(s.month).toMatchObject({ saved: 110, compressed: 2, before: 320, refineAdded: 50, refined: 1 });
    expect(s.days).toHaveLength(30);
    expect(s.days.at(-1)).toMatchObject({ saved: 110, count: 3 });
    expect(s.platforms[0]).toMatchObject({ platform: "claude", saved: 80 });
  });
});
