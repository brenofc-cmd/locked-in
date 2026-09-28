import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { OnboardingDone } from "@/components/screens/OnboardingDone";

export const metadata: Metadata = { title: t.pageTitles.onboarding };

/**
 * Onboarding itself is rendered by the app shell for as long as it is not
 * finished (any path). Once finished, this path just leads to Today.
 */
export default function Page() {
  return <OnboardingDone />;
}
