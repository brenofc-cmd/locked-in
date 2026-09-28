import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { FocusScreen } from "@/components/screens/FocusScreen";

export const metadata: Metadata = { title: t.pageTitles.focus };

export default function Page() {
  return <FocusScreen />;
}
