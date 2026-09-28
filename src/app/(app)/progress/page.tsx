import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { ProgressScreen } from "@/components/screens/ProgressScreen";

export const metadata: Metadata = { title: t.pageTitles.progress };

export default function Page() {
  return <ProgressScreen />;
}
