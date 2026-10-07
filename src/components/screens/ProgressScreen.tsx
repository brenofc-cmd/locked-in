"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadDays } from "@/app/(app)/progress-actions";
import { loadGoalProgress } from "@/app/(app)/proof-actions";
import { summaryParts, topGoals, type ProofSummary } from "@/lib/goal-proof";
import { useSession } from "@/components/session";
import { DuelHistory } from "@/components/duel/Duel";
import { MonthSummary } from "@/components/monthly/Monthly";
import {
  MilestonesSection,
  RecordsSection,
} from "@/components/monthly/Records";
import { useApp } from "@/components/app-state";
import { useResumeValue } from "@/components/resume/use-resume";
import { cx } from "@/components/ui";
import { DAYS, DAY_LETTERS, addDays, dayLabel } from "@/lib/local-date";
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
import { rememberProgress } from "@/lib/resume-state";

const RANGES: { k: Range; short: string; long: string }[] = (
  ["7", "30", "90", "Y"] as const
).map((k) => ({ k, ...t.progressScreen.ranges[k] }));

const sectionLabel =
  "m-0 font-mono text-meta font-normal tracking-eyebrow text-dim";

function barColor(b: Bar, standard: number, range: Range) {
  if (b.pct === null) return "bg-white/6";
  if (b.pct < standard)
    return "bg-[color-mix(in_oklab,var(--color-danger)_55%,var(--color-chip))]";
  if (b.pct === 100 || (b.current && range !== "7")) return "bg-accent";
  return "bg-off";
}

/** Bar height: 40–100 % fills the chart (the design's scale); low values stay visible. */
const barHeight = (pct: number | null) =>
  pct === null ? 2 : Math.max(4, ((pct - 40) / 60) * 82);

export function ProgressScreen() {
  const app = useApp();
  const { me } = useSession();
  // V2 Resume State: the last range chosen on this device (UI only).
  const [picked, setPicked] = useState<Range | null>(null);
  const stored = useResumeValue(
    me.id,
    (s) => s.progress?.range,
  ) as Range | null;
  const range: Range = picked ?? stored ?? "7";
  const setRange = (r: Range) => {
    setPicked(r);
    rememberProgress(me.id, { range: r });
  };
  const [insights, setInsights] = useState(false);
  const today = app.today;
  const days = app.progressDays;

  if (!app.hasHistory) {
    return (
      <div className="flex max-w-[420px] flex-col gap-5 pt-10 animate-[li-fade-up_.4s_ease]">
        <h1 className="font-mono text-meta font-normal tracking-eyebrow text-dim">
          {t.progressScreen.title}
        </h1>
        <p className="text-heading leading-[1.3] font-medium tracking-display text-pretty">
          {t.progressScreen.empty}
        </p>
        <Link
          href="/today"
          className="flex h-[52px] items-center self-start rounded-2xl bg-accent px-6 font-mono text-small font-semibold tracking-eyebrow text-bg"
        >
          {t.progressScreen.goToday}
        </Link>
      </div>
    );
  }

  const tot = totals(days, rangeFrom(range, today), today);
  const bars = chartBars(days, range, today);
  const showValues = bars.length <= 13;
  const rangeLong = RANGES.find((r) => r.k === range)?.long ?? "";
  const weeks = weeksWithData(completedWeeks(app.progress.weeks)).slice(0, 4);
  const habits = rankHabits(app.progress.habits);
  const lines = insightLines(
    app.progress.habits,
    days.filter((d) => d.day >= addDays(today, -30) && d.day < today),
    t.progressScreen.insightsPeriod,
  );

  return (
    <div className="flex flex-col gap-8 animate-[li-fade-up_.4s_ease] desk:gap-12">
      <header className="flex items-center justify-between gap-3">
        <h1 className="page-title">{t.progressScreen.title}</h1>
        <div
          role="radiogroup"
          aria-label={t.progressScreen.rangeAria}
          className="flex gap-0.5 rounded-xl border border-line p-1"
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
                "h-9 rounded-lg px-3 font-mono text-meta tracking-meta",
                range === r.k ? "bg-selected text-text" : "text-dim",
              )}
            >
              <span className="desk:hidden">{r.short}</span>
              <span className="hidden desk:inline">{r.long}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Results first (docs/NAVIGATION.md): VISÃO GERAL → METAS → DUELOS
          (month, last 7) → RECORDES / MARCOS → HISTÓRICO. The overview fits
          the first viewport. */}
      <section
        aria-labelledby="progress-overview"
        className="flex flex-col gap-6"
      >
        <h2 id="progress-overview" className={sectionLabel}>
          {t.progressScreen.overview}
        </h2>
        <div className="flex flex-col gap-2.5">
          <span
            data-testid="progress-pct"
            className="text-num-xl leading-[.82] font-medium tracking-number tabular-nums desk:text-num-3xl wide:text-num-hero"
          >
            {tot.pct ?? "—"}
            {tot.pct !== null && (
              <span className="text-heading text-dim desk:text-display">%</span>
            )}
          </span>
          <span className="font-mono text-meta tracking-eyebrow text-dim">
            {t.progressScreen.completionRate(rangeLong)}
            <span className="sr-only">
              {t.progressScreen.srTasks(tot.completed, tot.planned)}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => app.openSheet({ kind: "streak" })}
            className="flex flex-col gap-2 border-t border-line-strong pt-3.5 text-left"
          >
            <span
              data-testid="progress-streak"
              className="text-number leading-none font-medium tracking-display desk:text-display"
            >
              {app.streak}{" "}
              <span className="text-small tracking-normal text-muted">
                {t.progressScreen.days(app.streak)}
              </span>
            </span>
            <span className="font-mono text-meta tracking-eyebrow text-dim">
              {t.progressScreen.streak}
            </span>
          </button>
          <Stat
            value={focusLabel(tot.focusSeconds)}
            label={t.progressScreen.focus}
            testId="progress-focus"
          />
          <Stat
            value={String(tot.perfectDays)}
            label={t.progressScreen.perfectDays}
            testId="progress-perfect"
          />
        </div>
      </section>

      <GoalProgress range={range} />
      <MonthSummary />
      <DuelHistory />
      <RecordsSection />
      <MilestonesSection />

      <h2 className={cx(sectionLabel, "-mb-2 border-t border-line pt-6")}>
        {t.progressScreen.history}
      </h2>

      <section
        aria-label={t.progressScreen.chartAria}
        className="flex flex-col gap-3"
      >
        <h3 className="m-0 font-mono text-meta font-normal tracking-eyebrow text-muted">
          {range === "7"
            ? t.progressScreen.last7
            : t.progressScreen.completion(rangeLong)}
        </h3>
        <div
          role="list"
          className={cx(
            "flex h-[170px] items-end border-b border-line",
            bars.length > 20 ? "gap-1" : "gap-1.5 desk:gap-2",
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
                    "text-center text-small font-medium tabular-nums",
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
                  "rounded-t-sm transition-[height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
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
            bars.length > 20 ? "gap-1" : "gap-1.5 desk:gap-2",
          )}
        >
          {bars.map((b) => (
            <span
              key={b.key}
              className={cx(
                "min-w-0 flex-1 text-center font-mono text-meta whitespace-nowrap",
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
                  <span className="hidden desk:inline">
                    {dayLabel(b.label as (typeof DAYS)[number])}
                  </span>
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
        <section
          aria-label={t.progressScreen.weeklyAria}
          className="flex flex-col"
        >
          <h3 className="m-0 border-b border-line-strong pb-2 font-mono text-meta font-normal tracking-eyebrow text-muted">
            {t.progressScreen.weekly}
          </h3>
          {weeks.map((w) => (
            <button
              key={w.weekStart}
              type="button"
              onClick={() =>
                app.openOverlay({ kind: "weekly", weekStart: w.weekStart })
              }
              className="grid min-h-[50px] grid-cols-[80px_1fr_auto] items-center gap-2.5 border-b border-line p-0 text-left text-body"
            >
              <span className="font-mono text-meta text-muted">
                {t.progressScreen.week(w.week)}
              </span>
              <span className="tabular-nums">
                {t.progressScreen.you} {w.me === null ? "—" : `${w.me}%`}
                {app.hasPartner &&
                  ` · ${app.partner.name} ${w.partner === null ? "—" : `${w.partner}%`}`}
              </span>
              <span aria-hidden="true" className="text-ghost">
                ›
              </span>
            </button>
          ))}
          {weeks.length === 0 && (
            <span className="py-3.5 text-small text-dim">
              {t.progressScreen.firstReview}
            </span>
          )}
        </section>
      </div>

      <button
        type="button"
        onClick={() => setInsights((v) => !v)}
        aria-expanded={insights}
        className="flex h-[52px] items-center justify-between border-y border-line text-body"
      >
        <span>
          {insights
            ? t.progressScreen.hideInsights
            : t.progressScreen.showInsights}
        </span>
        <span
          aria-hidden="true"
          className="text-dim transition-transform duration-200"
          style={{ transform: insights ? "rotate(90deg)" : "none" }}
        >
          ›
        </span>
      </button>
      {insights && (
        <div className="flex flex-col gap-8 animate-[li-fade-up_.3s_ease]">
          <div className="flex flex-col gap-2.5">
            {lines.map((i) => (
              <span
                key={i}
                className="border-l-2 border-line-strong pl-3.5 text-body leading-[1.5]"
              >
                {i}
              </span>
            ))}
            {lines.length === 0 && (
              <span className="text-body leading-[1.5] text-dim">
                {t.progressScreen.notEnough}
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <div className="flex justify-between gap-3 border-b border-line-strong pb-2">
              <span className="font-mono text-meta tracking-eyebrow text-muted">
                {t.progressScreen.consistency}
              </span>
              <span className="font-mono text-meta text-dim">
                {t.progressScreen.longestStreak(app.longestStreak)}
              </span>
            </div>
            {habits.map((h) => (
              <div
                key={h.routineId}
                className="grid min-h-[46px] grid-cols-[minmax(0,1fr)_90px_44px] items-center gap-3 border-b border-line"
              >
                <span className="truncate text-body">
                  {h.title}
                  <span className="sr-only">
                    {t.progressScreen.srOf(h.completed, h.planned)}
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
                    "text-right text-body tabular-nums",
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

/**
 * V2 Phase 5 — PROGRESSO DAS METAS: up to three goals with proof in the chosen
 * range (actions and focus, never a score), read in one call per range.
 */
function GoalProgress({ range }: { range: Range }) {
  const app = useApp();
  const [loaded, setLoaded] = useState<{
    range: Range;
    summaries: Record<string, ProofSummary>;
  } | null>(null);
  const hasGoals = app.goals.length > 0;
  useEffect(() => {
    if (!hasGoals) return;
    let live = true;
    void loadGoalProgress(range)
      .catch(() => null)
      .then((res) => {
        if (live && res?.ok) setLoaded({ range, summaries: res.summaries });
      });
    return () => {
      live = false;
    };
  }, [range, hasGoals]);
  if (!hasGoals) return null;
  const current = loaded?.range === range ? loaded.summaries : null;
  const top = current
    ? topGoals(app.goals, new Map(Object.entries(current)))
    : [];
  return (
    <section
      aria-labelledby="goal-progress"
      data-testid="goal-progress"
      className="flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-line-strong pb-2">
        <h2
          id="goal-progress"
          className="m-0 font-mono text-meta font-normal tracking-eyebrow text-muted"
        >
          {t.proof.progressTitle} · {t.progressScreen.ranges[range].long}
        </h2>
        <Link
          href="/goals"
          className="flex h-9 items-center font-mono text-meta tracking-eyebrow text-dim hover:text-text"
        >
          {t.proof.seeGoals}
        </Link>
      </div>
      {current && top.length === 0 && (
        <p className="m-0 py-3.5 text-small text-dim">
          {t.proof.progressEmpty}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {top.map(({ goal, summary }) => (
          <li key={goal.id} className="border-b border-line">
            <Link
              href={`/goals/${goal.id}`}
              className="flex min-h-[56px] flex-col justify-center gap-0.5 py-2"
            >
              <span className="truncate text-body">{goal.title}</span>
              <span className="font-mono text-meta tracking-meta text-dim tabular-nums">
                {summaryParts(summary).join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
    <div className="flex flex-col gap-2 border-t border-line-strong pt-3.5">
      <span
        data-testid={testId}
        className="text-number leading-none font-medium tracking-display desk:text-display"
      >
        {value}
      </span>
      <span className="font-mono text-meta tracking-eyebrow text-dim">
        {label}
      </span>
    </div>
  );
}

const STATE_LABEL = t.progressScreen.states;

/**
 * History calendar: the current month from the loaded series; earlier months
 * (back to the account's first month) are read on demand. Read-only.
 */
function Calendar({ onOpen }: { onOpen: (date: string) => void }) {
  const app = useApp();
  const { me } = useSession();
  const current = app.today.slice(0, 7);
  const [extra, setExtra] = useState<Record<string, DayStat>>({});
  const loadedFrom = app.progressDays[0]?.day ?? app.today;
  const firstMonth = [
    me.createdAt.slice(0, 7),
    loadedFrom.slice(0, 7),
  ].sort()[0];
  // V2 Resume State: an earlier month left open on this device is reopened
  // (only the month; its days are always read from the database).
  const [picked, setPicked] = useState<string | null>(null);
  const stored = useResumeValue(me.id, (s) => s.progress?.month);
  const wanted = picked ?? stored ?? current;
  const month =
    wanted < firstMonth ? firstMonth : wanted > current ? current : wanted;
  const setMonth = (change: (m: string) => string) => {
    const next = change(month);
    setPicked(next);
    // The current month is the default: nothing to remember.
    rememberProgress(me.id, { month: next < current ? next : undefined });
  };

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
        <h3 className="m-0 font-mono text-meta font-normal tracking-eyebrow text-muted">
          {label}
        </h3>
        <div className="flex items-center gap-1">
          <span className="hidden text-small text-dim min-[400px]:inline">
            {t.progressScreen.tapDay}
          </span>
          <button
            type="button"
            aria-label={t.progressScreen.prevMonth}
            disabled={month <= firstMonth}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="size-11 rounded-xl text-base text-text disabled:text-off"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={t.progressScreen.nextMonth}
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
            className="pb-1 text-center font-mono text-meta text-dim"
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
                  ? t.progressScreen.todayState(
                      STATE_LABEL[shown === "today" ? "today" : shown],
                    )
                  : STATE_LABEL[c.state]
              }${c.pct !== null && closed ? `, ${c.pct}%` : ""}`}
              className={cx(
                "flex h-[46px] flex-col items-center justify-center gap-1 rounded-xl p-0 text-small tabular-nums disabled:cursor-default",
                c.state === "today"
                  ? "border border-line-bold"
                  : "border border-transparent",
                c.state === "future" ? "text-ghost" : "text-text",
              )}
            >
              <span>{c.dayNumber}</span>
              <span
                aria-hidden="true"
                className={cx(
                  "size-1.5 rounded-full",
                  (shown === "met" || shown === "perfect") && "bg-accent",
                  shown === "perfect" &&
                    "shadow-[0_0_0_2px_var(--color-bg),0_0_0_3px_var(--color-accent)]",
                  shown === "missed" && "border-[1.5px] border-missed",
                )}
              />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-meta text-dim">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-accent"
          />
          {t.progressScreen.legendMet}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--color-bg),0_0_0_3px_var(--color-accent)]"
          />
          {t.progressScreen.legendPerfect}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full border-[1.5px] border-missed"
          />
          {t.progressScreen.legendMissed}
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
