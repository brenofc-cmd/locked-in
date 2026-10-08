"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useState } from "react";
import { DuelDetailed } from "@/components/duel/Duel";
import { MonthRow } from "@/components/monthly/Monthly";
import { useApp } from "@/components/app-state";
import { RookDuo } from "@/components/brand/Rook";
import {
  CheckinPicker,
  CommitmentHistory,
  CommitmentsSection,
  PartnerDayLine,
} from "@/components/partner/Accountability";
import { ActivityItem } from "@/components/today/ActivityItem";
import { ReactButton } from "@/components/today/Reactions";
import {
  Avatar,
  MiniCheck,
  ProgressBar,
  SectionHeader,
  StatusDot,
  cx,
} from "@/components/ui";
import { isoWeekday } from "@/lib/local-date";
import { usePartnerView } from "@/components/use-partner-view";
import {
  completedWeeks,
  focusLabel,
  headToHead,
  isoWeekNumber,
  leader,
  percent,
  weeksWithData,
} from "@/lib/progress";

/** Activity lines shown before "Ver toda a atividade". */
const FEED_PREVIEW = 6;

export function PartnerScreen() {
  const app = useApp();
  const pv = usePartnerView();
  const { partner } = app;
  const [allActivity, setAllActivity] = useState(false);

  if (!app.hasPartner) {
    return (
      <div className="flex max-w-[420px] flex-col gap-5 pt-10 animate-[li-fade-up_.4s_ease]">
        <RookDuo size={72} />
        <h1 className="font-mono text-meta font-normal tracking-eyebrow text-dim">
          {t.partnerScreen.noPartner}
        </h1>
        <p className="text-heading leading-[1.3] font-medium tracking-display text-pretty">
          {t.partnerScreen.pitch}
        </p>
        <Link
          href="/duo"
          className="flex h-[52px] items-center self-start rounded-2xl btn-primary px-6 font-mono text-small font-semibold tracking-eyebrow"
        >
          {t.partnerScreen.invite}
        </Link>
      </div>
    );
  }

  // This week: mine live, theirs from duo_weeks; completed weeks only in H2H.
  const { week } = app;
  const mePct = percent(week.me.completed, week.me.planned);
  const partnerPct = week.partner
    ? percent(week.partner.completed, week.partner.planned)
    : null;
  const lead = leader(week.me, week.partner);
  const daysLeft = 7 - isoWeekday(app.today);
  const results = completedWeeks(app.progress.weeks);
  const score = headToHead(results);
  const strip = [...results].reverse();
  const history = weeksWithData(results).slice(0, 3);
  // V3 (audit F5): before any contested week the score is a fact of nothing,
  // so the block leads with the sentence and shrinks the score and strip.
  const contested = results.some((w) => w.result !== "ineligible");
  const myInitial = app.userName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-8 animate-[li-fade-up_.4s_ease] desk:gap-12">
      {/* DUPLA (docs/NAVIGATION.md): the person and their day in one block,
          then the duel, commitments, check-in, activity, week, history. */}
      <header className="flex flex-col gap-3.5">
        <div className="flex items-center gap-4">
          <Avatar
            initial={partner.initial}
            className="relative size-[48px] text-lead transition-shadow duration-700"
            style={{
              boxShadow: pv.flashing
                ? "0 0 0 1px color-mix(in oklab,var(--color-accent) 50%,transparent),0 0 40px color-mix(in oklab,var(--color-accent) 8%,transparent)"
                : undefined,
            }}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="m-0 truncate text-heading leading-none font-semibold tracking-meta max-[384px]:text-title desk:text-display">
              {partner.name.toUpperCase()}
            </h1>
            <span className="flex items-center gap-2 text-small text-muted">
              <StatusDot live={pv.live} pulse={pv.pulse} />
              {/* Two lines before an ellipsis: "Visto por último ontem às
                  15:13" must stay readable at 320 px. */}
              <span className="line-clamp-2" data-testid="partner-status">
                {pv.statusLine}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span
              data-testid="partner-pct"
              className="text-number leading-none font-medium tracking-number tabular-nums desk:text-num-l"
            >
              <span className="sr-only">{t.partnerScreen.today} </span>
              {pv.pct}
              <span className="text-lead text-dim desk:text-title">%</span>
            </span>
            <span className="text-small text-muted tabular-nums">
              {t.partnerScreen.doneCount(pv.done, pv.total)}
            </span>
          </span>
        </div>
        <ProgressBar
          pct={pv.pct}
          label={t.partnerScreen.completionLabel(partner.name)}
          tone="text"
          className="overflow-hidden"
        />
        <PartnerDayLine />
      </header>

      <DuelDetailed />
      <MonthRow />
      <CommitmentsSection />
      <CheckinPicker />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-8 desk:gap-12">
        <section
          aria-label={t.partnerScreen.partnerTodayAria(partner.name)}
          className="flex flex-col"
        >
          <SectionHeader
            as="h2"
            label={t.partnerScreen.partnerToday(partner.name.toUpperCase())}
            right={`${pv.done} / ${pv.total}`}
          />
          {app.partnerTasks.map((x) => (
            <div
              key={x.id}
              className="flex min-h-[52px] items-center gap-3.5 border-b border-line py-1"
            >
              <MiniCheck done={x.done} light />
              <span
                className={cx(
                  "flex-1 text-body",
                  x.done ? "text-muted" : "text-text",
                )}
              >
                {x.name}
                <span className="sr-only">
                  {x.done ? t.partnerScreen.srDone : t.partnerScreen.srNotDone}
                </span>
              </span>
              <span className="font-mono text-meta text-dim">{x.at ?? ""}</span>
              {x.done &&
                (() => {
                  const eventId = app.eventForTask(x.id);
                  return eventId ? (
                    <ReactButton
                      eventId={eventId}
                      title={t.partnerScreen.reactTitle(partner.name, x.name)}
                      name={x.name}
                    />
                  ) : null;
                })()}
            </div>
          ))}
          {app.partnerTasks.length === 0 && pv.total === 0 && (
            <span className="py-3.5 text-small text-dim">
              {t.partnerScreen.nothingScheduled}
            </span>
          )}
          {pv.total > app.partnerTasks.length && (
            <span className="py-3.5 text-small text-dim">
              {t.partnerScreen.privateCount(pv.total - app.partnerTasks.length)}
            </span>
          )}
        </section>
        <section
          aria-label={t.partnerScreen.activityAria}
          className="flex flex-col"
        >
          <div className="flex items-center gap-2 border-b border-line-strong pb-2">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-accent animate-[li-pulse_2.4s_ease-out_infinite]"
            />
            <h2 className="font-mono text-meta font-normal tracking-eyebrow">
              {t.partnerScreen.activity}
            </h2>
          </div>
          {/* Newest first; the latest few by default, the rest (up to 20) on tap. */}
          <div className="flex flex-col-reverse">
            {(allActivity ? app.feed : app.feed.slice(-FEED_PREVIEW)).map(
              (e) => (
                <ActivityItem key={e.id} event={e} />
              ),
            )}
          </div>
          {app.feed.length > FEED_PREVIEW && (
            <button
              type="button"
              aria-expanded={allActivity}
              onClick={() => setAllActivity((v) => !v)}
              className="flex min-h-11 items-center border-t border-line text-left text-small text-muted underline-offset-[3px] hover:text-text hover:underline"
            >
              {allActivity
                ? t.partnerScreen.activityLess
                : t.partnerScreen.activityAll(app.feed.length)}
            </button>
          )}
        </section>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-8 desk:gap-12">
        <section
          aria-label={t.partnerScreen.thisWeekAria}
          className="flex flex-col gap-5"
        >
          <SectionHeader
            as="h2"
            label={t.partnerScreen.thisWeek(isoWeekNumber(week.start))}
            right={
              daysLeft === 0
                ? t.partnerScreen.lastDay
                : t.partnerScreen.daysLeft(daysLeft)
            }
          />
          <div className="flex flex-col gap-3.5">
            <WeekBar
              who={t.partnerScreen.you}
              value={mePct}
              me
              testId="week-me"
            />
            <WeekBar
              who={partner.name.toUpperCase()}
              value={partnerPct}
              testId="week-partner"
            />
          </div>
          <div
            data-testid="week-leader"
            className="flex items-center justify-between gap-3"
          >
            <span className="font-mono text-small tracking-eyebrow">
              {lead.who === "me"
                ? t.partnerScreen.youAhead
                : lead.who === "partner"
                  ? t.partnerScreen.partnerAhead(partner.name.toUpperCase())
                  : lead.who === "tied"
                    ? t.partnerScreen.tied
                    : t.partnerScreen.noScore}
            </span>
            {lead.margin && (
              <span
                className={cx(
                  "text-title font-medium",
                  lead.who === "me" ? "text-accent" : "text-muted",
                )}
              >
                {lead.margin}
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <CompareRow
              label={t.partnerScreen.focus}
              me={focusLabel(week.me.focusSeconds)}
              them={week.partner ? focusLabel(week.partner.focus) : "—"}
            />
            <CompareRow
              label={t.partnerScreen.streak}
              me={t.partnerScreen.days(app.streak)}
              them={
                partner.streak === null
                  ? "—"
                  : t.partnerScreen.days(partner.streak)
              }
            />
          </div>
          {/* The rule is one tap away, like the duel's (less text on DUPLA). */}
          <details className="group border-t border-line">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between font-mono text-meta tracking-eyebrow text-dim hover:text-text [&::-webkit-details-marker]:hidden">
              {t.duel.rulesTitle}
              <span
                aria-hidden="true"
                className="text-ghost transition-transform group-open:rotate-90"
              >
                ›
              </span>
            </summary>
            <p className="m-0 pb-1 text-small leading-[1.5] text-muted">
              {t.partnerScreen.rule}
            </p>
          </details>
          <button
            type="button"
            onClick={() =>
              app.openOverlay({ kind: "weekly", weekStart: week.start })
            }
            className="h-11 self-start text-small text-muted underline underline-offset-[3px]"
          >
            {t.partnerScreen.reviewWeek}
          </button>
        </section>

        <section
          aria-label={t.partnerScreen.headToHeadAria}
          className="flex flex-col gap-5"
        >
          <SectionHeader
            as="h2"
            label={t.partnerScreen.headToHead}
            right={t.partnerScreen.lastWeeks(results.length)}
          />
          {!contested && history.length === 0 && (
            <p className="m-0 text-small leading-[1.5] text-muted">
              {t.partnerScreen.firstResult}
            </p>
          )}
          <div className="flex items-end justify-between gap-3">
            <span
              data-testid="h2h-score"
              className={cx(
                "leading-[.85] font-medium tracking-number tabular-nums",
                contested
                  ? "text-num-xl desk:text-num-2xl"
                  : "text-number text-dim",
              )}
            >
              {score.me}
              <span className="px-2.5 text-ghost">—</span>
              <span className="text-dim">{score.partner}</span>
            </span>
            <span className="text-right font-mono text-meta leading-[1.8] tracking-eyebrow text-dim">
              {t.partnerScreen.youVs(partner.name.toUpperCase())}
              {score.draws > 0 && (
                <span data-testid="h2h-draws" className="block">
                  {t.partnerScreen.draws(score.draws)}
                </span>
              )}
            </span>
          </div>
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${Math.max(strip.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            {strip.map((w) => (
              <div
                key={w.weekStart}
                className="flex flex-col items-center gap-1.5"
              >
                {/* A labelled graphic (role=img): a bare div may not carry
                    aria-label, and the empty strip has no text inside. */}
                <div
                  role="img"
                  aria-label={t.partnerScreen.weekAria(
                    w.week,
                    w.result === "me"
                      ? t.partnerScreen.youWon
                      : w.result === "partner"
                        ? t.partnerScreen.partnerWon(partner.name)
                        : w.result === "draw"
                          ? t.partnerScreen.draw
                          : t.partnerScreen.noContest,
                  )}
                  className={cx(
                    "flex w-full items-center justify-center font-mono text-meta font-semibold",
                    contested ? "h-[30px] rounded-lg" : "h-1.5 rounded-xs",
                    w.result === "me"
                      ? "bg-accent text-bg"
                      : w.result === "partner"
                        ? "bg-off text-muted"
                        : "border border-line text-dim",
                  )}
                >
                  {!contested
                    ? null
                    : w.result === "me"
                      ? myInitial
                      : w.result === "partner"
                        ? partner.initial
                        : w.result === "draw"
                          ? "="
                          : "·"}
                </div>
                {contested && (
                  <span className="font-mono text-meta text-dim">
                    {t.partnerScreen.weekShort(w.week)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-col">
            {history.map((w) => (
              <button
                key={w.weekStart}
                type="button"
                onClick={() =>
                  app.openOverlay({ kind: "weekly", weekStart: w.weekStart })
                }
                className="grid min-h-12 grid-cols-[80px_1fr_auto] items-center gap-2.5 border-t border-line p-0 text-left text-body"
              >
                <span className="font-mono text-meta text-muted">
                  {t.partnerScreen.weekLabel(w.week)}
                </span>
                <span className="tabular-nums">
                  {t.partnerScreen.youShort} {w.me === null ? "—" : `${w.me}%`}{" "}
                  · {partner.name} {w.partner === null ? "—" : `${w.partner}%`}
                </span>
                <span aria-hidden="true" className="text-ghost">
                  ›
                </span>
              </button>
            ))}
            {history.length === 0 && contested && (
              <span className="border-t border-line py-3.5 text-small text-dim">
                {t.partnerScreen.firstResult}
              </span>
            )}
          </div>
        </section>
      </div>

      <CommitmentHistory />
    </div>
  );
}

function WeekBar({
  who,
  value,
  me = false,
  testId,
}: {
  who: string;
  value: number | null;
  me?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span
          className={cx(
            "text-small font-semibold tracking-eyebrow",
            !me && "text-muted",
          )}
        >
          {who}
        </span>
        <span
          className={cx(
            "text-number leading-none font-medium tracking-number tabular-nums",
            !me && "text-muted",
          )}
        >
          <span data-testid={testId}>{value === null ? "—" : `${value}%`}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-sm bg-white/6">
        <div
          className={cx("h-full rounded-sm", me ? "bg-accent" : "bg-ghost")}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function CompareRow({
  label,
  me,
  them,
}: {
  label: string;
  me: string;
  them: string;
}) {
  return (
    <div className="grid min-h-11 grid-cols-3 items-center border-t border-line text-body tabular-nums">
      <span className="font-mono text-meta tracking-eyebrow text-dim">
        {label}
      </span>
      <span className="text-right">{me}</span>
      <span className="text-right text-dim">{them}</span>
    </div>
  );
}
