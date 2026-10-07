"use client";

/**
 * Daily Duel (V2 Phase 7, docs/DUEL.md). Three views of the same derived
 * duel: the compact card on Today, the detailed duel on Partner (numbers of
 * both sides + the rules) and the last 7 duels on Progress. Live never says
 * anyone won; VENCEU O DIA only on a final duel.
 */
import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useApp } from "@/components/app-state";
import { SectionHeader, cx } from "@/components/ui";
import {
  DUEL_CATEGORIES,
  categoryValue,
  duelHeadline,
  duelPhase,
  duelScore,
  type Duel,
  type Outcome,
} from "@/lib/duel";
import { dateLabel } from "@/lib/local-date";

function outcomeLabel(outcome: Outcome, partnerName: string): string {
  return outcome === "partner"
    ? t.duel.outcome.partner(partnerName)
    : t.duel.outcome[outcome];
}

/** "—" on screen; screen readers hear "não comparável". */
function OutcomeText({
  outcome,
  name,
  className,
}: {
  outcome: Outcome;
  name: string;
  className: string;
}) {
  const insufficient = outcome === "insufficient";
  return (
    <span
      className={cx(className, outcomeTone(outcome))}
      title={insufficient ? t.duel.notComparable : undefined}
    >
      <span aria-hidden={insufficient || undefined}>
        {outcomeLabel(outcome, name)}
      </span>
      {insufficient && <span className="sr-only">{t.duel.notComparable}</span>}
    </span>
  );
}

const outcomeTone = (outcome: Outcome) =>
  outcome === "me"
    ? "text-accent"
    : outcome === "partner"
      ? "text-text"
      : "text-dim";

function Phase({ duel }: { duel: Duel }) {
  return (
    <span
      data-testid="duel-phase"
      className={cx(
        "flex items-center gap-1.5 font-mono text-meta tracking-eyebrow",
        duel.final ? "text-muted" : "text-accent",
      )}
    >
      {!duel.final && (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
      )}
      {duelPhase(duel)}
    </span>
  );
}

function Headline({ duel, name }: { duel: Duel; name: string }) {
  const score = duelScore(duel);
  const { me, partner } = duel.score;
  // The scoreboard answers "who is ahead" before any rule is read.
  return (
    <div className="flex flex-col gap-2">
      {score && (
        <div
          data-testid="duel-score"
          className="flex items-center justify-between gap-3"
        >
          <span className="sr-only">{score}</span>
          <span aria-hidden="true" className="eyebrow text-muted">
            {t.duel.you}
          </span>
          <span
            aria-hidden="true"
            // Replays a short settle when the score changes.
            key={score}
            className="flex items-baseline gap-3 text-num-l leading-none font-medium tracking-number tabular-nums motion-safe:animate-[li-settle_.45s_var(--ease-settle)]"
          >
            <span className={me >= partner ? "text-text" : "text-dim"}>
              {me}
            </span>
            <span className="text-title text-ghost">—</span>
            <span className={partner >= me ? "text-text" : "text-dim"}>
              {partner}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="eyebrow max-w-[30%] truncate text-right text-muted"
          >
            {name.toUpperCase()}
          </span>
        </div>
      )}
      <span
        data-testid="duel-headline"
        className={cx(
          "font-mono text-small font-semibold tracking-eyebrow",
          score && "text-center",
        )}
      >
        {duelHeadline(duel, name)}
      </span>
    </div>
  );
}

/** Today: one line — state and score, the detail is on DUPLA. */
export function DuelCompact() {
  const { todayDuel: duel, partner } = useApp();
  if (!duel) return null;
  const headline = duelHeadline(duel, partner.name);
  const decided = duel.outcome !== "insufficient";
  return (
    <Link
      href="/partner#duel"
      data-testid="duel-today"
      aria-label={t.duel.dayAria(t.duel.title, duelPhase(duel), headline)}
      className="flex min-h-[56px] items-center justify-between gap-3 border-t border-line py-2.5 text-left"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 font-mono text-meta tracking-eyebrow text-dim">
          {t.todayScreen.duel}
          <span aria-hidden="true">·</span>
          <Phase duel={duel} />
        </span>
        <span
          data-testid="duel-today-score"
          className={cx(
            "truncate text-body",
            decided
              ? "text-text"
              : "font-mono text-meta tracking-eyebrow text-muted",
          )}
        >
          {decided
            ? t.todayScreen.duelScore(
                duel.score.me,
                duel.score.partner,
                partner.name,
              )
            : headline}
        </span>
      </span>
      <span aria-hidden="true" className="text-ghost">
        ›
      </span>
    </Link>
  );
}

/** Partner: every number behind each category, for both, and the rules. */
export function DuelDetailed() {
  const { todayDuel: duel, partner } = useApp();
  if (!duel) return null;
  const name = partner.name.toUpperCase();
  return (
    <section
      id="duel"
      aria-label={t.duel.aria}
      data-testid="duel-detailed"
      className="flex scroll-mt-6 flex-col gap-3.5"
    >
      <SectionHeader
        as="h2"
        label={t.duel.title}
        right={<Phase duel={duel} />}
      />
      <Headline duel={duel} name={partner.name} />
      <div role="table" aria-label={t.duel.aria} className="flex flex-col">
        <div
          role="row"
          className="grid grid-cols-[1.1fr_1fr_1fr_.9fr] gap-2 pb-1.5 font-mono text-meta tracking-eyebrow text-dim"
        >
          <span role="columnheader" />
          <span role="columnheader">{t.duel.you}</span>
          <span role="columnheader" className="truncate">
            {name}
          </span>
          <span role="columnheader" className="text-right" />
        </div>
        {DUEL_CATEGORIES.map((key) => {
          const outcome =
            duel.categories.find((c) => c.key === key)?.outcome ??
            "insufficient";
          return (
            <div
              key={key}
              role="row"
              data-testid={`duel-row-${key}`}
              className="grid grid-cols-[1.1fr_1fr_1fr_.9fr] items-baseline gap-2 border-t border-line py-2.5"
            >
              <span
                role="rowheader"
                className="font-mono text-meta tracking-eyebrow text-muted"
              >
                {t.duel.categories[key]}
              </span>
              <span role="cell" className="text-small tabular-nums">
                {categoryValue(key, duel.me)}
              </span>
              <span role="cell" className="text-small tabular-nums">
                {categoryValue(key, duel.partner)}
              </span>
              <span role="cell" className="min-w-0 text-right">
                <OutcomeText
                  outcome={outcome}
                  name={partner.name}
                  className="block truncate font-mono text-meta tracking-meta"
                />
              </span>
            </div>
          );
        })}
      </div>
      <details className="group border-t border-line pt-2.5">
        <summary className="flex h-9 cursor-pointer list-none items-center justify-between font-mono text-meta tracking-eyebrow text-dim hover:text-text [&::-webkit-details-marker]:hidden">
          {t.duel.rulesTitle}
          <span
            aria-hidden="true"
            className="text-ghost transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </summary>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 pt-1 text-small leading-[1.45] text-muted">
          {t.duel.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Progress: the last 7 days before today, each final or still live. */
export function DuelHistory() {
  const { pastDuels, partner, hasPartner } = useApp();
  if (!hasPartner) return null;
  return (
    <section
      aria-label={t.duel.last7Aria}
      data-testid="duel-history"
      className="flex flex-col"
    >
      <SectionHeader as="h2" label={t.duel.last7} />
      {pastDuels.length === 0 ? (
        <span className="pt-3 text-small text-dim">{t.duel.noHistory}</span>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {pastDuels.map((d) => {
            const headline = duelHeadline(d, partner.name);
            const score = duelScore(d);
            return (
              <li
                key={d.date}
                data-testid="duel-history-row"
                aria-label={t.duel.dayAria(
                  dateLabel(d.date),
                  duelPhase(d),
                  headline,
                )}
                className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 border-b border-line py-2.5"
              >
                <span className="font-mono text-meta tracking-meta text-muted tabular-nums">
                  {dateLabel(d.date)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-mono text-meta tracking-meta">
                    {headline}
                  </span>
                  <span
                    className={cx(
                      "font-mono text-meta tracking-eyebrow",
                      d.final ? "text-dim" : "text-accent",
                    )}
                  >
                    {duelPhase(d)}
                  </span>
                </span>
                <span className="font-mono text-meta text-muted tabular-nums">
                  {score}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
