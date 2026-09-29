"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useApp } from "@/components/app-state";
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

export function PartnerScreen() {
  const app = useApp();
  const pv = usePartnerView();
  const { partner } = app;

  if (!app.hasPartner) {
    return (
      <div className="flex max-w-[420px] flex-col gap-5 pt-10 animate-[li-fade-up_.4s_ease]">
        <h1 className="font-mono text-[11px] font-normal tracking-[.16em] text-dim">
          {t.partnerScreen.noPartner}
        </h1>
        <p className="text-[26px] leading-[1.3] font-medium tracking-[-0.02em] text-pretty">
          {t.partnerScreen.pitch}
        </p>
        <Link
          href="/duo"
          className="flex h-[52px] items-center self-start rounded-[14px] bg-accent px-[22px] font-mono text-xs font-semibold tracking-[.22em] text-bg"
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
  const myInitial = app.userName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-8 animate-[li-fade-up_.4s_ease] desk:gap-12">
      <header className="flex items-center gap-4">
        <Avatar
          initial={partner.initial}
          className="relative size-[52px] text-[19px] transition-shadow duration-700"
          style={{
            boxShadow: pv.flashing
              ? "0 0 0 1px color-mix(in oklab,var(--color-accent) 50%,transparent),0 0 40px color-mix(in oklab,var(--color-accent) 8%,transparent)"
              : undefined,
          }}
        />
        <span className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 text-[25px] leading-none font-semibold tracking-[.02em] max-[384px]:text-[23px] desk:text-[38px]">
            {partner.name.toUpperCase()}
          </h1>
          <span className="flex items-center gap-2 text-[13.5px] text-muted">
            <StatusDot live={pv.live} pulse={pv.pulse} />
            <span className="truncate" data-testid="partner-status">
              {pv.statusLine}
            </span>
          </span>
        </span>
      </header>

      <div className="flex flex-col gap-3">
        <span className="font-mono text-[11px] tracking-[.16em] text-dim">
          {t.partnerScreen.today}
        </span>
        <div className="flex items-end justify-between gap-4">
          <span className="text-[64px] leading-[.82] font-medium tracking-[-0.055em] tabular-nums desk:text-[84px] wide:text-[112px]">
            {pv.pct}
            <span className="text-[26px] text-quiet desk:text-[40px]">%</span>
          </span>
          <span className="pb-0.5 text-[15px] text-muted tabular-nums">
            {t.partnerScreen.doneCount(pv.done, pv.total)}
          </span>
        </div>
        <ProgressBar
          pct={pv.pct}
          label={t.partnerScreen.completionLabel(partner.name)}
          tone="text"
          className="overflow-hidden"
        />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8 desk:gap-12">
        <section
          aria-label={t.partnerScreen.thisWeekAria}
          className="flex flex-col gap-[18px]"
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
            <span className="font-mono text-xs tracking-[.2em]">
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
                  "text-[22px] font-medium",
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
          <span className="text-[12.5px] leading-[1.5] text-dim">
            {t.partnerScreen.rule}
          </span>
          <button
            type="button"
            onClick={() =>
              app.openOverlay({ kind: "weekly", weekStart: week.start })
            }
            className="h-11 self-start text-[13px] text-muted underline underline-offset-[3px]"
          >
            {t.partnerScreen.reviewWeek}
          </button>
        </section>

        <section
          aria-label={t.partnerScreen.headToHeadAria}
          className="flex flex-col gap-[18px]"
        >
          <SectionHeader
            as="h2"
            label={t.partnerScreen.headToHead}
            right={t.partnerScreen.lastWeeks(results.length)}
          />
          <div className="flex items-end justify-between gap-3">
            <span
              data-testid="h2h-score"
              className="text-[56px] leading-[.85] font-medium tracking-[-0.05em] tabular-nums desk:text-[72px]"
            >
              {score.me}
              <span className="px-2.5 text-off">—</span>
              <span className="text-dim">{score.partner}</span>
            </span>
            <span className="text-right font-mono text-[10.5px] leading-[1.8] tracking-[.14em] text-dim">
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
                <div
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
                    "flex h-[30px] w-full items-center justify-center rounded-md font-mono text-[10px] font-semibold",
                    w.result === "me"
                      ? "bg-accent text-bg"
                      : w.result === "partner"
                        ? "bg-[#2e2e32] text-muted"
                        : "border border-white/8 text-quiet",
                  )}
                >
                  {w.result === "me"
                    ? myInitial
                    : w.result === "partner"
                      ? partner.initial
                      : w.result === "draw"
                        ? "="
                        : "·"}
                </div>
                <span className="font-mono text-[9.5px] text-dim">
                  {t.partnerScreen.weekShort(w.week)}
                </span>
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
                className="grid min-h-12 grid-cols-[80px_1fr_auto] items-center gap-2.5 border-t border-white/5 p-0 text-left text-sm"
              >
                <span className="font-mono text-[11px] text-muted">
                  {t.partnerScreen.weekLabel(w.week)}
                </span>
                <span className="tabular-nums">
                  {t.partnerScreen.youShort} {w.me === null ? "—" : `${w.me}%`}{" "}
                  · {partner.name} {w.partner === null ? "—" : `${w.partner}%`}
                </span>
                <span aria-hidden="true" className="text-faint">
                  ›
                </span>
              </button>
            ))}
            {history.length === 0 && (
              <span className="border-t border-white/5 py-3.5 text-[13.5px] text-dim">
                {t.partnerScreen.firstResult}
              </span>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8 desk:gap-12">
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
              className="flex min-h-[52px] items-center gap-3.5 border-b border-white/5 py-1"
            >
              <MiniCheck done={x.done} light />
              <span
                className={cx(
                  "flex-1 text-[14.5px]",
                  x.done ? "text-muted" : "text-text",
                )}
              >
                {x.name}
                <span className="sr-only">
                  {x.done ? t.partnerScreen.srDone : t.partnerScreen.srNotDone}
                </span>
              </span>
              <span className="font-mono text-[11px] text-dim">
                {x.at ?? ""}
              </span>
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
            <span className="py-3.5 text-[13.5px] text-dim">
              {t.partnerScreen.nothingScheduled}
            </span>
          )}
          {pv.total > app.partnerTasks.length && (
            <span className="py-3.5 text-[13px] text-dim">
              {t.partnerScreen.privateCount(pv.total - app.partnerTasks.length)}
            </span>
          )}
        </section>
        <section
          aria-label={t.partnerScreen.activityAria}
          className="flex flex-col"
        >
          <div className="flex items-center gap-[9px] border-b border-white/9 pb-2">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-accent animate-[li-pulse_2.4s_ease-out_infinite]"
            />
            <h2 className="font-mono text-[11px] font-normal tracking-[.2em]">
              {t.partnerScreen.activity}
            </h2>
          </div>
          <div className="flex flex-col-reverse">
            {app.feed.map((e) => (
              <ActivityItem key={e.id} event={e} />
            ))}
          </div>
        </section>
      </div>
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
            "text-[13px] font-semibold tracking-[.14em]",
            !me && "text-muted",
          )}
        >
          {who}
        </span>
        <span
          className={cx(
            "text-[34px] leading-none font-medium tracking-[-0.04em] tabular-nums",
            !me && "text-muted",
          )}
        >
          <span data-testid={testId}>{value === null ? "—" : `${value}%`}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-[3px] bg-white/6">
        <div
          className={cx("h-full rounded-[3px]", me ? "bg-accent" : "bg-ghost")}
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
    <div className="grid min-h-11 grid-cols-3 items-center border-t border-white/5 text-sm tabular-nums">
      <span className="font-mono text-[10.5px] tracking-[.14em] text-dim">
        {label}
      </span>
      <span className="text-right">{me}</span>
      <span className="text-right text-dim">{them}</span>
    </div>
  );
}
