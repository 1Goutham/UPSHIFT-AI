/** Scoped to the closed shadow root: nothing leaks into, or in from, the host page. */
export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.root {
  --surface: rgba(28,28,30,.82); --solid: #1c1c1e; --fill: rgba(118,118,128,.24); --fill2: rgba(118,118,128,.16);
  --line: rgba(255,255,255,.08); --ink: #f5f5f7; --ink2: rgba(235,235,245,.68); --ink3: rgba(235,235,245,.45);
  --btn: #f5f5f7; --btnInk: #000; --ok: #30d158; --warn: #ffd60a; --del: #ff6961; --addBg: rgba(48,209,88,.18);
  --shadow: 0 0 0 .5px rgba(0,0,0,.6), 0 20px 50px -12px rgba(0,0,0,.6);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif;
  color: var(--ink); -webkit-font-smoothing: antialiased; letter-spacing: -.003em;
}
.root[data-theme="light"] {
  --surface: rgba(255,255,255,.86); --solid: #fff; --fill: rgba(118,118,128,.14); --fill2: rgba(118,118,128,.08);
  --line: rgba(0,0,0,.08); --ink: #1d1d1f; --ink2: rgba(60,60,67,.78); --ink3: rgba(60,60,67,.5);
  --btn: #1d1d1f; --btnInk: #fff; --ok: #248a3d; --warn: #b25000; --del: #d70015; --addBg: rgba(52,199,89,.16);
  --shadow: 0 0 0 .5px rgba(0,0,0,.1), 0 20px 50px -12px rgba(0,0,0,.22);
}
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
button:focus-visible, textarea:focus-visible, .out:focus-visible, summary:focus-visible { outline: 3px solid rgba(10,132,255,.55); outline-offset: 1px; }

.fab { position: fixed; z-index: 2147483646; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center;
  background: var(--surface); color: var(--ink); box-shadow: var(--shadow); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%);
  transition: transform .35s cubic-bezier(.2,.9,.3,1.2), opacity .2s; }
.fab:hover { transform: scale(1.08); }
.fab:active { transform: scale(.94); }
.fab .badge { position: absolute; top: -3px; right: -3px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--btn); color: var(--btnInk);
  font-size: 10px; font-weight: 600; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
.fab[data-busy] svg { animation: breathe 1.2s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: .35; transform: translateY(-1px); } }

.panel { position: fixed; z-index: 2147483647; width: 360px; max-width: calc(100vw - 16px); display: flex; flex-direction: column; overflow: hidden;
  background: var(--surface); border-radius: 18px; box-shadow: var(--shadow); backdrop-filter: blur(30px) saturate(180%); -webkit-backdrop-filter: blur(30px) saturate(180%);
  animation: rise .32s cubic-bezier(.2,.9,.3,1) both; transform-origin: bottom right; }
@keyframes rise { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
.head { display: flex; align-items: center; gap: 8px; padding: 14px 14px 0 18px; }
.brand { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: .08em; color: var(--ink); }
.plat { color: var(--ink3); font-size: 12px; }
.x { margin-left: auto; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--fill2); color: var(--ink2); transition: background .15s; }
.x:hover { background: var(--fill); color: var(--ink); }
.body { padding: 14px 18px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }

.title { font-size: 17px; font-weight: 600; letter-spacing: -.02em; color: var(--ink); }
.titlerow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.muted { color: var(--ink2); }
.small { font-size: 12px; margin-top: -6px; color: var(--ink3); }
.gaps { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.gaps li { position: relative; padding-left: 14px; color: var(--ink2); }
.gaps li::before { content: ""; position: absolute; left: 2px; top: .62em; width: 5px; height: 5px; border-radius: 50%; background: var(--ink3); }

.seg { display: grid; grid-template-columns: repeat(3,1fr); padding: 2px; border-radius: 9px; background: var(--fill2); }
.seg button { height: 28px; border-radius: 7px; color: var(--ink2); font-size: 12.5px; font-weight: 500; transition: background .2s, color .2s; }
.seg button[aria-checked="true"] { background: var(--solid); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 0 0 .5px var(--line); }

.primary, .secondary { height: 36px; border-radius: 10px; font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; transition: transform .15s, opacity .15s; }
.primary { background: var(--btn); color: var(--btnInk); }
.secondary { background: var(--fill); color: var(--ink); }
.primary:active, .secondary:active { transform: scale(.98); }
.primary:hover, .secondary:hover { opacity: .88; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.links { display: flex; justify-content: center; gap: 18px; margin-top: -4px; }
.links button { font-size: 12.5px; color: var(--ink2); padding: 2px 0; }
.links button:hover, .links button[aria-pressed="true"] { color: var(--ink); }

.out { width: 100%; min-height: 120px; max-height: 280px; overflow: auto; resize: none; padding: 12px 14px; border-radius: 12px; border: 0;
  background: var(--fill2); color: var(--ink); font: 13.5px/1.55 inherit; font-family: inherit; white-space: pre-wrap; }
textarea.out { outline: none; resize: vertical; box-shadow: inset 0 0 0 1.5px rgba(10,132,255,.6); }
.diff .del { color: var(--del); text-decoration: line-through; opacity: .8; }
.diff .add { background: var(--addBg); border-radius: 3px; }
.pill { font-size: 11.5px; font-weight: 500; padding: 3px 9px; border-radius: 999px; background: var(--fill2); white-space: pre; font-variant-numeric: tabular-nums; }
.pill.ok { color: var(--ok); } .pill.warn { color: var(--warn); }
.note { font-size: 12.5px; color: var(--ink2); }
.note.warn { color: var(--warn); }

.skeleton { display: flex; flex-direction: column; gap: 8px; }
.skeleton span { height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--fill2) 0%, var(--fill) 50%, var(--fill2) 100%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
.skeleton span:nth-child(2) { width: 86%; } .skeleton span:nth-child(3) { width: 62%; }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }

details summary { cursor: pointer; list-style: none; font-size: 12.5px; color: var(--ink2); display: inline-flex; align-items: center; gap: 6px; }
details summary::-webkit-details-marker { display: none; }
details summary::after { content: ""; width: 5px; height: 5px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg) translateY(-2px); transition: transform .2s; }
details[open] summary::after { transform: rotate(-135deg) translateY(-1px); }
details summary:hover { color: var(--ink); }
.whylist { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
.why { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 11px; font-weight: 600; color: var(--ink3); letter-spacing: .02em; }

.off { align-self: center; margin: -6px 0 14px; font-size: 11.5px; color: var(--ink3); }
.off:hover { color: var(--ink2); }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
