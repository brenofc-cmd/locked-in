"use client";

/**
 * Personal Records + Milestones (V2 Phase 8). Personal bests (owner-only,
 * never compared with the partner) as four compact rows, then MARCOS: the
 * next milestone of each kind with its progress, every milestone on demand.
 * Reached = CONQUISTADO, no animation (Phase 9).
 */
import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { Disclosure } from "@/components/monthly/Monthly";
import { dateLabel } from "@/lib/local-date";
import { monthTitle } from "@/lib/monthly";
import {
  hoursLabel,
  milestoneAria,
  milestoneProgress,
  milestoneTitle,
  nextMilestones,
  weekRangeLabel,
  type Milestone,
} from "@/lib/records";

const R = t.records;

function RecordRow({
  label,
  value,
  when,
  testId,
}: {
  label: string;
  value: string;
  when?: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-baseline justify-between gap-3 border-t border-white/7 py-2.5"
    >
      <dt className="font-mono text-[10.5px] tracking-[.14em] text-muted">
        {label}
      </dt>
      <dd className="m-0 flex items-baseline gap-2 text-right">
        <span className="text-[15px] font-medium tabular-nums">{value}</span>
        {when && (
          <span className="font-mono text-[10.5px] tracking-[.08em] text-dim">
            {when}
          </span>
        )}
      </dd>
    </div>
  );
}

export function RecordsSection() {
  const { records, longestStreak } = useApp();
  return (
    <section
      aria-label={R.aria}
      data-testid="records"
      className="flex flex-col"
    >
      <h2 className="m-0 border-b border-white/9 pb-2 font-mono text-[11px] font-normal tracking-[.16em] text-muted">
        {R.title}
      </h2>
      <dl className="m-0 flex flex-col">
        <RecordRow
          label={R.longestStreak}
          value={R.days(longestStreak)}
          testId="record-streak"
        />
        <RecordRow
          label={R.focusDay}
          value={
            records.bestFocusDay
              ? hoursLabel(records.bestFocusDay.seconds)
              : R.none
          }
          when={
            records.bestFocusDay
              ? `${dateLabel(records.bestFocusDay.date)} ${records.bestFocusDay.date.slice(0, 4)}`
              : undefined
          }
          testId="record-focus-day"
        />
        <RecordRow
          label={R.focusWeek}
          value={
            records.bestFocusWeek
              ? hoursLabel(records.bestFocusWeek.seconds)
              : R.none
          }
          when={
            records.bestFocusWeek
              ? weekRangeLabel(records.bestFocusWeek.weekStart)
              : undefined
          }
          testId="record-focus-week"
        />
        <RecordRow
          label={R.perfectMonth}
          value={
            records.bestPerfectMonth
              ? String(records.bestPerfectMonth.days)
              : R.none
          }
          when={
            records.bestPerfectMonth
              ? monthTitle(records.bestPerfectMonth.month)
              : undefined
          }
          testId="record-perfect-month"
        />
      </dl>
    </section>
  );
}

function MilestoneLine({ m }: { m: Milestone }) {
  return (
    <li
      data-testid="milestone"
      data-key={m.key}
      data-reached={m.reached}
      aria-label={milestoneAria(m)}
      className="flex flex-col gap-1.5 border-t border-white/7 py-2.5"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[.14em]">
          {milestoneTitle(m)}
        </span>
        <span
          className={
            m.reached
              ? "font-mono text-[10.5px] tracking-[.14em] text-accent"
              : "font-mono text-[11px] text-muted tabular-nums"
          }
        >
          {m.reached ? R.reached : milestoneProgress(m)}
        </span>
      </span>
      {!m.reached && (
        <span
          role="progressbar"
          aria-label={milestoneTitle(m)}
          aria-valuemin={0}
          aria-valuemax={m.target}
          aria-valuenow={m.current}
          aria-valuetext={milestoneAria(m)}
          className="block h-[3px] overflow-hidden rounded-full bg-white/8"
        >
          <span
            className="block h-full bg-white/50"
            style={{ width: `${(100 * m.current) / m.target}%` }}
          />
        </span>
      )}
    </li>
  );
}

export function MilestonesSection() {
  const { milestones } = useApp();
  const next = nextMilestones(milestones);
  const reached = milestones.filter((m) => m.reached).length;
  return (
    <section
      aria-label={R.milestonesAria}
      data-testid="milestones"
      className="flex flex-col"
    >
      <h2 className="m-0 flex items-baseline justify-between border-b border-white/9 pb-2 font-normal">
        <span className="font-mono text-[11px] tracking-[.16em] text-muted">
          {R.milestonesTitle}
        </span>
        <span
          data-testid="milestones-count"
          className="font-mono text-[11px] text-dim tabular-nums"
        >
          {R.reachedCount(reached, milestones.length)}
        </span>
      </h2>
      {next.length === 0 ? (
        <span className="py-2.5 text-[13px] text-dim">{R.allReached}</span>
      ) : (
        <>
          <span className="pt-3 font-mono text-[10px] tracking-[.16em] text-dim">
            {R.next}
          </span>
          <ul
            data-testid="milestones-next"
            className="m-0 flex list-none flex-col p-0"
          >
            {next.map((m) => (
              <MilestoneLine key={m.key} m={m} />
            ))}
          </ul>
        </>
      )}
      <Disclosure label={R.seeAll} testId="milestones-all-toggle">
        <ul
          data-testid="milestones-all"
          className="m-0 flex list-none flex-col p-0"
        >
          {milestones.map((m) => (
            <MilestoneLine key={m.key} m={m} />
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}
