import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
const calls: Captured[] = [];
let reply: (body: Record<string, unknown>) => unknown = () => ({});

const stub: typeof fetch = async (input, init) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  calls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()), body });
  return new Response(JSON.stringify(reply(body)), { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } });
};

const message = (text: string, stop = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 1200, output_tokens: 300 },
});

describe("provider (stubbed HTTP)", () => {
  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    (await import("./provider")).__setProviderFetchForTests(stub);
  });
  afterAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    (await import("./provider")).__setProviderFetchForTests(undefined);
  });

  it("sends structured-output requests and validates the reply", async () => {
    const { generateStructured } = await import("./provider");
    const { getDb, schema } = await import("@/lib/db");
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: `p-${Date.now()}@x.test`, name: "p", passwordHash: "x" }).returning();
    reply = () => message(JSON.stringify({ answer: "ok", items: ["a"] }));
    const out = await generateStructured({
      operation: "test.op",
      userId: u.id,
      system: "sys",
      content: [{ type: "text", text: "hello" }],
      schema: z.object({ answer: z.string(), items: z.array(z.string()) }),
    });
    expect(out.data).toEqual({ answer: "ok", items: ["a"] });
    const req = calls.at(-1)!;
    expect(req.url).toContain("https://api.anthropic.com/v1/messages");
    expect(req.body.model).toBe("claude-opus-5-5");
    expect((req.body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(req.body.thinking).toEqual({ type: "adaptive" });
    expect(req.body.fallbacks).toBe("default");
    expect(req.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    const usage = await db.select().from(schema.aiUsage).where((await import("drizzle-orm")).eq(schema.aiUsage.userId, u.id));
    expect(usage[0]).toMatchObject({ operation: "test.op", inputTokens: 1200, outputTokens: 300, ok: true });
    expect(Number(usage[0].estimatedCostUsd)).toBeCloseTo((1200 * 4 + 300 * 20) / 1e6, 6);
  });

  it("surfaces refusals and schema mismatches as provider errors", async () => {
    const { generateStructured, ProviderError } = await import("./provider");
    const { getDb, schema } = await import("@/lib/db");
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: `r-${Date.now()}@x.test`, name: "r", passwordHash: "x" }).returning();
    const req = { operation: "t", userId: u.id, system: "s", content: [{ type: "text" as const, text: "x" }], schema: z.object({ n: z.number() }) };
    reply = () => message("{}", "refusal");
    await expect(generateStructured(req)).rejects.toBeInstanceOf(ProviderError);
    reply = () => message(JSON.stringify({ n: "not a number" }));
    await expect(generateStructured(req)).rejects.toThrow();
  });
});
