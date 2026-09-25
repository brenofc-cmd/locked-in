import type { Metadata } from "next";
import { OnboardingDone } from "@/components/screens/OnboardingDone";

export const metadata: Metadata = { title: "Welcome" };

/**
 * Onboarding itself is rendered by the app shell for as long as it is not
 * finished (any path). Once finished, this path just leads to Today.
 */
export default function Page() {
  return <OnboardingDone />;
}
