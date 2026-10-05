// Builds the extension into extension/dist (load that folder in Chrome).
// Dev builds go to extension/dist-dev so they never overwrite the committed build.
//   node extension/build.mjs            production build
//   UPSHIFT_EXT_DEV=1 node ...          also grants localhost host access (local testing only)
//   UPSHIFT_SERVER_URL=https://...      default server shown in the popup
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dev = process.env.UPSHIFT_EXT_DEV === "1";
const out = path.join(here, dev ? "dist-dev" : "dist");

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, "icons"), { recursive: true });

const common = {
  bundle: true,
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  target: ["chrome116"],
  legalComments: "none",
  // On Vercel the production URL is known at build time; otherwise the hosted app (dev builds: local server).
  define: {
    __DEV__: JSON.stringify(dev),
    __DEFAULT_SERVER__: JSON.stringify(
      process.env.UPSHIFT_SERVER_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : dev ? "http://localhost:3000" : "https://upshift-ai.vercel.app"),
    ),
  },
  logLevel: "warning",
};
await Promise.all([
  build({ ...common, entryPoints: [path.join(here, "src/content/index.ts")], outfile: path.join(out, "content.js"), format: "iife" }),
  build({ ...common, entryPoints: [path.join(here, "src/background/index.ts")], outfile: path.join(out, "background.js"), format: "iife" }),
  build({ ...common, entryPoints: [path.join(here, "src/popup/popup.ts")], outfile: path.join(out, "popup.js"), format: "iife" }),
]);

const manifest = JSON.parse(await fs.readFile(path.join(here, "manifest.base.json"), "utf8"));
if (dev) manifest.host_permissions = [...manifest.host_permissions, "http://localhost/*", "http://127.0.0.1/*"];
await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
await fs.copyFile(path.join(here, "src/popup/popup.html"), path.join(out, "popup.html"));
await fs.copyFile(path.join(here, "src/popup/popup.css"), path.join(out, "popup.css"));
for (const size of [16, 32, 48, 128]) await fs.copyFile(path.join(here, `icons/${size}.png`), path.join(out, `icons/${size}.png`));

const sizes = await Promise.all(["content.js", "background.js", "popup.js"].map(async (f) => `${f} ${((await fs.stat(path.join(out, f))).size / 1024).toFixed(1)} KB`));
console.log(`extension built${dev ? " (dev)" : ""}: ${sizes.join(", ")}`);

// Optional: a .zip for "Load unpacked" downloads (UPSHIFT_EXT_ZIP=path). Stored, uncompressed: no dependencies.
if (process.env.UPSHIFT_EXT_ZIP) {
  const files = [];
  const walk = async (dir, rel = "") => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(path.join(dir, e.name), `${rel}${e.name}/`);
      else files.push({ name: `upshift-extension/${rel}${e.name}`, data: await fs.readFile(path.join(dir, e.name)) });
    }
  };
  await walk(out);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.data.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, f.data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(f.data.length, 20);
    cen.writeUInt32LE(f.data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + f.data.length;
  }
  const cenSize = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenSize, 12);
  end.writeUInt32LE(offset, 16);
  await fs.mkdir(path.dirname(process.env.UPSHIFT_EXT_ZIP), { recursive: true });
  await fs.writeFile(process.env.UPSHIFT_EXT_ZIP, Buffer.concat([...parts, ...central, end]));
  console.log(`zip: ${process.env.UPSHIFT_EXT_ZIP} (${files.length} files)`);
}
