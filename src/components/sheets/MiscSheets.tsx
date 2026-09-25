"use client";

import { useEffect, useState } from "react";
import { loadDayTasks, type DayTask } from "@/app/(app)/progress-actions";
import { useApp } from "@/components/app-state";
import { FocusPicker } from "@/components/focus/FocusPicker";
import { chipTone, cx } from "@/components/ui";
import { dateLabel } from "@/lib/local-date";
import { REACTIONS, mockChallengeOptions } from "@/lib/mock-data";
import { dayState, percent } from "@/lib/progress";
import { ROUTINE_TEMPLATES } from "@/lib/templates";
import { todayStats } from "@/lib/today";

const heading = "font-mono text-[11px] tracking-[.18em] text-muted";

export function ReactSheet({
  source,
  id,
  title,
}: {
  source: "feed" | "partnerTask";
  id: string;
  title: string;
}) {
  const { react } = useApp();
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <span className={heading}>REACT</span>
        <span className="text-[17px]">{title}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {REACTIONS.map((r) => {
          const emoji = !r.endsWith(".");
          return (
            <button
              key={r}
              type="button"
              onClick={() => react(source, id, r)}
              aria-label={emoji ? `React ${r}` : `Send “${r}”`}
              className={cx(
                "h-[72px] rounded-[18px] border border-white/8 bg-raised p-0 transition-transform duration-100 active:scale-[.88]",
                emoji ? "text-[26px]" : "text-[13px]",
              )}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FocusSheet() {
  const { startFocus } = useApp();
  return (
    <div className="flex flex-col gap-5">
      <span className={heading}>WHAT ARE YOU WORKING ON?</span>
      <FocusPicker compact />
      <button
        type="button"
        onClick={startFocus}
        className="h-[58px] rounded-2xl bg-accent font-mono text-[13px] font-semibold tracking-[.32em] text-bg active:scale-[.97]"
      >
        START
      </button>
    </div>
  );
}

export function StreakSheet() {
  const { tasks, standard, streak, longestStreak, closeSheet } = useApp();
  const stats = todayStats(tasks, standard);
  const rules = [
    {
      t: `A day counts when you complete ${standard}% of scheduled tasks.`,
      on: true,
    },
    {
      t: "Skipped tasks stay in the total and don't count as done.",
      on: true,
    },
    {
      t: "Days with nothing scheduled neither count nor break it.",
      on: true,
    },
    { t: "Missing your standard resets the streak to zero.", on: false },
  ];
  const today =
    stats.total === 0
      ? "Nothing scheduled today. The streak is safe."
      : stats.standardMet
        ? `Today: ${stats.done} / ${stats.total}. Standard met — today counts.`
        : `Today: ${stats.done} / ${stats.total}. ${stats.needed} more and today counts. Today can't break the streak before it ends.`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[56px] leading-[.9] font-medium tracking-[-0.05em]">
          {streak}
        </span>
        <span className="font-mono text-xs tracking-[.16em] text-muted">
          DAY STREAK
        </span>
        <span className="ml-auto font-mono text-[11px] tracking-[.12em] text-dim">
          LONGEST {longestStreak}
        </span>
      </div>
      <div className="flex flex-col">
        {rules.map((r) => (
          <div
            key={r.t}
            className="flex gap-3 border-t border-white/6 py-3 text-[14.5px] leading-[1.45]"
          >
            <span
              aria-hidden="true"
              className={cx(
                "mt-[7px] size-1.5 shrink-0 rounded-full",
                r.on ? "bg-accent" : "border-[1.5px] border-missed",
              )}
            />
            <span>{r.t}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-raised px-4 py-3.5 text-sm leading-[1.5] text-muted">
        {today}
      </div>
      <button
        type="button"
        onClick={closeSheet}
        className="h-[52px] rounded-[14px] border border-white/12 text-[15px]"
      >
        Got it
      </button>
    </div>
  );
}

const STATE_TEXT = {
  completed: "DONE",
  skipped: "SKIPPED",
  pending: "MISSED",
} as const;

/** A past day from daily_tasks history (read-only: the record). */
export function DaySheet({ date }: { date: string }) {
  const { standard } = useApp();
  const [items, setItems] = useState<DayTask[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadDayTasks(date)
      .catch(() => null)
      .then((res) => {
        if (!alive) return;
        if (res?.ok) setItems(res.tasks);
        else setError(true);
      });
    return () => {
      alive = false;
    };
  }, [date]);

  const done = items?.filter((i) => i.status === "completed").length ?? 0;
  const total = items?.length ?? 0;
  const pct = percent(done, total);
  const state = dayState(total, done, standard);
  const summary =
    state === "perfect"
      ? "Perfect day"
      : state === "met"
        ? "Standard met"
        : state === "missed"
          ? "Standard missed"
          : "Nothing scheduled";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[.16em] text-muted">
            {dateLabel(date)}
          </span>
          <span
            className={cx(
              "text-[15px]",
              items === null
                ? "text-dim"
                : state === "missed"
                  ? "text-danger"
                  : "text-accent",
            )}
          >
            {error
              ? "Could not load this day."
              : items === null
                ? "Loading…"
                : summary}
          </span>
        </span>
        <span className="text-[44px] leading-[.85] font-medium tracking-[-0.045em] tabular-nums">
          {pct === null ? "—" : `${pct}%`}
        </span>
      </div>
      <div className="flex flex-col">
        {(items ?? []).map((it) => {
          const missed = it.status !== "completed";
          return (
            <div
              key={it.id}
              className="flex min-h-12 items-center gap-3 border-t border-white/5"
            >
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px]",
                  missed
                    ? "border-dashed border-missed"
                    : "border-accent bg-accent",
                )}
              >
                <svg width="11" height="11" viewBox="0 0 16 16">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    stroke="#0A0A0B"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: missed ? 0 : 1 }}
                  />
                </svg>
              </span>
              <span
                className={cx(
                  "flex-1 text-[14.5px]",
                  missed ? "text-text" : "text-muted",
                )}
              >
                {it.title}
              </span>
              <span
                className={cx(
                  "font-mono text-[10px] tracking-[.12em]",
                  missed ? "text-danger" : "text-dim",
                )}
              >
                {STATE_TEXT[it.status]}
              </span>
            </div>
          );
        })}
      </div>
      <span className="text-xs text-dim">
        Skipped tasks stay in the total. Past days are the record.
      </span>
    </div>
  );
}

export function TemplateSheet() {
  const { routines, applyTemplate, closeSheet } = useApp();
  const names = Object.keys(ROUTINE_TEMPLATES);
  const [pick, setPick] = useState(names[0]);
  const have = new Set(routines.map((t) => t.name.toLowerCase()));
  const items = ROUTINE_TEMPLATES[pick];

  return (
    <div className="flex flex-col gap-[18px]">
      <span className={heading}>USE A TEMPLATE</span>
      <div
        role="radiogroup"
        aria-label="Template"
        className="flex flex-wrap gap-1.5"
      >
        {names.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={pick === n}
            onClick={() => setPick(n)}
            className={cx(
              "h-10 rounded-[10px] border px-3.5 text-sm",
              chipTone(pick === n),
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex flex-col">
        {items.map((it) => (
          <div
            key={it.name}
            className="flex min-h-[46px] items-center justify-between border-t border-white/5 text-[15px]"
          >
            <span>{it.name}</span>
            <span className="font-mono text-[10px] tracking-[.12em] text-dim">
              {have.has(it.name.toLowerCase()) ? "HAVE" : "NEW"}
            </span>
          </div>
        ))}
      </div>
      <span className="text-[12.5px] text-dim">
        Items you already have are skipped. Everything stays editable.
      </span>
      <button
        type="button"
        onClick={() => {
          closeSheet();
          void applyTemplate(items);
        }}
        className="h-14 rounded-2xl bg-text font-mono text-[12.5px] font-semibold tracking-[.26em] text-bg"
      >
        USE ROUTINE
      </button>
    </div>
  );
}

export function ChallengeSheet() {
  const { addChallenge, partner } = useApp();
  const [pick, setPick] = useState(mockChallengeOptions[0].id);
  const [len, setLen] = useState(30);
  const option =
    mockChallengeOptions.find((o) => o.id === pick) ?? mockChallengeOptions[0];

  return (
    <div className="flex flex-col gap-[18px]">
      <span className={heading}>NEW CHALLENGE</span>
      <div
        role="radiogroup"
        aria-label="Challenge"
        className="flex flex-col gap-[18px]"
      >
        {mockChallengeOptions.map((c) => {
          const on = pick === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPick(c.id)}
              className={cx(
                "flex min-h-[70px] items-center justify-between gap-3 rounded-[14px] border px-4 text-left",
                on ? "border-accent-line bg-accent-soft" : "border-white/9",
              )}
            >
              <span className="flex flex-col gap-1">
                <span className="text-[15.5px] font-medium">{c.label}</span>
                <span className="text-[12.5px] text-dim">{c.sub}</span>
              </span>
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                  on ? "border-accent" : "border-white/20",
                )}
              >
                <span
                  className="size-[9px] rounded-full bg-accent"
                  style={{ transform: on ? "scale(1)" : "scale(0)" }}
                />
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10.5px] tracking-[.16em] text-dim">
          LENGTH
        </span>
        <div role="radiogroup" aria-label="Length" className="flex gap-1.5">
          {[7, 14, 30].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={len === n}
              onClick={() => setLen(n)}
              className={cx(
                "h-[46px] flex-1 rounded-xl border text-[14.5px]",
                chipTone(len === n),
              )}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => addChallenge(option.label, len)}
        className="h-14 rounded-2xl bg-text font-mono text-[12.5px] font-semibold tracking-[.26em] text-bg"
      >
        START WITH {partner.name.toUpperCase()}
      </button>
    </div>
  );
}
