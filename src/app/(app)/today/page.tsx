import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { TodayScreen } from "@/components/screens/TodayScreen";
import { loadNorthStar } from "@/lib/north-star-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: t.pageTitles.today };

/**
 * V2 Phase 4: the North Star is read here (owner-only, private), not with
 * the app layout, so coming back from /goals always shows the current pick.
 */
export default async function Page() {
  const northStar = await loadNorthStar(await createClient());
  return <TodayScreen northStar={northStar} />;
}
