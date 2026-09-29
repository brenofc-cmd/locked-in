import type { SupabaseClient } from "@supabase/supabase-js";
import { t } from "@/i18n/pt-BR";
import type { PlannerRow } from "@/lib/planner";
import type { Database } from "@/types/database";

/**
 * Planner events dated from..to (inclusive): mine and the ones my current
 * partner shares — RLS decides, private partner events never arrive. One
 * query, served by (owner_id, event_date) / (duo_id, event_date).
 */
export async function loadPlannerRows(
  supabase: SupabaseClient<Database>,
  from: string,
  to: string,
): Promise<PlannerRow[]> {
  const { data, error } = await supabase
    .from("planner_events")
    .select("*")
    .gte("event_date", from)
    .lte("event_date", to)
    .order("event_date")
    .order("event_time", { nullsFirst: true })
    .limit(500);
  if (error) throw new Error(t.planner.errors.loadFailed);
  return data;
}
