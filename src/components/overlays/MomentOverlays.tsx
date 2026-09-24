"use client";

import { useState, type ReactNode } from "react";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { accountDay, localTimeHM, weekdayName } from "@/lib/local-date";
import { mockUser, mockWeeks } from "@/lib/mock-data";
import { partnerView } from "@/lib/partner";
import { todayStats } from "@/lib/today";

/** Review day, weekly review and morning briefing (full-screen moments). */
export function MomentOverlays() {
  const { overlay } = useApp();
  if (!overlay) return null;
  if (overlay.kind === "review") return <ReviewDay />;
  if (overlay.kind === "weekly") return <WeeklyReview start={overlay.index} />;
  return <Briefing />;
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
  "m-0 text-[44px] leading-none font-semibold tracking-[-0.035em] max-[384px]:text-[38px] desk:text-[64px]";
const lightButton =
  "h-[60px] w-full rounded-2xl bg-text font-mono text-[13px] font-semibold tracking-[.3em] text-bg transition-transform duration-100 active:scale-[.97]";

function ReviewDay() {
  const app = useApp();
  const { me } = useSession();
  // Real: today's tasks. Partner numbers and focus are still mock.
  const list = app.tasks;
  const stats = todayStats(list, app.standard);
  const pv = partnerView(app.partner, app.partnerTasks, app.feed, app.now);
  const notDone = list.filter((t) => !t.done && !t.skip).map((t) => t.name);
  const diff = pv.pct - stats.pct;

  return (
    <Frame label="Review today" width="max-w-[520px]">
      <div className="flex flex-col gap-[34px]">
        <div className="flex flex-col gap-3.5">
          <span className="font-mono text-xs tracking-[.14em] text-dim">
            {weekdayName(app.today)} · DAY{" "}
            {accountDay(me.createdAt, me.timezone, app.today)}
          </span>
          <h1 className={bigTitle}>
            TODAY
            <br />
            {stats.perfect ? "COMPLETE" : "SO FAR"}
          </h1>
        </div>
        <div className="flex items-end justify-between gap-4">
          <span className="text-[64px] leading-[.82] font-medium tracking-[-0.055em] desk:text-[112px]">
            {stats.pct}
            <span className="text-[26px] text-quiet desk:text-[40px]">%</span>
          </span>
          <span className="flex flex-col items-end gap-2">
            <span className="text-[15px] tabular-nums">
              {stats.done} / {stats.total}{" "}
              <span className="text-dim">done</span>
            </span>
            <span className="font-mono text-[11px] tracking-[.14em] text-muted">
              {formatMinutes(app.focusMin).toUpperCase()} FOCUS
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <span
            aria-hidden="true"
            className={cx(
              "size-1.5 rounded-full",
              stats.standardMet ? "bg-accent" : "bg-faint",
            )}
          />
          {stats.standardMet
            ? `Standard met. Streak is now ${mockUser.streak + 1} days.`
            : `${stats.needed} more to meet your standard.`}
        </div>
        {app.hasPartner && (
          <div className="flex flex-col gap-3 border-t border-white/7 pt-[18px]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold tracking-[.16em]">
                {app.partner.name.toUpperCase()}
              </span>
              <span className="flex items-baseline gap-3.5 tabular-nums">
                <span className="text-[15px] text-muted">
                  {pv.done} / {pv.total}
                </span>
                <span className="text-[28px] font-medium tracking-[-0.03em]">
                  {pv.pct}%
                </span>
              </span>
            </div>
            <span className="text-sm text-muted">
              {diff > 0
                ? `${app.partner.name} is ${diff}% ahead today.`
                : diff < 0
                  ? `You are ${-diff}% ahead today.`
                  : "Level today."}
            </span>
          </div>
        )}
        {notDone.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] tracking-[.16em] text-dim">
              NOT DONE
            </span>
            <span className="text-sm text-muted">{notDone.join(" · ")}</span>
          </div>
        )}
      </div>
      <button type="button" onClick={app.closeOverlay} className={lightButton}>
        DONE
      </button>
    </Frame>
  );
}

function WeeklyReview({ start }: { start: number }) {
  const { closeOverlay, partner } = useApp();
  const [i, setI] = useState(start);
  const w = mockWeeks[i];
  const meWon = w.me >= w.partner;
  const rows = [
    {
      k: "TASKS COMPLETED",
      v: `${Math.round(w.me * 0.74)} · ${Math.round(w.partner * 0.72)}`,
    },
    {
      k: "FOCUS",
      v: `${8 + (w.week % 4)}h ${10 + w.week}m · ${6 + (w.week % 3)}h ${w.week}m`,
    },
    {
      k: "PERFECT DAYS",
      v: `${w.me > 90 ? 3 : 1} · ${w.partner > 90 ? 3 : 1}`,
    },
  ];

  return (
    <Frame label={`Week ${w.week} review`} width="max-w-[560px]">
      <div className="flex flex-col gap-[30px]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs tracking-[.22em] text-accent">
            WEEK {w.week} COMPLETE
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="Older week"
              disabled={i >= mockWeeks.length - 1}
              onClick={() => setI((x) => Math.min(mockWeeks.length - 1, x + 1))}
              className="size-11 rounded-xl border border-white/10 text-base text-text disabled:text-off"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Newer week"
              disabled={i <= 0}
              onClick={() => setI((x) => Math.max(0, x - 1))}
              className="size-11 rounded-xl border border-white/10 text-base text-text disabled:text-off"
            >
              ›
            </button>
          </div>
        </div>
        <div className="flex flex-col">
          <div
            className={cx(
              "flex items-end justify-between pb-1.5",
              meWon ? "text-text" : "text-quiet",
            )}
          >
            <span className="text-[13px] font-semibold tracking-[.16em]">
              YOU
            </span>
            <span className="text-[64px] leading-[.8] font-medium tracking-[-0.06em] tabular-nums desk:text-[96px]">
              {w.me}%
            </span>
          </div>
          <div className="flex items-center gap-3.5 py-3.5">
            <span className="h-px flex-1 bg-white/8" />
            <span className="font-mono text-[11px] tracking-[.2em] text-muted">
              {meWon ? "YOU WON" : `${partner.name.toUpperCase()} WON`} BY{" "}
              {Math.abs(w.me - w.partner)}%
            </span>
            <span className="h-px flex-1 bg-white/8" />
          </div>
          <div
            className={cx(
              "flex items-end justify-between gap-3",
              meWon ? "text-quiet" : "text-text",
            )}
          >
            <span className="text-[13px] font-semibold tracking-[.16em]">
              {partner.name.toUpperCase()}
            </span>
            <span className="text-[64px] leading-[.8] font-medium tracking-[-0.06em] tabular-nums desk:text-[96px]">
              {w.partner}%
            </span>
          </div>
        </div>
        <div className="flex flex-col">
          {rows.map((r) => (
            <div
              key={r.k}
              className="flex items-baseline justify-between gap-3 border-t border-white/6 py-3.5"
            >
              <span className="font-mono text-[10.5px] tracking-[.16em] text-dim">
                {r.k}
              </span>
              <span className="text-right text-[15px]">{r.v}</span>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={closeOverlay}
        className={cx(lightButton, "h-[58px] text-[12.5px] tracking-[.26em]")}
      >
        CLOSE
      </button>
    </Frame>
  );
}

function Briefing() {
  const { closeOverlay, tasks, userName, today } = useApp();
  const { me } = useSession();
  const [auto, setAuto] = useState(true);
  // Real: today's task count. Yesterday % and streak are mock until Stage 7.
  const total = tasks.length;

  const rows = [
    { k: "TODAY", v: String(total), unit: "TASKS" },
    { k: "YESTERDAY", v: "93%", unit: "" },
    { k: "STREAK", v: String(mockUser.streak), unit: "DAYS" },
  ];

  return (
    <Frame label="Morning briefing" width="max-w-[480px]">
      <div className="flex flex-col gap-9">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm text-dim tabular-nums">
            {localTimeHM(new Date(), me.timezone)} · {weekdayName(today)}
          </span>
          <button
            type="button"
            onClick={closeOverlay}
            className="h-11 px-1 text-sm text-dim"
          >
            Skip
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <h1 className={bigTitle}>
            GOOD MORNING,
            <br />
            {userName.toUpperCase()}.
          </h1>
          <span className="font-mono text-[13px] tracking-[.26em] text-accent">
            DAY {accountDay(me.createdAt, me.timezone, today)}
          </span>
        </div>
        <div className="flex flex-col">
          {rows.map((r) => (
            <div
              key={r.k}
              className="flex items-baseline justify-between border-t border-white/7 py-4"
            >
              <span className="font-mono text-[11px] tracking-[.18em] text-dim">
                {r.k}
              </span>
              <span className="text-[34px] leading-none font-medium tracking-[-0.045em] desk:text-[46px]">
                {r.v}{" "}
                {r.unit && (
                  <span className="text-[15px] tracking-[.06em] text-muted">
                    {r.unit}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-[18px]">
        <button type="button" onClick={closeOverlay} className={lightButton}>
          START DAY
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          onClick={() => setAuto((a) => !a)}
          className="flex h-11 items-center gap-2.5 text-[13px] text-dim"
        >
          <span
            aria-hidden="true"
            className={cx(
              "flex size-[18px] items-center justify-center rounded-[5px] border-[1.5px]",
              auto ? "border-text bg-text" : "border-white/20",
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
                style={{ opacity: auto ? 1 : 0 }}
              />
            </svg>
          </span>
          Show automatically each morning
        </button>
        <span className="text-center font-mono text-[10.5px] leading-[1.9] tracking-[.28em] text-faint">
          NO HYPE.
          <br />
          JUST PROOF.
        </span>
      </div>
    </Frame>
  );
}
