import { t } from "@/i18n/pt-BR";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DUEL_DAYS, type DuelRow } from "@/lib/duel";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * The duels of my current duo (V2 Phase 7): today and the 7 days before it,
 * never before the duo became complete. Empty without a complete duo. The
 * database derives every number (docs/DUEL.md); nothing is stored.
 */
export async function loadDuels(supabase: Client): Promise<DuelRow[]> {
  const { data, error } = await supabase.rpc("duo_duels", {
    p_days: DUEL_DAYS,
  });
  if (error) throw new Error(t.loadErrors.progress);
  return data.map((r) => ({
    date: r.duel_date,
    isFinal: r.is_final,
    me: {
      planned: r.me_planned,
      completed: r.me_completed,
      standard: r.me_standard,
      focusSeconds: r.me_focus_seconds,
      focusRunning: r.me_focus_running,
    },
    partner: {
      planned: r.partner_planned,
      completed: r.partner_completed,
      standard: r.partner_standard,
      focusSeconds: r.partner_focus_seconds,
      focusRunning: r.partner_focus_running,
    },
  }));
}
