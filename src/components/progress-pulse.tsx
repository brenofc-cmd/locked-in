"use client";

import { useState } from "react";

/**
 * One short glow over a progress bar when its value goes up (transform /
 * opacity only, motion-safe; never on load and never when it goes down).
 * docs/MOTION.md → Task completion.
 */
export function ProgressPulse({
  pct,
  pill = false,
}: {
  pct: number;
  /** Over the Proof Pills (V3): rounded, barely swelling (--pulse-scale). */
  pill?: boolean;
}) {
  const [seen, setSeen] = useState({ pct, grew: 0 });
  if (pct !== seen.pct)
    setSeen({ pct, grew: pct > seen.pct ? seen.grew + 1 : seen.grew });
  if (seen.grew === 0) return null;
  return (
    <span
      key={seen.grew}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 left-0 bg-accent opacity-0 motion-safe:animate-[li-bar-pulse_.6s_ease-out] ${pill ? "rounded-full" : "rounded-sm"}`}
      style={{ width: `${pct}%` }}
    />
  );
}
