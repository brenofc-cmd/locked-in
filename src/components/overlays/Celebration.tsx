"use client";

/**
 * V2 Phase 9 celebration (docs/CELEBRATIONS.md): short, rare, factual, shown
 * once. One at a time, non-modal (nothing behind it is blocked), closes by
 * itself after ~2 s (held while pointed at or focused, so it can be read) or
 * on OK. Movement is a short fade only with
 * motion allowed; with prefers-reduced-motion it simply appears. Closing it
 * marks it seen in the database, so another device does not show it again.
 */
import { t } from "@/i18n/pt-BR";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { celebrationCopy } from "@/lib/celebrations";

const VISIBLE_MS = 2000;

export function Celebration() {
  const app = useApp();
  const { settings } = useSession();
  const row = settings.onboarded ? app.pendingCelebrations[0] : undefined;
  const copy = row
    ? celebrationCopy(row, { months: app.months, todayTasks: app.tasks.length })
    : null;
  const { dismissCelebration } = app;
  const id = row ? `${row.kind}:${row.key}` : null;
  // Held by the pointer or keyboard focus: the timer waits (WCAG 2.2.1).
  const [held, setHeld] = useState<string | null>(null);
  const isHeld = held !== null && held === id;

  // A row that cannot be shown (unknown month on this device) is just closed.
  useEffect(() => {
    if (row && !copy) dismissCelebration(row);
  }, [row, copy, dismissCelebration]);

  // Closes by itself, counted only while the page is visible and not held.
  useEffect(() => {
    if (!row || !copy || isHeld) return;
    let id: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(id);
      if (document.visibilityState === "visible")
        id = setTimeout(() => dismissCelebration(row), VISIBLE_MS);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [row, copy, isHeld, dismissCelebration]);

  if (!row || !copy) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[max(16px,env(safe-area-inset-top))] z-[70] flex justify-center px-4">
      <section
        key={id}
        role="status"
        aria-live="polite"
        aria-label={t.celebrations.aria}
        data-testid="celebration"
        data-kind={row.kind}
        data-key={row.key}
        onPointerEnter={() => setHeld(id)}
        onPointerLeave={() => setHeld(null)}
        onFocus={() => setHeld(id)}
        onBlur={() => setHeld(null)}
        className="pointer-events-auto flex w-full max-w-[420px] items-center gap-4 rounded-2xl border border-accent/30 bg-raised px-5 py-4 shadow-[0_12px_40px_rgba(0,0,0,.5)] motion-safe:animate-[li-fade-up_.35s_ease]"
      >
        <span aria-hidden="true" className="text-lead text-accent">
          ◆
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            data-testid="celebration-title"
            className="font-mono text-small font-semibold tracking-eyebrow text-accent"
          >
            {copy.title}
          </span>
          <span className="text-small text-muted">{copy.line}</span>
        </span>
        <button
          type="button"
          onClick={() => dismissCelebration(row)}
          aria-label={t.celebrations.close}
          className="h-10 shrink-0 rounded-xl border border-line-strong px-3.5 font-mono text-meta tracking-eyebrow text-text"
        >
          {t.celebrations.ok}
        </button>
      </section>
    </div>
  );
}
