import { desc, eq, gte, and } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema, dbDriver } from "@/lib/db";
import { hasPricing, providerStatus } from "@/lib/ai/provider";
import { DeleteAccount } from "@/components/delete-account";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = (await currentUser())!;
  const p = providerStatus();
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 86400_000);
  const usage = await db
    .select()
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.userId, user.id), gte(schema.aiUsage.createdAt, since)))
    .orderBy(desc(schema.aiUsage.createdAt));
  const byOp = new Map<string, { calls: number; failed: number; input: number; output: number; cost: number; priced: boolean }>();
  for (const u of usage) {
    const r = byOp.get(u.operation) ?? { calls: 0, failed: 0, input: 0, output: 0, cost: 0, priced: true };
    if (!hasPricing(u.model)) r.priced = false;
    r.calls++;
    if (!u.ok) r.failed++;
    r.input += u.inputTokens;
    r.output += u.outputTokens;
    r.cost += Number(u.estimatedCostUsd);
    byOp.set(u.operation, r);
  }
  const total = [...byOp.values()].reduce((s, r) => s + r.cost, 0);

  const rows: [string, string, boolean | null][] = [
    ["AI provider", p.configured ? `${p.label} · ${p.model}` : "Not configured", p.configured],
    ...(p.provider === "anthropic" ? ([["Refusal fallback", p.fallbacks ? "Server-side fallback enabled" : "Off", null]] as [string, string, boolean | null][]) : []),
    ["Database", dbDriver() === "postgres" ? "PostgreSQL (DATABASE_URL)" : "Embedded PGlite (.data/pglite) · single instance only", dbDriver() === "postgres"],
    ["Browser checks", process.env.UPSHIFT_BROWSER === "off" ? "Disabled" : "Headless Chromium when available; each audit reports whether it ran", process.env.UPSHIFT_BROWSER !== "off"],
    ["File storage", process.env.UPSHIFT_STORAGE_DIR ? `Local disk (${process.env.UPSHIFT_STORAGE_DIR})` : "Local disk (.data/uploads)", null],
  ];

  return (
    <main className="mx-auto max-w-3xl space-y-12 px-5 py-8 md:px-10 md:py-10">
      <div>
        <h1 className="font-mono text-2xl">
          <span className="text-ink-3">[</span> Settings <span className="text-ink-3">]</span>
        </h1>
      </div>

      <section>
        <h2 className="eyebrow mb-3">Configuration</h2>
        <dl className="divide-y divide-line border-y border-line">
          {rows.map(([k, v, ok]) => (
            <div key={k} className="grid grid-cols-[140px_1fr] gap-3 py-2.5 text-sm sm:grid-cols-[180px_1fr]">
              <dt className="text-ink-3">{k}</dt>
              <dd className="flex items-start gap-2 text-ink">
                {ok !== null ? <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-pass" : "border border-dashed border-ink-3"}`} aria-hidden /> : null}
                {v}
              </dd>
            </div>
          ))}
        </dl>
        {!p.configured ? (
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            To enable model-backed briefs, prompt rewrites and visual review, set <code className="font-mono text-ink-2">XAI_API_KEY</code> (Grok) or <code className="font-mono text-ink-2">ANTHROPIC_API_KEY</code> (Claude) on the server and restart. Keys are only read server-side and never sent to the browser.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="eyebrow mb-1">Model usage · last 30 days</h2>
        <p className="mb-3 text-xs text-ink-3">Estimated from token counts and list prices; “—” means no price is configured for that model (for Grok, set XAI_PRICE_INPUT / XAI_PRICE_OUTPUT). Your provider invoice is authoritative.</p>
        {usage.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] text-ink-3">
                  <th className="py-2 font-normal">Operation</th>
                  <th className="py-2 text-right font-normal">Calls</th>
                  <th className="py-2 text-right font-normal">Tokens in / out</th>
                  <th className="py-2 text-right font-normal">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {[...byOp.entries()].map(([op, r]) => (
                  <tr key={op} className="border-b border-line">
                    <td className="py-2 text-ink">{op}</td>
                    <td className="py-2 text-right font-mono">
                      {r.calls}
                      {r.failed ? <span className="text-fail"> ({r.failed} failed)</span> : null}
                    </td>
                    <td className="py-2 text-right font-mono text-ink-2">
                      {r.input.toLocaleString()} / {r.output.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-mono">{r.priced ? `$${r.cost.toFixed(3)}` : r.cost ? `≥ $${r.cost.toFixed(3)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-2 text-ink-3" colSpan={3}>
                    Total
                  </td>
                  <td className="py-2 text-right font-mono text-ink">{[...byOp.values()].every((r) => r.priced) ? `$${total.toFixed(3)}` : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-3">No model calls in the last 30 days.</p>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-3">Data</h2>
        <ul className="space-y-1.5 text-sm text-ink-2">
          <li>Projects, prompts, audits and uploads are visible only to your account.</li>
          <li>Deleting a project removes its rows and its stored files (uploads and screenshots).</li>
          <li>When a model is configured, the material being analysed is sent to the provider for that request.</li>
        </ul>
        <div className="mt-6">
          <DeleteAccount email={user.email} />
        </div>
      </section>
    </main>
  );
}
