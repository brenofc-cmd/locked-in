"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useRef } from "react";
import { useApp } from "@/components/app-state";
import { FocusPicker } from "@/components/focus/FocusPicker";
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

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 animate-[li-fade-up_.4s_ease] desk:gap-12 wide:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <h1 className="page-title">{t.focusUi.question}</h1>
        <FocusPicker />
        {/* The one action of the screen: pinned in reach on a phone, so it
            is on the first view however long the task list is. */}
        <div className="sticky bottom-0 z-[5] -mx-5 -mb-7 bg-[linear-gradient(to_top,var(--color-bg)_72%,transparent)] px-5 pt-5 pb-3.5 desk:static desk:m-0 desk:bg-none desk:p-0">
          <button
            type="button"
            onClick={app.startFocus}
            className="h-[62px] w-full rounded-2xl bg-accent font-mono text-body font-semibold tracking-brand text-bg transition-transform duration-100 active:scale-[.97]"
          >
            LOCK IN
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
            className="text-number leading-none font-medium tracking-number desk:text-num-l"
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
