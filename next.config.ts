import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages ship native bindings / WASM or spawn processes; keep them
  // out of the server bundle so Node resolves them at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "playwright-core", "postgres"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
