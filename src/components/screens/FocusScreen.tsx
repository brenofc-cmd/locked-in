"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useRef } from "react";
import { useApp } from "@/components/app-state";
import { FocusPicker } from "@/components/focus/FocusPicker";
import { LockGlyph } from "@/components/icons";
import { StatusDot } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { linkableGoalId } from "@/lib/goal-proof";
import { usePartnerView } from "@/components/use-partner-view";

export function FocusScreen({ goalId = null }: { goalId?: string | null }) {
  const app = useApp();
  const pv = usePartnerView();
  // V2 Phase 5: INICIAR FOCO from a goal pre-selects it once (setup only).
  const { goals, focus, setFocusGoal } = app;
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || focus.phase !== "setup") return;
    applied.current = true;
    const id = linkableGoalId(goalId, goals);
    if (id) void setFocusGoal(id);
  }, [goalId, goals, focus.phase, setFocusGoal]);
  const sessions = [...app.sessions].reverse();
  const dur =
    focus.dur === "custom" ? Number(focus.custom) || 0 : Number(focus.dur);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 animate-[li-fade-up_.4s_ease] desk:gap-12 wide:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-meta tracking-[0.14em] text-dim">
            {t.focusUi.focusToday} · {formatMinutes(app.focusMin)}
          </span>
          <h1 className="page-title">{t.focusUi.question}</h1>
        </div>
        <FocusPicker />
        {/* The one action of the screen: pinned in reach on a phone, above
            the floating tab bar (V3), so it is on the first view however
            long the task list is. It names what it will start. */}
        <div className="sticky bottom-[calc(90px+env(safe-area-inset-bottom))] z-[5] -mx-5 bg-[linear-gradient(to_top,var(--color-bg)_70%,transparent)] px-4 pt-[22px] pb-3 desk:static desk:m-0 desk:bg-none desk:p-0">
          <button
            type="button"
            onClick={app.startFocus}
            className="btn-primary flex h-[58px] w-full items-center justify-center gap-3 rounded-2xl px-4"
          >
            <LockGlyph />
            <span className="flex min-w-0 flex-col items-start">
              <span className="font-mono text-small leading-[1.1] font-bold tracking-brand">
                LOCK IN
                <span aria-hidden="true">
                  {dur ? ` · ${t.focusUi.minutesShort(dur)}` : ""}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="max-w-full truncate text-[0.78125rem] font-semibold opacity-75"
              >
                {focus.task}
              </span>
            </span>
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2.5 border-t border-line-strong pt-3.5">
          <span className="font-mono text-meta tracking-eyebrow text-dim">
            {t.focusUi.focusToday}
          </span>
          <span
            data-testid="focus-today"
            className="text-number leading-none num desk:text-num-l"
          >
            {formatMinutes(app.focusMin)}
          </span>
        </div>
        <div className="flex flex-col">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-1.5 border-b border-line py-3.5"
            >
              <div className="flex justify-between gap-2.5">
                <span className="text-body">{s.task}</span>
                <span className="font-mono text-small text-muted">
                  {t.focusUi.minutesShort(s.min)}
                </span>
              </div>
              <span className="font-mono text-meta text-dim">
                {s.from} – {s.to}
              </span>
              {s.note && (
                <span className="text-small leading-[1.45] text-muted">
                  {s.note}
                </span>
              )}
            </div>
          ))}
        </div>
        {app.hasPartner && (
          <div className="flex items-center gap-3 text-small text-muted">
            <StatusDot live={pv.live} pulse={pv.pulse} />
            <span>
              <span className="text-text">{app.partner.name}</span> ·{" "}
              {pv.statusLine}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
