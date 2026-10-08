"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useState } from "react";
import { loadMoreProofs } from "@/app/(app)/proof-actions";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import {
  appendPage,
  formatFocus,
  groupByDay,
  proofLine,
  type Proof,
  type ProofKind,
  type ProofSummary,
} from "@/lib/goal-proof";
import { goalTypeLabel, type Goal } from "@/lib/goals";
import { scheduleLabel } from "@/lib/today";

const h2 =
  "border-b border-line-strong pb-2 font-mono text-meta font-normal tracking-eyebrow text-muted";
const MARK: Record<ProofKind, string> = {
  task: "✓",
  focus: "◷",
  milestone: "◆",
};

/**
 * One goal and its proof (V2 Phase 5, docs/GOAL_PROOF.md): what was DONE for
 * it — completed tasks, completed focus (effective time), completed
 * milestones. Evidence, not points: no score, no percentage.
 */
export function GoalDetailScreen({
  goal,
  week,
  proofs: firstPage,
  more: firstMore,
}: {
  goal: Goal;
  week: ProofSummary;
  proofs: Proof[];
  more: boolean;
}) {
  const app = useApp();
  const { me } = useSession();
  const [proofs, setProofs] = useState(firstPage);
  const [more, setMore] = useState(firstMore);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const active = goal.status === "active";

  async function loadMore() {
    setLoading(true);
    const res = await loadMoreProofs(goal.id, proofs.length).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      app.toast({
        text: res && !res.ok ? res.error : t.proof.errors.load,
        sub: t.proof.latest,
      });
      return;
    }
    setProofs((p) => appendPage(p, res.proofs));
    setMore(res.more);
  }

  async function link(routineId: string, on: boolean, name: string) {
    const ok = await app.linkRoutine(routineId, on ? goal.id : null);
    if (!ok) return;
    setPicking(false);
    app.toast({
      text: on ? t.proof.linkedToast : t.proof.unlinkedToast,
      sub: name.toUpperCase(),
    });
  }

  const linkedRoutines = app.routines.filter(
    (r) => app.routineGoals[r.id] === goal.id,
  );
  const linkedToday = app.tasks.filter(
    (x) => x.once && !x.done && app.taskGoals[x.id] === goal.id,
  );
  const linkable = app.routines.filter(
    (r) => app.routineGoals[r.id] !== goal.id,
  );
  const weekLines = [
    week.actions > 0 && {
      mark: MARK.task,
      text: t.proof.actions(week.actions),
    },
    week.focusSeconds >= 60 && {
      mark: MARK.focus,
      text: t.proof.focusOf(formatFocus(week.focusSeconds)),
    },
    week.milestones > 0 && {
      mark: MARK.milestone,
      text: t.proof.milestones(week.milestones),
    },
  ].filter((x) => !!x);

  return (
    <div className="flex flex-col gap-8 animate-[li-fade-up_.4s_ease] desk:gap-10">
      <div className="flex flex-col gap-3">
        <Link
          href="/goals"
          aria-label={t.proof.backAria}
          className="flex h-9 items-center self-start font-mono text-meta tracking-eyebrow text-dim hover:text-text"
        >
          ‹ {t.proof.back}
        </Link>
        <span className="font-mono text-meta tracking-eyebrow text-dim">
          {goalTypeLabel(goal.type)}
          {!active &&
            ` · ${goal.status === "achieved" ? t.goals.statusAchieved : t.goals.statusArchived}`}
        </span>
        <h1 className="page-title">{goal.title}</h1>
        {!active && (
          <p className="m-0 text-small text-muted">{t.proof.inactive}</p>
        )}
      </div>

      <section aria-labelledby="proof-week" className="flex flex-col gap-3">
        <h2 id="proof-week" className={h2}>
          {t.proof.thisWeek}
        </h2>
        {weekLines.length === 0 ? (
          <p className="m-0 text-body text-dim">{t.proof.noneWeek}</p>
        ) : (
          <ul
            data-testid="proof-week"
            className="m-0 flex list-none flex-col gap-2 p-0"
          >
            {weekLines.map((l) => (
              <li key={l.mark} className="flex items-baseline gap-3 text-lead">
                <span
                  aria-hidden="true"
                  className="w-4 text-center text-accent"
                >
                  {l.mark}
                </span>
                <span className="tabular-nums">{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {active && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => app.openSheet({ kind: "add", goalId: goal.id })}
            className="h-12 rounded-xl border border-line-strong font-mono text-meta font-semibold tracking-eyebrow"
          >
            {t.proof.createTask}
          </button>
          <Link
            href={`/focus?goal=${goal.id}`}
            className="flex h-12 items-center justify-center rounded-xl btn-primary font-mono text-meta font-bold tracking-[0.2em]"
          >
            {t.proof.startFocus}
          </Link>
        </div>
      )}

      <section aria-labelledby="proof-latest" className="flex flex-col gap-3">
        <h2 id="proof-latest" className={h2}>
          {t.proof.latest}
        </h2>
        {proofs.length === 0 ? (
          <p className="m-0 text-body text-dim">{t.proof.none}</p>
        ) : (
          <div data-testid="proof-timeline" className="flex flex-col gap-5">
            {groupByDay(proofs, app.today).map((day) => (
              <section
                key={day.date}
                aria-labelledby={`proof-day-${day.date}`}
                className="flex flex-col gap-1"
              >
                <h3
                  id={`proof-day-${day.date}`}
                  className="m-0 font-mono text-meta font-normal tracking-eyebrow text-dim"
                >
                  {day.heading}
                </h3>
                <ul className="m-0 flex list-none flex-col p-0">
                  {day.items.map((p) => {
                    const line = proofLine(p, me.timezone);
                    return (
                      <li
                        key={`${p.kind}:${p.id}`}
                        data-kind={p.kind}
                        className="flex items-start gap-3 border-b border-line py-2.5"
                      >
                        <span
                          aria-hidden="true"
                          className="w-4 pt-0.5 text-center text-accent"
                        >
                          {MARK[p.kind]}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-body text-pretty">
                            {line.text}
                          </span>
                          <span className="font-mono text-meta tracking-meta text-dim tabular-nums">
                            {line.sub}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {more && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loading}
                className="h-11 self-start rounded-xl border border-line-strong px-4 font-mono text-meta tracking-eyebrow text-muted"
              >
                {loading ? t.proof.loading : t.proof.loadMore}
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="proof-linked" className="flex flex-col gap-3">
        <h2 id="proof-linked" className={h2}>
          {t.proof.linked}
        </h2>
        {linkedRoutines.length === 0 && linkedToday.length === 0 && (
          <p className="m-0 text-body text-dim">{t.proof.linkedNone}</p>
        )}
        {linkedRoutines.length > 0 && (
          <ul
            aria-label={t.proof.routines}
            className="m-0 flex list-none flex-col p-0"
          >
            {linkedRoutines.map((r) => (
              <li
                key={r.id}
                className="flex min-h-[56px] items-center gap-3 border-b border-line"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body">{r.name}</span>
                  <span className="font-mono text-meta tracking-meta text-dim">
                    {scheduleLabel(r.days)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void link(r.id, false, r.name)}
                  aria-label={t.proof.unlink(r.name)}
                  className="flex size-11 items-center justify-center rounded-lg text-dim hover:bg-white/4 hover:text-text"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {linkedToday.length > 0 && (
          <ul
            aria-label={t.proof.upcoming}
            className="m-0 flex list-none flex-col p-0"
          >
            {linkedToday.map((x) => (
              <li
                key={x.id}
                className="flex min-h-12 flex-col justify-center gap-0.5 border-b border-line"
              >
                <span className="truncate text-body">{x.name}</span>
                <span className="font-mono text-meta tracking-meta text-dim">
                  {t.proof.today}
                </span>
              </li>
            ))}
          </ul>
        )}
        {active && !picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-expanded={false}
            className="h-11 self-start rounded-xl border border-dashed border-line-strong px-4 font-mono text-meta tracking-eyebrow text-muted"
          >
            + {t.proof.linkAction}
          </button>
        )}
        {active && picking && (
          <div
            role="group"
            aria-labelledby="link-pick"
            className="flex flex-col gap-2 rounded-2xl border border-line-strong p-4"
          >
            <span id="link-pick" className="text-small text-muted">
              {linkable.length ? t.proof.linkPick : t.proof.linkNone}
            </span>
            {linkable.map((r) => {
              const other = app.routineGoals[r.id]
                ? app.goals.find((g) => g.id === app.routineGoals[r.id])
                : undefined;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void link(r.id, true, r.name)}
                  aria-label={t.proof.linkRoutine(r.name)}
                  className="flex min-h-12 flex-col items-start justify-center gap-0.5 rounded-xl border border-line-strong bg-raised px-3 py-2 text-left"
                >
                  <span className="text-body">{r.name}</span>
                  <span
                    className={cx("font-mono text-meta tracking-meta text-dim")}
                  >
                    {[
                      scheduleLabel(r.days),
                      other && t.goalPicker.tag(other.title),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="h-10 self-start text-body text-dim"
            >
              {t.taskSheet.cancel}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
