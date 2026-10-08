"use client";

import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { Rook } from "@/components/brand/Rook";
import { FocusGoalSelect } from "@/components/focus/FocusPicker";
import { StatusDot, cx } from "@/components/ui";
import { formatClock } from "@/lib/format";
import { usePartnerView } from "@/components/use-partner-view";

/**
 * Focus running + focus complete, full screen over the app (V3: the ink
 * stage — the change of room is the transition; serif timer, a 2 px line of
 * progress, Pausar / Encerrar always visible).
 */
export function FocusOverlay() {
  const app = useApp();
  const { focus } = app;
  const pv = usePartnerView();
  if (focus.phase === "setup") return null;

  if (focus.phase === "running") {
    const elapsed = Math.max(0, focus.total - focus.left);
    const share = focus.total ? (elapsed / focus.total) * 100 : 0;
    const totalMin = Math.round(focus.total / 60);
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.focusUi.sessionAria}
        className="absolute inset-0 z-50 flex flex-col overflow-y-auto bg-stage text-stage-text animate-[li-fade-in_.7s_ease]"
      >
        <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-[26px] pt-[calc(24px+env(safe-area-inset-top))]">
          <div className="flex items-center justify-between border-b border-stage-text/20 pb-2.5 font-mono text-meta tracking-[0.08em]">
            <span className="flex items-center gap-2 text-accent">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-accent animate-[li-pulse_2.4s_ease-out_infinite]"
              />
              LOCKED IN
            </span>
            <span className="text-stage-muted">
              {t.focusUi.currentSession(totalMin)}
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            {/* Rook locks in with the session (wings in, a lean, the Core
                active) and then stays almost still: an occasional blink only
                (none with reduced motion). The timer dominates. */}
            <Rook
              pose="focused"
              core={focus.paused ? "idle" : "active"}
              act="lock"
              idle={!focus.paused}
              size={64}
            />
            <span className="mt-[26px] font-stage text-[1.75rem] leading-[1.1] italic [text-wrap:balance]">
              {focus.task}
            </span>
            <span
              role="timer"
              aria-label={t.focusUi.remaining(formatClock(focus.left))}
              data-testid="focus-clock"
              className="mt-[30px] font-stage text-[min(112px,28vw)] leading-[.9] font-light tracking-[-0.03em] [font-variant-numeric:lining-nums_tabular-nums] transition-opacity duration-[600ms] desk:text-[min(168px,17dvh)]"
              style={{ opacity: focus.paused ? 0.38 : 1 }}
            >
              {formatClock(focus.left)}
            </span>
            <div className="relative mt-[30px] h-0.5 w-full bg-stage-text/15">
              <div
                aria-hidden="true"
                className="absolute -top-px left-0 h-1 rounded-xs bg-stage-text transition-[width] duration-1000 ease-linear"
                style={{ width: `${share.toFixed(2)}%` }}
              />
            </div>
            <div className="mt-2.5 flex w-full justify-between font-mono text-meta text-stage-muted">
              <span>
                {focus.paused
                  ? t.focusUi.paused
                  : t.focusUi.minutesShort(Math.floor(elapsed / 60))}
              </span>
              <span>{t.focusUi.minutesShort(totalMin)}</span>
            </div>
            <div className="mt-6 w-full max-w-[280px] text-left">
              <FocusGoalSelect compact />
            </div>
            {app.hasPartner && (
              <span className="mt-[22px] flex items-center gap-2 text-sm text-stage-soft">
                <StatusDot live={pv.live} pulse={pv.pulse} size={6} />
                {t.focusUi.partner} · {pv.focusWord}
              </span>
            )}
          </div>
        </div>
        {/* Pausar / Encerrar: real buttons in thumb reach, always visible. */}
        <div className="mx-auto flex w-full max-w-[560px] gap-2.5 px-[22px] pt-2 pb-[calc(32px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={app.togglePause}
            className={cx(
              "h-[58px] flex-1 rounded-[14px] border-[1.5px] border-stage-text font-mono text-small font-semibold tracking-[0.2em] transition-[background-color,color,transform] duration-200 active:scale-[.97]",
              focus.paused
                ? "bg-stage-text text-stage"
                : "bg-transparent text-stage-text",
            )}
          >
            {focus.paused ? t.focusUi.resume : t.focusUi.pause}
          </button>
          <button
            type="button"
            onClick={app.endFocus}
            aria-label={t.focusUi.endAria}
            className="h-[58px] flex-1 rounded-[14px] border-[1.5px] border-stage-text/30 font-mono text-small font-semibold tracking-[0.2em] text-stage-text transition-transform duration-150 active:scale-[.97]"
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
      className="absolute inset-0 z-50 overflow-y-auto bg-stage text-stage-text animate-[li-fade-in_.5s_ease]"
    >
      <div className="mx-auto flex min-h-full max-w-[460px] flex-col justify-center gap-[26px] px-6 pt-20 pb-10 desk:px-8 desk:py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* Done: the wings relax, a nod, the Core pulses once. */}
          <Rook pose="proud" core="proof" act="ack" size={72} />
          <span
            data-testid="focus-minutes"
            className="font-stage text-[6.5rem] leading-[.9] font-light tracking-[-0.03em] [font-variant-numeric:lining-nums]"
          >
            {minutes}
          </span>
          <span className="font-mono text-meta tracking-brand text-accent">
            {t.focusUi.minComplete}
          </span>
          <span className="text-body text-stage-muted">
            {focus.task} · {focus.from} – {focus.to}
          </span>
          {goalTitle && (
            <span
              data-testid="focus-goal-proof"
              className="font-mono text-meta tracking-[0.12em] text-stage-muted"
            >
              {t.goalPicker.tag(goalTitle)}
            </span>
          )}
        </div>
        <label className="flex flex-col gap-2.5">
          <span className="text-body text-stage-soft">
            {t.focusUi.accomplished}{" "}
            <span className="text-stage-muted">{t.focusUi.optional}</span>
          </span>
          <textarea
            value={focus.note}
            onChange={(e) => app.setFocusNote(e.target.value)}
            rows={3}
            placeholder={t.focusUi.notePlaceholder}
            className="resize-none rounded-xl border border-stage-text/20 bg-stage-field p-3.5 text-base leading-[1.5] text-stage-text outline-none placeholder:text-stage-muted focus:border-stage-text/40"
          />
        </label>
        <button
          type="button"
          onClick={app.completeFocus}
          className="btn-primary h-[58px] rounded-2xl font-mono text-small font-bold tracking-brand"
        >
          {t.focusUi.done}
        </button>
      </div>
    </div>
  );
}
