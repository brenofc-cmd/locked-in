import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { TodayScreen } from "@/components/screens/TodayScreen";

export const metadata: Metadata = { title: t.pageTitles.today };

export default function Page() {
  return <TodayScreen />;
}
