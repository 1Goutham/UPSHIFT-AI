import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
// Everything is self-hosted (fonts, images via the file route), so the policy can be tight.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // These packages ship native bindings / WASM or spawn processes; keep them
  // out of the server bundle so Node resolves them at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "playwright-core", "postgres", "@sparticuz/chromium", "axe-core"],
  poweredByHeader: false,
  // Files read at runtime by path (not imported) must be shipped with the functions.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**"],
    "/api/projects/**": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
          { key: "Content-Security-Policy", value: CSP },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
