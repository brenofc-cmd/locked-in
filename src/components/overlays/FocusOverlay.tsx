"use client";

import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { Rook } from "@/components/brand/Rook";
import { FocusGoalSelect } from "@/components/focus/FocusPicker";
import { StatusDot, cx } from "@/components/ui";
import { formatClock } from "@/lib/format";
import { usePartnerView } from "@/components/use-partner-view";

const RING = 917.35; // circumference of r=146 in the 296 viewBox

/** Focus running + focus complete, full screen over the app. */
export function FocusOverlay() {
  const app = useApp();
  const { focus } = app;
  const pv = usePartnerView();
  if (focus.phase === "setup") return null;

  if (focus.phase === "running") {
    const offset = focus.total
      ? (RING * (focus.left / focus.total)).toFixed(2)
      : RING;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.focusUi.sessionAria}
        className="absolute inset-0 z-50 flex flex-col bg-stage animate-[li-fade-in_.7s_ease]"
      >
        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-7 pt-6 text-center">
          {/* Start of the session: Rook locks in for a moment, then leaves
              the screen to the timer (never animated beside it). With
              reduced motion he is simply not shown. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-6 left-1/2 opacity-0 motion-safe:animate-[li-cameo_1.9s_var(--ease-settle)_both]"
          >
            <Rook pose="focused" size={56} />
          </span>
          <span className="flex items-center gap-2.5 font-mono text-meta tracking-brand text-accent">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-accent animate-[li-pulse_2.4s_ease-out_infinite]"
            />
            LOCKED IN
          </span>
          <span className="text-lead font-medium tracking-eyebrow desk:text-title">
            {focus.task.toUpperCase()}
          </span>
          <div className="w-full max-w-[280px] text-left">
            <FocusGoalSelect compact />
          </div>
          <div className="relative flex size-[296px] flex-col items-center justify-center gap-3 desk:size-[min(520px,58dvh)]">
            <svg
              viewBox="0 0 296 296"
              aria-hidden="true"
              className="absolute inset-0 size-full -rotate-90"
            >
              <circle
                cx="148"
                cy="148"
                r="146"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1.5"
              />
              <circle
                cx="148"
                cy="148"
                r="146"
                fill="none"
                strokeLinecap="round"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeDasharray={RING}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <span
              role="timer"
              aria-label={t.focusUi.remaining(formatClock(focus.left))}
              data-testid="focus-clock"
              className={cx(
                "text-num-2xl leading-none font-light tracking-number tabular-nums transition-opacity duration-700 desk:text-[min(168px,17dvh)]",
                focus.paused &&
                  "animate-[li-breathe_2.6s_ease-in-out_infinite]",
              )}
              style={{ opacity: focus.paused ? 0.35 : 1 }}
            >
              {formatClock(focus.left)}
            </span>
            <span className="font-mono text-meta tracking-brand text-dim">
              {focus.paused
                ? t.focusUi.paused
                : t.focusUi.currentSession(Math.round(focus.total / 60))}
            </span>
          </div>
          {app.hasPartner && (
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-meta tracking-eyebrow text-dim">
                {t.focusUi.partner}
              </span>
              <span className="flex items-center gap-2 text-small text-muted">
                <StatusDot live={pv.live} pulse={pv.pulse} size={6} />
                {pv.focusWord}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-center gap-3 pt-2 pb-[calc(32px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={app.togglePause}
            className="h-12 min-w-24 px-5 font-mono text-meta tracking-brand text-dim hover:text-text"
          >
            {focus.paused ? t.focusUi.resume : t.focusUi.pause}
          </button>
          <button
            type="button"
            onClick={app.endFocus}
            aria-label={t.focusUi.endAria}
            className="h-12 min-w-24 px-5 font-mono text-meta tracking-brand text-dim hover:text-text"
          >
            {t.focusUi.end}
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.max(1, Math.round((focus.total - focus.left) / 60));
  const goalTitle = focus.goalId
    ? (app.goals.find((g) => g.id === focus.goalId)?.title ?? "")
    : "";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.focusUi.completeAria}
      className="absolute inset-0 z-50 overflow-y-auto bg-stage animate-[li-fade-in_.5s_ease]"
    >
      <div className="mx-auto flex min-h-full max-w-[460px] flex-col justify-center gap-7 px-6 pt-12 pb-8 desk:px-8 desk:py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="motion-safe:animate-[li-rook-land_.6s_var(--ease-settle)_.1s_both]">
            <Rook pose="proud" size={64} />
          </span>
          <span
            data-testid="focus-minutes"
            className="text-num-2xl leading-none font-light tracking-number tabular-nums desk:text-num-hero"
          >
            {minutes}
          </span>
          <span className="font-mono text-small tracking-brand text-accent">
            {t.focusUi.minComplete}
          </span>
          <span className="text-body text-dim">
            {focus.task} · {focus.from} – {focus.to}
          </span>
          {goalTitle && (
            <span
              data-testid="focus-goal-proof"
              className="font-mono text-meta tracking-eyebrow text-dim"
            >
              {t.goalPicker.tag(goalTitle)}
            </span>
          )}
        </div>
        <label className="flex flex-col gap-2.5">
          <span className="text-body text-muted">
            {t.focusUi.accomplished}{" "}
            <span className="text-dim">{t.focusUi.optional}</span>
          </span>
          <textarea
            value={focus.note}
            onChange={(e) => app.setFocusNote(e.target.value)}
            rows={3}
            placeholder={t.focusUi.notePlaceholder}
            className="resize-none rounded-xl border border-line-strong bg-field p-3.5 text-base leading-[1.5] outline-none focus:border-line-bold"
          />
        </label>
        <button
          type="button"
          onClick={app.completeFocus}
          className="h-[58px] rounded-2xl bg-accent font-mono text-small font-semibold tracking-brand text-bg active:scale-[.97]"
        >
          {t.focusUi.done}
        </button>
      </div>
    </div>
  );
}
