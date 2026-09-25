"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadDays } from "@/app/(app)/progress-actions";
import { useSession } from "@/components/session";
import { useApp } from "@/components/app-state";
import { cx } from "@/components/ui";
import { DAYS, DAY_LETTERS, addDays } from "@/lib/local-date";
import {
  calendarMonth,
  chartBars,
  completedWeeks,
  dayState,
  focusLabel,
  insightLines,
  rangeFrom,
  rankHabits,
  totals,
  weeksWithData,
  monthRange,
  shiftMonth,
  type Bar,
  type DayStat,
  type Range,
} from "@/lib/progress";

const RANGES: { k: Range; short: string; long: string }[] = [
  { k: "7", short: "7D", long: "7 DAYS" },
  { k: "30", short: "30D", long: "30 DAYS" },
  { k: "90", short: "90D", long: "90 DAYS" },
  { k: "Y", short: "YEAR", long: "YEAR" },
];

function barColor(b: Bar, standard: number, range: Range) {
  if (b.pct === null) return "bg-white/6";
  if (b.pct < standard) return "bg-[color-mix(in_oklab,#E0715F_55%,#17171A)]";
  if (b.pct === 100 || (b.current && range !== "7")) return "bg-accent";
  return "bg-[#35353a]";
}

/** Bar height: 40–100 % fills the chart (the design's scale); low values stay visible. */
const barHeight = (pct: number | null) =>
  pct === null ? 2 : Math.max(4, ((pct - 40) / 60) * 82);

export function ProgressScreen() {
  const app = useApp();
  const [range, setRange] = useState<Range>("7");
  const [insights, setInsights] = useState(false);
  const today = app.today;
  const days = app.progressDays;

  if (!app.hasHistory) {
    return (
      <div className="flex max-w-[420px] flex-col gap-5 pt-10 animate-[li-fade-up_.4s_ease]">
        <h1 className="font-mono text-[11px] font-normal tracking-[.16em] text-dim">
          PROGRESS
        </h1>
        <p className="text-[26px] leading-[1.3] font-medium tracking-[-0.02em] text-pretty">
          No data yet. Start showing up.
        </p>
        <Link
          href="/today"
          className="flex h-[52px] items-center self-start rounded-[14px] bg-accent px-[22px] font-mono text-xs font-semibold tracking-[.22em] text-bg"
        >
          GO TO TODAY
        </Link>
      </div>
    );
  }

  const t = totals(days, rangeFrom(range, today), today);
  const bars = chartBars(days, range, today);
  const showValues = bars.length <= 13;
  const rangeLong = RANGES.find((r) => r.k === range)?.long ?? "";
  const weeks = weeksWithData(completedWeeks(app.progress.weeks)).slice(0, 4);
  const habits = rankHabits(app.progress.habits);
  const lines = insightLines(
    app.progress.habits,
    days.filter((d) => d.day >= addDays(today, -30) && d.day < today),
    "in the last 30 days",
  );

  return (
    <div className="flex flex-col gap-8 animate-[li-fade-up_.4s_ease] desk:gap-12">
      <header className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
          PROGRESS
        </h1>
        <div
          role="radiogroup"
          aria-label="Range"
          className="flex gap-0.5 rounded-[11px] border border-white/8 p-[3px]"
        >
          {RANGES.map((r) => (
            <button
              key={r.k}
              type="button"
              role="radio"
              aria-checked={range === r.k}
              aria-label={r.long}
              onClick={() => setRange(r.k)}
              className={cx(
                "h-9 rounded-lg px-[13px] font-mono text-[11px] tracking-[.1em]",
                range === r.k ? "bg-selected text-text" : "text-dim",
              )}
            >
              <span className="desk:hidden">{r.short}</span>
              <span className="hidden desk:inline">{r.long}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2.5">
          <span
            data-testid="progress-pct"
            className="text-[64px] leading-[.82] font-medium tracking-[-0.055em] tabular-nums desk:text-[84px] wide:text-[112px]"
          >
            {t.pct ?? "—"}
            {t.pct !== null && (
              <span className="text-[26px] text-quiet desk:text-[40px]">%</span>
            )}
          </span>
          <span className="font-mono text-[11px] tracking-[.16em] text-dim">
            COMPLETION RATE · {rangeLong}
            <span className="sr-only">
              {`: ${t.completed} of ${t.planned} tasks`}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => app.openSheet({ kind: "streak" })}
            className="flex flex-col gap-2 border-t border-white/10 pt-3.5 text-left"
          >
            <span
              data-testid="progress-streak"
              className="text-[30px] leading-none font-medium tracking-[-0.03em] desk:text-[40px]"
            >
              {app.streak}{" "}
              <span className="text-[13px] tracking-normal text-muted">
                {app.streak === 1 ? "day" : "days"}
              </span>
            </span>
            <span className="font-mono text-[10px] tracking-[.14em] text-dim">
              STREAK ›
            </span>
          </button>
          <Stat
            value={focusLabel(t.focusSeconds)}
            label="FOCUS"
            testId="progress-focus"
          />
          <Stat
            value={String(t.perfectDays)}
            label="PERFECT DAYS"
            testId="progress-perfect"
          />
        </div>
      </div>

      <section aria-label="Completion chart" className="flex flex-col gap-3">
        <h2 className="font-mono text-[11px] font-normal tracking-[.16em] text-muted">
          {range === "7" ? "LAST 7 DAYS" : `COMPLETION · ${rangeLong}`}
        </h2>
        <div
          role="list"
          className={cx(
            "flex h-[170px] items-end border-b border-white/8",
            bars.length > 20 ? "gap-[3px]" : "gap-1.5 desk:gap-2",
          )}
        >
          {bars.map((b) => (
            <div
              key={b.key}
              role="listitem"
              aria-label={b.title}
              title={b.title}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
            >
              {showValues && (
                <span
                  aria-hidden="true"
                  className={cx(
                    "text-center text-[13px] font-medium tabular-nums",
                    b.pct === 100
                      ? "text-accent"
                      : b.pct !== null && b.pct < app.standard
                        ? "text-danger"
                        : "text-muted",
                  )}
                >
                  {b.pct ?? "–"}
                </span>
              )}
              <div
                aria-hidden="true"
                className={cx(
                  "rounded-t transition-[height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
                  barColor(b, app.standard, range),
                )}
                style={{ height: `${barHeight(b.pct)}%` }}
              />
            </div>
          ))}
        </div>
        <div
          aria-hidden="true"
          className={cx(
            "flex",
            bars.length > 20 ? "gap-[3px]" : "gap-1.5 desk:gap-2",
          )}
        >
          {bars.map((b) => (
            <span
              key={b.key}
              className={cx(
                "min-w-0 flex-1 text-center font-mono text-[10px] whitespace-nowrap",
                b.current ? "text-text" : "text-dim",
              )}
            >
              {range === "7" ? (
                <>
                  <span className="desk:hidden">
                    {
                      DAY_LETTERS[
                        DAYS.indexOf(b.label as (typeof DAYS)[number])
                      ]
                    }
                  </span>
                  <span className="hidden desk:inline">{b.label}</span>
                </>
              ) : (
                b.label
              )}
            </span>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8 desk:gap-12">
        <Calendar onOpen={(date) => app.openSheet({ kind: "day", date })} />
        <section aria-label="Weekly reviews" className="flex flex-col">
          <h2 className="border-b border-white/9 pb-2 font-mono text-[11px] font-normal tracking-[.16em] text-muted">
            WEEKLY REVIEWS
          </h2>
          {weeks.map((w) => (
            <button
              key={w.weekStart}
              type="button"
              onClick={() =>
                app.openOverlay({ kind: "weekly", weekStart: w.weekStart })
              }
              className="grid min-h-[50px] grid-cols-[80px_1fr_auto] items-center gap-2.5 border-b border-white/5 p-0 text-left text-sm"
            >
              <span className="font-mono text-[11px] text-muted">
                WEEK {w.week}
              </span>
              <span className="tabular-nums">
                You {w.me === null ? "—" : `${w.me}%`}
                {app.hasPartner &&
                  ` · ${app.partner.name} ${w.partner === null ? "—" : `${w.partner}%`}`}
              </span>
              <span aria-hidden="true" className="text-faint">
                ›
              </span>
            </button>
          ))}
          {weeks.length === 0 && (
            <span className="py-3.5 text-[13.5px] text-dim">
              Your first review arrives after your first full week.
            </span>
          )}
        </section>
      </div>

      <button
        type="button"
        onClick={() => setInsights((v) => !v)}
        aria-expanded={insights}
        className="flex h-[52px] items-center justify-between border-y border-white/8 text-[14.5px]"
      >
        <span>{insights ? "Hide insights" : "Show insights"}</span>
        <span
          aria-hidden="true"
          className="text-dim transition-transform duration-200"
          style={{ transform: insights ? "rotate(90deg)" : "none" }}
        >
          ›
        </span>
      </button>
      {insights && (
        <div className="flex flex-col gap-[30px] animate-[li-fade-up_.3s_ease]">
          <div className="flex flex-col gap-2.5">
            {lines.map((i) => (
              <span
                key={i}
                className="border-l-2 border-white/12 pl-3.5 text-[15px] leading-[1.5]"
              >
                {i}
              </span>
            ))}
            {lines.length === 0 && (
              <span className="text-[14px] leading-[1.5] text-dim">
                Not enough history yet. Insights need a routine scheduled at
                least 3 times.
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <div className="flex justify-between gap-3 border-b border-white/9 pb-2">
              <span className="font-mono text-[11px] tracking-[.16em] text-muted">
                CONSISTENCY · 30 DAYS
              </span>
              <span className="font-mono text-[11px] text-dim">
                LONGEST STREAK {app.longestStreak}{" "}
                {app.longestStreak === 1 ? "DAY" : "DAYS"}
              </span>
            </div>
            {habits.map((h) => (
              <div
                key={h.routineId}
                className="grid min-h-[46px] grid-cols-[minmax(0,1fr)_90px_44px] items-center gap-3 border-b border-white/5"
              >
                <span className="truncate text-sm">
                  {h.title}
                  <span className="sr-only">
                    {`: ${h.completed} of ${h.planned}`}
                  </span>
                </span>
                <div
                  aria-hidden="true"
                  className="h-[3px] rounded-sm bg-white/6"
                >
                  <div
                    className={cx(
                      "h-full rounded-sm",
                      h.rate < app.standard ? "bg-danger" : "bg-muted",
                    )}
                    style={{ width: `${h.rate}%` }}
                  />
                </div>
                <span
                  className={cx(
                    "text-right text-sm tabular-nums",
                    h.rate < app.standard ? "text-danger" : "text-text",
                  )}
                >
                  {h.rate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  testId,
}: {
  value: string;
  label: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-3.5">
      <span
        data-testid={testId}
        className="text-[30px] leading-none font-medium tracking-[-0.03em] desk:text-[40px]"
      >
        {value}
      </span>
      <span className="font-mono text-[10px] tracking-[.14em] text-dim">
        {label}
      </span>
    </div>
  );
}

const STATE_LABEL = {
  met: "standard met",
  perfect: "perfect",
  missed: "missed",
  neutral: "nothing scheduled",
  future: "upcoming",
  today: "in progress",
} as const;

/**
 * History calendar: the current month from the loaded series; earlier months
 * (back to the account's first month) are read on demand. Read-only.
 */
function Calendar({ onOpen }: { onOpen: (date: string) => void }) {
  const app = useApp();
  const { me } = useSession();
  const current = app.today.slice(0, 7);
  const [month, setMonth] = useState(current);
  const [extra, setExtra] = useState<Record<string, DayStat>>({});
  const loadedFrom = app.progressDays[0]?.day ?? app.today;
  const firstMonth = [
    me.createdAt.slice(0, 7),
    loadedFrom.slice(0, 7),
  ].sort()[0];

  useEffect(() => {
    const { from, to } = monthRange(month);
    if (from >= loadedFrom || extra[from]) return;
    let alive = true;
    void loadDays(from, to < loadedFrom ? to : addDays(loadedFrom, -1))
      .catch(() => null)
      .then((res) => {
        if (!alive || !res?.ok) return;
        setExtra((x) => {
          const next = { ...x };
          for (const d of res.days) next[d.day] = d;
          return next;
        });
      });
    return () => {
      alive = false;
    };
  }, [month, loadedFrom, extra]);

  const days = [...Object.values(extra), ...app.progressDays];
  const { label, cells } = calendarMonth(days, app.today, app.standard, month);
  const title = label.charAt(0) + label.slice(1).toLowerCase();

  return (
    <section aria-label={title} className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] font-normal tracking-[.16em] text-muted">
          {label}
        </h2>
        <div className="flex items-center gap-1">
          <span className="hidden text-xs text-dim min-[400px]:inline">
            Tap a day to review
          </span>
          <button
            type="button"
            aria-label="Previous month"
            disabled={month <= firstMonth}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="size-11 rounded-xl text-base text-text disabled:text-off"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= current}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="size-11 rounded-xl text-base text-text disabled:text-off"
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DAY_LETTERS.map((d, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pb-1 text-center font-mono text-[10px] text-faint"
          >
            {d}
          </span>
        ))}
        {cells.map((c) => {
          if (c.kind === "blank") return <span key={c.key} />;
          // Today shows its live state like the rest of the heat.
          const shown =
            c.state === "today"
              ? todayState(
                  app.tasks.length,
                  app.tasks.filter((x) => x.done).length,
                  app.standard,
                )
              : c.state;
          const closed = c.state !== "future" && c.state !== "today";
          return (
            <button
              key={c.key}
              type="button"
              disabled={!closed || c.state === "neutral"}
              onClick={() => onOpen(c.date)}
              aria-label={`${title.slice(0, 3)} ${c.dayNumber}: ${
                c.state === "today"
                  ? `today, ${STATE_LABEL[shown === "today" ? "today" : shown]}`
                  : STATE_LABEL[c.state]
              }${c.pct !== null && closed ? `, ${c.pct}%` : ""}`}
              className={cx(
                "flex h-[46px] flex-col items-center justify-center gap-[5px] rounded-[10px] p-0 text-[12.5px] tabular-nums disabled:cursor-default",
                c.state === "today"
                  ? "border border-white/20"
                  : "border border-transparent",
                c.state === "future" ? "text-off" : "text-text",
              )}
            >
              <span>{c.dayNumber}</span>
              <span
                aria-hidden="true"
                className={cx(
                  "size-1.5 rounded-full",
                  (shown === "met" || shown === "perfect") && "bg-accent",
                  shown === "perfect" &&
                    "shadow-[0_0_0_2px_#0A0A0B,0_0_0_3px_var(--color-accent)]",
                  shown === "missed" && "border-[1.5px] border-missed",
                )}
              />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-[11.5px] text-dim">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-accent"
          />
          Standard met
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-accent shadow-[0_0_0_2px_#0A0A0B,0_0_0_3px_var(--color-accent)]"
          />
          Perfect
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full border-[1.5px] border-missed"
          />
          Missed
        </span>
      </div>
    </section>
  );
}

/** Today in the calendar: met / perfect once reached; otherwise still open. */
function todayState(planned: number, completed: number, standard: number) {
  const state = dayState(planned, completed, standard);
  return state === "met" || state === "perfect" ? state : ("today" as const);
}
