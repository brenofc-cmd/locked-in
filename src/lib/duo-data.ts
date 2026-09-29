import { t } from "@/i18n/pt-BR";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyTaskRow } from "@/lib/task-model";
import type { Database } from "@/types/database";

/** The duo's live side (Stage 5): persisted feed + the partner's day. */
export type DuoData = {
  /** activity_events of my duo, newest first, at most 20. */
  feed: {
    id: string;
    actor_id: string;
    event_type: string;
    target_id: string | null;
    title: string | null;
    duration_seconds: number | null;
    created_at: string;
    /** Stage 8: reactions attached to the event (RLS: my duo only). */
    reactions: { from_user_id: string; reaction_type: string }[];
  }[];
  /** Partner's local today and counts (private tasks counted, never listed). */
  partnerDay: { date: string; done: number; total: number } | null;
  /** Partner's shared tasks for their today (RLS hides private ones). */
  partnerTasks: DailyTaskRow[];
  /**
   * Partner's unfinished focus session as a limited projection (timer fields,
   * title only when shared; never the reflection). null when not focusing.
   */
  partnerFocus: PartnerFocus | null;
  /**
   * V2 Phase 2: the partner's last heartbeat (user_presence, RLS: current
   * partner only). Shown only while they are neither focusing nor online.
   */
  partnerLastSeen: string | null;
};

export type PartnerFocus = {
  id: string;
  user_id: string;
  title: string | null;
  status: string;
  started_at: string;
  planned_seconds: number;
  paused_at: string | null;
  accumulated_pause_seconds: number;
};

/**
 * Feed + partner's day. Used by the layout and, through the browser client,
 * by the realtime provider after each event or reconnect (same queries).
 */
export async function loadDuoData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<DuoData> {
  const [feed, day, focus, seen] = await Promise.all([
    supabase
      .from("activity_events")
      .select(
        "id, actor_id, event_type, target_id, title:title_snapshot, duration_seconds, created_at, reactions(from_user_id, reaction_type)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("partner_today"),
    supabase.rpc("partner_current_focus"),
    supabase
      .from("user_presence")
      .select("last_seen_at")
      .neq("user_id", userId)
      .maybeSingle(),
  ]);
  if (feed.error || day.error || focus.error || seen.error)
    throw new Error(t.loadErrors.duo);
  const d = day.data?.[0];
  const partnerDay = d
    ? { date: d.task_date, done: d.done, total: d.total }
    : null;
  let partnerTasks: DailyTaskRow[] = [];
  if (partnerDay) {
    const res = await supabase
      .from("daily_tasks")
      .select("*")
      .neq("owner_id", userId)
      .eq("task_date", partnerDay.date)
      .order("sort_order")
      .order("created_at");
    if (res.error) throw new Error(t.loadErrors.duo);
    partnerTasks = res.data;
  }
  return {
    feed: feed.data,
    partnerDay,
    partnerTasks,
    partnerFocus: focus.data?.[0] ?? null,
    partnerLastSeen: seen.data?.last_seen_at ?? null,
  };
}
