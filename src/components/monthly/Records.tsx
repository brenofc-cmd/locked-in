"use client";

/**
 * Personal Records + Milestones (V2 Phase 8). Personal bests (owner-only,
 * never compared with the partner) as four compact rows, then MARCOS: the
 * next milestone of each kind with its progress, every milestone on demand.
 * Reached = CONQUISTADO, no animation (Phase 9).
 */
import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { cx } from "@/components/ui";
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
    // A personal best reads as an achievement: the number first, then
    // what it is and when it happened (not a label / value table row).
    <div
      data-testid={testId}
      className="flex min-w-0 flex-col gap-1.5 border-t border-line pt-3"
    >
      <dd
        className={cx(
          "m-0 text-title font-medium tracking-display tabular-nums",
          value === R.none && "text-ghost",
        )}
      >
        {value}
      </dd>
      <dt className="eyebrow text-muted">{label}</dt>
      {when && <span className="text-small text-dim">{when}</span>}
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
      <h2 className="m-0 border-b border-line-strong pb-2 font-mono text-meta font-normal tracking-eyebrow text-muted">
        {R.title}
      </h2>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 pt-1 desk:grid-cols-4">
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
  // Three states: locked (far), near (≥ 70 %), reached — said in words too.
  const near = !m.reached && m.current / m.target >= 0.7;
  return (
    <li
      data-testid="milestone"
      data-key={m.key}
      data-reached={m.reached}
      aria-label={milestoneAria(m)}
      className="flex flex-col gap-1.5 border-t border-line py-2.5"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span
          className={cx(
            "font-mono text-meta tracking-eyebrow",
            m.reached || near ? "text-text" : "text-muted",
          )}
        >
          {m.reached && (
            <span aria-hidden="true" className="mr-1.5 text-accent">
              ◆
            </span>
          )}
          {milestoneTitle(m)}
        </span>
        <span
          className={
            m.reached
              ? "font-mono text-meta tracking-eyebrow text-accent"
              : "font-mono text-meta text-muted tabular-nums"
          }
        >
          {m.reached
            ? R.reached
            : near
              ? `${milestoneProgress(m)} · ${R.near}`
              : milestoneProgress(m)}
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
            className={cx(
              "block h-full",
              near ? "bg-accent-line" : "bg-white/40",
            )}
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
      <h2 className="m-0 flex items-baseline justify-between border-b border-line-strong pb-2 font-normal">
        <span className="font-mono text-meta tracking-eyebrow text-muted">
          {R.milestonesTitle}
        </span>
        <span
          data-testid="milestones-count"
          className="font-mono text-meta text-dim tabular-nums"
        >
          {R.reachedCount(reached, milestones.length)}
        </span>
      </h2>
      {next.length === 0 ? (
        <span className="py-2.5 text-small text-dim">{R.allReached}</span>
      ) : (
        <>
          <span className="pt-3 font-mono text-meta tracking-eyebrow text-dim">
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
