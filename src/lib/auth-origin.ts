import { headers } from "next/headers";

/**
 * Absolute origin for links inside auth emails. Production sets SITE_URL
 * (server-only), so a forged Host / Origin header can never choose where a
 * confirmation or reset link points; Supabase's redirect allow-list is the
 * second guard (docs/PRODUCTION_CHECKLIST.md). Without it (local dev), the
 * request's own origin is used.
 */
export async function authOrigin() {
  const site = process.env.SITE_URL;
  if (site) return new URL(site).origin;
  const h = await headers();
  const fromHeader = h.get("origin");
  if (fromHeader) return fromHeader;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
