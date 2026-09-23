"use client";

import Link from "next/link";
import { useApp } from "@/components/app-state";
import { LockGlyph } from "@/components/icons";
import { ActivityItem } from "@/components/today/ActivityItem";
import { NoPartnerCard, PartnerCard } from "@/components/today/PartnerCard";
import { TaskRow } from "@/components/today/TaskRow";
import { ProgressBar, SectionHeader, cx } from "@/components/ui";
import { mockToday, mockUser } from "@/lib/mock-data";
import { groupBySection, nextLine, scheduledOn, todayStats } from "@/lib/today";

export function TodayScreen() {
  const app = useApp();
  const { today, rest } = scheduledOn(app.tasks, mockToday.day);
  const stats = todayStats(today, app.standard);
  const sections = groupBySection(today);
  const feedShort = app.feed.slice(-5);

  return (
    <div className="flex flex-col animate-[li-fade-up_.4s_ease]">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 desk:gap-12 wide:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-[26px] desk:gap-10">
          <header className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs tracking-[.06em] text-dim">
                  {mockToday.label}
                </span>
                <span className="font-mono text-[11.5px] tracking-[.22em] text-accent">
                  DAY {mockToday.dayNumber}
                </span>
              </div>
              <h1 className="m-0 text-[25px] leading-[1.1] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
                GOOD MORNING, {app.userName.toUpperCase()}.
              </h1>
            </div>
            <div className="flex items-end justify-between gap-4">
              <span
                data-testid="today-pct"
                aria-label={`${stats.pct}% complete`}
                className={cx(
                  "flex items-baseline text-[64px] leading-[.82] font-medium tracking-[-0.055em] tabular-nums transition-colors duration-[400ms] desk:text-[84px] wide:text-[112px]",
                  stats.perfect ? "text-accent" : "text-text",
                )}
              >
                {stats.pct}
                <span className="ml-0.5 text-[26px] tracking-[-0.02em] text-quiet desk:text-[40px]">
                  %
                </span>
              </span>
              <div className="flex flex-col items-end gap-2 pb-0.5">
                <span
                  data-testid="today-count"
                  className="text-[15px] tabular-nums"
                >
                  {stats.done} / {stats.total}{" "}
                  <span className="text-dim">done</span>
                </span>
                <button
                  type="button"
                  onClick={() => app.openSheet({ kind: "streak" })}
                  className="flex h-7 items-center gap-1.5 font-mono text-[11px] tracking-[.14em] text-muted hover:text-text"
                >
                  {mockUser.streak} DAY STREAK
                  <span aria-hidden="true" className="text-faint">
                    ›
                  </span>
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <ProgressBar
                pct={stats.pct}
                label="Today's completion"
                marker={app.standard}
                className="overflow-visible"
              />
              <span
                className={cx(
                  "text-[13px]",
                  stats.standardMet ? "text-accent" : "text-muted",
                )}
              >
                {nextLine(stats)}
              </span>
            </div>
          </header>

          {stats.perfect && (
            <div className="flex items-center justify-between gap-4 rounded-[14px] bg-accent-wash px-5 py-[18px] animate-[li-glow_3.6s_ease-in-out_infinite]">
              <span className="flex items-baseline gap-4">
                <span className="text-[26px] font-semibold tracking-[-0.03em] text-accent">
                  100%
                </span>
                <span className="font-mono text-[12.5px] tracking-[.28em]">
                  STANDARD MET.
                </span>
              </span>
            </div>
          )}

          <section
            aria-label="Today's tasks"
            className="flex flex-col gap-[30px]"
          >
            {sections.map((sec) => (
              <div key={sec.name} className="flex flex-col">
                <SectionHeader
                  as="h2"
                  label={sec.name}
                  right={sec.count}
                  tracking="tracking-[.18em]"
                />
                {sec.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    popping={app.pop === t.id}
                    flashing={app.flash === t.id}
                    onToggle={() => app.toggleTask(t.id)}
                    onOptions={() =>
                      app.openSheet({ kind: "options", taskId: t.id })
                    }
                  />
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() => app.openSheet({ kind: "add" })}
              className="-mt-3.5 hidden h-11 self-start rounded-xl border border-dashed border-white/16 px-4 text-sm text-muted hover:border-white/30 hover:text-text desk:block"
            >
              + Add task
            </button>
            {rest.length > 0 && (
              <span className="text-[13px] text-dim">
                Rest today: {rest.map((t) => t.name).join(" · ")}
              </span>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-7 wide:sticky wide:top-0">
          {app.hasPartner ? <PartnerCard /> : <NoPartnerCard />}
          <button
            type="button"
            onClick={() => app.openSheet({ kind: "focus" })}
            className="hidden h-14 items-center justify-center gap-3 rounded-[14px] bg-accent font-mono text-[13px] font-semibold tracking-[.3em] text-bg transition-transform duration-100 active:scale-[.97] desk:flex"
          >
            <LockGlyph />
            LOCK IN
          </button>
          {feedShort.length > 0 && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-1">
                <span className="flex items-center gap-[9px]">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-accent animate-[li-pulse_2.4s_ease-out_infinite]"
                  />
                  <h2 className="font-mono text-[11px] font-normal tracking-[.2em]">
                    LIVE
                  </h2>
                </span>
                <Link
                  href="/partner"
                  className="flex h-9 items-center text-[12.5px] text-dim hover:text-text"
                >
                  See all
                </Link>
              </div>
              <div className="flex flex-col-reverse">
                {feedShort.map((e) => (
                  <ActivityItem key={e.id} event={e} />
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => app.openOverlay({ kind: "review" })}
            className="flex h-12 items-center justify-between border-t border-white/6 text-[13.5px] text-muted hover:text-text"
          >
            <span>Review today</span>
            <span aria-hidden="true" className="text-faint">
              ›
            </span>
          </button>
        </aside>
      </div>

      <div className="sticky bottom-0 z-[5] -mx-[18px] -mb-7 flex gap-2.5 bg-[linear-gradient(to_top,#0A0A0B_72%,rgba(10,10,11,0))] px-[18px] pt-[18px] pb-3.5 desk:hidden">
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "add" })}
          aria-label="Add task"
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-[#141416] text-[26px] font-light transition-transform duration-100 active:scale-[.92]"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "focus" })}
          className="flex h-14 flex-1 items-center justify-center gap-3 rounded-2xl bg-accent font-mono text-[13px] font-semibold tracking-[.3em] text-bg transition-transform duration-100 active:scale-[.97]"
        >
          <LockGlyph />
          LOCK IN
        </button>
      </div>
    </div>
  );
}
