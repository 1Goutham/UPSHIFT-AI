/** Scoped to the closed shadow root: nothing leaks into, or in from, the host page. */
export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.root { --bg:#0b0b0b; --raise:#151515; --line:rgba(255,255,255,.1); --line2:rgba(255,255,255,.22); --ink:#fff; --ink2:rgba(255,255,255,.72); --ink3:rgba(255,255,255,.5); --accent:#9dff50; --fail:#ff6b57; --warn:#f5c451;
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); -webkit-font-smoothing: antialiased; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid rgba(157,255,80,.6); outline-offset: 2px; }

.fab { position: fixed; z-index: 2147483646; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px 0 8px; border-radius: 999px;
  background: #000; border: 1px solid var(--line2); color: var(--accent); box-shadow: 0 6px 20px -8px rgba(0,0,0,.7);
  transition: transform .3s cubic-bezier(.16,1,.3,1), border-color .2s, opacity .2s; }
.fab:hover { transform: translateY(-1px); border-color: rgba(157,255,80,.6); }
.fab:active { transform: scale(.96); }
.fab .lbl { font-size: 11px; letter-spacing: .12em; font-weight: 600; color: var(--ink); }
.fab .badge { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--accent); color: #000; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.fab[data-busy] svg { animation: spin 1.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.panel { position: fixed; z-index: 2147483647; width: 384px; max-width: calc(100vw - 16px); display: flex; flex-direction: column; overflow: hidden;
  background: var(--bg); border: 1px solid var(--line2); border-radius: 12px; box-shadow: 0 24px 60px -20px rgba(0,0,0,.85); animation: rise .28s cubic-bezier(.16,1,.3,1) both; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.head .brand { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font-size: 11px; letter-spacing: .14em; font-weight: 700; }
.head .brand span { color: var(--ink); }
.head .plat { color: var(--ink3); font-size: 11px; }
.head .x { margin-left: auto; width: 24px; height: 24px; border-radius: 6px; color: var(--ink3); }
.head .x:hover { background: var(--raise); color: var(--ink); }
.body { padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.lead { font-size: 14px; color: var(--ink); }
.muted { color: var(--ink3); }
.list { display: flex; flex-direction: column; gap: 4px; }
.gap { display: flex; gap: 8px; align-items: baseline; color: var(--ink2); }
.gap .plus { color: var(--accent); width: 10px; flex: none; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; font-size: 11px; color: var(--ink2); }
.chip.q { border-style: dashed; }
.eyebrow { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); }
.modes { display: grid; grid-template-columns: repeat(3,1fr); gap: 2px; padding: 2px; background: var(--raise); border-radius: 8px; }
.modes button { height: 28px; border-radius: 6px; color: var(--ink3); font-size: 12px; }
.modes button[aria-checked="true"] { background: #000; color: var(--ink); box-shadow: inset 0 0 0 1px var(--line2); }
.primary { height: 34px; border-radius: 8px; background: var(--accent); color: #000; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: transform .2s; }
.primary:hover { transform: translateY(-1px); }
.primary:disabled { opacity: .5; cursor: default; transform: none; }
.ghost { height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line2); color: var(--ink); font-size: 12px; }
.ghost:hover { background: var(--raise); }
.quiet { height: 28px; padding: 0 8px; border-radius: 6px; color: var(--ink3); font-size: 12px; }
.quiet:hover { color: var(--ink); background: var(--raise); }
.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.out { width: 100%; min-height: 140px; max-height: 300px; resize: vertical; background: #000; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 10px; font: 12.5px/1.55 ui-monospace, Menlo, monospace; white-space: pre-wrap; overflow: auto; }
textarea.out { outline: none; }
.diff { white-space: pre-wrap; }
.diff .del { color: var(--fail); text-decoration: line-through; opacity: .75; }
.diff .add { background: rgba(157,255,80,.14); color: var(--ink); border-radius: 2px; }
.meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--ink3); }
.ok { color: var(--accent); } .warn { color: var(--warn); } .bad { color: var(--fail); }
.note { font-size: 12px; color: var(--ink2); border-left: 2px solid var(--line2); padding-left: 8px; }
.msg { font-size: 12px; padding: 8px 10px; border-radius: 8px; background: var(--raise); color: var(--ink2); }
.msg.err { color: var(--ink); box-shadow: inset 2px 0 0 var(--fail); }
.foot { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-top: 1px solid var(--line); font-size: 11px; color: var(--ink3); }
.foot button { color: var(--ink3); font-size: 11px; } .foot button:hover { color: var(--ink); }
.spin { width: 14px; height: 14px; animation: spin 1.4s linear infinite; color: var(--accent); }
details summary { cursor: pointer; list-style: none; font-size: 11px; color: var(--ink3); } details summary:hover { color: var(--ink); }
details[open] summary { margin-bottom: 6px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
