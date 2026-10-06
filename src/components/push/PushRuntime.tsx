"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  registerServiceWorker,
  syncPushDevice,
} from "@/components/push/push-device";
import { safePushPath } from "@/lib/push";

/**
 * The one service worker, on every page (offline page + push). Registered
 * after load; never asks for anything (docs/WEB_PUSH.md).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => void registerServiceWorker();
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}

/**
 * Signed-in app: checks this device's push subscription once per open
 * (keeps mine, drops someone else's — shared device) and follows a
 * notification click the worker could not navigate itself.
 */
export function usePushRuntime() {
  const router = useRouter();
  useEffect(() => {
    void syncPushDevice();
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; route?: unknown } | null;
      if (data?.type === "li:navigate") router.push(safePushPath(data.route));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
}
