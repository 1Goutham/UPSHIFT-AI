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
/** The UPSHIFT asterisk. */
export function star(size = 14): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", "M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "2");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("fill", "none");
  svg.append(p);
  return svg;
}
