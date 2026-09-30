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
 * ISSUE-001: where the app sends a user whose cookies still hold a session the
 * database refuses. The proxy lets a signed-in user see this one login URL
 * (instead of bouncing it to /today), so the two can never redirect in a loop;
 * signing in again replaces the session.
 */
export const SESSION_REJECTED_LOGIN = "/login?reason=session";

export function isSessionRejectedLogin(
  pathname: string,
  search: URLSearchParams,
): boolean {
  return pathname === "/login" && search.get("reason") === "session";
}

const BASE = "http://locked-in.invalid";

/**
 * Only allow same-site relative redirects ("/today", "/duo?x=1").
 * Anything else ("//evil.com", "https://…", "/\\evil.com", "/<TAB>/evil.com",
 * "") falls back to /today. Control characters and backslashes are refused
 * outright (browsers drop tabs / newlines, so "/<TAB>/x" would become "//x"),
 * and the result is re-serialised from a URL parsed against a fixed origin.
 */
export function safeNext(
  next: string | null | undefined,
  fallback = "/today",
): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    /[\u0000-\u001f\u007f\\]/.test(next)
  ) {
    return fallback;
  }
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
