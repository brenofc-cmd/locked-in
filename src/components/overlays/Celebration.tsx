"use client";

/**
 * V2 Phase 9 celebration (docs/CELEBRATIONS.md), staged by rarity in the
 * final design pass (docs/MOTION.md → Celebrations). Short, rare, factual,
 * shown once. One at a time, non-modal (nothing behind it is blocked),
 * closes by itself (held while pointed at or focused, so it can be read) or
 * on OK / CONTINUAR. Each rarity has its own short story — not the same
 * animation made bigger: Perfect Day quiets the screen for a beat; the
 * 7-day streak charges the Proof Core and opens Rook's wings inside the
 * Ring; 30 days doubles the Ring; 100 days starts as a silhouette and
 * ignites; the Monthly Champion gets a rook-tower crown. With
 * prefers-reduced-motion the final frame simply appears. Closing it marks
 * it seen in the database, so another device does not show it again.
 */
import { t } from "@/i18n/pt-BR";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import {
  ROOK_COLORS,
  Rook,
  type CoreState,
  type RookPose,
} from "@/components/brand/Rook";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import { celebrationCopy, type CelebrationRow } from "@/lib/celebrations";

/** How long a moment stays (visible time only). Rare moments get longer. */
const VISIBLE_MS = { card: 2000, stage: 4200 } as const;

type Story =
  | "perfect"
  | "streak"
  | "streak-rare"
  | "streak-100"
  | "focus"
  | "perfect-ms"
  | "month"
  | "draw";

type Moment = {
  size: "card" | "stage";
  story: Story;
  /** The badge number (streak days). */
  number?: string;
};

/** Rarity → staging. Unknown keys fall back to the quiet card. */
export function momentFor(row: Pick<CelebrationRow, "kind" | "key">): Moment {
  if (row.kind === "perfect_day") return { size: "card", story: "perfect" };
  if (row.kind === "milestone") {
    const [kind, n] = row.key.split("_");
    const v = Number(n);
    if (kind === "streak") {
      if (v >= 100) return { size: "stage", story: "streak-100", number: n };
      if (v >= 30) return { size: "stage", story: "streak-rare", number: n };
      return { size: "stage", story: "streak", number: n };
    }
    if (kind === "focus")
      return { size: v >= 50 ? "stage" : "card", story: "focus" };
    return { size: v >= 30 ? "stage" : "card", story: "perfect-ms" };
  }
  return { size: "stage", story: "month" };
}

/** One frame of a story: Rook's pose and Core, and what is drawn. */
type Frame = {
  at: number;
  pose: RookPose;
  core: CoreState;
  ring?: boolean;
  badge?: boolean;
  dark?: boolean;
  crown?: boolean;
  ack?: boolean;
};

export const STORIES: Record<Story, Frame[]> = {
  perfect: [
    { at: 0, pose: "neutral", core: "idle" },
    { at: 260, pose: "neutral", core: "proof", ack: true },
    { at: 620, pose: "proud", core: "proof", ring: true },
  ],
  streak: [
    { at: 0, pose: "neutral", core: "idle" },
    { at: 260, pose: "watching", core: "active" },
    { at: 520, pose: "watching", core: "milestone" },
    { at: 760, pose: "celebrating", core: "milestone", ring: true },
    {
      at: 1100,
      pose: "celebrating",
      core: "milestone",
      ring: true,
      badge: true,
    },
    { at: 1650, pose: "proud", core: "proof", ring: true, badge: true },
  ],
  "streak-rare": [
    { at: 0, pose: "neutral", core: "idle" },
    { at: 260, pose: "watching", core: "active" },
    { at: 520, pose: "watching", core: "milestone" },
    { at: 760, pose: "celebrating", core: "milestone", ring: true },
    {
      at: 1100,
      pose: "celebrating",
      core: "milestone",
      ring: true,
      badge: true,
    },
    { at: 1700, pose: "proud", core: "milestone", ring: true, badge: true },
  ],
  "streak-100": [
    { at: 0, pose: "neutral", core: "off", dark: true },
    { at: 420, pose: "neutral", core: "milestone", dark: true },
    { at: 900, pose: "proud", core: "milestone" },
    { at: 1200, pose: "proud", core: "milestone", ring: true },
    { at: 1550, pose: "proud", core: "milestone", ring: true, badge: true },
  ],
  focus: [
    { at: 0, pose: "focused", core: "active" },
    { at: 500, pose: "proud", core: "proof", ring: true },
  ],
  "perfect-ms": [
    { at: 0, pose: "neutral", core: "idle" },
    { at: 300, pose: "proud", core: "proof", ring: true },
  ],
  month: [
    { at: 0, pose: "neutral", core: "idle" },
    { at: 300, pose: "neutral", core: "milestone" },
    { at: 600, pose: "celebrating", core: "milestone", crown: true },
    { at: 1500, pose: "proud", core: "milestone", crown: true },
  ],
  draw: [
    { at: 0, pose: "neutral", core: "idle" },
    { at: 400, pose: "proud", core: "proof" },
  ],
};

/**
 * Plays a story's frames once (local timers only, no network). With reduced
 * motion the last frame is shown at once.
 */
function useStory(frames: Frame[]): Frame {
  const [i, setI] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timers = reduce
      ? [setTimeout(() => setI(frames.length - 1), 0)]
      : frames.map((f, n) => setTimeout(() => setI(n), f.at));
    return () => timers.forEach(clearTimeout);
  }, [frames]);
  return frames[i];
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
  const base = row ? momentFor(row) : null;
  // A draw is the month's stage without the crown.
  const moment =
    base && copy && copy.title === t.celebrations.monthDraw
      ? { ...base, story: "draw" as const }
      : base;
  // Held by the pointer or keyboard focus: the timer waits (WCAG 2.2.1).
  const [held, setHeld] = useState<string | null>(null);
  const isHeld = held !== null && held === id;
  const size = moment?.size;

  // A row that cannot be shown (unknown month on this device) is just closed.
  useEffect(() => {
    if (row && !copy) dismissCelebration(row);
  }, [row, copy, dismissCelebration]);

  // Closes by itself, counted only while the page is visible and not held.
  useEffect(() => {
    if (!row || !copy || !size || isHeld) return;
    let id: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(id);
      if (document.visibilityState === "visible")
        id = setTimeout(() => dismissCelebration(row), VISIBLE_MS[size]);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [row, copy, size, isHeld, dismissCelebration]);

  if (!row || !copy || !moment) return null;
  const stage = moment.size === "stage";
  return (
    <>
      {moment.story === "perfect" && (
        // Perfect Day: the screen quiets for a beat behind the card.
        <div
          key={`dim-${id}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[69] bg-black opacity-0 motion-safe:animate-[li-dim_1.4s_ease_both]"
        />
      )}
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
            "pointer-events-auto flex w-full rounded-2xl border border-line-strong bg-raised shadow-[0_16px_48px_rgba(0,0,0,.55)]",
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
                {moment.story === "streak-100"
                  ? t.celebrations.hundred
                  : t.celebrations.signature}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => dismissCelebration(row)}
            aria-label={t.celebrations.close}
            className={cx(
              "h-11 shrink-0 rounded-xl border border-line-strong px-4 font-mono text-meta tracking-eyebrow text-text active:scale-[.97]",
              stage && "w-full",
            )}
          >
            {stage ? t.celebrations.continue : t.celebrations.ok}
          </button>
        </section>
      </div>
    </>
  );
}

const EMERALD = ROOK_COLORS.green;

/**
 * Rook in front of his Ring; each element appears on its frame. `still`
 * pins one frame (the character sheet's storyboard, docs/MOTION.md).
 */
export function MomentArt({
  moment,
  still,
}: {
  moment: Moment;
  still?: number;
}) {
  const played = useStory(STORIES[moment.story]);
  const frame = still === undefined ? played : STORIES[moment.story][still];
  const stage = moment.size === "stage";
  const box = stage ? 140 : 56;
  const rare = moment.story === "streak-rare" || moment.story === "streak-100";
  return (
    <span
      aria-hidden="true"
      className="relative grid shrink-0 place-items-center"
      style={{ width: box, height: box }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {moment.story === "perfect" && frame.ring && (
          <circle
            cx="50"
            cy="56"
            r="36"
            fill={EMERALD}
            opacity=".1"
            className="motion-safe:animate-[li-fade-in_.5s_ease_both]"
          />
        )}
        {frame.ring &&
          moment.story !== "perfect" &&
          moment.story !== "focus" && (
            <Ring r={46} width={moment.story === "streak-100" ? 2.6 : 1.8} />
          )}
        {frame.ring && rare && (
          <circle
            cx="50"
            cy="50"
            r="41"
            fill="none"
            stroke={EMERALD}
            strokeOpacity=".45"
            strokeWidth="1"
            className="motion-safe:animate-[li-fade-in_.5s_ease_.35s_both]"
          />
        )}
        {frame.ring && moment.story === "focus" && <Clock />}
        {frame.crown && <Crown />}
      </svg>
      <span
        className={cx(
          "relative transition-[filter] duration-500",
          frame.dark && "brightness-[.12]",
        )}
      >
        <Rook
          pose={frame.pose}
          core={frame.core}
          act={frame.ack ? "ack" : undefined}
          size={stage ? 96 : 48}
        />
      </span>
      {frame.dark && frame.core === "milestone" && (
        // Ignition: only the Core shows through the silhouette.
        <span
          className="pointer-events-none absolute top-[63%] left-1/2 h-3.5 w-2 -translate-x-1/2 rounded-full blur-[3px] motion-safe:animate-[li-fade-in_.3s_ease_both]"
          style={{ background: EMERALD }}
        />
      )}
      {frame.badge && moment.number && (
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full border border-line-strong bg-raised px-2.5 py-0.5 font-mono text-small font-semibold text-text tabular-nums motion-safe:animate-[li-settle_.45s_var(--ease-settle)]">
          {moment.number}
        </span>
      )}
    </span>
  );
}

/** The Ring: draws itself closed (emerald, the Core's colour). */
function Ring({ r, width }: { r: number; width: number }) {
  const c = 2 * Math.PI * r;
  return (
    <circle
      cx="50"
      cy="50"
      r={r}
      fill="none"
      stroke={EMERALD}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={c}
      strokeDashoffset={0}
      transform="rotate(-90 50 50)"
      style={{ ["--ring" as string]: `${c}` }}
      className="motion-safe:animate-[li-ring-draw_.9s_var(--ease-out-quick)_both]"
    />
  );
}

/** Focus milestones: a clock of 12 ticks, never the streak Ring. */
function Clock() {
  return (
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
  );
}

/** Monthly Champion: a geometric rook-tower crown above Rook. */
function Crown() {
  return (
    <path
      d="M32 20 V9 H38 V13 H45 V9 H55 V13 H62 V9 H68 V20 Z"
      fill="none"
      stroke={EMERALD}
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeDasharray="120"
      strokeDashoffset="0"
      style={{ ["--ring" as string]: "120" }}
      className="motion-safe:animate-[li-ring-draw_.8s_var(--ease-out-quick)_both]"
    />
  );
}
