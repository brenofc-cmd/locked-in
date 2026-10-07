"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useState } from "react";
import { loadPlanner } from "@/app/(app)/planner-actions";
import { useApp } from "@/components/app-state";
import { useResumeValue } from "@/components/resume/use-resume";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import { DAY_LETTERS, dateLabel } from "@/lib/local-date";
import {
  compareEvents,
  countdown,
  dayAria,
  eventHeading,
  fromRow,
  groupUpcoming,
  plannerMonth,
  type PlannerEvent,
} from "@/lib/planner";
import { monthRange, shiftMonth } from "@/lib/progress";
import { rememberPlanner, type PlannerView } from "@/lib/resume-state";

const VIEWS: PlannerView[] = ["upcoming", "calendar"];

/**
 * School planner (V2 Phase 2): PRÓXIMOS (today → 60 days, grouped) and
 * CALENDÁRIO (one month at a time, read on demand). The view and the month
 * are remembered on this device (Resume State); events never are.
 */
export function PlannerScreen() {
  const app = useApp();
  const { me } = useSession();
  const [picked, setPicked] = useState<PlannerView | null>(null);
  const stored = useResumeValue(
    me.id,
    (s) => s.planner?.view,
  ) as PlannerView | null;
  const view: PlannerView = picked ?? stored ?? "upcoming";
  const pick = (v: PlannerView) => {
    setPicked(v);
    rememberPlanner(me.id, { view: v });
  };

  return (
    <div className="flex flex-col gap-7 animate-[li-fade-up_.4s_ease] desk:gap-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">{t.planner.title}</h1>
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "planner" })}
          aria-label={t.planner.addAria}
          className="h-11 rounded-xl border border-line-strong px-4 text-body"
        >
          {t.planner.add}
        </button>
      </header>
      <div
        role="radiogroup"
        aria-label={t.planner.viewsAria}
        className="flex self-start rounded-xl border border-line p-1"
      >
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            onClick={() => pick(v)}
            className={cx(
              "h-9 rounded-lg px-4 font-mono text-meta tracking-eyebrow",
              view === v ? "bg-selected text-text" : "text-dim",
            )}
          >
            {t.planner.views[v]}
          </button>
        ))}
      </div>
      {view === "upcoming" ? <Upcoming /> : <Calendar />}
    </div>
  );
}

export function EventRow({
  event,
  showDate = true,
}: {
  event: PlannerEvent;
  showDate?: boolean;
}) {
  const app = useApp();
  const when = [showDate ? countdown(event.date, app.today) : "", event.time]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={() => app.openSheet({ kind: "planner", event })}
      className="grid min-h-[58px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-2 text-left"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 font-mono text-meta tracking-eyebrow text-dim">
          {!event.mine && (
            <span className="text-muted">{app.partner.name.toUpperCase()}</span>
          )}
          <span className="truncate">{eventHeading(event)}</span>
          {event.important && (
            <>
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-accent"
              />
              <span className="sr-only">{t.planner.importantTag}</span>
            </>
          )}
        </span>
        <span className="truncate text-body">{event.title}</span>
      </span>
      <span className="font-mono text-meta tracking-meta text-muted tabular-nums">
        {when}
      </span>
    </button>
  );
}

function Upcoming() {
  const app = useApp();
  const groups = groupUpcoming(app.plannerEvents, app.today);
  if (groups.length === 0)
    return <p className="text-body text-dim">{t.planner.empty}</p>;
  return (
    <div className="flex flex-col gap-7">
      {groups.map((g) => (
        <section
          key={g.group}
          aria-label={t.planner.groups[g.group]}
          className="flex flex-col"
        >
          <h2 className="border-b border-line-strong pb-2 font-mono text-meta font-normal tracking-eyebrow text-muted">
            {t.planner.groups[g.group]}
          </h2>
          {g.events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Calendar() {
  const app = useApp();
  const { me } = useSession();
  const current = app.today.slice(0, 7);
  const [picked, setPicked] = useState<string | null>(null);
  const stored = useResumeValue(me.id, (s) => s.planner?.month);
  const month = picked ?? stored ?? current;
  const [rows, setRows] = useState<{ month: string; events: PlannerEvent[] }>({
    month: "",
    events: [],
  });
  const [selected, setSelected] = useState<string | null>(null);

  const go = (n: number) => {
    const next = shiftMonth(month, n);
    setPicked(next);
    setSelected(null);
    rememberPlanner(me.id, { month: next === current ? undefined : next });
  };

  // One month per read; again after any planner change.
  useEffect(() => {
    let alive = true;
    const { from, to } = monthRange(month);
    void loadPlanner(from, to)
      .catch(() => null)
      .then((res) => {
        if (!alive || !res?.ok) return;
        setRows({ month, events: res.rows.map((r) => fromRow(r, me.id)) });
      });
    return () => {
      alive = false;
    };
  }, [month, me.id, app.plannerSeq]);

  const events = rows.month === month ? rows.events : [];
  const cells = plannerMonth(month, events, app.today);
  const [y, m] = month.split("-").map(Number);
  const title = `${t.dates.monthsLong[m - 1]} ${y}`;
  const day = selected ?? (month === current ? app.today : `${month}-01`);
  const dayEvents = events.filter((e) => e.date === day).sort(compareEvents);

  return (
    <div className="grid grid-cols-1 gap-7 wide:grid-cols-2 wide:gap-12">
      <section aria-label={title} className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2
            data-testid="planner-month"
            className="font-mono text-meta font-normal tracking-eyebrow text-muted"
          >
            {title}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t.planner.prevMonth}
              onClick={() => go(-1)}
              className="size-11 rounded-xl text-base text-text"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label={t.planner.nextMonth}
              onClick={() => go(1)}
              className="size-11 rounded-xl text-base text-text"
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
          {cells.map((c) =>
            c.kind === "blank" ? (
              <span key={c.key} />
            ) : (
              <button
                key={c.key}
                type="button"
                aria-label={dayAria(c.date, c.count)}
                aria-pressed={c.date === day}
                onClick={() => setSelected(c.date)}
                className={cx(
                  "flex h-[46px] flex-col items-center justify-center gap-1 rounded-xl border p-0 text-small tabular-nums",
                  c.date === day
                    ? "border-line-bold bg-white/5"
                    : c.today
                      ? "border-line-strong"
                      : "border-transparent",
                  c.past ? "text-dim" : "text-text",
                )}
              >
                <span>{c.dayNumber}</span>
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex h-1.5 items-center gap-1",
                    c.count === 0 && "invisible",
                  )}
                >
                  {Array.from({ length: Math.min(c.count, 3) }, (_, i) => (
                    <span
                      key={i}
                      className={cx(
                        "size-1.5 rounded-full",
                        c.important && i === 0 ? "bg-accent" : "bg-muted",
                      )}
                    />
                  ))}
                </span>
              </button>
            ),
          )}
        </div>
      </section>
      <section aria-label={dateLabel(day)} className="flex flex-col">
        <div className="flex items-center justify-between border-b border-line-strong pb-2">
          <h2 className="font-mono text-meta font-normal tracking-eyebrow text-muted">
            {dateLabel(day)}
          </h2>
          <button
            type="button"
            onClick={() => app.openSheet({ kind: "planner", date: day })}
            className="h-9 px-1 text-small text-dim hover:text-text"
          >
            {t.planner.add}
          </button>
        </div>
        {dayEvents.map((e) => (
          <EventRow key={e.id} event={e} showDate={false} />
        ))}
        {dayEvents.length === 0 && (
          <span className="py-3.5 text-small text-dim">
            {t.planner.emptyDay}
          </span>
        )}
      </section>
    </div>
  );
}
