"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { DuelCompact } from "@/components/duel/Duel";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { LockGlyph } from "@/components/icons";
import { ActivityItem } from "@/components/today/ActivityItem";
import { MorningCard } from "@/components/today/MorningCard";
import { NorthStarCard } from "@/components/today/NorthStarCard";
import { NoPartnerCard, PartnerCard } from "@/components/today/PartnerCard";
import { TaskRow } from "@/components/today/TaskRow";
import { TopThree } from "@/components/today/TopThree";
import { UpcomingCard } from "@/components/today/UpcomingCard";
import { ProgressBar, SectionHeader, cx } from "@/components/ui";
import { accountDay, dateLabel, weekdayOf } from "@/lib/local-date";
import { daypartAt, type NorthStar } from "@/lib/north-star";
import { groupBySection, nextLine, routinesOn, todayStats } from "@/lib/today";

/**
 * Today = execution (docs/NAVIGATION.md): header → morning card (first open
 * of the day) → TOP 3 → tasks, then minimal context, one line each — the
 * duel, the next event, the why — after the tasks on a phone and in the side
 * column on a wide screen. The partner is the header chip on a phone and a
 * card on desktop (no header there); without a partner the invite card shows
 * everywhere. The live feed is wide-screen only (the full feed is on DUPLA).
 */
export function TodayScreen({ northStar }: { northStar: NorthStar }) {
  const app = useApp();
  const { me } = useSession();
  // Real: today's daily_tasks. Rest = routine items not scheduled today.
  const rest = routinesOn(app.routines, weekdayOf(app.today)).off;
  const stats = todayStats(app.tasks, app.standard);
  const sections = groupBySection(app.tasks);
  const empty = app.tasks.length === 0 && app.routines.length === 0;
  const dayNumber = accountDay(me.createdAt, me.timezone, app.today);
  const feedShort = app.feed.slice(-5);

  return (
    <div className="flex flex-col animate-[li-fade-up_.4s_ease]">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 desk:gap-12 wide:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6 desk:gap-10">
          <header className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-small tracking-meta text-dim">
                  {dateLabel(app.today)}
                </span>
                <span className="font-mono text-meta tracking-eyebrow text-accent">
                  {t.todayScreen.day(dayNumber)}
                </span>
              </div>
              <h1 suppressHydrationWarning className="page-title">
                {t.todayScreen.greeting(
                  daypartAt(app.now, me.timezone),
                  app.userName.toUpperCase(),
                )}
              </h1>
            </div>
            <div className="flex items-end justify-between gap-4">
              <span
                data-testid="today-pct"
                aria-label={t.todayScreen.pctAria(stats.pct)}
                className={cx(
                  "flex items-baseline text-num-xl leading-[.82] font-medium tracking-number tabular-nums transition-colors duration-[400ms] desk:text-num-3xl wide:text-num-hero",
                  stats.perfect ? "text-accent" : "text-text",
                )}
              >
                {stats.pct}
                <span className="ml-0.5 text-heading tracking-display text-dim desk:text-display">
                  %
                </span>
              </span>
              <div className="flex flex-col items-end gap-2 pb-0.5">
                <span
                  data-testid="today-count"
                  className="text-body tabular-nums"
                >
                  {stats.done} / {stats.total}{" "}
                  <span className="text-dim">{t.todayScreen.done}</span>
                </span>
                <button
                  type="button"
                  onClick={() => app.openSheet({ kind: "streak" })}
                  className="flex h-7 items-center gap-1.5 font-mono text-meta tracking-eyebrow text-muted hover:text-text"
                >
                  <span data-testid="today-streak">{app.streak}</span>{" "}
                  {t.todayScreen.streakSuffix}
                  <span aria-hidden="true" className="text-ghost">
                    ›
                  </span>
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <ProgressBar
                pct={stats.pct}
                label={t.todayScreen.completionLabel}
                marker={app.standard}
                className="overflow-visible"
              />
              <span
                className={cx(
                  "text-small",
                  stats.standardMet ? "text-accent" : "text-muted",
                )}
              >
                {nextLine(stats)}
              </span>
            </div>
          </header>

          <MorningCard star={northStar} />

          {stats.perfect && (
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent-wash px-5 py-5 motion-safe:animate-[li-glow_1.8s_ease-in-out_1]">
              <span className="flex items-baseline gap-4">
                <span className="text-heading font-semibold tracking-display text-accent">
                  100%
                </span>
                <span className="font-mono text-small tracking-brand">
                  {t.todayScreen.standardMet}
                </span>
              </span>
            </div>
          )}

          <TopThree />

          <section
            aria-label={t.todayScreen.tasksAria}
            className="flex flex-col gap-8"
          >
            {empty && (
              <div className="flex flex-col gap-3.5 rounded-2xl border border-dashed border-line-strong p-5">
                <span className="font-mono text-meta tracking-eyebrow text-dim">
                  {t.todayScreen.noRoutine}
                </span>
                <span className="text-body leading-[1.45]">
                  {t.todayScreen.buildStandard}
                </span>
                <button
                  type="button"
                  onClick={() => app.openSheet({ kind: "add", repeat: true })}
                  className="flex h-11 items-center self-start rounded-xl border border-line-strong px-5 font-mono text-meta font-semibold tracking-eyebrow"
                >
                  {t.todayScreen.createRoutine}
                </button>
              </div>
            )}
            {sections.map((sec) => (
              <div key={sec.name} className="flex flex-col">
                <SectionHeader
                  as="h2"
                  label={sec.name}
                  right={sec.count}
                  tracking="tracking-eyebrow"
                />
                {sec.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    popping={app.pop === task.id}
                    flashing={app.flash === task.id}
                    onToggle={() => app.toggleTask(task.id)}
                    onOptions={() =>
                      app.openSheet({ kind: "options", taskId: task.id })
                    }
                  />
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() => app.openSheet({ kind: "add" })}
              className="-mt-3.5 hidden h-11 self-start rounded-xl border border-dashed border-line-strong px-4 text-body text-muted hover:border-line-bold hover:text-text desk:block"
            >
              {t.todayScreen.addTask}
            </button>
            {rest.length > 0 && (
              <span className="text-small text-dim">
                {t.todayScreen.restToday} {rest.map((r) => r.name).join(" · ")}
              </span>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-7 wide:sticky wide:top-0">
          {app.hasPartner ? (
            <div className="hidden desk:contents">
              <PartnerCard />
            </div>
          ) : (
            <NoPartnerCard />
          )}
          <div data-testid="today-context" className="flex flex-col">
            {app.hasPartner && <DuelCompact />}
            <UpcomingCard />
            <NorthStarCard star={northStar} />
            <button
              type="button"
              onClick={() => app.openOverlay({ kind: "review" })}
              className="flex min-h-[52px] items-center justify-between border-y border-line text-small text-muted hover:text-text"
            >
              <span>{t.todayScreen.reviewToday}</span>
              <span aria-hidden="true" className="text-ghost">
                ›
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => app.openSheet({ kind: "focus" })}
            className="hidden h-14 items-center justify-center gap-3 rounded-2xl bg-accent font-mono text-small font-semibold tracking-brand text-bg transition-transform duration-100 active:scale-[.97] desk:flex"
          >
            <LockGlyph />
            LOCK IN
          </button>
          {feedShort.length > 0 && (
            <div className="hidden flex-col wide:flex">
              <div className="flex items-center justify-between pb-1">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-accent animate-[li-pulse_2.4s_ease-out_infinite]"
                  />
                  <h2 className="font-mono text-meta font-normal tracking-eyebrow">
                    {t.todayScreen.live}
                  </h2>
                </span>
                <Link
                  href="/partner"
                  className="flex h-9 items-center text-small text-dim hover:text-text"
                >
                  {t.todayScreen.seeAll}
                </Link>
              </div>
              <div className="flex flex-col-reverse">
                {feedShort.map((e) => (
                  <ActivityItem key={e.id} event={e} />
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="sticky bottom-0 z-[5] -mx-5 -mb-7 flex gap-2.5 bg-[linear-gradient(to_top,var(--color-bg)_72%,transparent)] px-5 pt-5 pb-3.5 desk:hidden">
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "add" })}
          aria-label={t.todayScreen.addTaskAria}
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-line-strong bg-card text-heading font-light transition-transform duration-100 active:scale-[.92]"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "focus" })}
          className="flex h-14 flex-1 items-center justify-center gap-3 rounded-2xl bg-accent font-mono text-small font-semibold tracking-brand text-bg transition-transform duration-100 active:scale-[.97]"
        >
          <LockGlyph />
          LOCK IN
        </button>
      </div>
    </div>
  );
}
