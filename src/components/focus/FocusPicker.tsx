"use client";

import { useApp } from "@/components/app-state";
import { chipTone, cx } from "@/components/ui";
import { mockFocus } from "@/lib/mock-data";
import type { FocusDuration } from "@/types";

const DURATIONS: { value: FocusDuration; n: string; u: string }[] = [
  { value: 25, n: "25", u: "MIN" },
  { value: 50, n: "50", u: "MIN" },
  { value: 90, n: "90", u: "MIN" },
  { value: "custom", n: "—", u: "CUSTOM" },
];

/** Activity radio list + duration tiles. Used on /focus and in the Lock In sheet. */
export function FocusPicker({ compact = false }: { compact?: boolean }) {
  const { focus, setFocusTask, setFocusDur, setFocusCustom } = useApp();

  return (
    <>
      <div
        role="radiogroup"
        aria-label="What are you working on?"
        className="flex flex-col"
      >
        {mockFocus.activities.map((label) => {
          const on = focus.task === label;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFocusTask(label)}
              className={cx(
                "flex items-center justify-between border-b border-white/5 px-0.5 text-left",
                compact ? "h-[54px] text-base" : "h-14 text-[17px]",
                on ? "text-text" : "text-muted",
              )}
            >
              <span>{label}</span>
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-[22px] items-center justify-center rounded-full border-[1.5px]",
                  on ? "border-accent" : "border-white/20",
                )}
              >
                <span
                  className="size-2.5 rounded-full bg-accent transition-transform duration-200 ease-[cubic-bezier(.3,1.6,.5,1)]"
                  style={{ transform: on ? "scale(1)" : "scale(0)" }}
                />
              </span>
            </button>
          );
        })}
      </div>
      <div
        role="radiogroup"
        aria-label="Duration"
        className="grid grid-cols-4 gap-2"
      >
        {DURATIONS.map((d) => {
          const on = focus.dur === d.value;
          return (
            <button
              key={d.u + d.n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={
                d.value === "custom" ? "Custom duration" : `${d.n} minutes`
              }
              onClick={() => setFocusDur(d.value)}
              className={cx(
                "flex flex-col items-center justify-center gap-1 rounded-[14px] border p-0 transition-all duration-150 active:scale-[.95]",
                compact ? "h-[68px]" : "h-[76px]",
                chipTone(on),
              )}
            >
              <span
                className={cx(
                  "font-medium tracking-[-0.03em]",
                  compact ? "text-[23px]" : "text-[26px]",
                )}
              >
                {d.value === "custom" && focus.custom ? focus.custom : d.n}
              </span>
              <span className="font-mono text-[9.5px] tracking-[.14em] text-dim">
                {d.u}
              </span>
            </button>
          );
        })}
      </div>
      {focus.dur === "custom" && (
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={5}
            max={240}
            value={focus.custom}
            onChange={(e) => setFocusCustom(e.target.value)}
            placeholder="45"
            aria-label="Custom minutes"
            className="h-12 w-[110px] rounded-xl border border-white/12 bg-bg px-3.5 text-lg outline-none"
          />
          <span className="font-mono text-[11px] tracking-[.14em] text-dim">
            MINUTES
          </span>
        </div>
      )}
    </>
  );
}
