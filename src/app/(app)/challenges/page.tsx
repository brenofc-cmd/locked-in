import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { ChallengesScreen } from "@/components/screens/ChallengesScreen";

export const metadata: Metadata = { title: t.pageTitles.challenges };

export default function Page() {
  return <ChallengesScreen />;
}
