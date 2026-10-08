/**
 * Daily Duel (V2 Phase 7, docs/DUEL.md). Pure logic: the integers of
 * `duo_duels()` (plus my live state for today) → three categories → the
 * result of the day. Every rule reuses an existing definition — no new
 * formula, no score, no stored result:
 *
 * - Execution: completion ratio (Progress), exact comparison (`compareRatio`);
 *   both sides need planned > 0.
 * - Focus: effective focus seconds of the day, compared exactly (pauses never
 *   count). 0 vs 0 is NEUTRAL / not comparable — the absence of focus never
 *   counts as a decided category (ADR-075).
 * - Consistency: each side's Daily Standard (`standardMet`, the Progress
 *   rule). MET beats NOT_MET; equal states tie; a NEUTRAL side (no task) makes
 *   the category not comparable.
 *
 * The day: more categories won wins; equal = tie; nothing decided =
 * insufficient. A live duel only has a leader — "won" exists only when final.
 * No Supabase imports.
 */
import { t } from "@/i18n/pt-BR";
import { activeSeconds, type FocusTimes } from "@/lib/focus";
import { compareRatio, standardMet } from "@/lib/progress";

/** Days loaded: today and the last 7 days before it. */
export const DUEL_DAYS = 8;

export type DuelSide = {
  planned: number;
  completed: number;
  /**
   * The member's Daily Standard (1–100) in force on that day: the version of
   * the day for a closed day, the current one for an open day (ADR-076).
   */
  standard: number;
  /** Effective focus seconds of the day (settled + the running session). */
  focusSeconds: number;
  /** A session of that day is still running (its time is added live). */
  focusRunning: boolean;
};

export type DuelRow = {
  date: string;
  /** Closed for both members and no running session (the database's call). */
  isFinal: boolean;
  me: DuelSide;
  partner: DuelSide;
};

export const DUEL_CATEGORIES = ["execution", "focus", "consistency"] as const;
export type DuelCategory = (typeof DUEL_CATEGORIES)[number];
export type Outcome = "me" | "partner" | "tie" | "insufficient";
export type StandardState = "met" | "not_met" | "neutral";

export type CategoryResult = {
  key: DuelCategory;
  outcome: Outcome;
};

export type Duel = {
  date: string;
  final: boolean;
  me: DuelSide;
  partner: DuelSide;
  categories: CategoryResult[];
  /** Categories won by each side. */
  score: { me: number; partner: number };
  outcome: Outcome;
};

const sign = (n: number): Outcome => (n > 0 ? "me" : n < 0 ? "partner" : "tie");

export function executionOutcome(me: DuelSide, partner: DuelSide): Outcome {
  if (me.planned === 0 || partner.planned === 0) return "insufficient";
  return sign(compareRatio(me, partner));
}

export function focusOutcome(me: DuelSide, partner: DuelSide): Outcome {
  const a = Math.max(0, Math.floor(me.focusSeconds));
  const b = Math.max(0, Math.floor(partner.focusSeconds));
  if (a === 0 && b === 0) return "insufficient";
  return sign(a - b);
}

/** The existing Daily Standard of a day: MET / NOT_MET / NEUTRAL (no task). */
export function standardState(side: DuelSide): StandardState {
  if (side.planned === 0) return "neutral";
  return standardMet(side.planned, side.completed, side.standard)
    ? "met"
    : "not_met";
}

export function consistencyOutcome(me: DuelSide, partner: DuelSide): Outcome {
  const a = standardState(me);
  const b = standardState(partner);
  if (a === "neutral" || b === "neutral") return "insufficient";
  if (a === b) return "tie";
  return a === "met" ? "me" : "partner";
}

const OUTCOME: Record<DuelCategory, (a: DuelSide, b: DuelSide) => Outcome> = {
  execution: executionOutcome,
  focus: focusOutcome,
  consistency: consistencyOutcome,
};

export function decideDuel(row: DuelRow): Duel {
  const categories = DUEL_CATEGORIES.map((key) => ({
    key,
    outcome: OUTCOME[key](row.me, row.partner),
  }));
  const score = {
    me: categories.filter((c) => c.outcome === "me").length,
    partner: categories.filter((c) => c.outcome === "partner").length,
  };
  const decided = categories.some((c) => c.outcome !== "insufficient");
  return {
    date: row.date,
    final: row.isFinal,
    me: row.me,
    partner: row.partner,
    categories,
    score,
    outcome: !decided ? "insufficient" : sign(score.me - score.partner),
  };
}

// ---- live ---------------------------------------------------------------------

/**
 * A side with its running session added: the database returns the settled
 * seconds and a running flag; the session clock (mine, or
 * `partner_current_focus()`) is derived locally — nothing is fetched per tick.
 */
export function withRunning(
  side: DuelSide,
  session: FocusTimes | null,
  nowMs: number,
): DuelSide {
  if (!side.focusRunning || !session || session.status === "completed")
    return side;
  return {
    ...side,
    focusSeconds: side.focusSeconds + activeSeconds(session, nowMs),
  };
}

/**
 * The rows as shown: today's side of mine comes from the screen (tasks just
 * checked off, my focus clock, my standard) — the same live numbers as
 * Progress; the partner's running session ticks locally.
 */
export function liveDuels(
  rows: DuelRow[],
  today: string,
  mine: {
    planned: number;
    completed: number;
    standard: number;
    focusSeconds: number;
  },
  sessions: { me: FocusTimes | null; partner: FocusTimes | null },
  nowMs: number,
): Duel[] {
  return rows.map((row) =>
    decideDuel({
      ...row,
      isFinal: row.date === today ? false : row.isFinal,
      me:
        row.date === today
          ? { ...row.me, ...mine, focusRunning: false }
          : withRunning(row.me, sessions.me, nowMs),
      partner: withRunning(row.partner, sessions.partner, nowMs),
    }),
  );
}

// ---- labels -------------------------------------------------------------------

/**
 * The headline of a duel. Live: never "won" — ESTÁ NA FRENTE / EMPATE /
 * SEM RESULTADO SUFICIENTE. Final: VENCEU O DIA / EMPATE / SEM RESULTADO
 * SUFICIENTE.
 */
export function duelHeadline(duel: Duel, partnerName: string): string {
  const d = t.duel;
  if (duel.outcome === "insufficient") return d.insufficient;
  if (duel.outcome === "tie") return d.tie;
  if (duel.final) return duel.outcome === "me" ? d.youWon : d.won(partnerName);
  return duel.outcome === "me" ? d.youAhead : d.ahead(partnerName);
}

/** RESULTADO FINAL or AO VIVO. */
export const duelPhase = (duel: Duel) =>
  duel.final ? t.duel.final : t.duel.live;

/** "2–1" (categories won), only when something was decided. */
export function duelScore(duel: Duel): string {
  return duel.outcome === "insufficient"
    ? ""
    : t.duel.score(duel.score.me, duel.score.partner);
}

/** What a category shows for one side. */
export function categoryValue(key: DuelCategory, side: DuelSide): string {
  if (key === "execution")
    return side.planned === 0
      ? t.duel.noTasks
      : t.duel.execution(side.completed, side.planned);
  if (key === "focus") return t.duel.focus(side.focusSeconds);
  return t.duel.standard[standardState(side)];
}

/**
 * V3 — my share of a category for the duel's bar (0..1), from the same
 * numbers the category shows; null when neither side has anything to
 * compare (the bar then stays even). Presentation only: never a rule.
 */
export function categoryShare(
  key: DuelCategory,
  me: DuelSide,
  partner: DuelSide,
): number | null {
  const value = (side: DuelSide) =>
    key === "execution"
      ? side.planned
        ? side.completed / side.planned
        : 0
      : key === "focus"
        ? side.focusSeconds
        : standardState(side) === "met"
          ? 1
          : 0;
  const a = value(me);
  const b = value(partner);
  return a + b > 0 ? a / (a + b) : null;
}
