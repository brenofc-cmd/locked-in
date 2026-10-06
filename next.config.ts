import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Security headers (docs/SECURITY.md → "HTTP headers"). The CSP limits where
 * scripts, styles, images and connections may come from (this origin and the
 * project's Supabase API / Realtime socket) and forbids framing. Inline
 * scripts / styles stay allowed: Next.js bootstraps with inline scripts and a
 * nonce-based policy would force dynamic rendering of every page (tracked
 * for after V1). HSTS is added by Vercel on HTTPS deployments.
 */
function contentSecurityPolicy() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
    : null;
  const connect = supabase
    ? `https://${supabase.host} wss://${supabase.host}`
    : "https://*.supabase.co wss://*.supabase.co";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${connect}${isDev ? " ws: http://localhost:*" : ""}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray lockfile in a parent folder would
  // otherwise make Next.js guess the wrong root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
      {
        // V2 Phase 10: the browser always re-checks the service worker, so
        // nobody stays on an old one (docs/WEB_PUSH.md → Updates).
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
