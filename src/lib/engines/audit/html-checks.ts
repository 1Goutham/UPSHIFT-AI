import { parse, type HTMLElement } from "node-html-parser";
import type { FindingDraft } from "./types";

/**
 * Deterministic checks over a page's served HTML. They inspect markup only:
 * client-rendered content that does not exist in the initial HTML is covered
 * by the browser run, not here, and the findings say so.
 */

const PLACEHOLDER_PATTERNS: [RegExp, string][] = [
  [/lorem ipsum/i, "Lorem ipsum"],
  [/\b(your name|john doe|jane doe)\b/i, "Placeholder name"],
  [/\b(example\.com|yourdomain\.com|yoursite\.com)\b/i, "Placeholder domain"],
  [/\b(TODO|FIXME|TBD)\b/, "TODO marker"],
  [/\[(insert|add|your) [^\]]{2,40}\]/i, "Bracketed placeholder"],
  [/\b(placeholder text|sample text|coming soon)\b/i, "Placeholder copy"],
];

export function findPlaceholders(text: string) {
  const hits: string[] = [];
  for (const [re, label] of PLACEHOLDER_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const i = m.index ?? 0;
      hits.push(`${label}: "…${text.slice(Math.max(0, i - 30), i + m[0].length + 30).replace(/\s+/g, " ").trim()}…"`);
    }
  }
  return hits;
}

const accessibleName = (el: HTMLElement) =>
  (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || el.text || "").trim() ||
  el.querySelector("img[alt]")?.getAttribute("alt")?.trim() ||
  (el.querySelector("svg title")?.text ?? "").trim();

const describe = (el: HTMLElement) => {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join("");
  return `<${tag}${id}${cls}>`;
};

const list = (items: string[], max = 5) => items.slice(0, max).join("\n") + (items.length > max ? `\n…and ${items.length - max} more` : "");

export type HtmlFacts = { title: string; text: string; bytes: number; scripts: number; clientRendered: boolean };

export function runHtmlChecks(html: string, finalUrl: string, httpStatus: number): { findings: FindingDraft[]; facts: HtmlFacts } {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const out: FindingDraft[] = [];
  const d = (f: Omit<FindingDraft, "method">) => out.push({ ...f, method: "deterministic" });

  const ok = httpStatus >= 200 && httpStatus < 300;
  d({
    checkKey: "check:http_status",
    title: "Page responds successfully",
    detail: ok ? `The server answered with HTTP ${httpStatus}.` : `The server answered with HTTP ${httpStatus}.`,
    status: ok ? "verified_pass" : "verified_fail",
    severity: ok ? "info" : "critical",
    evidence: `GET ${finalUrl} -> ${httpStatus}`,
    recommendation: ok ? "" : "Make sure the deployed URL serves the page (check the deployment, routing and access settings).",
    verification: "Reload the URL and confirm a 200 response.",
    category: "technical",
  });

  const https = finalUrl.startsWith("https://");
  d({
    checkKey: "check:https",
    title: "Served over HTTPS",
    detail: https ? "The final URL uses HTTPS." : "The page is served over plain HTTP.",
    status: https ? "verified_pass" : "verified_fail",
    severity: https ? "info" : "high",
    evidence: finalUrl,
    recommendation: https ? "" : "Serve the site over HTTPS and redirect HTTP to it.",
    verification: "Open the http:// address and confirm it redirects to https://.",
    category: "technical",
  });

  const title = root.querySelector("title")?.text.trim() ?? "";
  d({
    checkKey: "check:title",
    title: "Page has a title",
    detail: title ? `Title: "${title.slice(0, 120)}"` : "There is no <title>, so tabs, bookmarks and search results show the URL.",
    status: title ? "verified_pass" : "verified_fail",
    severity: title ? "info" : "medium",
    evidence: title ? `<title>${title.slice(0, 120)}</title>` : "No <title> element found in the served HTML.",
    recommendation: title ? "" : "Add a <title> that names the site and page.",
    verification: "View source and confirm a non-empty <title>.",
    category: "technical",
  });

  const metaDesc = root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
  d({
    checkKey: "check:meta_description",
    title: "Meta description present",
    detail: metaDesc ? `"${metaDesc.slice(0, 160)}"` : "No meta description. Search engines and link previews will improvise one.",
    status: metaDesc ? "verified_pass" : "verified_fail",
    severity: metaDesc ? "info" : "low",
    evidence: metaDesc ? "" : 'No <meta name="description"> found.',
    recommendation: metaDesc ? "" : "Add a one-sentence meta description.",
    verification: 'View source and confirm <meta name="description" content="…">.',
    category: "technical",
  });

  const viewport = root.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
  const vpOk = /width\s*=\s*device-width/i.test(viewport);
  d({
    checkKey: "check:viewport",
    title: "Mobile viewport configured",
    detail: vpOk ? `viewport="${viewport}"` : "Without a device-width viewport, phones render the desktop layout zoomed out.",
    status: vpOk ? "verified_pass" : "verified_fail",
    severity: vpOk ? "info" : "high",
    evidence: viewport ? `<meta name="viewport" content="${viewport}">` : 'No <meta name="viewport"> found.',
    recommendation: vpOk ? "" : 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    verification: "Open the page on a phone-width viewport and confirm it is not zoomed out.",
    category: "responsive",
  });

  const lang = root.querySelector("html")?.getAttribute("lang") ?? "";
  d({
    checkKey: "check:lang",
    title: "Page language declared",
    detail: lang ? `lang="${lang}"` : "Screen readers cannot pick the right pronunciation without a lang attribute.",
    status: lang ? "verified_pass" : "verified_fail",
    severity: lang ? "info" : "medium",
    evidence: lang ? "" : "<html> has no lang attribute.",
    recommendation: lang ? "" : 'Add lang="en" (or the right language) to the <html> element.',
    verification: "View source and confirm <html lang=…>.",
    category: "accessibility",
  });

  const imgs = root.querySelectorAll("img");
  const noAlt = imgs.filter((i) => i.getAttribute("alt") === undefined);
  d({
    checkKey: "check:img_alt",
    title: "Images have alt attributes",
    detail: imgs.length
      ? noAlt.length
        ? `${noAlt.length} of ${imgs.length} images have no alt attribute.`
        : `All ${imgs.length} images in the served HTML have an alt attribute.`
      : "No <img> elements in the served HTML.",
    status: noAlt.length ? "verified_fail" : "verified_pass",
    severity: noAlt.length ? "medium" : "info",
    evidence: noAlt.length ? list(noAlt.map((i) => `<img src="${(i.getAttribute("src") ?? "").slice(0, 80)}">`)) : "",
    recommendation: noAlt.length ? 'Add alt text describing each meaningful image; use alt="" for purely decorative ones.' : "",
    verification: "Search the markup for <img> without alt.",
    category: "accessibility",
  });

  const h1s = root.querySelectorAll("h1");
  d({
    checkKey: "check:h1",
    title: "One main heading",
    detail: h1s.length === 1 ? `H1: "${h1s[0].text.trim().slice(0, 100)}"` : h1s.length === 0 ? "No <h1> in the served HTML." : `${h1s.length} <h1> elements.`,
    status: h1s.length === 1 ? "verified_pass" : h1s.length === 0 ? "verified_fail" : "subjective",
    severity: h1s.length === 1 ? "info" : "low",
    evidence: h1s.length > 1 ? list(h1s.map((h) => `<h1>${h.text.trim().slice(0, 60)}</h1>`)) : "",
    recommendation: h1s.length === 1 ? "" : "Use a single <h1> for the page's main heading and <h2>+ for sections.",
    verification: "Count <h1> elements in the rendered page.",
    category: "accessibility",
  });

  const headingLevels = root.querySelectorAll("h1,h2,h3,h4,h5,h6").map((h) => Number(h.tagName[1]));
  const skips: string[] = [];
  for (let i = 1; i < headingLevels.length; i++)
    if (headingLevels[i] - headingLevels[i - 1] > 1) skips.push(`h${headingLevels[i - 1]} -> h${headingLevels[i]}`);
  if (headingLevels.length > 1)
    d({
      checkKey: "check:heading_order",
      title: "Heading levels in order",
      detail: skips.length ? `Heading levels skip ${skips.length} time(s).` : "Heading levels do not skip.",
      status: skips.length ? "verified_fail" : "verified_pass",
      severity: skips.length ? "low" : "info",
      evidence: skips.length ? list([...new Set(skips)]) : "",
      recommendation: skips.length ? "Do not skip heading levels; choose levels by structure, not by size." : "",
      verification: "Inspect the heading outline.",
      category: "accessibility",
    });

  const labelled = new Set(root.querySelectorAll("label[for]").map((l) => l.getAttribute("for")));
  const fields = root
    .querySelectorAll("input, select, textarea")
    .filter((el) => !["hidden", "submit", "button", "reset", "image"].includes((el.getAttribute("type") ?? "").toLowerCase()));
  const unlabelled = fields.filter(
    (el) =>
      !(el.id && labelled.has(el.id)) &&
      !el.getAttribute("aria-label") &&
      !el.getAttribute("aria-labelledby") &&
      !el.closest("label") &&
      !el.getAttribute("title"),
  );
  if (fields.length)
    d({
      checkKey: "check:form_labels",
      title: "Form fields have labels",
      detail: unlabelled.length ? `${unlabelled.length} of ${fields.length} fields have no label.` : `All ${fields.length} fields are labelled.`,
      status: unlabelled.length ? "verified_fail" : "verified_pass",
      severity: unlabelled.length ? "medium" : "info",
      evidence: unlabelled.length ? list(unlabelled.map(describe)) : "",
      recommendation: unlabelled.length ? "Give each field a <label for> or aria-label. Placeholder text is not a label." : "",
      verification: "Tab through the form with a screen reader or check each field's accessible name.",
      category: "accessibility",
    });

  const interactive = [...root.querySelectorAll("a[href]"), ...root.querySelectorAll("button")];
  const nameless = interactive.filter((el) => !accessibleName(el));
  if (interactive.length)
    d({
      checkKey: "check:control_names",
      title: "Links and buttons have accessible names",
      detail: nameless.length ? `${nameless.length} links/buttons have no text or label.` : "Every link and button has a name.",
      status: nameless.length ? "verified_fail" : "verified_pass",
      severity: nameless.length ? "medium" : "info",
      evidence: nameless.length ? list(nameless.map(describe)) : "",
      recommendation: nameless.length ? "Add visible text or aria-label to icon-only links and buttons." : "",
      verification: "Check each control's accessible name in the browser accessibility inspector.",
      category: "accessibility",
    });

  const ids = new Set(root.querySelectorAll("[id]").map((e) => e.id));
  const anchors = root.querySelectorAll('a[href^="#"]').map((a) => a.getAttribute("href") ?? "");
  const deadAnchors = [...new Set(anchors.filter((h) => h.length > 1 && !ids.has(decodeURIComponent(h.slice(1)))))];
  const inert = root
    .querySelectorAll("a[href]")
    .filter((a) => /^(#|javascript:\s*(void\(0\)|;)?)$/i.test((a.getAttribute("href") ?? "").trim()) && !a.getAttribute("role") && !a.getAttribute("onclick"));
  if (anchors.length || inert.length)
    d({
      checkKey: "check:dead_links",
      title: "In-page links lead somewhere",
      detail:
        deadAnchors.length || inert.length
          ? [
              deadAnchors.length ? `${deadAnchors.length} in-page link(s) point to ids that do not exist in the served HTML.` : "",
              inert.length ? `${inert.length} link(s) use href="#" or javascript: and may do nothing.` : "",
            ]
              .filter(Boolean)
              .join(" ")
          : "Every in-page link points to an existing id.",
      status: deadAnchors.length ? "verified_fail" : inert.length ? "likely_issue" : "verified_pass",
      severity: deadAnchors.length || inert.length ? "medium" : "info",
      evidence: list([...deadAnchors.map((h) => `href="${h}" (no matching id)`), ...inert.map((a) => `${describe(a)} "${a.text.trim().slice(0, 40)}"`)]),
      recommendation: deadAnchors.length || inert.length ? "Point each link at a real section id or page, or remove it. Placeholder links read as broken features." : "",
      verification: "Click each navigation link and confirm it scrolls or navigates.",
      category: "functionality",
    });

  if (https) {
    const insecure = [
      ...root.querySelectorAll("script[src], img[src], iframe[src], source[src], audio[src], video[src]").map((e) => e.getAttribute("src") ?? ""),
      ...root.querySelectorAll('link[rel="stylesheet"][href]').map((e) => e.getAttribute("href") ?? ""),
    ].filter((u) => u.startsWith("http://"));
    d({
      checkKey: "check:mixed_content",
      title: "No insecure (http://) resources",
      detail: insecure.length ? `${insecure.length} resource(s) load over plain HTTP and will be blocked or flagged by browsers.` : "No http:// resources in the served HTML.",
      status: insecure.length ? "verified_fail" : "verified_pass",
      severity: insecure.length ? "medium" : "info",
      evidence: list(insecure),
      recommendation: insecure.length ? "Load every resource over https://." : "",
      verification: "Check the browser console for mixed-content warnings.",
      category: "technical",
    });
  }

  const bodyEl = root.querySelector("body");
  const text = (bodyEl?.structuredText ?? root.structuredText).replace(/\n{3,}/g, "\n\n").trim();
  const placeholders = findPlaceholders(text);
  d({
    checkKey: "check:placeholder_content",
    title: "No placeholder content",
    detail: placeholders.length ? `${placeholders.length} kind(s) of placeholder text found.` : "No common placeholder patterns found in the served text.",
    status: placeholders.length ? "verified_fail" : "verified_pass",
    severity: placeholders.length ? "high" : "info",
    evidence: list(placeholders),
    recommendation: placeholders.length ? "Replace placeholder text with real content, or remove the section." : "",
    verification: "Search the page text for the listed snippets.",
    category: "content",
  });

  const bytes = Buffer.byteLength(html);
  const scripts = root.querySelectorAll("script").length;
  // An app shell: scripts plus an empty mount node, or almost no text at all.
  const mount = root.querySelector("#root, #app, #__next, #__nuxt, #svelte, [data-reactroot]");
  const clientRendered = scripts > 0 && (text.length < 40 || (!!mount && mount.text.trim().length < 20 && text.length < 400));
  d({
    checkKey: "check:html_weight",
    title: "HTML document size",
    detail: `${(bytes / 1024).toFixed(0)} KB of HTML, ${scripts} script tag(s).`,
    status: bytes > 600 * 1024 ? "verified_fail" : "verified_pass",
    severity: bytes > 600 * 1024 ? "low" : "info",
    evidence: "",
    recommendation: bytes > 600 * 1024 ? "Large HTML usually means inlined data or images; move them to separate, cacheable files." : "",
    verification: "Measure the document transfer size in the browser network panel.",
    category: "performance",
  });

  if (clientRendered)
    out.push({
      checkKey: "check:client_rendered",
      title: "Content is rendered by JavaScript",
      detail:
        "The served HTML contains almost no text. Markup checks above only see the initial shell; the browser run and screenshots are needed to judge the real page.",
      status: "subjective",
      severity: "info",
      method: "deterministic",
      category: "technical",
      evidence: `${text.length} characters of text in served HTML.`,
      recommendation: "If search visibility or first paint matter, consider server rendering or static generation.",
      verification: "Disable JavaScript and reload the page.",
    });

  return { findings: out, facts: { title, text: text.slice(0, 30_000), bytes, scripts, clientRendered } };
}

const SKIP_EXT = /\.(pdf|zip|png|jpe?g|gif|webp|svg|mp4|mp3|webm|ico|xml|json|txt|css|js)$/i;

/** Same-origin page links from the served HTML, normalised, without the page itself. */
export function extractInternalLinks(html: string, baseUrl: string, max = 8): string[] {
  const base = new URL(baseUrl);
  const root = parse(html);
  const out: string[] = [];
  const seen = new Set([base.origin + base.pathname.replace(/\/$/, "")]);
  for (const a of root.querySelectorAll("a[href]")) {
    const href = (a.getAttribute("href") ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (u.origin !== base.origin || SKIP_EXT.test(u.pathname)) continue;
    const key = u.origin + u.pathname.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u.origin + u.pathname + u.search);
    if (out.length >= max) break;
  }
  return out;
}

export type CrawledPage = { url: string; status: number; title?: string; placeholders?: string[]; error?: string };

/** Findings for the extra pages reached from the landing page. */
export function crawlFindings(homeTitle: string, pages: CrawledPage[]): FindingDraft[] {
  if (!pages.length) return [];
  const out: FindingDraft[] = [];
  const broken = pages.filter((p) => p.error || p.status >= 400);
  out.push({
    checkKey: "check:internal_links",
    title: "Internal links work",
    detail: broken.length ? `${broken.length} of ${pages.length} linked pages failed to load.` : `All ${pages.length} linked pages load.`,
    status: broken.length ? "verified_fail" : "verified_pass",
    severity: broken.length ? "high" : "info",
    evidence: (broken.length ? broken : pages).slice(0, 8).map((p) => `${p.status || "error"} ${p.url}${p.error ? ` (${p.error})` : ""}`).join("\n"),
    recommendation: broken.length ? "Create the missing pages or point the links somewhere real." : "",
    verification: "Click each link in the navigation and footer.",
    method: "deterministic",
    category: "functionality",
  });
  const ph = pages.filter((p) => p.placeholders?.length);
  if (pages.some((p) => p.placeholders))
    out.push({
      checkKey: "check:inner_placeholders",
      title: "Inner pages have real content",
      detail: ph.length ? `Placeholder text on ${ph.length} page(s).` : "No placeholder text on linked pages.",
      status: ph.length ? "verified_fail" : "verified_pass",
      severity: ph.length ? "high" : "info",
      evidence: ph.slice(0, 5).map((p) => `${new URL(p.url).pathname}: ${p.placeholders![0]}`).join("\n"),
      recommendation: ph.length ? "Replace placeholder copy on these pages." : "",
      method: "deterministic",
      category: "content",
    });
  const titled = pages.filter((p) => p.title !== undefined && !p.error && p.status < 400);
  if (titled.length && homeTitle) {
    const same = titled.filter((p) => p.title === homeTitle);
    out.push({
      checkKey: "check:distinct_titles",
      title: "Pages have their own titles",
      detail: same.length ? `${same.length} of ${titled.length} pages reuse the home page title "${homeTitle.slice(0, 60)}".` : "Each linked page has its own title.",
      status: same.length ? "verified_fail" : "verified_pass",
      severity: same.length ? "low" : "info",
      evidence: same.slice(0, 5).map((p) => new URL(p.url).pathname).join("\n"),
      recommendation: same.length ? "Give each page a title that names that page." : "",
      method: "deterministic",
      category: "technical",
    });
  }
  return out;
}

/** Title and placeholder text of an inner page. */
export function pageFacts(html: string) {
  const root = parse(html, { blockTextElements: { script: true, style: true, noscript: true } });
  return { title: root.querySelector("title")?.text.trim() ?? "", placeholders: findPlaceholders((root.querySelector("body") ?? root).structuredText) };
}
