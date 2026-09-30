/**
 * Duo Accountability 2.0 (V2 Phase 6, docs/ACCOUNTABILITY.md). Pure logic:
 * commitment rows → view models, the partner projection, nudge availability
 * and the day's check-in. The database decides everything (status, proof,
 * MISSED, limits); these helpers only mirror it for the interface so a button
 * is disabled before the database would refuse it. No Supabase imports.
 */
import { t } from "@/i18n/pt-BR";
import { localTimeHM } from "@/lib/local-date";

export const COMMITMENT_KINDS = [
  "task",
  "focus",
  "standard",
  "simple",
] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

/** Stored status + MISSED, which is derived (ACTIVE on a closed day). */
export type CommitmentStatus = "active" | "proven" | "cancelled" | "missed";
export type Resolution = "verified" | "self_declared";
export type ProofKind = "task" | "focus" | "standard" | "self";

export const CHECKIN_STATES = [
  "LOCKED_IN",
  "NEED_ACCOUNTABILITY",
  "HARD_DAY",
] as const;
export type CheckinState = (typeof CHECKIN_STATES)[number];

/** Mirrors the database limits (docs/ACCOUNTABILITY.md → Limits). */
export const TITLE_MAX = 80;
export const DAILY_COMMITMENTS = 5;
export const FOCUS_MIN_MINUTES = 5;
export const FOCUS_MAX_MINUTES = 720;
export const NUDGE_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const NUDGES_PER_DAY = 3;
/** Short history shown on the Partner Hub. */
export const HISTORY_DAYS = 14;

/** duo_commitments() row. */
export type CommitmentRow = {
  id: string;
  owner_id: string;
  commit_date: string;
  title: string;
  kind: string;
  focus_target_seconds: number | null;
  standard_percent: number | null;
  status: string;
  resolution: string | null;
  proof_kind: string | null;
  proven_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  closed: boolean;
};

export type Commitment = {
  id: string;
  ownerId: string;
  /** The owner's local day "YYYY-MM-DD". */
  date: string;
  title: string;
  kind: CommitmentKind;
  focusTargetSeconds: number | null;
  standardPercent: number | null;
  status: CommitmentStatus;
  resolution: Resolution | null;
  proofKind: ProofKind | null;
  provenAt: string | null;
  createdAt: string;
  /** The owner's day is closed: the result is final. */
  closed: boolean;
};

export type NudgeRow = {
  id: string;
  from_user: string;
  to_user: string;
  commitment_id: string;
  recipient_date: string;
  created_at: string;
};

export type CheckinRow = {
  user_id: string;
  local_date: string;
  state: string;
  created_at: string;
};

const isKind = (k: string): k is CommitmentKind =>
  (COMMITMENT_KINDS as readonly string[]).includes(k);
export const isCheckinState = (s: unknown): s is CheckinState =>
  typeof s === "string" && (CHECKIN_STATES as readonly string[]).includes(s);

/**
 * The status the interface shows. The database already returns "missed";
 * this keeps the rule in one tested place for rows read otherwise.
 */
export function effectiveStatus(
  status: string,
  closed: boolean,
): CommitmentStatus {
  if (status === "proven" || status === "cancelled") return status;
  return closed ? "missed" : "active";
}

export function commitmentFromRow(r: CommitmentRow): Commitment | null {
  if (!isKind(r.kind)) return null;
  const status = effectiveStatus(r.status, r.closed);
  const proven = status === "proven";
  return {
    id: r.id,
    ownerId: r.owner_id,
    date: r.commit_date,
    title: r.title,
    kind: r.kind,
    focusTargetSeconds: r.focus_target_seconds,
    standardPercent: r.standard_percent,
    status,
    resolution: proven
      ? r.resolution === "self_declared"
        ? "self_declared"
        : "verified"
      : null,
    proofKind: proven ? ((r.proof_kind as ProofKind | null) ?? null) : null,
    provenAt: proven ? r.proven_at : null,
    createdAt: r.created_at,
    closed: r.closed,
  };
}

/**
 * What the partner's side of the interface may use: the public title, the
 * status, the generic proof kind and the proof time. Nothing else from the
 * row (never a task, a goal or a source) — ADR-070.
 */
export type PartnerCommitment = Pick<
  Commitment,
  "id" | "title" | "status" | "resolution" | "proofKind" | "provenAt" | "date"
>;

export function partnerProjection(c: Commitment): PartnerCommitment {
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    resolution: c.resolution,
    proofKind: c.proofKind,
    provenAt: c.provenAt,
    date: c.date,
  };
}

/** "Tarefa concluída · 09:54", "AUTODECLARADO · 21:10"… (viewer's timezone). */
export function proofLine(
  c: Pick<Commitment, "status" | "proofKind" | "resolution" | "provenAt">,
  timeZone: string,
): string | null {
  if (c.status !== "proven" || !c.provenAt || !c.proofKind) return null;
  const at = localTimeHM(c.provenAt, timeZone);
  // Self-declared reads "Marcado como cumprido"; the AUTODECLARADO label is
  // shown next to the status.
  return t.accountability.proofLine(
    t.accountability.proofKinds[c.proofKind],
    at,
  );
}

/** What the commitment asks for, e.g. "FOCO · 60 MIN" or "PADRÃO · 80%". */
export function kindLine(
  c: Pick<Commitment, "kind" | "focusTargetSeconds" | "standardPercent">,
): string {
  if (c.kind === "focus" && c.focusTargetSeconds)
    return t.accountability.kindFocus(Math.round(c.focusTargetSeconds / 60));
  if (c.kind === "standard" && c.standardPercent)
    return t.accountability.kindStandard(c.standardPercent);
  return t.accountability.kindShort[c.kind];
}

export type NudgeBlock = "self" | "closed" | "cooldown" | "limit";

/**
 * May I nudge this commitment now? Mirrors private.guard_nudge: never my
 * own, only ACTIVE on an open day, one per commitment every 2 h, at most 3
 * per recipient day. The recipient's day is the commitment's date (an open
 * commitment always belongs to its owner's current day).
 */
export function nudgeBlock(
  c: Pick<Commitment, "id" | "ownerId" | "status" | "closed" | "date">,
  myId: string,
  nudges: NudgeRow[],
  now: number,
): NudgeBlock | null {
  if (c.ownerId === myId) return "self";
  if (c.status !== "active" || c.closed) return "closed";
  const mine = nudges.filter(
    (n) => n.from_user === myId && n.to_user === c.ownerId,
  );
  if (
    mine.some(
      (n) =>
        n.commitment_id === c.id &&
        now - Date.parse(n.created_at) < NUDGE_COOLDOWN_MS,
    )
  )
    return "cooldown";
  if (mine.filter((n) => n.recipient_date === c.date).length >= NUDGES_PER_DAY)
    return "limit";
  return null;
}

/** Milliseconds until the cooldown on this commitment ends (0 = free). */
export function nudgeCooldownLeft(
  commitmentId: string,
  myId: string,
  nudges: NudgeRow[],
  now: number,
): number {
  const last = nudges
    .filter((n) => n.from_user === myId && n.commitment_id === commitmentId)
    .reduce((m, n) => Math.max(m, Date.parse(n.created_at)), 0);
  return last ? Math.max(0, last + NUDGE_COOLDOWN_MS - now) : 0;
}

/** The latest check-in of a user for a local day (history stays in the database). */
export function currentCheckin(
  rows: CheckinRow[],
  userId: string,
  day: string | null,
): CheckinState | null {
  if (!day) return null;
  const latest = rows
    .filter((r) => r.user_id === userId && r.local_date === day)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return latest && isCheckinState(latest.state) ? latest.state : null;
}

export type DaySummary = {
  total: number;
  proven: number;
  active: number;
  missed: number;
  selfDeclared: number;
};

/** One owner's commitments of one day (cancelled ones are not promises any more). */
export function daySummary(list: Commitment[]): DaySummary {
  const live = list.filter((c) => c.status !== "cancelled");
  return {
    total: live.length,
    proven: live.filter((c) => c.status === "proven").length,
    active: live.filter((c) => c.status === "active").length,
    missed: live.filter((c) => c.status === "missed").length,
    selfDeclared: live.filter((c) => c.resolution === "self_declared").length,
  };
}

/**
 * Closed days (final results), newest day first. "Closed" comes from the
 * database (each owner's own day), so no timezone is computed here.
 */
export function historyDays(
  list: Commitment[],
): { date: string; items: Commitment[] }[] {
  const byDay = new Map<string, Commitment[]>();
  for (const c of list) {
    if (!c.closed || c.status === "cancelled") continue;
    byDay.set(c.date, [...(byDay.get(c.date) ?? []), c]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
}

export type CommitmentDraft = {
  title: string;
  kind: CommitmentKind;
  taskId: string | null;
  focusMinutes: number | null;
};

/** Client-side check before the database decides (null = fine). */
export function validateCommitmentDraft(d: CommitmentDraft): string | null {
  const title = d.title.trim();
  if (!title) return t.accountability.errors.titleRequired;
  if (title.length > TITLE_MAX) return t.accountability.errors.titleTooLong;
  if (!isKind(d.kind)) return t.accountability.errors.generic;
  if (d.kind === "task" && !d.taskId) return t.accountability.errors.pickTask;
  if (
    d.kind === "focus" &&
    (d.focusMinutes === null ||
      !Number.isInteger(d.focusMinutes) ||
      d.focusMinutes < FOCUS_MIN_MINUTES ||
      d.focusMinutes > FOCUS_MAX_MINUTES)
  )
    return t.accountability.errors.focusRange;
  return null;
}

/** Database error code → fixed copy (never the raw message). */
export function accountabilityErrorMessage(code: string | undefined): string {
  const e = t.accountability.errors;
  switch (code) {
    case "LI_NO_PARTNER":
      return e.noPartner;
    case "LI_COMMITMENT_LIMIT":
      return e.limit;
    case "LI_COMMITMENT_CLOSED":
      return e.closed;
    case "LI_HISTORY_LOCKED":
      return e.dayClosed;
    case "LI_PROOF_REQUIRED":
      return e.proofRequired;
    case "LI_NUDGE_COOLDOWN":
      return e.nudgeCooldown;
    case "LI_NUDGE_LIMIT":
      return e.nudgeLimit;
    case "LI_NUDGE_CLOSED":
      return e.nudgeClosed;
    case "LI_NUDGE_SELF":
      return e.generic;
    case "LI_CHECKIN_LIMIT":
      return e.checkinLimit;
    case "LI_NOT_FOUND":
      return e.notFound;
    default:
      return e.generic;
  }
}
