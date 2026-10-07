"use client";

/**
 * V2 Phase 9 celebration (docs/CELEBRATIONS.md), staged by rarity in the
 * final design pass (docs/MOTION.md → Celebrations). Short, rare, factual,
 * shown once. One at a time, non-modal (nothing behind it is blocked),
 * closes by itself (held while pointed at or focused, so it can be read) or
 * on OK. The rarer the proof, the bigger the moment: Perfect Day and the
 * 7-day streak are a card; 30 / 100 days, the bigger focus milestones and
 * the Monthly Champion get a stage with Rook and the Ring. Motion only with
 * motion allowed; with prefers-reduced-motion the final frame simply
 * appears. Closing it marks it seen in the database, so another device does
 * not show it again.
 */
import { t } from "@/i18n/pt-BR";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import { Rook, type RookPose } from "@/components/brand/Rook";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import { celebrationCopy, type CelebrationRow } from "@/lib/celebrations";

/** How long a moment stays (visible time only). Rare moments get longer. */
const VISIBLE_MS = { card: 2000, stage: 3200 } as const;

type Ring = "light" | "ring" | "double" | "full" | "clock" | "crest";
type Moment = {
  size: "card" | "stage";
  pose: RookPose;
  ring: Ring;
  /** A big number inside the ring (100 days). */
  number?: string;
};

/** Rarity → staging. Unknown keys fall back to the quiet card. */
export function momentFor(row: Pick<CelebrationRow, "kind" | "key">): Moment {
  if (row.kind === "perfect_day")
    return { size: "card", pose: "proud", ring: "light" };
  if (row.kind === "milestone") {
    const [kind, n] = row.key.split("_");
    const v = Number(n);
    if (kind === "streak") {
      if (v >= 100)
        return { size: "stage", pose: "proud", ring: "full", number: n };
      if (v >= 30) return { size: "stage", pose: "proud", ring: "double" };
      return { size: "card", pose: "celebrating", ring: "ring" };
    }
    if (kind === "focus")
      return { size: v >= 50 ? "stage" : "card", pose: "proud", ring: "clock" };
    return { size: v >= 30 ? "stage" : "card", pose: "proud", ring: "ring" };
  }
  return { size: "stage", pose: "celebrating", ring: "crest" };
}

export function Celebration() {
  const app = useApp();
  const { settings } = useSession();
  const row = settings.onboarded ? app.pendingCelebrations[0] : undefined;
  const copy = row
    ? celebrationCopy(row, { months: app.months, todayTasks: app.tasks.length })
    : null;
  const { dismissCelebration } = app;
  const id = row ? `${row.kind}:${row.key}` : null;
  const moment = row ? momentFor(row) : null;
  // Held by the pointer or keyboard focus: the timer waits (WCAG 2.2.1).
  const [held, setHeld] = useState<string | null>(null);
  const isHeld = held !== null && held === id;

  // A row that cannot be shown (unknown month on this device) is just closed.
  useEffect(() => {
    if (row && !copy) dismissCelebration(row);
  }, [row, copy, dismissCelebration]);

  // Closes by itself, counted only while the page is visible and not held.
  useEffect(() => {
    if (!row || !copy || !moment || isHeld) return;
    let id: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(id);
      if (document.visibilityState === "visible")
        id = setTimeout(() => dismissCelebration(row), VISIBLE_MS[moment.size]);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [row, copy, moment, isHeld, dismissCelebration]);

  if (!row || !copy || !moment) return null;
  const stage = moment.size === "stage";
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
        data-size={moment.size}
        onPointerEnter={() => setHeld(id)}
        onPointerLeave={() => setHeld(null)}
        onFocus={() => setHeld(id)}
        onBlur={() => setHeld(null)}
        className={cx(
          "pointer-events-auto flex w-full rounded-2xl border border-accent/25 bg-raised shadow-[0_16px_48px_rgba(0,0,0,.55)]",
          stage
            ? "max-w-[440px] flex-col items-center gap-4 px-6 pt-6 pb-5 text-center motion-safe:animate-[li-stage-in_.5s_var(--ease-settle)]"
            : "max-w-[420px] items-center gap-4 px-4 py-3.5 motion-safe:animate-[li-fade-up_.35s_ease]",
        )}
      >
        <MomentArt moment={moment} />
        <span
          className={cx(
            "flex min-w-0 flex-col gap-1",
            stage ? "items-center" : "flex-1",
          )}
        >
          <span
            data-testid="celebration-title"
            className={cx(
              "font-mono font-semibold tracking-eyebrow text-accent",
              stage ? "text-body" : "text-small",
            )}
          >
            {copy.title}
          </span>
          <span className="text-small text-muted">{copy.line}</span>
          {stage && (
            <span className="pt-1 font-mono text-meta tracking-brand text-dim">
              {t.celebrations.signature}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => dismissCelebration(row)}
          aria-label={t.celebrations.close}
          className={cx(
            "h-11 shrink-0 rounded-xl border border-line-strong px-4 font-mono text-meta tracking-eyebrow text-text",
            stage && "w-full",
          )}
        >
          {stage ? t.celebrations.continue : t.celebrations.ok}
        </button>
      </section>
    </div>
  );
}

/**
 * Rook in front of the Ring. Every animated piece draws from its first frame
 * to the static final frame, so reduced motion shows the final frame.
 */
function MomentArt({ moment }: { moment: Moment }) {
  const stage = moment.size === "stage";
  const box = stage ? 132 : 56;
  return (
    <span
      aria-hidden="true"
      className="relative grid shrink-0 place-items-center"
      style={{ width: box, height: box }}
    >
      <RingArt kind={moment.ring} number={moment.number} />
      <span className="relative motion-safe:animate-[li-rook-land_.6s_var(--ease-settle)_.15s_both]">
        <Rook pose={moment.pose} size={stage ? 92 : 46} />
      </span>
    </span>
  );
}

function RingArt({ kind, number }: { kind: Ring; number?: string }) {
  const draw =
    "motion-safe:animate-[li-ring-draw_.9s_var(--ease-out-quick)_both]";
  const C = 2 * Math.PI * 46;
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
      {kind === "light" && (
        <circle
          cx="50"
          cy="56"
          r="34"
          fill="var(--color-accent)"
          opacity=".1"
          className="motion-safe:animate-[li-fade-in_.6s_ease_both]"
        />
      )}
      {(kind === "ring" || kind === "double" || kind === "full") && (
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={kind === "full" ? 2.4 : 1.6}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={0}
          transform="rotate(-90 50 50)"
          style={{ ["--ring" as string]: `${C}` }}
          className={draw}
        />
      )}
      {kind === "double" && (
        <circle
          cx="50"
          cy="50"
          r="41"
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity=".45"
          strokeWidth="1"
          className="motion-safe:animate-[li-fade-in_.5s_ease_.6s_both]"
        />
      )}
      {kind === "full" && number && (
        <text
          x="50"
          y="14"
          textAnchor="middle"
          fontSize="9"
          className="fill-accent font-mono font-semibold"
        >
          {number}
        </text>
      )}
      {kind === "clock" && (
        <g stroke="var(--color-focus)" strokeLinecap="round">
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1="50"
              y1="5"
              x2="50"
              y2={i % 3 === 0 ? 11 : 8}
              strokeWidth={i % 3 === 0 ? 1.6 : 1}
              transform={`rotate(${i * 30} 50 50)`}
              style={{ animationDelay: `${i * 45}ms` }}
              className="motion-safe:animate-[li-fade-in_.3s_ease_both]"
            />
          ))}
        </g>
      )}
      {kind === "crest" && (
        // A thin crest of light above Rook: the month is decided.
        <path
          d="M28 22 L36 10 L44 18 L50 6 L56 18 L64 10 L72 22"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="80"
          strokeDashoffset="0"
          style={{ ["--ring" as string]: "80" }}
          className="motion-safe:animate-[li-ring-draw_.8s_var(--ease-out-quick)_.35s_both]"
        />
      )}
    </svg>
  );
}
