"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** About every 5 minutes while the app is visible (V2 Phase 2). */
export const HEARTBEAT_MS = 5 * 60_000;
/** Never more often than this, however often the tab flips visible. */
export const HEARTBEAT_MIN_GAP_MS = 60_000;

/**
 * "I am here": writes only my own last seen (touch_last_seen(), database
 * clock). On open, on every return to visible, and every ~5 min while
 * visible; nothing while hidden and nothing on close (a phone can kill the
 * tab without warning, so beforeunload is never relied on — the partner
 * sees a last seen accurate to a few minutes). Never reads the partner.
 */
export function useHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let last = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => {
      const now = Date.now();
      if (now - last < HEARTBEAT_MIN_GAP_MS) return;
      last = now;
      void Promise.resolve(supabase.rpc("touch_last_seen")).catch(() => {
        last = 0; // offline: the next visible / interval tries again
      });
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}
