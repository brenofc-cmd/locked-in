import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { MoreScreen } from "@/components/screens/MoreScreen";

export const metadata: Metadata = { title: t.pageTitles.more };

export default function Page() {
  return <MoreScreen />;
}
