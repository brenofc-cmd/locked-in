/**
 * Web Push on this device (V2 Phase 10, docs/WEB_PUSH.md): support, permission
 * state, the VAPID key and the subscription the server stores. Pure helpers
 * (unit-tested) — the browser calls live in src/components/push/.
 */
import {
  PUSH_FALLBACK_ROUTE,
  PUSH_ROUTES,
  isPushService,
} from "../../supabase/functions/push-dispatch/routes.ts";

export { isPushService, PUSH_ROUTES };

/** The VAPID public key of this environment's Supabase project (public). */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushSupport =
  /** Service worker + Push API + Notification + a configured key. */
  | "supported"
  /** iPhone / iPad in Safari: only an app added to the Home Screen gets push. */
  | "ios-install"
  /** This browser cannot receive Web Push. */
  | "unsupported"
  /** No VAPID key in this environment (push is off for everyone). */
  | "unconfigured";

export type PushEnv = {
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  /** iPhone / iPad (including iPadOS reporting as Mac with touch). */
  ios: boolean;
  /** Launched from the Home Screen (display-mode standalone). */
  standalone: boolean;
  key: string;
};

export function pushSupport(env: PushEnv): PushSupport {
  if (!env.key) return "unconfigured";
  if (env.serviceWorker && env.pushManager && env.notification)
    return "supported";
  if (env.ios && !env.standalone) return "ios-install";
  return "unsupported";
}

/** What Settings shows (text, never only a colour). */
export type PushState =
  "unsupported" | "ios-install" | "unconfigured" | "denied" | "off" | "on";

export function pushState(
  support: PushSupport,
  permission: NotificationPermission,
  subscribed: boolean,
): PushState {
  if (support !== "supported") return support;
  if (permission === "denied") return "denied";
  return permission === "granted" && subscribed ? "on" : "off";
}

/** applicationServerKey bytes from the base64url public key (65 bytes). */
export function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{86,88}={0,2}$/.test(key)) return null;
  const b64 = key.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  let bin: string;
  try {
    bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  } catch {
    return null;
  }
  if (bin.length !== 65 || bin.charCodeAt(0) !== 4) return null;
  const out = new Uint8Array(new ArrayBuffer(65));
  for (let i = 0; i < 65; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** What the server stores of a subscription: endpoint + the two keys. */
export type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const B64U = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * Validates `PushSubscription.toJSON()` (or anything claiming to be it) into
 * the stored shape; null when it is not a usable subscription of a known
 * push service.
 */
export function subscriptionInput(json: unknown): SubscriptionInput | null {
  if (!json || typeof json !== "object") return null;
  const { endpoint, keys } = json as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof endpoint !== "string" || !isPushService(endpoint)) return null;
  if (typeof p256dh !== "string" || !B64U.test(p256dh)) return null;
  if (typeof auth !== "string" || !B64U.test(auth)) return null;
  if (p256dh.replace(/=+$/, "").length !== 87) return null;
  if (auth.replace(/=+$/, "").length !== 22) return null;
  return { endpoint, p256dh, auth };
}

/** A whitelisted path from a route sent by the service worker, else Today. */
export function safePushPath(path: unknown): string {
  return typeof path === "string" &&
    (Object.values(PUSH_ROUTES) as string[]).includes(path)
    ? path
    : PUSH_FALLBACK_ROUTE;
}

/** "Chrome · Windows" — a short label of this device, no identifier. */
export function deviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Navegador";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}
