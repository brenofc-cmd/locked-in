"use client";

import { useSyncExternalStore } from "react";

/**
 * "Install the app" is offered only when the browser says it can be
 * installed (`beforeinstallprompt`). The event fires once, early, so it is
 * kept here for the whole session: Settings and the profile menu both read
 * it. Using it once hides the offer (the browser will not prompt twice).
 */
type InstallEvent = Event & { prompt: () => Promise<void> };

let pending: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pending = e as InstallEvent;
    emit();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The install action while the browser offers it, else null. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const evt = useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
  if (!evt) return null;
  return async () => {
    await evt.prompt();
    pending = null;
    emit();
  };
}
