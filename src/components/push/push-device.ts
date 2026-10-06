"use client";

/**
 * Web Push on this browser (V2 Phase 10, docs/WEB_PUSH.md): the service
 * worker, enabling / disabling this device, the on-open check and the
 * shared-device rule. The permission prompt only ever comes from
 * enablePush(), called by the "Ativar neste dispositivo" button.
 */
import {
  isMyPushSubscription,
  removePushSubscription,
  savePushSubscription,
} from "@/app/(app)/push-actions";
import {
  VAPID_PUBLIC_KEY,
  pushSupport,
  vapidKeyBytes,
  type PushSupport,
} from "@/lib/push";

/** This device's own endpoint once known (sent with sign-out). */
let knownEndpoint: string | null = null;
export const pushEndpoint = () => knownEndpoint;

export function detectSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return pushSupport({
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    ios,
    standalone,
    key: VAPID_PUBLIC_KEY,
  });
}

export function permissionNow(): NotificationPermission {
  return typeof Notification === "undefined"
    ? "default"
    : Notification.permission;
}

/** The single service worker (public/sw.js, scope "/"). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  } catch {
    return null;
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await registerServiceWorker();
  if (!reg) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return reg;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

const sameKey = (sub: PushSubscription, key: Uint8Array) => {
  const current = sub.options?.applicationServerKey;
  if (!current) return true; // not exposed by this browser: trust it
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
};

/**
 * On every app open (signed in): keep this device's subscription if it is
 * mine; unsubscribe one that belongs to someone else (a shared browser) or
 * that was made with another server key. Never subscribes on its own.
 */
export async function syncPushDevice(): Promise<boolean> {
  knownEndpoint = null;
  if (detectSupport() !== "supported" || permissionNow() !== "granted")
    return false;
  const sub = await currentSubscription();
  if (!sub) return false;
  const key = vapidKeyBytes(VAPID_PUBLIC_KEY);
  const mine = await isMyPushSubscription(sub.endpoint);
  if (mine === false || (key && !sameKey(sub, key))) {
    if (mine) await removePushSubscription(sub.endpoint).catch(() => null);
    await sub.unsubscribe().catch(() => false);
    return false;
  }
  // null = could not check (offline): leave it, it is checked next time.
  knownEndpoint = sub.endpoint;
  return true;
}

export type EnableResult = { ok: true } | { ok: false; denied: boolean };

/** "Ativar neste dispositivo": the only place the browser prompt appears. */
export async function enablePush(): Promise<EnableResult> {
  const key = vapidKeyBytes(VAPID_PUBLIC_KEY);
  if (!key || detectSupport() !== "supported")
    return { ok: false, denied: false };
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, denied: false };
  }
  if (permission !== "granted")
    return { ok: false, denied: permission === "denied" };
  const reg = await readyRegistration();
  if (!reg) return { ok: false, denied: false };
  // Twice at most: a subscription still owned by another account on this
  // browser is dropped and replaced by a fresh one.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (res.ok) {
        knownEndpoint = sub.endpoint;
        return { ok: true };
      }
      if (res.code !== "taken") return { ok: false, denied: false };
      await sub.unsubscribe();
    } catch {
      return { ok: false, denied: false };
    }
  }
  return { ok: false, denied: false };
}

/** "Desativar neste dispositivo": the server forgets it, then the browser. */
export async function disablePush(): Promise<boolean> {
  const sub = await currentSubscription();
  if (sub) {
    const res = await removePushSubscription(sub.endpoint).catch(() => null);
    if (!res?.ok) return false;
    await sub.unsubscribe().catch(() => false);
  }
  knownEndpoint = null;
  return true;
}

/**
 * Sign-out on this device: the form carries this device's endpoint so the
 * server deletes the row in the same request; the browser subscription is
 * dropped too (best effort — the next sign-in checks again).
 */
export function prepareSignOut(form: HTMLFormElement) {
  const input = form.elements.namedItem("push_endpoint");
  if (input instanceof HTMLInputElement) input.value = knownEndpoint ?? "";
  knownEndpoint = null;
  void currentSubscription().then((sub) =>
    sub?.unsubscribe().catch(() => false),
  );
}
