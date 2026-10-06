/**
 * Shared by the Edge Function and the app (V2 Phase 10): where a push may
 * open, and which push services a subscription may point at. The service
 * worker (public/sw.js) repeats ROUTES — a unit test keeps them equal.
 */

/** Route keys a push may carry → the only paths a click may open. */
export const PUSH_ROUTES = {
  today: "/today",
  partner: "/partner",
  planner: "/planner",
  "plan-week": "/plan/week",
  progress: "/progress",
  settings: "/settings",
} as const;

export type PushRoute = keyof typeof PUSH_ROUTES;

/** Anything not whitelisted opens Today. */
export const PUSH_FALLBACK_ROUTE = "/today";

export function pushRoutePath(key: unknown): string {
  return typeof key === "string" &&
    Object.prototype.hasOwnProperty.call(PUSH_ROUTES, key)
    ? PUSH_ROUTES[key as PushRoute]
    : PUSH_FALLBACK_ROUTE;
}

/** Push services a subscription may point at (same list as the database check). */
const SERVICE =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)\//;

export function isPushService(endpoint: string): boolean {
  return endpoint.length <= 1024 && SERVICE.test(endpoint);
}
