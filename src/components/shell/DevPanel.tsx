"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/app-state";

/**
 * Development shortcuts. Only rendered in development and only when the URL
 * contains ?dev=1 (the flag is remembered for the session). Never touches
 * real presence, activity or duo state.
 */
const KEY = "locked-in:dev";
const noopSubscribe = () => () => {};

function devFlag(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    return (
      new URLSearchParams(window.location.search).get("dev") === "1" ||
      sessionStorage.getItem(KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function DevPanel() {
  // Server snapshot is always false, so hydration never mismatches.
  const enabled = useSyncExternalStore(noopSubscribe, devFlag, () => false);
  const [open, setOpen] = useState(false);
  const app = useApp();

  useEffect(() => {
    if (!enabled) return;
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // Storage blocked: the panel still works for this page view.
    }
  }, [enabled]);

  if (!enabled) return null;

  // Partner presence, activity and connection are real since Stage 5, so the
  // panel no longer simulates them (it would fight the realtime state).
  const actions: [string, () => void][] = [
    ["Morning briefing", () => app.openOverlay({ kind: "briefing" })],
  ];

  return (
    <div className="absolute top-[60px] right-2 z-[95] flex flex-col items-end gap-1.5 font-mono text-[11px] desk:top-3 desk:right-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="h-7 rounded-md border border-dashed border-accent/60 bg-bg px-2 tracking-[.14em] text-accent"
      >
        DEV
      </button>
      {open && (
        <div className="flex w-56 flex-col gap-1 rounded-lg border border-white/10 bg-sheet p-2 shadow-[0_14px_40px_rgba(0,0,0,0.5)]">
          {actions.map(([label, run]) => (
            <button
              key={label}
              type="button"
              onClick={run}
              className="h-8 rounded-md px-2 text-left text-muted hover:bg-white/5 hover:text-text"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
