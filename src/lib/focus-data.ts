import { t } from "@/i18n/pt-BR";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clockOffset, type FocusRow } from "@/lib/focus";
import type { Database } from "@/types/database";

/**
 * My focus state: the unfinished session (if any), the last 36 h of sessions
 * and the database clock minus this server's clock (ms): focus timestamps
 * come from Postgres, whose clock the app server may not share.
 */
export type FocusData = {
  active: FocusRow | null;
  recent: FocusRow[];
  dbOffset: number;
};

/**
 * my_active_focus() first reconciles a session whose planned time ran out
 * (e.g. while the app was closed), so the list is read after it.
 */
export async function loadFocusData(
  supabase: SupabaseClient<Database>,
): Promise<FocusData> {
  const sentAt = Date.now();
  const [active, clock] = await Promise.all([
    supabase.rpc("my_active_focus"),
    supabase.rpc("server_now").then((r) => ({ ...r, receivedAt: Date.now() })),
  ]);
  if (active.error) throw new Error(t.loadErrors.focus);
  const recent = await supabase
    .from("focus_sessions")
    .select("*")
    .gte("started_at", new Date(Date.now() - 36 * 3600_000).toISOString())
    .order("started_at");
  if (recent.error) throw new Error(t.loadErrors.focus);
  return {
    active: active.data?.[0] ?? null,
    recent: recent.data,
    dbOffset: clock.data
      ? clockOffset(clock.data, sentAt, clock.receivedAt)
      : 0,
  };
}
