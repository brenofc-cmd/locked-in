/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/auth/"];

/** Routes a signed-in user has no reason to see. */
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY.includes(pathname);
}

/**
 * Only allow same-site relative redirects ("/today", "/duo?x=1").
 * Anything else ("//evil.com", "https://…", "") falls back to /today.
 */
export function safeNext(
  next: string | null | undefined,
  fallback = "/today",
): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return fallback;
  }
  return next;
}
