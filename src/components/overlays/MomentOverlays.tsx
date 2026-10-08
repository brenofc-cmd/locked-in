"use client";

import { t } from "@/i18n/pt-BR";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { loadWeekHabits } from "@/app/(app)/progress-actions";
import { loadDayReview, loadWeekReview } from "@/app/(app)/reflection-actions";
import {
  FactRows,
  ReflectionForm,
  ReflectionView,
} from "@/components/reviews/Reflection";
import { useApp } from "@/components/app-state";
import { Rook } from "@/components/brand/Rook";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { accountDay, addDays, weekdayName } from "@/lib/local-date";
import { usePartnerView } from "@/components/use-partner-view";
import {
  completedWeeks,
  focusLabel,
  habitExtremes,
  headToHead,
  reviewWeeks,
  weekRangeLabel,
  weekStartOf,
  type Habit,
} from "@/lib/progress";
import { todayStats } from "@/lib/today";
import {
  ratio,
  weekFactLines,
  type Reflection,
  type ReviewFacts,
} from "@/lib/reviews";
import type { Priority } from "@/lib/weekly-plan";

/** Review day and weekly review (full-screen moments). The morning briefing
 *  is an inline card on Today since V2 Phase 4 (MorningCard). */
export function MomentOverlays() {
  const { overlay } = useApp();
  if (!overlay) return null;
  if (overlay.kind === "review") return <ReviewDay />;
  if (overlay.kind === "weekly")
    return <WeeklyReview start={overlay.weekStart} />;
  return null;
}

function Frame({
  label,
  width,
  children,
}: {
  label: string;
  width: string;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="absolute inset-0 z-[60] overflow-y-auto bg-overlay animate-[li-fade-in_.5s_ease]"
    >
      <div
        className={cx(
          "mx-auto flex min-h-full flex-col justify-between gap-9 px-6 pt-12 pb-8 desk:px-8 desk:py-16",
          width,
        )}
      >
        {children}
      </div>
    </div>
  );
}

const bigTitle =
  "m-0 text-num-l leading-none num max-[384px]:text-display desk:text-num-xl";
const lightButton =
  "h-[60px] w-full rounded-2xl bg-text font-mono text-small font-semibold tracking-brand text-bg transition-transform duration-100 active:scale-[.97]";

function ReviewDay() {
  const app = useApp();
  const { me } = useSession();
  const list = app.tasks;
  const stats = todayStats(list, app.standard);
  const pv = usePartnerView();
  const notDone = list.filter((x) => !x.done && !x.skip).map((x) => x.name);
  const doneNames = list.filter((x) => x.done).map((x) => x.name);
  const skipped = list.filter((x) => x.skip).map((x) => x.name);
  const diff = pv.pct - stats.pct;
  // V2 Phase 9: today's non-negotiables, live from my own state.
  const flagged = list.filter((x) => app.taskFlags[x.id]);
  const nn = ratio(flagged.filter((x) => x.done).length, flagged.length);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  useEffect(() => {
    let alive = true;
    void loadDayReview(app.today)
      .catch(() => null)
      .then((res) => {
        if (alive && res?.ok) setReflection(res.reflection);
      });
    return () => {
      alive = false;
    };
  }, [app.today]);

  return (
    <Frame label={t.moments.reviewTodayAria} width="max-w-[520px]">
      <div className="flex flex-col gap-8">
        {/* Reflection first, facts second (docs/FINAL_DESIGN_RESEARCH.md):
            a short summary, the questions, then the detail. */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3.5">
            <span className="font-mono text-small tracking-eyebrow text-dim">
              {weekdayName(app.today)} ·{" "}
              {t.moments.day(accountDay(me.createdAt, me.timezone, app.today))}
            </span>
            <h1 className={bigTitle}>
              {t.moments.today}
              <br />
              {stats.perfect ? t.moments.complete : t.moments.soFar}
            </h1>
          </div>
          <Rook pose="reviewing" size={72} className="-mt-2 shrink-0" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <span
              data-testid="review-pct"
              className="text-num-l leading-none num"
            >
              {stats.pct}
              <span className="text-title text-dim">%</span>
            </span>
            <span className="flex items-baseline gap-3 tabular-nums">
              <span className="text-body">
                {stats.done} / {stats.total}{" "}
                <span className="text-dim">{t.moments.done}</span>
              </span>
              <span
                data-testid="review-focus"
                className="font-mono text-meta tracking-eyebrow text-muted"
              >
                {formatMinutes(app.focusMin).toUpperCase()}{" "}
                {t.moments.focusSuffix}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-small text-muted">
            <span
              aria-hidden="true"
              className={cx(
                "size-1.5 rounded-full",
                stats.standardMet ? "bg-accent" : "bg-ghost",
              )}
            />
            {stats.standardMet
              ? t.moments.standardMetStreak(app.streak)
              : t.moments.moreToMeet(stats.needed)}
          </div>
        </div>
        {reflection && (
          <ReflectionForm
            kind="day"
            periodStart={app.today}
            initial={reflection}
          />
        )}
        <div className="flex flex-col gap-5 border-t border-line pt-5">
          <span className="eyebrow text-dim">{t.moments.facts}</span>
          {app.hasPartner && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-small font-semibold tracking-eyebrow">
                  {app.partner.name.toUpperCase()}
                </span>
                <span className="flex items-baseline gap-3.5 tabular-nums">
                  <span className="text-small text-muted">
                    {pv.done} / {pv.total}
                  </span>
                  <span
                    data-testid="review-partner-pct"
                    className="text-title cond font-bold"
                  >
                    {pv.pct}%
                  </span>
                </span>
              </div>
              <span className="text-small text-muted">
                {diff > 0
                  ? t.moments.partnerAheadToday(app.partner.name, diff)
                  : diff < 0
                    ? t.moments.youAheadToday(-diff)
                    : t.moments.levelToday}
              </span>
            </div>
          )}
          {(
            [
              [t.moments.doneList, doneNames],
              [t.moments.skippedList, skipped],
              [t.moments.notDoneList, notDone],
            ] as const
          ).map(([k, names]) =>
            names.length > 0 ? (
              <div key={k} className="flex flex-col gap-1.5">
                <span className="font-mono text-meta tracking-eyebrow text-dim">
                  {k}
                </span>
                <span className="text-small text-muted">
                  {names.join(" · ")}
                </span>
              </div>
            ) : null,
          )}
          {list.length === 0 && (
            <span className="text-small text-muted">
              {t.moments.nothingToday}
            </span>
          )}
          {nn && (
            <FactRows
              lines={[
                { k: t.reviews.nonNegotiables, v: nn, testId: "fact-nn" },
              ]}
            />
          )}
        </div>
      </div>
      <button type="button" onClick={app.closeOverlay} className={lightButton}>
        {t.moments.doneButton}
      </button>
    </Frame>
  );
}

/**
 * Weekly review (Stage 8): the current week (CURRENT LEADER, live) and every
 * completed week (WINNER), from Stage 7 data. Raw completion decides; focus,
 * perfect days and habits are shown apart; head-to-head is the record.
 */
function WeeklyReview({ start }: { start: string }) {
  const { closeOverlay, partner, hasPartner, progress, week, today } = useApp();
  const router = useRouter();
  const weeks = reviewWeeks(progress.weeks, {
    planned: week.me.planned,
    completed: week.me.completed,
    focus: week.me.focusSeconds,
    perfect: week.me.perfectDays,
  });
  const record = headToHead(completedWeeks(progress.weeks));
  const [i, setI] = useState(() =>
    Math.max(
      0,
      weeks.findIndex((w) => w.weekStart === start),
    ),
  );
  const w = weeks[Math.min(i, Math.max(0, weeks.length - 1))];
  const [habits, setHabits] = useState<{ week: string; list: Habit[] } | null>(
    null,
  );

  const weekStart = w?.weekStart;
  // V2 Phase 9: facts, priorities and my reflection of the week shown.
  const [extra, setExtra] = useState<{
    week: string;
    facts: ReviewFacts;
    priorities: Priority[];
    reflection: Reflection;
  } | null>(null);
  useEffect(() => {
    if (!weekStart) return;
    let alive = true;
    void loadWeekReview(weekStart)
      .catch(() => null)
      .then((res) => {
        if (alive && res?.ok) setExtra({ week: weekStart, ...res });
      });
    return () => {
      alive = false;
    };
  }, [weekStart]);
  useEffect(() => {
    if (!weekStart) return;
    let alive = true;
    void loadWeekHabits(weekStart)
      .catch(() => null)
      .then((res) => {
        if (alive && res?.ok) setHabits({ week: weekStart, list: res.habits });
      });
    return () => {
      alive = false;
    };
  }, [weekStart]);

  if (!w) {
    return (
      <Frame label={t.moments.weeklyAria} width="max-w-[560px]">
        <span className="text-body text-muted">{t.moments.firstReview}</span>
        <button type="button" onClick={closeOverlay} className={lightButton}>
          {t.moments.close}
        </button>
      </Frame>
    );
  }

  const me = w.me;
  const them = hasPartner ? w.partner : null;
  const diff = Math.abs((w.mePct ?? 0) - (w.partnerPct ?? 0));
  const margin = diff === 0 ? "<1" : String(diff);
  const verdict = w.current
    ? w.leader?.who === "me"
      ? t.moments.leaderYou(w.leader.margin)
      : w.leader?.who === "partner"
        ? t.moments.leaderPartner(partner.name.toUpperCase(), w.leader.margin)
        : w.leader?.who === "tied"
          ? t.moments.leaderTied
          : t.moments.noScore
    : w.result === "me"
      ? t.moments.winnerYou(margin)
      : w.result === "partner"
        ? t.moments.winnerPartner(partner.name.toUpperCase(), margin)
        : w.result === "draw"
          ? t.moments.draw
          : t.moments.noContest;
  const partnerAhead = w.current
    ? w.leader?.who === "partner"
    : w.result === "partner";
  const pair = (a: string, b: string) => (them ? `${a} · ${b}` : a);
  const shown = extra?.week === w.weekStart ? extra : null;
  // The current and the last closed week take a reflection; older ones are read.
  const editable = w.current || w.weekStart === addDays(weekStartOf(today), -7);
  const { best, missed } = habitExtremes(
    habits?.week === w.weekStart ? habits.list : [],
  );
  const rows = [
    {
      k: t.moments.tasksCompleted,
      v: pair(
        `${me.completed} / ${me.planned}`,
        them ? `${them.completed} / ${them.planned}` : "",
      ),
    },
    {
      k: t.moments.focus,
      v: pair(focusLabel(me.focus), them ? focusLabel(them.focus) : ""),
    },
    {
      k: t.moments.perfectDays,
      v: pair(String(me.perfect), them ? String(them.perfect) : ""),
    },
    ...(shown ? weekFactLines(shown.facts, shown.priorities) : []),
    ...(best
      ? [{ k: t.moments.bestHabit, v: `${best.title} ${best.rate}%` }]
      : []),
    ...(missed
      ? [{ k: t.moments.mostMissed, v: `${missed.title} ${missed.rate}%` }]
      : []),
    ...(hasPartner
      ? [
          {
            k: t.moments.headToHead,
            v: `${record.me} — ${record.partner}${record.draws ? ` · ${t.moments.draws(record.draws)}` : ""}`,
          },
        ]
      : []),
  ];

  return (
    <Frame label={t.moments.weekReviewAria(w.week)} width="max-w-[560px]">
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <span className="flex flex-col gap-1.5">
            <span
              data-testid="weekly-title"
              className="font-mono text-small tracking-eyebrow text-accent"
            >
              {t.moments.weekTitle(w.week, w.current)}
            </span>
            <span className="font-mono text-meta tracking-eyebrow text-dim">
              {weekRangeLabel(w.weekStart)}
            </span>
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label={t.moments.olderWeek}
              disabled={i >= weeks.length - 1}
              onClick={() => setI((x) => Math.min(weeks.length - 1, x + 1))}
              className="size-11 rounded-xl border border-line-strong text-base text-text disabled:text-off"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label={t.moments.newerWeek}
              disabled={i <= 0}
              onClick={() => setI((x) => Math.max(0, x - 1))}
              className="size-11 rounded-xl border border-line-strong text-base text-text disabled:text-off"
            >
              ›
            </button>
          </div>
        </div>
        <div className="flex flex-col">
          <div
            className={cx(
              "flex items-end justify-between pb-1.5",
              partnerAhead ? "text-dim" : "text-text",
            )}
          >
            <span className="text-small font-semibold tracking-eyebrow">
              {t.moments.you}
            </span>
            <span
              data-testid="weekly-me"
              className="text-num-xl leading-[.8] num desk:text-num-3xl"
            >
              {w.mePct === null ? "—" : `${w.mePct}%`}
            </span>
          </div>
          {them && (
            <>
              <div className="flex items-center gap-3.5 py-3.5">
                <span className="h-px flex-1 bg-white/8" />
                <span
                  data-testid="weekly-verdict"
                  className="text-center font-mono text-meta tracking-eyebrow text-muted"
                >
                  {verdict}
                </span>
                <span className="h-px flex-1 bg-white/8" />
              </div>
              <div
                className={cx(
                  "flex items-end justify-between gap-3",
                  partnerAhead || w.result === "draw"
                    ? "text-text"
                    : "text-dim",
                )}
              >
                <span className="text-small font-semibold tracking-eyebrow">
                  {partner.name.toUpperCase()}
                </span>
                <span
                  data-testid="weekly-partner"
                  className="text-num-xl leading-[.8] num desk:text-num-3xl"
                >
                  {w.partnerPct === null ? "—" : `${w.partnerPct}%`}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col">
          {rows.map((r) => (
            <div
              key={r.k}
              data-testid={"testId" in r ? r.testId : undefined}
              className="flex items-baseline justify-between gap-3 border-t border-line py-3.5"
            >
              <span className="font-mono text-meta tracking-eyebrow text-dim">
                {r.k}
              </span>
              <span className="text-right text-body">{r.v}</span>
            </div>
          ))}
        </div>
        {shown &&
          (editable ? (
            <ReflectionForm
              key={shown.week}
              kind="week"
              periodStart={shown.week}
              initial={shown.reflection}
            />
          ) : (
            <ReflectionView kind="week" reflection={shown.reflection} />
          ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          data-testid="plan-next-week"
          onClick={() => {
            closeOverlay();
            router.push("/plan/week?w=next");
          }}
          className="h-[52px] w-full rounded-2xl border border-line-strong font-mono text-small tracking-brand text-text"
        >
          {t.reviews.planNext}
        </button>
        <button
          type="button"
          onClick={closeOverlay}
          className={cx(lightButton, "h-[58px] text-small tracking-brand")}
        >
          {t.moments.close}
        </button>
      </div>
    </Frame>
  );
}
