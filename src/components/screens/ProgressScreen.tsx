"use client";

import { useState } from "react";
import { useApp } from "@/components/app-state";
import { cx } from "@/components/ui";
import { seeded } from "@/lib/format";
import {
  DAY_LETTERS,
  DAYS,
  mockStats,
  mockToday,
  mockUser,
  mockWeeks,
  type Range,
} from "@/lib/mock-data";
import { scheduledOn, todayStats } from "@/lib/today";

const RANGES: { k: Range; short: string; long: string }[] = [
  { k: "7", short: "7D", long: "7 DAYS" },
  { k: "30", short: "30D", long: "30 DAYS" },
  { k: "90", short: "90D", long: "90 DAYS" },
  { k: "Y", short: "YEAR", long: "YEAR" },
];

type Bar = { v: number; label: string; today: boolean };

function barsFor(range: Range, todayPct: number): Bar[] {
  if (range === "7") {
    // Last 7 days ending today (TUE): WED … MON, then today, live.
    const order = [2, 3, 4, 5, 6, 0];
    return [
      ...mockStats.lastSixDays.map((v, i) => ({
        v,
        label: DAYS[order[i]],
        today: false,
      })),
      { v: todayPct, label: DAYS[1], today: true },
    ];
  }
  const rnd = seeded({ "30": 7, "90": 11, Y: 17 }[range]);
  const labels =
    range === "30"
      ? // 30 days ending Sep 23 start on Aug 25; label three days, away from the edges.
        Array.from({ length: 30 }, (_, i) => {
          if (i % 10 !== 4) return "";
          const d = 25 + i;
          return d > 31 ? `SEP ${d - 31}` : `AUG ${d}`;
        })
      : range === "90"
        ? Array.from({ length: 13 }, (_, i) => `W${27 + i}`)
        : ["MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP"];
  return labels.map((label, i) => ({
    v: i === labels.length - 1 ? todayPct : Math.round(62 + rnd() * 37),
    label,
    today: i === labels.length - 1,
  }));
}

function barColor(v: number, last: boolean, range: Range) {
  if (v < 70) return "bg-[color-mix(in_oklab,#E0715F_55%,#17171A)]";
  if (v === 100 || (last && range !== "7")) return "bg-accent";
  return "bg-[#35353a]";
}

export function ProgressScreen() {
  const app = useApp();
  const [range, setRange] = useState<Range>("7");
  const [insights, setInsights] = useState(false);
  const stats = todayStats(
    scheduledOn(app.tasks, mockToday.day).today,
    app.standard,
  );
  const bars = barsFor(range, stats.pct);
  const avg =
    range === "7"
      ? Math.round(bars.reduce((s, b) => s + b.v, 0) / bars.length)
      : mockStats.byRange[range].pct;
  const meta = mockStats.byRange[range];
  const showValues = bars.length <= 13;
  const rangeLong = RANGES.find((r) => r.k === range)?.long ?? "";

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
            {avg}
            <span className="text-[26px] text-quiet desk:text-[40px]">%</span>
          </span>
          <span className="font-mono text-[11px] tracking-[.16em] text-dim">
            COMPLETION RATE · {rangeLong}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => app.openSheet({ kind: "streak" })}
            className="flex flex-col gap-2 border-t border-white/10 pt-3.5 text-left"
          >
            <span className="text-[30px] leading-none font-medium tracking-[-0.03em] desk:text-[40px]">
              {mockUser.streak}{" "}
              <span className="text-[13px] tracking-normal text-muted">
                days
              </span>
            </span>
            <span className="font-mono text-[10px] tracking-[.14em] text-dim">
              STREAK ›
            </span>
          </button>
          <Stat value={meta.focus} label="FOCUS" />
          <Stat value={String(meta.perfect)} label="PERFECT DAYS" />
        </div>
      </div>

      <section aria-label="Completion chart" className="flex flex-col gap-3">
        <h2 className="font-mono text-[11px] font-normal tracking-[.16em] text-muted">
          {range === "7" ? "LAST 7 DAYS" : `COMPLETION · ${rangeLong}`}
        </h2>
        <div
          className={cx(
            "flex h-[170px] items-end border-b border-white/8",
            bars.length > 20 ? "gap-[3px]" : "gap-1.5 desk:gap-2",
          )}
        >
          {bars.map((b, i) => (
            <div
              key={i}
              title={`${b.v}%`}
              className="flex h-full flex-1 flex-col justify-end gap-2"
            >
              {showValues && (
                <span
                  className={cx(
                    "text-center text-[13px] font-medium tabular-nums",
                    b.v === 100
                      ? "text-accent"
                      : b.v < 70
                        ? "text-danger"
                        : "text-muted",
                  )}
                >
                  {b.v}
                </span>
              )}
              <div
                className={cx(
                  "rounded-t transition-[height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
                  barColor(b.v, i === bars.length - 1, range),
                )}
                style={{ height: `${Math.max(4, ((b.v - 40) / 60) * 82)}%` }}
              />
            </div>
          ))}
        </div>
        <div
          className={cx(
            "flex",
            bars.length > 20 ? "gap-[3px]" : "gap-1.5 desk:gap-2",
          )}
        >
          {bars.map((b, i) => (
            <span
              key={i}
              className={cx(
                "flex-1 text-center font-mono text-[10px] whitespace-nowrap",
                b.today ? "text-text" : "text-dim",
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
        <Calendar
          todayPct={stats.pct}
          standard={app.standard}
          onOpen={(d) => app.openSheet({ kind: "day", day: d })}
        />
        <section aria-label="Weekly reviews" className="flex flex-col">
          <h2 className="border-b border-white/9 pb-2 font-mono text-[11px] font-normal tracking-[.16em] text-muted">
            WEEKLY REVIEWS
          </h2>
          {mockWeeks.slice(0, 4).map((w, i) => (
            <button
              key={w.week}
              type="button"
              onClick={() => app.openOverlay({ kind: "weekly", index: i })}
              className="grid min-h-[50px] grid-cols-[80px_1fr_auto] items-center gap-2.5 border-b border-white/5 p-0 text-left text-sm"
            >
              <span className="font-mono text-[11px] text-muted">
                WEEK {w.week}
              </span>
              <span className="tabular-nums">
                You {w.me}% · {app.partner.name} {w.partner}%
              </span>
              <span aria-hidden="true" className="text-faint">
                ›
              </span>
            </button>
          ))}
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
            {mockStats.insights.map((i) => (
              <span
                key={i}
                className="border-l-2 border-white/12 pl-3.5 text-[15px] leading-[1.5]"
              >
                {i}
              </span>
            ))}
          </div>
          <div className="flex flex-col">
            <div className="flex justify-between border-b border-white/9 pb-2">
              <span className="font-mono text-[11px] tracking-[.16em] text-muted">
                CONSISTENCY · 30 DAYS
              </span>
              <span className="font-mono text-[11px] text-dim">
                LONGEST STREAK {mockUser.longestStreak} DAYS
              </span>
            </div>
            {mockStats.habits.map((h) => (
              <div
                key={h.name}
                className="grid min-h-[46px] grid-cols-[minmax(0,1fr)_90px_44px] items-center gap-3 border-b border-white/5"
              >
                <span className="truncate text-sm">{h.name}</span>
                <div className="h-[3px] rounded-sm bg-white/6">
                  <div
                    className={cx(
                      "h-full rounded-sm",
                      h.rate < 75 ? "bg-danger" : "bg-muted",
                    )}
                    style={{ width: `${h.rate}%` }}
                  />
                </div>
                <span
                  className={cx(
                    "text-right text-sm tabular-nums",
                    h.rate < 75 ? "text-danger" : "text-text",
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-3.5">
      <span className="text-[30px] leading-none font-medium tracking-[-0.03em] desk:text-[40px]">
        {value}
      </span>
      <span className="font-mono text-[10px] tracking-[.14em] text-dim">
        {label}
      </span>
    </div>
  );
}

function Calendar({
  todayPct,
  standard,
  onOpen,
}: {
  todayPct: number;
  standard: number;
  onOpen: (day: number) => void;
}) {
  const { missed, perfect } = mockStats.september;
  // Sep 1 2026 is a Monday, so the grid needs no leading blanks.
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <section aria-label="September" className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] font-normal tracking-[.16em] text-muted">
          {mockToday.monthLabel}
        </h2>
        <span className="text-xs text-dim">Tap a day to review</span>
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
        {days.map((d) => {
          const future = d > mockToday.date;
          const isToday = d === mockToday.date;
          const state = isToday
            ? todayPct === 100
              ? "perfect"
              : todayPct >= standard
                ? "met"
                : "open"
            : future
              ? "future"
              : missed.includes(d)
                ? "missed"
                : perfect.includes(d)
                  ? "perfect"
                  : "met";
          const aria = `Sep ${d}: ${
            {
              met: "standard met",
              perfect: "perfect",
              missed: "missed",
              future: "upcoming",
              open: "in progress",
            }[state]
          }`;
          return (
            <button
              key={d}
              type="button"
              disabled={future || isToday}
              onClick={() => onOpen(d)}
              aria-label={aria}
              className={cx(
                "flex h-[46px] flex-col items-center justify-center gap-[5px] rounded-[10px] p-0 text-[12.5px] tabular-nums disabled:cursor-default",
                isToday
                  ? "border border-white/20"
                  : "border border-transparent",
                future ? "text-off" : "text-text",
              )}
            >
              <span>{d}</span>
              <span
                aria-hidden="true"
                className={cx(
                  "size-1.5 rounded-full",
                  (state === "met" || state === "perfect") && "bg-accent",
                  state === "perfect" &&
                    "shadow-[0_0_0_2px_#0A0A0B,0_0_0_3px_var(--color-accent)]",
                  state === "missed" && "border-[1.5px] border-missed",
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
