/**
 * Tiny element builder. Text is always set with textContent, never parsed as
 * HTML, so nothing from the page or the network can inject markup.
 */
type Child = Node | string | null | undefined | false;
type Props = Record<string, string | number | boolean | EventListener | undefined> & { class?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}

const SVG = "http://www.w3.org/2000/svg";

function icon(paths: string[], size: number, strokeWidth = 2): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", String(strokeWidth));
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("fill", "none");
    svg.append(p);
  }
  return svg;
}

/** The UPSHIFT mark: two rising chevrons. */
export const mark = (size = 14) => icon(["M6 13.5 12 8l6 5.5", "M6 19 12 13.5l6 5.5"], size, 2.2);
export const closeIcon = (size = 12) => icon(["M6 6l12 12", "M18 6 6 18"], size, 2);
