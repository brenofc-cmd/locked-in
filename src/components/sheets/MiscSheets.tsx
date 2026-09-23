"use client";

import { useState } from "react";
import { useApp } from "@/components/app-state";
import { FocusPicker } from "@/components/focus/FocusPicker";
import { chipTone, cx } from "@/components/ui";
import { seeded } from "@/lib/format";
import {
  DAYS,
  REACTIONS,
  mockChallengeOptions,
  mockStats,
  mockTemplates,
  mockToday,
  mockUser,
} from "@/lib/mock-data";
import { scheduledOn, todayStats } from "@/lib/today";

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
  const { tasks, standard, closeSheet } = useApp();
  const stats = todayStats(scheduledOn(tasks, mockToday.day).today, standard);
  const rules = [
    {
      t: `A day counts when you complete ${standard}% of scheduled tasks.`,
      on: true,
    },
    {
      t: "Skipped tasks leave the total. They don't count for or against you.",
      on: true,
    },
    { t: "Missing your standard resets the streak to zero.", on: false },
  ];
  const today = stats.standardMet
    ? `Today: ${stats.done} / ${stats.total}. Standard met — the streak continues.`
    : `Today: ${stats.done} / ${stats.total}. ${stats.needed} more to keep the streak.`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[56px] leading-[.9] font-medium tracking-[-0.05em]">
          {mockUser.streak}
        </span>
        <span className="font-mono text-xs tracking-[.16em] text-muted">
          DAY STREAK
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

type DayItem = { name: string; state: "DONE" | "MISSED" | "EDITED" };

/** Past day detail from the Progress calendar. Corrections stay local. */
export function DaySheet({ day }: { day: number }) {
  const { tasks } = useApp();
  const [items, setItems] = useState<DayItem[]>(() => {
    const names = scheduledOn(tasks, DAYS[(day - 1) % 7]).today.map(
      (t) => t.name,
    );
    const missed = mockStats.september.missed.includes(day);
    const perfect = mockStats.september.perfect.includes(day);
    const rnd = seeded(day * 13 + 7);
    return names.map((name) => ({
      name,
      state: perfect
        ? "DONE"
        : rnd() < (missed ? 0.35 : 0.1)
          ? "MISSED"
          : "DONE",
    }));
  });
  const done = items.filter((i) => i.state !== "MISSED").length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const weekday = DAYS[(day - 1) % 7];
  const summary =
    pct === 100
      ? "Perfect day"
      : pct >= mockUser.standard
        ? "Standard met"
        : "Standard missed";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[.16em] text-muted">
            {weekday}, SEP {day}
          </span>
          <span
            className={cx(
              "text-[15px]",
              pct >= mockUser.standard ? "text-accent" : "text-danger",
            )}
          >
            {summary}
          </span>
        </span>
        <span className="text-[44px] leading-[.85] font-medium tracking-[-0.045em] tabular-nums">
          {pct}%
        </span>
      </div>
      <div className="flex flex-col">
        {items.map((it, i) => {
          const missed = it.state === "MISSED";
          return (
            <button
              key={it.name}
              type="button"
              disabled={!missed}
              onClick={() =>
                setItems((list) =>
                  list.map((x, j) => (j === i ? { ...x, state: "EDITED" } : x)),
                )
              }
              className="flex min-h-12 items-center gap-3 border-t border-white/5 text-left disabled:cursor-default"
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
                {it.name}
              </span>
              <span
                className={cx(
                  "font-mono text-[10px] tracking-[.12em]",
                  missed ? "text-danger" : "text-dim",
                )}
              >
                {it.state}
              </span>
            </button>
          );
        })}
      </div>
      <span className="text-xs text-dim">
        Tap a missed task to correct it. Corrections are marked as edited.
      </span>
    </div>
  );
}

export function TemplateSheet() {
  const { tasks, applyTemplate } = useApp();
  const names = Object.keys(mockTemplates);
  const [pick, setPick] = useState(names[0]);
  const have = new Set(tasks.map((t) => t.name.toLowerCase()));
  const items = mockTemplates[pick];

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
        onClick={() => applyTemplate(items)}
        className="h-14 rounded-2xl bg-text font-mono text-[12.5px] font-semibold tracking-[.26em] text-bg"
      >
        USE ROUTINE
      </button>
    </div>
  );
}

export function ChallengeSheet() {
  const { addChallenge } = useApp();
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
        START WITH LUCAS
      </button>
    </div>
  );
}
