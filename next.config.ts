import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  // Next.js injects inline <script> tags for RSC hydration.
  // In dev, 'unsafe-inline' + 'unsafe-eval' are required for HMR/Turbopack.
  // In production, replace with nonce-based CSP (see TODO below).
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  // TODO(Fix 18): Replace 'unsafe-inline' with nonce-based CSP.
  // Next.js 16 supports nonces via proxy.ts (src/proxy.ts already exists).
  // The pattern: generate a nonce per-request in the proxy, set
  // `x-nonce` and `Content-Security-Policy` headers there, and remove this
  // static header declaration from next.config.ts entirely.
  // See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
  // Caveat: nonces force all pages into dynamic rendering (no static/ISR/PPR).
  // Audit page rendering assumptions before enabling.
  "style-src 'self' 'unsafe-inline'", // Next.js SSR injects inline styles
  "img-src 'self' data: blob:",       // watermarked canvas images use data:/blob: URIs
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
