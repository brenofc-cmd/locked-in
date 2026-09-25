"use server";

import {
  targetValue,
  validateDraft,
  type Challenge,
  type ChallengeDraft,
} from "@/lib/challenges";
import { isReactionType, type ReactionType } from "@/lib/reactions";
import { createClient } from "@/lib/supabase/server";

/**
 * Reactions and challenges (Stage 8). The database decides who may react
 * or create (RLS, auth.uid()); these actions only validate and map errors.
 */
type Fail = { ok: false; error: string };

const REACT_FAIL: Fail = { ok: false, error: "Could not send the reaction." };

export async function setReaction(
  eventId: string,
  type: ReactionType,
): Promise<{ ok: true } | Fail> {
  if (!isReactionType(type) || !/^[0-9a-f-]{36}$/i.test(eventId))
    return REACT_FAIL;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_reaction", {
      p_event_id: eventId,
      p_type: type,
    });
    if (error)
      return error.message === "LI_NOT_FOUND"
        ? { ok: false, error: "That activity is gone." }
        : REACT_FAIL;
    return { ok: true };
  } catch {
    return REACT_FAIL;
  }
}

export async function clearReaction(
  eventId: string,
): Promise<{ ok: true } | Fail> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return REACT_FAIL;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const id = data?.claims?.sub;
    if (typeof id !== "string") return REACT_FAIL;
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("activity_event_id", eventId)
      .eq("from_user_id", id);
    return error ? REACT_FAIL : { ok: true };
  } catch {
    return REACT_FAIL;
  }
}

const LOAD_FAIL: Fail = { ok: false, error: "Could not load challenges." };

export async function loadChallenges(): Promise<
  { ok: true; challenges: Challenge[] } | Fail
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("duo_challenges");
    if (error) return LOAD_FAIL;
    return {
      ok: true,
      challenges: data.map((c) => ({
        id: c.id,
        title: c.title,
        type:
          c.challenge_type === "focus_seconds"
            ? "focus_seconds"
            : "standard_days",
        target: c.target_value,
        start: c.start_date,
        end: c.end_date,
        createdBy: c.created_by,
        me: c.me_value,
        partner: c.partner_value,
      })),
    };
  } catch {
    return LOAD_FAIL;
  }
}

export async function createChallenge(
  draft: ChallengeDraft,
  today: string,
): Promise<{ ok: true } | Fail> {
  const invalid = validateDraft(draft, today);
  if (invalid) return { ok: false, error: invalid };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("challenges").insert({
      title: draft.title.trim(),
      challenge_type: draft.type,
      target_value: targetValue(draft),
      start_date: draft.start,
      end_date: draft.end,
    });
    if (error)
      return {
        ok: false,
        error:
          error.code === "42501"
            ? "Challenges start today or later, with your partner in the duo."
            : error.code === "23505"
              ? "That challenge already exists."
              : "Could not create the challenge.",
      };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not create the challenge." };
  }
}

/** Only before it starts (RLS); afterwards it is part of the record. */
export async function deleteChallenge(
  id: string,
): Promise<{ ok: true } | Fail> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("challenges")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !data?.length)
      return { ok: false, error: "A started challenge stays on the record." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not delete the challenge." };
  }
}
