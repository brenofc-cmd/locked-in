"use server";

import { t } from "@/i18n/pt-BR";
import {
  accountabilityErrorMessage,
  isCheckinState,
  validateCommitmentDraft,
  type CheckinRow,
  type CheckinState,
  type CommitmentDraft,
  type CommitmentRow,
  type NudgeRow,
} from "@/lib/accountability";
import { addDays, localDateISO } from "@/lib/local-date";
import { createClient } from "@/lib/supabase/server";

/**
 * Duo Accountability 2.0 (V2 Phase 6). The database decides everything —
 * who may read (RLS: owner + current duo), the day, the duo, the status, the
 * proof, MISSED and every limit (triggers). These actions validate input and
 * map error codes to fixed copy; they never send an owner, a duo or a date.
 */
type Fail = { ok: false; error: string };
type Ok<T = object> = { ok: true } & T;

const ID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const GENERIC: Fail = { ok: false, error: t.accountability.errors.generic };
const fail = (code: string | undefined): Fail => ({
  ok: false,
  error: accountabilityErrorMessage(code),
});

export type AccountabilityData = {
  commitments: CommitmentRow[];
  nudges: NudgeRow[];
  checkins: CheckinRow[];
  /** The partner's local today and their effective focus seconds on it. */
  partnerDate: string | null;
  partnerFocusSeconds: number;
};

/** My duo's commitments from `today - HISTORY` plus recent nudges / check-ins. */
export async function loadAccountability(
  today: string,
  historyDays: number,
  partner: { id: string; timezone: string } | null,
): Promise<Ok<{ data: AccountabilityData }> | Fail> {
  if (!DAY.test(today) || !Number.isInteger(historyDays) || historyDays < 0)
    return GENERIC;
  if (partner && !ID.test(partner.id)) return GENERIC;
  try {
    const supabase = await createClient();
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const [commitments, nudges, checkins, day] = await Promise.all([
      supabase.rpc("duo_commitments", { p_from: addDays(today, -historyDays) }),
      supabase
        .from("nudges")
        .select(
          "id, from_user, to_user, commitment_id, recipient_date, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("checkins")
        .select("user_id, local_date, state, created_at")
        .gte("local_date", addDays(today, -1))
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.rpc("partner_today"),
    ]);
    if (commitments.error || nudges.error || checkins.error || day.error)
      return { ok: false, error: t.accountability.loadError };

    // The partner's focus today: their completed sessions' effective seconds,
    // as the feed already carries them (activity_events, RLS: my duo only —
    // an id from outside the duo reads nothing).
    const partnerDate = day.data?.[0]?.task_date ?? null;
    let partnerFocusSeconds = 0;
    if (partner && partnerDate) {
      const focus = await supabase
        .from("activity_events")
        .select("duration_seconds, created_at")
        .eq("actor_id", partner.id)
        .eq("event_type", "focus_completed")
        .gte("created_at", since);
      if (!focus.error)
        partnerFocusSeconds = focus.data
          .filter(
            (e) =>
              localDateISO(partner.timezone, new Date(e.created_at)) ===
              partnerDate,
          )
          .reduce((s, e) => s + (e.duration_seconds ?? 0), 0);
    }

    return {
      ok: true,
      data: {
        commitments: commitments.data,
        nudges: nudges.data,
        checkins: checkins.data,
        partnerDate,
        partnerFocusSeconds,
      },
    };
  } catch {
    return { ok: false, error: t.accountability.loadError };
  }
}

export async function createCommitment(
  draft: CommitmentDraft,
): Promise<Ok | Fail> {
  const invalid = validateCommitmentDraft(draft);
  if (invalid) return { ok: false, error: invalid };
  if (draft.taskId && !ID.test(draft.taskId)) return GENERIC;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_commitment", {
      p_title: draft.title.trim(),
      p_kind: draft.kind,
      p_daily_task_id: (draft.kind === "task" && draft.taskId) || undefined,
      p_focus_minutes:
        draft.kind === "focus" ? (draft.focusMinutes ?? undefined) : undefined,
    });
    return error ? fail(error.message) : { ok: true };
  } catch {
    return GENERIC;
  }
}

/** CANCELAR (open, active), CUMPRI / DESFAZER (simple, open). */
export async function setCommitmentStatus(
  id: string,
  status: "cancelled" | "proven" | "active",
): Promise<Ok | Fail> {
  if (!ID.test(id) || !["cancelled", "proven", "active"].includes(status))
    return GENERIC;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("commitments")
      .update({ status })
      .eq("id", id)
      .select("id");
    if (error) return fail(error.message);
    return data.length ? { ok: true } : fail("LI_NOT_FOUND");
  } catch {
    return GENERIC;
  }
}

/** DAR UM TOQUE: only the commitment; the database stamps everything else. */
export async function sendNudge(commitmentId: string): Promise<Ok | Fail> {
  if (!ID.test(commitmentId)) return GENERIC;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("nudges")
      .insert({ commitment_id: commitmentId });
    return error ? fail(error.message) : { ok: true };
  } catch {
    return GENERIC;
  }
}

export async function setCheckin(state: CheckinState): Promise<Ok | Fail> {
  if (!isCheckinState(state)) return GENERIC;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("checkins").insert({ state });
    return error ? fail(error.message) : { ok: true };
  } catch {
    return GENERIC;
  }
}
