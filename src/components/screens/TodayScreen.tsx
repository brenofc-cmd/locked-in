"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DuelCompact } from "@/components/duel/Duel";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { LockGlyph } from "@/components/icons";
import { ActivityItem } from "@/components/today/ActivityItem";
import {
  MorningRitual,
  useMorningRitual,
} from "@/components/today/MorningRitual";
import { NorthStarCard } from "@/components/today/NorthStarCard";
import { NoPartnerCard, PartnerCard } from "@/components/today/PartnerCard";
import { TaskRow } from "@/components/today/TaskRow";
import { StreakNumber, TodayRook } from "@/components/today/TodayRook";
import { TopThree } from "@/components/today/TopThree";
import { UpcomingCard } from "@/components/today/UpcomingCard";
import { ProgressBar, SectionHeader, cx } from "@/components/ui";
import { accountDay, dateLabel, weekdayOf } from "@/lib/local-date";
import { daypartAt, type NorthStar } from "@/lib/north-star";
import {
  dayPills,
  groupBySection,
  nextLine,
  nextTaskId,
  routinesOn,
  todayStats,
  trackOrder,
  type RitualState,
} from "@/lib/today";

/**
 * Today = execution (docs/NAVIGATION.md): header (the Morning Ritual on the first open
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
  const next = nextTaskId(app.tasks);
  const nextTask = app.tasks.find((x) => x.id === next);
  const nextName = nextTask?.name;
  /** V3: LOCK IN opens the duration sheet already on the PRÓXIMA task,
   *  unless a task was picked by hand (the pick is only the form's state). */
  const lockIn = () => {
    if (nextTask && !app.focus.taskId && app.focus.phase === "setup") {
      const goalId = app.taskGoals[nextTask.id];
      app.setFocusTask(
        nextTask.name,
        nextTask.id,
        goalId &&
          app.goals.some((g) => g.id === goalId && g.status === "active")
          ? goalId
          : undefined,
      );
    }
    app.openSheet({ kind: "focus" });
  };
  const empty = app.tasks.length === 0 && app.routines.length === 0;
  // V3.3: in fill order — proof from the left (Proof Track).
  const pills = trackOrder(dayPills(app.tasks, next));
  const ritual = useMorningRitual();
  /** Times the day was started here: Rook's nod and the numbers' entry. */
  const [started, setStarted] = useState(0);
  /** The step the ritual handed over to, lit for a moment in the list. */
  const [cue, setCue] = useState<string | null>(null);
  const [go, setGo] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!go) return;
    const id = setTimeout(() => setGo(false), 2600);
    return () => clearTimeout(id);
  }, [go]);
  useEffect(() => {
    if (!cue) return;
    const id = setTimeout(() => setCue(null), 900);
    return () => clearTimeout(id);
  }, [cue]);

  /**
   * V3.2: the ritual hands over to execution. State first, motion after:
   * it closes at once, Rook acknowledges, the numbers come back, and focus
   * lands on the first step's check (scrolled into view only when hidden) —
   * nothing is completed, started or navigated. No tasks → the add sheet.
   */
  function startDay(state: RitualState) {
    ritual.close();
    setStarted((n) => n + 1);
    if (state === "empty") {
      app.openSheet({ kind: "add", repeat: app.routines.length === 0 });
      return;
    }
    if (state === "done" || !next) {
      requestAnimationFrame(() => title.current?.focus());
      return;
    }
    setCue(next);
    setGo(true);
    requestAnimationFrame(() => {
      const check = document.querySelector<HTMLElement>(
        '[data-next="true"] [role="checkbox"]',
      );
      if (!check) return;
      check.focus({ preventScroll: true });
      // The row, not the check: the check overhangs its overflow-hidden row,
      // which would otherwise scroll sideways and clip the name.
      const row = check.closest<HTMLElement>("[data-next]") ?? check;
      const box = row.getBoundingClientRect();
      // The pinned LOCK IN and the tab bar cover the bottom of a phone.
      if (box.top < 0 || box.bottom > window.innerHeight - 200) {
        const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
        row.scrollIntoView({
          block: "center",
          behavior: calm ? "auto" : "smooth",
        });
      }
    });
  }
  const dayNumber = accountDay(me.createdAt, me.timezone, app.today);
  const feedShort = app.feed.slice(-5);

  return (
    <div className="flex flex-col animate-[li-fade-up_.4s_ease]">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 desk:gap-12 wide:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6 desk:gap-10">
          <header className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-meta tracking-[0.14em] text-dim">
                  {dateLabel(app.today)}
                </span>
                <span className="font-mono text-meta tracking-[0.14em] text-accent">
                  {t.todayScreen.day(dayNumber)}
                </span>
              </div>
              {/* Rook beside the greeting: he reacts to each task proved. */}
              <div className="flex items-end justify-between gap-3">
                <h1
                  ref={title}
                  tabIndex={-1}
                  suppressHydrationWarning
                  className="page-title focus:outline-none"
                >
                  {t.todayScreen.greeting(
                    daypartAt(app.now, me.timezone),
                    app.userName.toUpperCase(),
                  )}
                </h1>
                <TodayRook
                  done={stats.done}
                  standardMet={stats.standardMet}
                  perfect={stats.perfect}
                  greeting={ritual.open}
                  started={started}
                />
              </div>
            </div>
            {ritual.open ? (
              <MorningRitual
                star={northStar}
                stats={stats}
                next={nextTask}
                pills={pills}
                onStart={startDay}
                onClose={ritual.close}
              />
            ) : (
              <div
                key={started}
                className={cx(
                  "flex flex-col gap-5",
                  started > 0 &&
                    "motion-safe:animate-[li-fade-up_.4s_var(--ease-out-quick)]",
                )}
              >
                <div className="flex items-end justify-between gap-4">
                  <span
                    data-testid="today-pct"
                    aria-label={t.todayScreen.pctAria(stats.pct)}
                    className={cx(
                      "num flex items-baseline text-num-today transition-colors duration-[400ms] max-[359px]:text-num-xl wide:text-num-hero",
                      stats.perfect ? "text-accent" : "text-text",
                    )}
                  >
                    {stats.pct}
                    <span className="ml-[3px] text-[2.375rem] font-semibold tracking-normal text-dim">
                      %
                    </span>
                  </span>
                  <span className="flex min-w-0 items-end gap-3">
                    <div className="flex flex-col items-end gap-1.5 pb-0.5">
                      <span
                        data-testid="today-count"
                        className="text-base whitespace-nowrap tabular-nums"
                      >
                        {stats.done} / {stats.total}{" "}
                        <span className="text-dim">{t.todayScreen.done}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => app.openSheet({ kind: "streak" })}
                        className={cx(
                          "flex min-h-8 items-center gap-[7px] text-right font-mono text-meta tracking-[0.14em] hover:text-text",
                          app.streak > 0 ? "text-streak" : "text-dim",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cx(
                            "h-3 w-1.5 rounded-[3px]",
                            app.streak > 0 ? "bg-streak" : "bg-dim",
                          )}
                        />
                        <StreakNumber streak={app.streak} />{" "}
                        {t.todayScreen.streakSuffix}
                        <span aria-hidden="true" className="text-ghost">
                          ›
                        </span>
                      </button>
                    </div>
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  <ProgressBar
                    pct={stats.pct}
                    label={t.todayScreen.completionLabel}
                    marker={app.standard}
                    pills={pills}
                    className="mt-1 overflow-visible"
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    {go ? (
                      <span
                        role="status"
                        className="text-sm text-text motion-safe:animate-[li-fade-in_.3s_ease]"
                      >
                        {t.morning.go}
                      </span>
                    ) : (
                      <span
                        className={cx(
                          "text-sm",
                          stats.standardMet ? "text-accent" : "text-muted",
                        )}
                      >
                        {nextLine(stats)}
                      </span>
                    )}
                    {stats.total > 0 && (
                      <span className="font-mono text-tab tracking-[0.12em] whitespace-nowrap text-dim">
                        {t.todayScreen.standardTag(app.standard)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </header>

          {/* The ritual already says the day is done. */}
          {stats.perfect && !ritual.open && (
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent-wash px-5 py-5 motion-safe:animate-[li-glow_1.8s_ease-in-out_1]">
              <span className="flex items-baseline gap-4">
                <span className="text-heading cond font-bold text-accent">
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
            {empty && !ritual.open && (
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
                    flashing={app.flash === task.id || cue === task.id}
                    next={task.id === next}
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
            onClick={lockIn}
            className="btn-primary hidden h-[58px] items-center justify-center gap-3 rounded-2xl font-mono text-small font-bold tracking-brand wide:flex"
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

      {/* Pinned LOCK IN until the aside sits beside the tasks (`wide`):
          from 780 to 1179 px the aside falls below the whole list, so the
          one action of the screen would be off the first view (V3). On a
          phone it floats above the tab bar and names the PRÓXIMA task. */}
      <div className="sticky bottom-[calc(90px+env(safe-area-inset-bottom))] z-[5] -mx-5 flex gap-2.5 bg-[linear-gradient(to_top,var(--color-bg)_70%,transparent)] px-4 pt-[22px] pb-3 desk:bottom-0 desk:-mx-8 desk:-mb-20 desk:px-8 desk:pb-6 wide:hidden">
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "add" })}
          aria-label={t.todayScreen.addTaskAria}
          // Desktop has its own "add task" row under the list.
          className="flex size-[58px] shrink-0 items-center justify-center rounded-2xl border border-line-strong bg-card text-[1.625rem] font-light transition-transform duration-100 active:scale-[.92] desk:hidden"
        >
          +
        </button>
        <button
          type="button"
          onClick={lockIn}
          className="btn-primary flex h-[58px] min-w-0 flex-1 items-center justify-center gap-3 rounded-2xl px-4"
        >
          <LockGlyph />
          <span className="flex min-w-0 flex-col items-start">
            <span className="font-mono text-small leading-[1.1] font-bold tracking-brand">
              LOCK IN
            </span>
            {nextName && (
              <span
                aria-hidden="true"
                className="max-w-full truncate text-[0.78125rem] font-semibold opacity-75"
              >
                {nextName}
              </span>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
