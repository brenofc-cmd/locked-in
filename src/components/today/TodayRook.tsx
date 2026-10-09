"use client";

import { useEffect, useState } from "react";
import { Rook } from "@/components/brand/Rook";
import { cx } from "@/components/ui";

/** Counts how many times `value` went up after the first render. */
function useRises(value: number) {
  const [seen, setSeen] = useState({ value, rises: 0 });
  if (value !== seen.value)
    setSeen({
      value,
      rises: value > seen.value ? seen.rises + 1 : seen.rises,
    });
  return seen.rises;
}

/**
 * Today's Rook (docs/ROOK.md → Usage): small, beside the day's number. He
 * acknowledges every task proved (the Core lights, a blink, a nod) and
 * otherwise stays still; the Core is idle on an ordinary day and shows
 * proof once the standard is met. Decorative: the numbers say it all.
 *
 * V3.2 Morning Ritual: while the ritual is open (`greeting`) he hosts it —
 * he lands, looking up at the user (`watching`), then stands `ready`; when
 * the user starts the day (`started` grows) he acknowledges it once.
 */
export function TodayRook({
  done,
  standardMet,
  perfect,
  greeting = false,
  started = 0,
}: {
  done: number;
  standardMet: boolean;
  perfect: boolean;
  greeting?: boolean;
  started?: number;
}) {
  const rises = useRises(done);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    if (!greeting) return;
    // One look up, then he stands: a single pose change, never a loop.
    const on = setTimeout(() => setLooking(true), 0);
    const off = setTimeout(() => setLooking(false), 650);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [greeting]);
  const acts = rises + started;
  return (
    <span
      className={cx(
        "-mb-1 flex shrink-0 origin-bottom-right transition-transform duration-300 ease-[var(--ease-settle)]",
        // The host is a little larger; he settles back when the day starts.
        greeting &&
          "scale-110 motion-safe:animate-[li-rook-land_.5s_var(--ease-settle)_both]",
      )}
    >
      <Rook
        size={58}
        pose={
          greeting && looking
            ? "watching"
            : perfect
              ? "proud"
              : done === 0
                ? "ready"
                : "neutral"
        }
        core={standardMet ? "proof" : done === 0 ? "off" : "idle"}
        act={acts > 0 ? "ack" : undefined}
        actKey={acts}
      />
    </span>
  );
}

/**
 * The streak number on Today. When it grows while the app is open (the
 * standard was just met), a thin ring closes around it once and the number
 * settles — the ordinary day's small streak moment. Never on load.
 */
export function StreakNumber({ streak }: { streak: number }) {
  const rises = useRises(streak);
  return (
    <span className="relative inline-grid place-items-center">
      {rises > 0 && (
        <svg
          key={rises}
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute size-6 -rotate-90"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="var(--color-streak)"
            strokeWidth="1.5"
            strokeDasharray="62.8"
            strokeDashoffset="0"
            strokeLinecap="round"
            style={{ ["--ring" as string]: "62.8" }}
            className="opacity-0 motion-safe:animate-[li-ring-draw_.7s_var(--ease-out-quick),li-fade-out_1.6s_ease_both]"
          />
        </svg>
      )}
      <span
        key={rises}
        data-testid="today-streak"
        className={
          rises > 0
            ? "text-streak motion-safe:animate-[li-settle_.45s_var(--ease-settle)]"
            : undefined
        }
      >
        {streak}
      </span>
    </span>
  );
}
