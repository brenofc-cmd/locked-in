"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { cx } from "@/components/ui";
import type { Pill } from "@/lib/today";

const GAP = 4; // px between segments (gap-1)

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
 * V3.3 Proof Track (docs/MOTION.md → Task completion): Today's bar as one
 * segmented track — one segment per task, already in fill order
 * (`trackOrder`), so proof grows from the left. A new proof's fill slides in
 * across its segment, then one light passes over every proved segment, left
 * to right; nothing moves on load or when proof is undone (the fill just
 * retracts). The standard is a tick in the gap where it is met. Decorative:
 * the progressbar around it carries the value.
 */
export function ProofTrack({
  pills,
  standard,
  size = "md",
}: {
  pills: readonly Pill[];
  /** Daily Standard %; its tick sits after the segment that meets it. */
  standard?: number;
  size?: "sm" | "md";
}) {
  const n = pills.length;
  const done = pills.filter((p) => p === "done").length;
  const rises = useRises(done);
  // Segments needed to meet the standard (same rounding as todayStats).
  const need = standard === undefined ? 0 : Math.ceil((standard / 100) * n);
  /** Left edge of the gap after segment k, as CSS. */
  const gapAt = (k: number) =>
    `calc(${k} * (100% - ${(n - 1) * GAP}px) / ${n} + ${(k - 0.5) * GAP}px)`;
  return (
    <span
      aria-hidden="true"
      data-testid="proof-track"
      className={cx(
        "relative flex w-full gap-1",
        size === "md" ? "h-3" : "h-2",
      )}
    >
      {pills.map((p, i) => (
        // <i>, not <span>: the track's only spans are its own marks.
        <i
          key={i}
          data-pill={p}
          className={cx(
            "relative min-w-0 flex-1 overflow-hidden rounded-full",
            p === "skip"
              ? "border border-dashed border-line-bold"
              : "bg-line-strong",
            p === "next" && "shadow-[inset_0_0_0_1.5px_var(--color-accent)]",
          )}
        >
          <i
            className={cx(
              "absolute inset-0 origin-left rounded-full bg-accent transition-transform duration-500 ease-[var(--ease-out-quick)] motion-reduce:transition-none",
              p === "done" ? "scale-x-100" : "scale-x-0",
            )}
          >
            {p === "done" && rises > 0 && (
              <i
                key={rises}
                data-testid="track-sheen"
                className="absolute inset-0 bg-[linear-gradient(90deg,transparent,var(--color-sheen),transparent)] opacity-0 motion-safe:animate-[li-sheen_.65s_var(--ease-out-quick)_both]"
                style={{ animationDelay: `${260 + i * 45}ms` } as CSSProperties}
              />
            )}
          </i>
        </i>
      ))}
      {need > 0 && need < n && (
        <span
          data-testid="track-standard"
          className={cx(
            "absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full transition-colors duration-300",
            done >= need ? "bg-accent" : "bg-marker",
          )}
          style={{ left: gapAt(need) }}
        />
      )}
    </span>
  );
}
