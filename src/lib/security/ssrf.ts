import "server-only";
import dns from "node:dns";
import net from "node:net";
import { Agent, ProxyAgent, type Dispatcher, fetch as undiciFetch } from "undici";

/**
 * Outbound fetching of user-supplied URLs.
 *
 * Users can paste any URL, so the server must not become a way to reach
 * internal services (cloud metadata, localhost admin panels, the database).
 *
 *  - http/https only, no embedded credentials, ports 80/443/8080/8443.
 *  - Every resolved address is checked against private/reserved ranges.
 *  - The check runs inside the socket's DNS lookup, so the address that is
 *    validated is the address that is connected to (no DNS-rebinding gap).
 *  - Redirects are followed manually and each hop is re-validated.
 *  - Response size and time are capped.
 *
 * UPSHIFT_ALLOW_PRIVATE_URLS=true disables the address check for local
 * development and tests. It is ignored when NODE_ENV=production.
 */

export class UnsafeUrlError extends Error {}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const MAX_REDIRECTS = 5;

export function allowPrivate() {
  return process.env.UPSHIFT_ALLOW_PRIVATE_URLS === "true" && process.env.NODE_ENV !== "production";
}

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // IPv4-mapped / translated forms: check the embedded v4 address.
    const mapped = lower.match(/^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (lower === "::" || lower === "::1") return true;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (lower.startsWith("2001:db8")) return true; // documentation
    return false;
  }
  return true; // not an IP at all: refuse
}

export function validateUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http and https URLs can be analysed.");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with embedded credentials are not accepted.");
  if (!ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError("Only standard web ports (80, 443, 8080, 8443) are allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!allowPrivate()) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
      throw new UnsafeUrlError("Local and internal hostnames cannot be analysed.");
    if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("Private and reserved IP addresses cannot be analysed.");
  }
  return url;
}

/** Resolve a hostname and refuse if any address is private. */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (allowPrivate()) return;
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("Private and reserved IP addresses cannot be analysed.");
    return;
  }
  let addrs: dns.LookupAddress[];
  try {
    addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve ${host}.`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address)))
    throw new UnsafeUrlError("That hostname points to a private or reserved address and cannot be analysed.");
}

/** DNS lookup used by the socket itself: validates the address actually connected to. */
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as unknown as dns.LookupAddress[];
    const bad = !allowPrivate() && list.some((a) => isPrivateAddress(a.address));
    if (bad || !list.length) return callback(new UnsafeUrlError("Blocked private address."), "", 4);
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

let dispatcher: Dispatcher | null = null;
function getDispatcher(): Dispatcher {
  if (dispatcher) return dispatcher;
  // If outbound traffic must go through a proxy, DNS happens at the proxy; we
  // still pre-validate each hop with assertPublicHost.
  const proxy = process.env.UPSHIFT_OUTBOUND_PROXY;
  dispatcher = proxy
    ? new ProxyAgent({ uri: proxy })
    : new Agent({ connect: { lookup: guardedLookup, timeout: 10_000 }, headersTimeout: 15_000, bodyTimeout: 15_000 });
  return dispatcher;
}

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
  truncated: boolean;
  redirects: string[];
};

export async function safeFetch(rawUrl: string, opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 3 * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  const redirects: string[] = [];
  try {
    let url = validateUrlShape(rawUrl);
    for (let hop = 0; ; hop++) {
      await assertPublicHost(url.hostname);
      const res = await undiciFetch(url, {
        redirect: "manual",
        signal: controller.signal,
        dispatcher: getDispatcher(),
        headers: {
          "user-agent": "UPSHIFT-Auditor/0.1 (+output analysis; respects robots of the user's own sites)",
          accept: opts.accept ?? "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (hop >= MAX_REDIRECTS) throw new UnsafeUrlError("Too many redirects.");
        await res.body?.cancel();
        url = validateUrlShape(new URL(res.headers.get("location")!, url).toString());
        redirects.push(url.toString());
        continue;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      if (res.body) {
        for await (const chunk of res.body) {
          const buf = Buffer.from(chunk as Uint8Array);
          size += buf.length;
          if (size > maxBytes) {
            chunks.push(buf.subarray(0, buf.length - (size - maxBytes)));
            truncated = true;
            controller.abort();
            break;
          }
          chunks.push(buf);
        }
      }
      return {
        finalUrl: url.toString(),
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        body: Buffer.concat(chunks),
        truncated,
        redirects,
      };
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    if ((err as Error).name === "AbortError") throw new UnsafeUrlError("The site took too long to respond.");
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof UnsafeUrlError) throw cause;
    throw new UnsafeUrlError(`Could not fetch the URL (${(cause as Error)?.message ?? (err as Error).message}).`);
  } finally {
    clearTimeout(timer);
  }
}
