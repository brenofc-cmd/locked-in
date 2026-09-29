"use server";

import { daysBetween } from "@/lib/local-date";
import {
  isDateISO,
  plannerErrorMessage,
  toRow,
  validatePlannerInput,
  type PlannerInput,
  type PlannerRow,
} from "@/lib/planner";
import { loadPlannerRows } from "@/lib/planner-data";
import { createClient } from "@/lib/supabase/server";

/**
 * Planner reads and writes (V2 Phase 2). Identity comes from the session
 * cookie; RLS, column grants and the table trigger decide ownership and
 * sharing (owner_id / duo_id are never sent). Errors are fixed copy.
 */
type Fail = { ok: false; error: string };
const fail = (error: { code?: string; message?: string }): Fail => ({
  ok: false,
  error: plannerErrorMessage(error),
});

/** At most ~two months per read (a month grid, or the upcoming window). */
const MAX_RANGE_DAYS = 70;

export async function loadPlanner(
  from: string,
  to: string,
): Promise<{ ok: true; rows: PlannerRow[] } | Fail> {
  if (!isDateISO(from) || !isDateISO(to) || to < from)
    return fail({ code: "23514" });
  if (daysBetween(from, to) > MAX_RANGE_DAYS) return fail({ code: "23514" });
  try {
    return {
      ok: true,
      rows: await loadPlannerRows(await createClient(), from, to),
    };
  } catch {
    return fail({});
  }
}

export async function savePlannerEvent(
  id: string | null,
  input: PlannerInput,
): Promise<{ ok: true; row: PlannerRow } | Fail> {
  // The database checks the partner too (LI_PLANNER_NO_PARTNER).
  const invalid = validatePlannerInput(input, true);
  if (invalid) return { ok: false, error: invalid };
  try {
    const supabase = await createClient();
    const fields = toRow(input);
    const res = id
      ? await supabase
          .from("planner_events")
          .update(fields)
          .eq("id", id)
          .select()
          .single()
      : await supabase.from("planner_events").insert(fields).select().single();
    if (res.error) return fail(res.error);
    return { ok: true, row: res.data };
  } catch {
    return fail({});
  }
}

export async function deletePlannerEvent(
  id: string,
): Promise<{ ok: true } | Fail> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("planner_events")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) return fail(error);
    if (!data.length) return fail({ code: "42501" });
    return { ok: true };
  } catch {
    return fail({});
  }
}
