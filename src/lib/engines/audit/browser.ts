import "server-only";
import fs from "node:fs";
import type { FindingDraft } from "./types";
import { assertPublicHost } from "@/lib/security/ssrf";

/**
 * Real-browser checks with headless Chromium (playwright-core).
 *
 * Runs only when a Chromium binary is available: UPSHIFT_CHROMIUM_PATH, or
 * the Playwright-managed browser. When unavailable, the audit records the
 * browser checks as "not tested" rather than guessing.
 *
 * Every request the page makes (sub-resources, XHR, redirects) is checked
 * against the same private-address rules as the initial fetch.
 */

export type ViewportResult = {
  name: "mobile" | "desktop";
  width: number;
  height: number;
  screenshot?: Buffer;
  overflowPx: number;
  loadMs: number;
};

export type BrowserRun = {
  available: boolean;
  reason?: string;
  viewports: ViewportResult[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  blockedRequests: string[];
  renderedText: string;
  /** axe-core WCAG A/AA violations from the desktop run. */
  axe?: { violations: AxeViolation[] } | { error: string };
  /** Mobile navigation: is it reachable, and does the menu button work? */
  mobileMenu?: { state: "visible" | "opened" | "dead_button" | "no_button" | "no_nav" | "error"; links: number; detail?: string };
};

export type AxeViolation = { id: string; impact: string | null; help: string; helpUrl: string; nodes: number; targets: string[] };

// Read once; injected into audited pages over CDP (not affected by their CSP).
let axeSource: string | null = null;
async function getAxeSource() {
  if (axeSource === null) {
    const mod = (await import("axe-core")) as unknown as { source: string; default?: { source: string } };
    axeSource = mod.source ?? mod.default?.source ?? "";
  }
  return axeSource;
}

const MAX_SHOT_HEIGHT = 5000;

const VIEWPORTS = [
  { name: "mobile" as const, width: 390, height: 844, isMobile: true },
  { name: "desktop" as const, width: 1440, height: 900, isMobile: false },
];

const serverless = () => !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) || process.env.UPSHIFT_CHROMIUM === "sparticuz";

/** Which Chromium to launch: explicit path, the serverless build, or Playwright's managed browser. */
async function launchOptions(): Promise<{ executablePath?: string; args: string[] }> {
  const explicit = process.env.UPSHIFT_CHROMIUM_PATH;
  if (explicit && fs.existsSync(explicit)) return { executablePath: explicit, args: process.env.UPSHIFT_CHROMIUM_NO_SANDBOX === "true" ? ["--no-sandbox"] : [] };
  if (serverless()) {
    // Brotli-packed Chromium built for serverless functions; unpacked to /tmp on first use.
    const { default: Sparticuz } = await import("@sparticuz/chromium");
    Sparticuz.setGraphicsMode = false;
    return { executablePath: await Sparticuz.executablePath(), args: Sparticuz.args };
  }
  return { args: process.env.UPSHIFT_CHROMIUM_NO_SANDBOX === "true" ? ["--no-sandbox"] : [] };
}

export async function runBrowser(url: string): Promise<BrowserRun> {
  const empty: BrowserRun = { available: false, viewports: [], consoleErrors: [], pageErrors: [], failedRequests: [], blockedRequests: [], renderedText: "" };
  if (process.env.UPSHIFT_BROWSER === "off") return { ...empty, reason: "Browser checks are disabled (UPSHIFT_BROWSER=off)." };

  let chromium: typeof import("playwright-core").chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return { ...empty, reason: "playwright-core is not installed." };
  }

  let browser: import("playwright-core").Browser;
  try {
    browser = await chromium.launch({ ...(await launchOptions()), headless: true, timeout: 30_000 });
  } catch (err) {
    return { ...empty, reason: `No usable Chromium found (${(err as Error).message.split("\n")[0]}). Set UPSHIFT_CHROMIUM_PATH.` };
  }

  const run: BrowserRun = { ...empty, available: true };
  const hostCache = new Map<string, Promise<boolean>>();
  const hostAllowed = (host: string) => {
    if (!hostCache.has(host))
      hostCache.set(
        host,
        assertPublicHost(host).then(
          () => true,
          () => false,
        ),
      );
    return hostCache.get(host)!;
  };

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        deviceScaleFactor: 1,
        acceptDownloads: false,
        serviceWorkers: "block",
        bypassCSP: true,
        userAgent: vp.isMobile
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 UPSHIFT-Auditor"
          : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 UPSHIFT-Auditor",
      });
      await context.route("**/*", async (route) => {
        const reqUrl = route.request().url();
        if (reqUrl.startsWith("data:") || reqUrl.startsWith("blob:")) return route.continue();
        let parsed: URL;
        try {
          parsed = new URL(reqUrl);
        } catch {
          return route.abort();
        }
        if (!["http:", "https:"].includes(parsed.protocol) || !(await hostAllowed(parsed.hostname))) {
          if (vp.name === "desktop") run.blockedRequests.push(reqUrl.slice(0, 160));
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      const page = await context.newPage();
      if (vp.name === "desktop") {
        page.on("console", (msg) => {
          if (msg.type() === "error") run.consoleErrors.push(msg.text().slice(0, 300));
        });
        page.on("pageerror", (err) => run.pageErrors.push(err.message.slice(0, 300)));
        page.on("requestfailed", (req) => {
          const f = req.failure()?.errorText ?? "failed";
          if (!f.includes("BLOCKED_BY_CLIENT")) run.failedRequests.push(`${req.method()} ${req.url().slice(0, 160)} (${f})`);
        });
        page.on("response", (res) => {
          if (res.status() >= 400) run.failedRequests.push(`${res.request().method()} ${res.url().slice(0, 160)} -> ${res.status()}`);
        });
      }
      const started = Date.now();
      try {
        await page.goto(url, { waitUntil: "load", timeout: 25_000 });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      } catch (err) {
        await context.close();
        run.pageErrors.push(`Navigation failed at ${vp.width}px: ${(err as Error).message.split("\n")[0]}`);
        continue;
      }
      const loadMs = Date.now() - started;
      const metrics = await page
        .evaluate(() => ({
          overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          height: document.documentElement.scrollHeight,
          text: document.body?.innerText ?? "",
        }))
        .catch(() => ({ overflow: 0, height: vp.height, text: "" }));
      // Full page, capped so very long pages stay a reasonable size.
      const shotHeight = Math.min(Math.max(metrics.height, vp.height), MAX_SHOT_HEIGHT);
      const screenshot = await page
        .screenshot({ type: "jpeg", quality: 72, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: shotHeight }, timeout: 15_000 })
        .catch(() => undefined);
      run.viewports.push({ name: vp.name, width: vp.width, height: vp.height, overflowPx: metrics.overflow, loadMs, screenshot: screenshot ? Buffer.from(screenshot) : undefined });
      if (vp.name === "desktop") {
        run.renderedText = metrics.text.slice(0, 30_000);
        run.axe = await runAxe(page);
      } else {
        run.mobileMenu = await checkMobileMenu(page);
      }
      await context.close();
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return run;
}

async function runAxe(page: import("playwright-core").Page): Promise<BrowserRun["axe"]> {
  try {
    await page.evaluate(await getAxeSource());
    const result = await page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; impact: string | null; help: string; helpUrl: string; nodes: { target: string[] }[] }[] }> } };
      const r = await w.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }));
    });
    return { violations: result };
  } catch (err) {
    return { error: (err as Error).message.split("\n")[0].slice(0, 200) };
  }
}

/**
 * On a phone: are nav links visible, or is there a menu button that reveals
 * them? Clicks only buttons (never links or form submits) so nothing on the
 * audited site is changed.
 */
async function checkMobileMenu(page: import("playwright-core").Page): Promise<BrowserRun["mobileMenu"]> {
  const count = () =>
    page.evaluate(() => {
      const vis = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05 && r.right > 0 && r.left < innerWidth;
      };
      const links = [...document.querySelectorAll("header a[href], nav a[href], [role=navigation] a[href]")];
      return { total: links.length, visible: links.filter(vis).length };
    });
  try {
    const before = await count();
    if (before.total === 0) return { state: "no_nav", links: 0 };
    if (before.visible >= Math.min(before.total, 2)) return { state: "visible", links: before.visible };
    const marked = await page.evaluate(() => {
      const sel = 'header button, nav button, button[aria-controls], button[aria-expanded], [role=button][aria-expanded], button[aria-label*="menu" i], button[class*="menu" i], button[class*="burger" i]';
      const el = [...document.querySelectorAll(sel)].find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
      });
      if (!el) return false;
      el.setAttribute("data-upshift-menu", "1");
      return true;
    });
    if (!marked) return { state: "no_button", links: before.visible, detail: `${before.total - before.visible} of ${before.total} nav links hidden` };
    await page.click("[data-upshift-menu]", { timeout: 3000 });
    await page.waitForTimeout(600);
    const after = await count();
    return after.visible > before.visible
      ? { state: "opened", links: after.visible, detail: `${before.visible} → ${after.visible} visible links after tapping the menu button` }
      : { state: "dead_button", links: after.visible, detail: `Tapping the menu button left ${after.visible} of ${after.total} links visible` };
  } catch (err) {
    return { state: "error", links: 0, detail: (err as Error).message.split("\n")[0].slice(0, 160) };
  }
}

// Rules the markup checks already report (kept there so requirement links keep working).
const AXE_DUPLICATES = new Set(["image-alt", "html-has-lang", "label", "link-name", "button-name"]);
const IMPACT_SEVERITY: Record<string, FindingDraft["severity"]> = { critical: "high", serious: "high", moderate: "medium", minor: "low" };

export function browserFindings(run: BrowserRun): FindingDraft[] {
  if (!run.available) {
    return [
      {
        checkKey: "browser:run",
        title: "Browser checks",
        detail: `Not run. ${run.reason ?? ""}`.trim(),
        status: "not_tested",
        severity: "info",
        method: "browser",
        category: "technical",
        recommendation: "Configure Chromium on the server to get layout, console and network checks.",
      },
    ];
  }
  const out: FindingDraft[] = [];
  const mobile = run.viewports.find((v) => v.name === "mobile");
  const desktop = run.viewports.find((v) => v.name === "desktop");

  for (const [vp, key, label] of [
    [mobile, "browser:overflow_mobile", "No horizontal scrolling on a 390px phone"],
    [desktop, "browser:overflow_desktop", "No horizontal scrolling at 1440px desktop"],
  ] as const) {
    if (!vp) {
      out.push({ checkKey: key, title: label, detail: "The page did not load at this width.", status: "unable_to_verify", severity: "medium", method: "browser", category: "responsive" });
      continue;
    }
    const bad = vp.overflowPx > 1;
    out.push({
      checkKey: key,
      title: label,
      detail: bad ? `Content is ${vp.overflowPx}px wider than the ${vp.width}px viewport, so the page scrolls sideways.` : `Content fits within ${vp.width}px.`,
      status: bad ? "verified_fail" : "verified_pass",
      severity: bad ? (vp.name === "mobile" ? "high" : "medium") : "info",
      evidence: `document.scrollWidth - innerWidth = ${vp.overflowPx}px at ${vp.width}×${vp.height}`,
      recommendation: bad ? `Find the element wider than ${vp.width}px (fixed widths, large images, long unbroken text, negative margins) and constrain it at this breakpoint.` : "",
      verification: `Load the page at ${vp.width}px wide and confirm there is no horizontal scrollbar.`,
      method: "browser",
      category: "responsive",
    });
  }

  const errors = [...run.pageErrors, ...run.consoleErrors];
  out.push({
    checkKey: "browser:console_errors",
    title: "No JavaScript errors on load",
    detail: errors.length ? `${errors.length} error(s) while loading.` : "No console or uncaught errors during load (desktop run).",
    status: errors.length ? "verified_fail" : "verified_pass",
    severity: errors.length ? "high" : "info",
    evidence: errors.slice(0, 6).join("\n"),
    recommendation: errors.length ? "Fix the listed errors; uncaught errors often stop interactive features from working." : "",
    verification: "Open devtools console and reload.",
    method: "browser",
    category: "technical",
  });

  const failed = [...new Set(run.failedRequests)];
  out.push({
    checkKey: "browser:failed_requests",
    title: "All requests succeed",
    detail: failed.length ? `${failed.length} request(s) failed or returned 4xx/5xx.` : "No failed requests during load.",
    status: failed.length ? "verified_fail" : "verified_pass",
    severity: failed.length ? "medium" : "info",
    evidence: failed.slice(0, 6).join("\n"),
    recommendation: failed.length ? "Fix or remove the missing resources (broken image paths, missing fonts, failing API calls)." : "",
    verification: "Check the network panel for red entries.",
    method: "browser",
    category: "technical",
  });

  if (run.blockedRequests.length)
    out.push({
      checkKey: "browser:blocked_requests",
      title: "Requests blocked by the auditor",
      detail: `${run.blockedRequests.length} request(s) pointed at private or non-web addresses and were blocked for safety. Parts of the page may not have loaded.`,
      status: "unable_to_verify",
      severity: "info",
      evidence: run.blockedRequests.slice(0, 5).join("\n"),
      method: "browser",
      category: "technical",
    });

  if (run.axe && "violations" in run.axe) {
    const vs = run.axe.violations.filter((v) => !AXE_DUPLICATES.has(v.id));
    for (const v of vs.slice(0, 12))
      out.push({
        checkKey: `axe:${v.id}`,
        title: v.help,
        detail: `${v.nodes} element${v.nodes === 1 ? "" : "s"} (axe-core rule ${v.id}).`,
        status: "verified_fail",
        severity: IMPACT_SEVERITY[v.impact ?? ""] ?? "medium",
        evidence: v.targets.join("\n"),
        recommendation: `Fix per ${v.helpUrl}`,
        verification: "Re-run the audit; the axe-core rule should no longer report these elements.",
        method: "browser",
        category: "accessibility",
      });
    out.push({
      checkKey: "axe:summary",
      title: "Automated accessibility rules (WCAG A/AA)",
      detail: vs.length ? `${vs.length} rule${vs.length === 1 ? "" : "s"} failed.` : "No violations found by axe-core. Automated rules catch only part of accessibility issues.",
      status: vs.length ? "verified_fail" : "verified_pass",
      severity: vs.length ? "medium" : "info",
      method: "browser",
      category: "accessibility",
    });
  } else if (run.axe && "error" in run.axe) {
    out.push({ checkKey: "axe:summary", title: "Automated accessibility rules (WCAG A/AA)", detail: `Could not run: ${run.axe.error}`, status: "unable_to_verify", severity: "info", method: "browser", category: "accessibility" });
  }

  const m = run.mobileMenu;
  if (m && m.state !== "no_nav") {
    const map = {
      visible: ["verified_pass", "info", `${m.links} navigation links visible at 390px.`],
      opened: ["verified_pass", "info", m.detail ?? "Menu opens."],
      dead_button: ["likely_issue", "high", m.detail ?? "The menu button did not reveal navigation."],
      no_button: ["likely_issue", "high", `Navigation is hidden on phones and no menu button was found (${m.detail}).`],
      error: ["unable_to_verify", "info", m.detail ?? "Could not test."],
    } as const;
    const [status, severity, detail] = map[m.state as keyof typeof map];
    out.push({
      checkKey: "browser:mobile_menu",
      title: "Navigation works on phones",
      detail,
      status,
      severity,
      recommendation: status === "likely_issue" ? "Make the navigation reachable at phone widths: a visible menu button that toggles the links (and sets aria-expanded)." : "",
      verification: "At 390px wide, tap the menu button and confirm the links appear and work.",
      method: "browser",
      category: "responsive",
    });
  }

  if (desktop)
    out.push({
      checkKey: "browser:load_time",
      title: "Load time (single run)",
      detail: `Loaded in ${(desktop.loadMs / 1000).toFixed(1)}s from the auditor's server. One sample from one location, not a performance benchmark.`,
      status: desktop.loadMs > 8000 ? "likely_issue" : "subjective",
      severity: desktop.loadMs > 8000 ? "medium" : "info",
      method: "browser",
      category: "performance",
      verification: "Run Lighthouse or WebPageTest for a proper measurement.",
    });
  return out;
}
