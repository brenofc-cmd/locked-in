import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyTaskRow } from "@/lib/task-model";
import type { Database } from "@/types/database";

/** The duo's live side (Stage 5): persisted feed + the partner's day. */
export type DuoData = {
  /** activity_events of my duo, newest first, at most 20. */
  feed: {
    id: string;
    actor_id: string;
    target_id: string | null;
    title: string | null;
    created_at: string;
  }[];
  /** Partner's local today and counts (private tasks counted, never listed). */
  partnerDay: { date: string; done: number; total: number } | null;
  /** Partner's shared tasks for their today (RLS hides private ones). */
  partnerTasks: DailyTaskRow[];
};

/**
 * Feed + partner's day. Used by the layout and, through the browser client,
 * by the realtime provider after each event or reconnect (same queries).
 */
export async function loadDuoData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<DuoData> {
  const [feed, day] = await Promise.all([
    supabase
      .from("activity_events")
      .select("id, actor_id, target_id, title:title_snapshot, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("partner_today"),
  ]);
  if (feed.error || day.error) throw new Error("Could not load your duo.");
  const d = day.data?.[0];
  const partnerDay = d
    ? { date: d.task_date, done: d.done, total: d.total }
    : null;
  let partnerTasks: DailyTaskRow[] = [];
  if (partnerDay) {
    const t = await supabase
      .from("daily_tasks")
      .select("*")
      .neq("owner_id", userId)
      .eq("task_date", partnerDay.date)
      .order("sort_order")
      .order("created_at");
    if (t.error) throw new Error("Could not load your duo.");
    partnerTasks = t.data;
  }
  return { feed: feed.data, partnerDay, partnerTasks };
}
