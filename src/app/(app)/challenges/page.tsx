import type { Metadata } from "next";
import { ChallengesScreen } from "@/components/screens/ChallengesScreen";

export const metadata: Metadata = { title: "Challenges" };

export default function Page() {
  return <ChallengesScreen />;
}
