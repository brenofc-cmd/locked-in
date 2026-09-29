import type { SupabaseClient } from "@supabase/supabase-js";
import { t } from "@/i18n/pt-BR";
import {
  goalFromRow,
  milestoneFromRow,
  mirrorFromRow,
  visionFromRow,
  type GoalsData,
} from "@/lib/goals";
import type { Database } from "@/types/database";

/**
 * Everything on /goals for the signed-in user: RLS returns only their own
 * rows (owner-only tables). Four small queries in parallel, no N+1.
 */
export async function loadGoalsData(
  supabase: SupabaseClient<Database>,
): Promise<GoalsData> {
  const [visions, goals, milestones, mirror] = await Promise.all([
    supabase.from("vision_items").select("*").order("sort_order").limit(200),
    supabase.from("goals").select("*").order("sort_order").limit(500),
    supabase
      .from("goal_milestones")
      .select("*")
      .order("sort_order")
      .limit(2000),
    supabase
      .from("accountability_items")
      .select("*")
      .order("sort_order")
      .limit(200),
  ]);
  if (visions.error || goals.error || milestones.error || mirror.error)
    throw new Error(t.goals.errors.loadFailed);
  const ms = milestones.data.map(milestoneFromRow);
  return {
    visions: visions.data.map(visionFromRow),
    goals: goals.data.map((g) => goalFromRow(g, ms)),
    mirror: mirror.data.map(mirrorFromRow),
  };
}
