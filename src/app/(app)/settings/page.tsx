import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { SettingsScreen } from "@/components/screens/SettingsScreen";

export const metadata: Metadata = { title: t.pageTitles.settings };

export default function Page() {
  return <SettingsScreen />;
}
