/**
 * Monthly Champion (V2 Phase 8, docs/MONTHLY_COMPETITION.md). Pure logic on
 * the per-day duel numbers of `duo_duel_months()`: each FINAL day is decided
 * by the existing Daily Duel rules (`decideDuel`, never a copy) and the month
 * by days won — no points, no stored result.
 *
 * - Only FINAL days count; today and any open day never do.
 * - Official day = a win or a draw. At least 3 in the month, otherwise there
 *   is no result (also no live leader).
 * - More daily wins → tiebreak 1: monthly Execution, Σ completed / Σ planned
 *   over the FINAL days where both had tasks, exact ratio → tiebreak 2: total
 *   effective focus seconds of the FINAL days → draw. A tiebreak with nothing
 *   to compare does not decide.
 * - A month is FINAL when its last calendar day is a FINAL duel (the Phase 7
 *   closing); before that it is live and never has a champion.
 * No Supabase imports.
 */
import { t } from "@/i18n/pt-BR";
import { decideDuel, type DuelRow } from "@/lib/duel";
import { compareRatio } from "@/lib/progress";

/** Months loaded: the current one and the 5 before it. */
export const MONTHS = 6;
/** Official days (a win or a draw) a month needs before anyone leads it. */
export const MIN_OFFICIAL_DAYS = 3;

export type MonthSide = {
  /** Daily duels won (FINAL days). */
  wins: number;
  /** Execution over the FINAL days where both had tasks. */
  completed: number;
  planned: number;
  /** Effective focus seconds of the FINAL days (pauses never count). */
  focusSeconds: number;
};

export type MonthState = "live" | "final" | "insufficient";
export type MonthLeader = "me" | "partner" | "draw" | null;
export type DecidedBy =
  "daily_wins" | "execution" | "focus" | "draw" | "insufficient";

export type Month = {
  /** First day of the month, YYYY-MM-01. */
  month: string;
  final: boolean;
  me: MonthSide;
  partner: MonthSide;
  draws: number;
  /** FINAL days without a result (SEM RESULTADO SUFICIENTE). */
  insufficientDays: number;
  /** FINAL days with a result: wins + draws. */
  officialDays: number;
  /** Days of the month not final yet (today, a day still open for one side). */
  openDays: number;
  state: MonthState;
  leader: MonthLeader;
  decidedBy: DecidedBy;
};

const side = (): MonthSide => ({
  wins: 0,
  completed: 0,
  planned: 0,
  focusSeconds: 0,
});

/** "2026-02-01" → "2026-02-28" (calendar month, no time zone involved). */
export function lastDayOfMonth(monthStart: string): string {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthStart.slice(0, 8)}${String(days).padStart(2, "0")}`;
}

export const monthOf = (dateISO: string) => `${dateISO.slice(0, 7)}-01`;

/**
 * Who leads a month and why, from its totals. Same rule live and final; the
 * caller decides the wording (a live month never has a champion).
 */
export function decideMonth(
  m: Pick<Month, "me" | "partner" | "officialDays">,
): {
  leader: MonthLeader;
  decidedBy: DecidedBy;
} {
  if (m.officialDays < MIN_OFFICIAL_DAYS)
    return { leader: null, decidedBy: "insufficient" };
  if (m.me.wins !== m.partner.wins)
    return {
      leader: m.me.wins > m.partner.wins ? "me" : "partner",
      decidedBy: "daily_wins",
    };
  if (m.me.planned > 0 && m.partner.planned > 0) {
    const c = compareRatio(m.me, m.partner);
    if (c !== 0)
      return { leader: c > 0 ? "me" : "partner", decidedBy: "execution" };
  }
  if (m.me.focusSeconds !== m.partner.focusSeconds)
    return {
      leader: m.me.focusSeconds > m.partner.focusSeconds ? "me" : "partner",
      decidedBy: "focus",
    };
  return { leader: "draw", decidedBy: "draw" };
}

/**
 * The months of the rows (newest first), each decided. `rows` are the
 * database's per-day numbers; open days never count.
 */
export function buildMonths(rows: DuelRow[]): Month[] {
  const byMonth = new Map<string, DuelRow[]>();
  for (const r of rows) {
    const key = monthOf(r.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), r]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([month, days]) => {
      const me = side();
      const partner = side();
      let draws = 0;
      let insufficientDays = 0;
      let openDays = 0;
      for (const row of days) {
        if (!row.isFinal) {
          openDays += 1;
          continue;
        }
        const duel = decideDuel(row);
        if (duel.outcome === "me") me.wins += 1;
        else if (duel.outcome === "partner") partner.wins += 1;
        else if (duel.outcome === "tie") draws += 1;
        else insufficientDays += 1;
        if (row.me.planned > 0 && row.partner.planned > 0) {
          me.completed += row.me.completed;
          me.planned += row.me.planned;
          partner.completed += row.partner.completed;
          partner.planned += row.partner.planned;
        }
        me.focusSeconds += row.me.focusSeconds;
        partner.focusSeconds += row.partner.focusSeconds;
      }
      const officialDays = me.wins + partner.wins + draws;
      const last = lastDayOfMonth(month);
      const final =
        openDays === 0 && days.some((d) => d.date === last && d.isFinal);
      const { leader, decidedBy } = decideMonth({ me, partner, officialDays });
      const state: MonthState = !final
        ? "live"
        : decidedBy === "insufficient"
          ? "insufficient"
          : "final";
      return {
        month,
        final,
        me,
        partner,
        draws,
        insufficientDays,
        officialDays,
        openDays,
        state,
        leader,
        decidedBy,
      };
    });
}

// ---- labels -------------------------------------------------------------------

/** "OUTUBRO 2026" */
export const monthTitle = (month: string) =>
  `${t.dates.monthsLong[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** "OUTUBRO" */
export const monthName = (month: string) =>
  t.dates.monthsLong[Number(month.slice(5, 7)) - 1];

/**
 * The headline. Live: ESTÁ NA FRENTE / EMPATADOS / SEM RESULTADO SUFICIENTE
 * AINDA — never a champion. Final: CAMPEÃO DE <MÊS> / EMPATE DO MÊS / SEM
 * RESULTADO SUFICIENTE NO MÊS.
 */
export function monthHeadline(m: Month, partnerName: string): string {
  const c = t.monthly;
  if (!m.final) {
    if (m.leader === null) return c.liveInsufficient;
    if (m.leader === "draw") return c.liveTied;
    return m.leader === "me" ? c.youAhead : c.ahead(partnerName);
  }
  if (m.leader === null) return c.finalInsufficient;
  if (m.leader === "draw") return c.finalDraw;
  return c.champion(monthName(m.month));
}

/** The champion's name on a final month (VOCÊ / the partner), else null. */
export function championName(m: Month, partnerName: string): string | null {
  if (!m.final || (m.leader !== "me" && m.leader !== "partner")) return null;
  return m.leader === "me" ? t.monthly.you : partnerName.toUpperCase();
}

/** "8 — 5" (days won). */
export const monthScore = (m: Month) =>
  t.monthly.score(m.me.wins, m.partner.wins);

/** Why the leader leads: null when the daily wins already decide. */
export function tiebreakLine(m: Month): string | null {
  if (m.decidedBy === "execution") return t.monthly.tiebreak.execution;
  if (m.decidedBy === "focus") return t.monthly.tiebreak.focus;
  if (m.decidedBy === "draw") return t.monthly.tiebreak.none;
  return null;
}

/** Screen-reader sentence: "Brendon lidera Matheus por 8 vitórias a 5." */
export function monthAria(m: Month, myName: string, partnerName: string) {
  const c = t.monthly;
  const title = monthTitle(m.month);
  const phase = m.final ? c.final : c.live;
  if (m.leader === null || m.leader === "draw")
    return `${title}, ${phase}: ${monthHeadline(m, partnerName)}. ${c.ariaScore(myName, m.me.wins, partnerName, m.partner.wins)}`;
  const [lead, lw, other, ow] =
    m.leader === "me"
      ? [myName, m.me.wins, partnerName, m.partner.wins]
      : [partnerName, m.partner.wins, myName, m.me.wins];
  return `${title}, ${phase}: ${m.final ? c.ariaChampion(lead, other, lw, ow) : c.ariaLeads(lead, other, lw, ow)}${
    tiebreakLine(m) ? ` ${tiebreakLine(m)}.` : ""
  }`;
}

/** "88%" of a month side's execution, or "—" without eligible days. */
export const monthExecution = (s: MonthSide) =>
  s.planned === 0
    ? "—"
    : t.monthly.execution(
        s.completed,
        s.planned,
        Math.round((100 * s.completed) / s.planned),
      );
