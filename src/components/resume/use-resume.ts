"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import {
  SCROLL_ROUTES,
  loadResume,
  rememberRoute,
  rememberScroll,
  type ResumeState,
} from "@/lib/resume-state";

const noSubscribe = () => () => {};
/** Scroll is written at most this often (never per pixel). */
const SCROLL_SAVE_MS = 400;
/** How long a restore waits for the page to be tall enough. */
const RESTORE_WAIT_MS = 2000;

/**
 * One stored value (a string or null) for rendering. The server snapshot is
 * null and the client reads the device after hydration, so the markup never
 * mismatches. It does not follow other tabs (no storage event, by design).
 */
export function useResumeValue(
  userId: string,
  select: (state: ResumeState) => string | undefined,
): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => select(loadResume(userId)) ?? null,
    () => null,
  );
}

/**
 * The shell's part of Resume State: remembers the current private route and
 * the scroll offset of long screens (throttled), and restores that offset
 * once, for the first screen of this page load, after its content is there.
 * Later in-app navigation keeps the V1 behaviour (a new screen starts at the
 * top) and back / forward stay the browser's. Holds no React state, so a
 * scroll never re-renders anything.
 */
export function useResumeShell(
  userId: string,
  pathname: string,
  mainRef: RefObject<HTMLElement | null>,
) {
  const pathRef = useRef(pathname);
  const restored = useRef(false);

  useEffect(() => {
    pathRef.current = pathname;
    rememberRoute(userId, pathname);
  }, [userId, pathname]);

  // Save: throttled while scrolling, flushed when the page is hidden / closed.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      rememberScroll(userId, pathRef.current, main.scrollTop);
    };
    const onScroll = () => {
      if (!timer) timer = setTimeout(flush, SCROLL_SAVE_MS);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && timer) flush();
    };
    const onPageHide = () => timer && flush();
    main.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      main.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      if (timer) clearTimeout(timer);
    };
  }, [userId, mainRef]);

  // Restore once per page load, never over the user's own scrolling.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const main = mainRef.current;
    const path = pathRef.current;
    if (!main || !SCROLL_ROUTES.includes(path)) return;
    const y = loadResume(userId).scroll?.[path]?.y ?? 0;
    if (y <= 0) return;

    let frame = 0;
    let cancelled = false;
    const start = performance.now();
    const cancel = () => {
      cancelled = true;
    };
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const e of events)
      main.addEventListener(e, cancel, { passive: true, once: true });

    const tryRestore = () => {
      if (cancelled || pathRef.current !== path) return;
      const max = main.scrollHeight - main.clientHeight;
      if (max >= y || performance.now() - start > RESTORE_WAIT_MS) {
        main.scrollTo(0, Math.min(y, Math.max(0, max)));
        return;
      }
      frame = requestAnimationFrame(tryRestore);
    };
    frame = requestAnimationFrame(tryRestore);
    return () => {
      cancelAnimationFrame(frame);
      for (const e of events) main.removeEventListener(e, cancel);
    };
  }, [userId, mainRef]);
}
