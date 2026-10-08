"use client";

/**
 * Monthly Champion (V2 Phase 8, docs/MONTHLY_COMPETITION.md). Progress leads
 * DUELOS with the current month (details and previous months on demand);
 * DUPLA gets one row linking here. A live month never has a champion; the
 * tiebreak that decided is always written out. No celebration (Phase 9).
 */
import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { useApp } from "@/components/app-state";
import { cx } from "@/components/ui";
import { focusLabel } from "@/lib/progress";
import {
  MIN_OFFICIAL_DAYS,
  championName,
  monthAria,
  monthExecution,
  monthHeadline,
  monthScore,
  monthTitle,
  tiebreakLine,
  type Month,
} from "@/lib/monthly";

const M = t.monthly;

/** A closed-by-default disclosure: button (aria-expanded) + panel. */
export function Disclosure({
  label,
  children,
  testId,
  level = "plain",
}: {
  label: string;
  children: ReactNode;
  testId?: string;
  level?: "plain" | "h3";
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen((o) => !o)}
      data-testid={testId}
      className="flex min-h-11 w-full items-center justify-between font-mono text-meta font-normal tracking-eyebrow text-dim hover:text-text"
    >
      {label}
      <span
        aria-hidden="true"
        className={cx(
          "text-ghost transition-transform duration-200",
          open && "rotate-90",
        )}
      >
        ›
      </span>
    </button>
  );
  return (
    <div className="flex flex-col border-t border-line">
      {level === "h3" ? <h3 className="m-0">{button}</h3> : button}
      <div id={panelId} hidden={!open} className="flex flex-col pb-2">
        {children}
      </div>
    </div>
  );
}

function PhaseTag({ month }: { month: Month }) {
  return (
    <span
      data-testid="month-phase"
      className={cx(
        "flex items-center gap-1.5 font-mono text-meta tracking-eyebrow",
        month.final ? "text-muted" : "text-accent",
      )}
    >
      {!month.final && (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
      )}
      {month.final ? M.final : M.live}
    </span>
  );
}

function DetailRow({
  label,
  me,
  partner,
  testId,
}: {
  label: string;
  me: string;
  partner: string;
  testId: string;
}) {
  return (
    <div
      role="row"
      data-testid={testId}
      className="grid grid-cols-[1.2fr_1fr_1fr] items-baseline gap-2 border-t border-line py-2.5"
    >
      <span
        role="rowheader"
        className="font-mono text-meta tracking-meta text-muted"
      >
        {label}
      </span>
      <span role="cell" className="text-small tabular-nums">
        {me}
      </span>
      <span role="cell" className="text-small tabular-nums">
        {partner}
      </span>
    </div>
  );
}

/** Every number behind the month: wins, draws, execution, focus, tiebreak. */
function MonthDetail({ month, name }: { month: Month; name: string }) {
  const tiebreak = tiebreakLine(month);
  return (
    <div className="flex flex-col gap-2">
      <div role="table" aria-label={monthTitle(month.month)}>
        <div
          role="row"
          className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 pb-1.5 font-mono text-meta tracking-eyebrow text-dim"
        >
          <span role="columnheader" />
          <span role="columnheader">{M.you}</span>
          <span role="columnheader" className="truncate">
            {name.toUpperCase()}
          </span>
        </div>
        <DetailRow
          label={M.wins}
          me={String(month.me.wins)}
          partner={String(month.partner.wins)}
          testId="month-wins"
        />
        <DetailRow
          label={M.executionLabel}
          me={monthExecution(month.me)}
          partner={monthExecution(month.partner)}
          testId="month-execution"
        />
        <DetailRow
          label={M.focusLabel}
          me={focusLabel(month.me.focusSeconds)}
          partner={focusLabel(month.partner.focusSeconds)}
          testId="month-focus"
        />
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 pt-1 text-small">
        <dt className="font-mono text-meta tracking-meta text-muted">
          {M.drawsLabel}
        </dt>
        <dd data-testid="month-draws" className="m-0 tabular-nums">
          {month.draws}
        </dd>
        <dt className="font-mono text-meta tracking-meta text-muted">
          {M.insufficientDays}
        </dt>
        <dd data-testid="month-insufficient" className="m-0 tabular-nums">
          {month.insufficientDays}
        </dd>
        <dt className="font-mono text-meta tracking-meta text-muted">
          {M.tiebreakLabel}
        </dt>
        <dd data-testid="month-tiebreak-detail" className="m-0">
          {tiebreak ?? M.notNeeded}
        </dd>
      </dl>
    </div>
  );
}

/** The headline block of a month: state, score, draws, why. */
function MonthHead({ month, name }: { month: Month; name: string }) {
  const champion = championName(month, name);
  const tiebreak = tiebreakLine(month);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span
          data-testid="month-headline"
          className="font-mono text-small font-semibold tracking-eyebrow"
        >
          {monthHeadline(month, name)}
        </span>
        <span
          data-testid="month-score"
          className="shrink-0 font-mono text-small whitespace-nowrap text-muted tabular-nums"
        >
          {monthScore(month)}
        </span>
      </span>
      {champion && (
        <span data-testid="month-champion" className="text-title font-medium">
          {champion}
        </span>
      )}
      <span className="flex flex-wrap gap-x-3 font-mono text-meta tracking-meta text-dim">
        <span data-testid="month-draws-line">{M.draws(month.draws)}</span>
        {tiebreak && (
          <span data-testid="month-tiebreak" className="text-muted">
            {tiebreak}
          </span>
        )}
      </span>
      {month.officialDays < MIN_OFFICIAL_DAYS && (
        <span className="text-small text-dim">
          {M.minimum(month.officialDays)}
        </span>
      )}
    </div>
  );
}

/** Progress → DUELOS: the current month, its details, previous months. */
export function MonthSummary() {
  const { months, partner, hasPartner, userName } = useApp();
  if (!hasPartner) return null;
  const current = months[0];
  const previous = months.slice(1);
  return (
    <section
      id="month"
      aria-label={M.aria}
      data-testid="month-summary"
      className="flex scroll-mt-6 flex-col gap-3"
    >
      {!current ? (
        <>
          <h2 className="m-0 border-b border-line-strong pb-2 font-mono text-meta font-normal tracking-eyebrow text-muted">
            {M.title}
          </h2>
          <span className="text-small text-dim">{M.none}</span>
        </>
      ) : (
        <>
          <h2 className="m-0 flex items-baseline justify-between border-b border-line-strong pb-2 font-normal">
            <span
              data-testid="month-title"
              className="font-mono text-meta tracking-eyebrow text-muted"
            >
              {monthTitle(current.month)}
            </span>
            <PhaseTag month={current} />
          </h2>
          <div
            data-testid="month-current"
            aria-label={monthAria(current, userName, partner.name)}
            role="group"
          >
            <MonthHead month={current} name={partner.name} />
          </div>
          <div className="flex flex-col">
            <Disclosure label={M.details} testId="month-details-toggle">
              <div data-testid="month-current-details">
                <MonthDetail month={current} name={partner.name} />
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 pt-3 text-small leading-[1.45] text-muted">
                {M.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Disclosure>
            <Disclosure label={M.previous} testId="month-previous-toggle">
              {previous.length === 0 ? (
                <span className="py-2 text-small text-dim">{M.noPrevious}</span>
              ) : (
                <ol className="m-0 flex list-none flex-col p-0">
                  {previous.map((m) => (
                    <li
                      key={m.month}
                      data-testid="month-previous"
                      data-month={m.month}
                      aria-label={monthAria(m, userName, partner.name)}
                      className="flex flex-col gap-2 border-t border-line py-3"
                    >
                      <span className="flex items-baseline justify-between gap-3 font-mono text-meta tracking-eyebrow text-muted">
                        {monthTitle(m.month)}
                        <PhaseTag month={m} />
                      </span>
                      <MonthHead month={m} name={partner.name} />
                      <MonthDetail month={m} name={partner.name} />
                    </li>
                  ))}
                </ol>
              )}
            </Disclosure>
          </div>
        </>
      )}
    </section>
  );
}

/** DUPLA: one row — the current month — linking to Progress. */
export function MonthRow() {
  const { months, partner, hasPartner, userName } = useApp();
  const current = months[0];
  if (!hasPartner || !current) return null;
  return (
    <Link
      href="/progress#month"
      data-testid="month-row"
      aria-label={monthAria(current, userName, partner.name)}
      className="flex min-h-[56px] items-center justify-between gap-3 border-y border-line py-2.5"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 font-mono text-meta tracking-eyebrow text-dim">
          {M.title}
          <span aria-hidden="true">·</span>
          <PhaseTag month={current} />
        </span>
        <span className="truncate text-body">
          {M.duoRow(current.me.wins, current.partner.wins, partner.name)}
        </span>
      </span>
      <span aria-hidden="true" className="text-ghost">
        ›
      </span>
    </Link>
  );
}
