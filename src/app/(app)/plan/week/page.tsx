import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { WeekPlanScreen } from "@/components/screens/WeekPlanScreen";

export const metadata: Metadata = { title: t.pageTitles.week };

/** V2 Phase 9: this / next week's priorities (data already in useApp()). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;
  return <WeekPlanScreen initialWeek={w === "next" ? "next" : "current"} />;
}
