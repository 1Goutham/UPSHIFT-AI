// Tiny static server for e2e: /v1 is a flawed AI-generated page, /v2 the fixed one.
import http from "node:http";

const v1 = `<!doctype html><html><head><title>Ana Ruiz</title><meta name="viewport" content="width=device-width"><style>@media (max-width:600px){nav{display:none}}</style></head><body style="margin:0;font-family:sans-serif">
<nav><a href="#work">Work</a> <a href="#contact">Contact</a> <a href="/v1/about">About</a> <a href="#"></a></nav>
<header style="width:900px;padding:40px;background:#111;color:#fff"><h1>Ana Ruiz, product designer</h1></header>
<section id="work"><h3>Selected work</h3><img src="/missing.png"><p>Lorem ipsum dolor sit amet.</p></section>
<script>window.undefinedFn();</script>
</body></html>`;

const v2 = `<!doctype html><html lang="en"><head><title>Ana Ruiz, product designer</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Portfolio of Ana Ruiz">
</head><body style="margin:0;font-family:sans-serif">
<nav><a href="#work">Work</a> <a href="#contact">Contact</a> <a href="/v2/about">About</a></nav>
<header style="max-width:900px;padding:40px;background:#111;color:#fff"><h1>Ana Ruiz, product designer</h1></header>
<section id="work"><h2>Selected work</h2><img src="/ok.svg" alt="Checkout redesign"><p>Checkout redesign that cut drop-off by 18%.</p></section>
<section id="contact"><h2>Contact</h2><label for="e">Email</label><input id="e" type="email"></section>
</body></html>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>`;

/**
 * Fake model upstream (OpenAI-compatible, like xAI) for the extension tests:
 * returns a schema-valid refinement built from the user's prompt. It lets the
 * real server, provider and extension run end to end without a paid key.
 */
function fakeCompletion(body) {
  const user = body.messages?.[1]?.content?.map?.((p) => p.text ?? "").join("\n") ?? "";
  const prompt = (user.match(/<untrusted_input source="user prompt">\n([\s\S]*?)\n<\/untrusted_input>/) ?? [])[1] ?? "";
  const name = body.response_format?.json_schema?.name ?? "";
  const mode = name.split("_")[1] ?? "quick";
  const refined = `${prompt.replace(/cool/g, "high-contrast").replace(/some animations/g, "subtle scroll animations")}\n\nAudience: {{who it is for}}. Output: a single responsive page.`;
  const content = {
    analysis: { intent: "Build a personal site", taskType: "website build", strengths: ["Clear subject"], ambiguities: [{ phrase: "cool", why: "Means different things" }], missingContext: [{ item: "Target audience", why: "Shapes tone" }, { item: "Output format", why: "Stack unknown" }], assumptions: ["A single page"] },
    refined,
    changes: [{ change: "Defined “cool”", reason: "Concrete visual direction" }],
    assumptions: ["Single responsive page"],
    placeholders: ["{{who it is for}}"],
    platformNotes: mode === "expert" ? ["General practice: an explicit output format helps any model."] : [],
  };
  return { id: "fake", model: "fake-grok", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }], usage: { prompt_tokens: 50, completion_tokens: 60 } };
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(fakeCompletion(JSON.parse(raw)))));
      return;
    }
    if (req.url === "/v1") return res.writeHead(200, { "content-type": "text/html" }).end(v1);
    if (req.url === "/v2") return res.writeHead(200, { "content-type": "text/html" }).end(v2);
    if (req.url === "/v2/about") return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html lang="en"><head><title>About Ana</title></head><body><h1>About</h1></body></html>`);
    if (req.url === "/ok.svg") return res.writeHead(200, { "content-type": "image/svg+xml" }).end(svg);
    res.writeHead(404).end("not found");
  })
  .listen(Number(process.env.FIXTURE_PORT ?? 4555), "127.0.0.1");
