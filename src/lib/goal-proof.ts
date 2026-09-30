/**
 * Goal → Action → Proof (V2 Phase 5, docs/GOAL_PROOF.md, ADR-064…068):
 * pure model and presentation, unit-tested. Proof is what the database
 * derives from real actions (my_goal_proof_summaries / my_goal_proofs):
 *   completed daily task linked to the goal = 1 action
 *   completed focus session linked to it   = its effective seconds
 *   completed milestone                    = 1 milestone
 * Never a score, never a percentage, never typed in by hand.
 */
import { t } from "@/i18n/pt-BR";
import { addDays, dateLabel, localTimeHM } from "@/lib/local-date";
import { rangeFrom, weekStartOf, type Range } from "@/lib/progress";
import type { GoalStatus } from "@/lib/goals";
import type { Database } from "@/types/database";

type Fns = Database["public"]["Functions"];
export type SummaryRow = Fns["my_goal_proof_summaries"]["Returns"][number];
export type ProofRow = Fns["my_goal_proofs"]["Returns"][number];

/** A goal as the pickers and labels need it (owner-only data). */
export type GoalOption = { id: string; title: string; status: GoalStatus };

export type ProofSummary = {
  actions: number;
  focusSeconds: number;
  milestones: number;
};

export const EMPTY_SUMMARY: ProofSummary = {
  actions: 0,
  focusSeconds: 0,
  milestones: 0,
};

export type ProofKind = "task" | "focus" | "milestone";

export type Proof = {
  kind: ProofKind;
  id: string;
  title: string;
  /** Local day it proves ("YYYY-MM-DD"): task date, focus start day, milestone day. */
  date: string;
  /** When it happened (completion / end), or null. */
  at: string | null;
  /** Effective focus seconds (pauses excluded); null for tasks / milestones. */
  focusSeconds: number | null;
};

/** Timeline page size (the database caps a page at 50). */
export const PROOF_PAGE = 20;

const isKind = (k: string): k is ProofKind =>
  k === "task" || k === "focus" || k === "milestone";

export function proofFromRow(r: ProofRow): Proof | null {
  if (!isKind(r.kind)) return null;
  return {
    kind: r.kind,
    id: r.id,
    title: r.title,
    date: r.proof_date,
    at: r.occurred_at,
    focusSeconds: r.kind === "focus" ? Math.max(0, r.focus_seconds ?? 0) : null,
  };
}

/** One summary per goal id (goals without proof are simply absent). */
export function summaryMap(rows: SummaryRow[]): Map<string, ProofSummary> {
  return new Map(
    rows.map((r) => [
      r.goal_id,
      {
        actions: Math.max(0, r.actions),
        focusSeconds: Math.max(0, r.focus_seconds),
        milestones: Math.max(0, r.milestones),
      },
    ]),
  );
}

export const hasProof = (
  s: ProofSummary | null | undefined,
): s is ProofSummary =>
  !!s && (s.actions > 0 || s.focusSeconds >= 60 || s.milestones > 0);

/** "1h35" · "1h05" · "2h" · "45 min" · "<1 min" · "0 min" (whole minutes, never rounded up). */
export function formatFocus(seconds: number): string {
  if (seconds > 0 && seconds < 60) return t.proof.underMinute;
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t.proof.minutes(m);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** ["3 ações", "2h15 de foco", "1 marco"] — only the parts that exist. */
export function summaryParts(s: ProofSummary): string[] {
  return [
    s.actions > 0 && t.proof.actions(s.actions),
    s.focusSeconds >= 60 && t.proof.focusOf(formatFocus(s.focusSeconds)),
    s.milestones > 0 && t.proof.milestones(s.milestones),
  ].filter((x): x is string => !!x);
}

/** This week: Monday → today (local dates, like the weekly competition). */
export const weekRange = (today: string) => ({
  from: weekStartOf(today),
  to: today,
});

/** Progress ranges (7D / 30D / 90D / ANO), ending today. */
export const periodRange = (range: Range, today: string) => ({
  from: rangeFrom(range, today),
  to: today,
});

/** "HOJE" · "ONTEM" · "SEG, 28 SET". */
export function dayHeading(date: string, today: string): string {
  if (date === today) return t.proof.today;
  if (date === addDays(today, -1)) return t.proof.yesterday;
  return dateLabel(date);
}

/** Newest day first; inside a day, the database order (newest first). */
export function groupByDay(
  proofs: Proof[],
  today: string,
): { date: string; heading: string; items: Proof[] }[] {
  const days: { date: string; heading: string; items: Proof[] }[] = [];
  for (const p of proofs) {
    const last = days[days.length - 1];
    if (last?.date === p.date) last.items.push(p);
    else
      days.push({
        date: p.date,
        heading: dayHeading(p.date, today),
        items: [p],
      });
  }
  return days;
}

/** Text of one line: what was done, and what kind of proof it is. */
export function proofLine(
  p: Proof,
  timeZone: string,
): { text: string; sub: string } {
  const time = p.at ? localTimeHM(p.at, timeZone) : "";
  if (p.kind === "focus")
    return {
      text: t.proof.focusLine(formatFocus(p.focusSeconds ?? 0), p.title),
      sub: [t.proof.focusDone, time].filter(Boolean).join(" · "),
    };
  if (p.kind === "milestone")
    return { text: p.title, sub: t.proof.milestoneDone };
  return {
    text: p.title,
    sub: [t.proof.taskDone, time].filter(Boolean).join(" · "),
  };
}

/** Merge a new page into the loaded proofs (a proof never shows twice). */
export function appendPage(loaded: Proof[], page: Proof[]): Proof[] {
  const seen = new Set(loaded.map((p) => `${p.kind}:${p.id}`));
  return [...loaded, ...page.filter((p) => !seen.has(`${p.kind}:${p.id}`))];
}

/**
 * Progress "PROGRESSO DAS METAS": at most `n` goals WITH proof in the period,
 * most actions first, then most focus, then title. Any status: an archived
 * goal's proof is still history.
 */
export function topGoals(
  goals: GoalOption[],
  summaries: Map<string, ProofSummary>,
  n = 3,
): { goal: GoalOption; summary: ProofSummary }[] {
  return goals
    .map((goal) => ({ goal, summary: summaries.get(goal.id) }))
    .filter((x): x is { goal: GoalOption; summary: ProofSummary } =>
      hasProof(x.summary),
    )
    .sort(
      (a, b) =>
        b.summary.actions - a.summary.actions ||
        b.summary.focusSeconds - a.summary.focusSeconds ||
        a.goal.title.localeCompare(b.goal.title),
    )
    .slice(0, n);
}

/** Goals that can take a new action: active only, alphabetically. */
export const linkableGoals = (goals: GoalOption[]) =>
  goals
    .filter((g) => g.status === "active")
    .sort((a, b) => a.title.localeCompare(b.title));

/**
 * A goal id from a draft or a link (e.g. "?goal="): kept only while it is
 * still one of my ACTIVE goals; anything else becomes "no goal".
 */
export function linkableGoalId(
  id: string | null | undefined,
  goals: GoalOption[],
): string | null {
  if (!id) return null;
  return goals.some((g) => g.id === id && g.status === "active") ? id : null;
}
