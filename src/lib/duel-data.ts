import { t } from "@/i18n/pt-BR";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DUEL_DAYS, type DuelRow } from "@/lib/duel";
import { MONTHS } from "@/lib/monthly";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * The duels of my current duo (V2 Phase 7): today and the 7 days before it,
 * never before the duo became complete. Empty without a complete duo. The
 * database derives every number (docs/DUEL.md); nothing is stored.
 */
type DuelDbRow =
  Database["public"]["Functions"]["duo_duels"]["Returns"][number];

const toRow = (r: DuelDbRow): DuelRow => ({
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
});

export async function loadDuels(supabase: Client): Promise<DuelRow[]> {
  const { data, error } = await supabase.rpc("duo_duels", {
    p_days: DUEL_DAYS,
  });
  if (error) throw new Error(t.loadErrors.progress);
  return data.map(toRow);
}

/**
 * V2 Phase 8: the same per-day numbers for whole months — the current month
 * and the 5 before it, never before the duo became complete
 * (docs/MONTHLY_COMPETITION.md). Decided on the client (src/lib/monthly.ts).
 */
export async function loadDuelMonths(supabase: Client): Promise<DuelRow[]> {
  const { data, error } = await supabase.rpc("duo_duel_months", {
    p_months: MONTHS,
  });
  if (error) throw new Error(t.loadErrors.progress);
  return data.map(toRow);
}
