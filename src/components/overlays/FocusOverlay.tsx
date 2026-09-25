"use client";

import { useApp } from "@/components/app-state";
import { StatusDot, cx } from "@/components/ui";
import { formatClock } from "@/lib/format";
import { partnerView } from "@/lib/partner";

const RING = 917.35; // circumference of r=146 in the 296 viewBox

/** Focus running + focus complete, full screen over the app. */
export function FocusOverlay() {
  const app = useApp();
  const { focus } = app;
  if (focus.phase === "setup") return null;

  if (focus.phase === "running") {
    const pv = partnerView(app.partner, app.partnerCounts, app.feed, app.now);
    const offset = focus.total
      ? (RING * (focus.left / focus.total)).toFixed(2)
      : RING;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Focus session"
        className="absolute inset-0 z-50 flex flex-col bg-focus animate-[li-fade-in_.7s_ease]"
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-7 pt-6 text-center">
          <span className="flex items-center gap-2.5 font-mono text-[11px] tracking-[.34em] text-accent">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-accent animate-[li-pulse_2.4s_ease-out_infinite]"
            />
            LOCKED IN
          </span>
          <span className="text-[17px] font-medium tracking-[.14em] desk:text-[22px]">
            {focus.task.toUpperCase()}
          </span>
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
              aria-label={`${formatClock(focus.left)} remaining`}
              data-testid="focus-clock"
              className={cx(
                "text-[76px] leading-none font-light tracking-[-0.045em] tabular-nums transition-opacity duration-700 desk:text-[min(168px,17dvh)]",
                focus.paused &&
                  "animate-[li-breathe_2.6s_ease-in-out_infinite]",
              )}
              style={{ opacity: focus.paused ? 0.35 : 1 }}
            >
              {formatClock(focus.left)}
            </span>
            <span className="font-mono text-[10px] tracking-[.24em] text-quiet">
              {focus.paused
                ? "PAUSED"
                : `CURRENT SESSION · ${Math.round(focus.total / 60)} MIN`}
            </span>
          </div>
          {app.hasPartner && (
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-[10px] tracking-[.2em] text-quiet">
                PARTNER
              </span>
              <span className="flex items-center gap-[7px] text-[13px] text-muted">
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
            className="h-12 min-w-24 px-5 font-mono text-[11px] tracking-[.24em] text-quiet hover:text-text"
          >
            {focus.paused ? "RESUME" : "PAUSE"}
          </button>
          <button
            type="button"
            onClick={app.endFocus}
            aria-label="End session"
            className="h-12 min-w-24 px-5 font-mono text-[11px] tracking-[.24em] text-quiet hover:text-text"
          >
            END
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.max(1, Math.round((focus.total - focus.left) / 60));
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session complete"
      className="absolute inset-0 z-50 overflow-y-auto bg-focus animate-[li-fade-in_.5s_ease]"
    >
      <div className="mx-auto flex min-h-full max-w-[460px] flex-col justify-center gap-7 px-6 pt-12 pb-8 desk:px-8 desk:py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            data-testid="focus-minutes"
            className="text-[72px] leading-none font-light tracking-[-0.045em] tabular-nums desk:text-[112px]"
          >
            {minutes}
          </span>
          <span className="font-mono text-xs tracking-[.3em] text-accent">
            MIN COMPLETE
          </span>
          <span className="text-sm text-dim">
            {focus.task} · {focus.from} – {focus.to}
          </span>
        </div>
        <label className="flex flex-col gap-2.5">
          <span className="text-sm text-muted">
            What did you accomplish?{" "}
            <span className="text-quiet">Optional</span>
          </span>
          <textarea
            value={focus.note}
            onChange={(e) => app.setFocusNote(e.target.value)}
            rows={3}
            placeholder="Finished problem set 5."
            className="resize-none rounded-xl border border-white/10 bg-field p-3.5 text-base leading-[1.5] outline-none focus:border-white/25"
          />
        </label>
        <button
          type="button"
          onClick={app.completeFocus}
          className="h-[58px] rounded-2xl bg-accent font-mono text-[13px] font-semibold tracking-[.3em] text-bg active:scale-[.97]"
        >
          DONE
        </button>
      </div>
    </div>
  );
}
