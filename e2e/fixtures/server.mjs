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

http
  .createServer((req, res) => {
    if (req.url === "/v1") return res.writeHead(200, { "content-type": "text/html" }).end(v1);
    if (req.url === "/v2") return res.writeHead(200, { "content-type": "text/html" }).end(v2);
    if (req.url === "/v2/about") return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html lang="en"><head><title>About Ana</title></head><body><h1>About</h1></body></html>`);
    if (req.url === "/ok.svg") return res.writeHead(200, { "content-type": "image/svg+xml" }).end(svg);
    res.writeHead(404).end("not found");
  })
  .listen(Number(process.env.FIXTURE_PORT ?? 4555), "127.0.0.1");
