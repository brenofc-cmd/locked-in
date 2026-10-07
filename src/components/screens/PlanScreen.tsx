"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useApp } from "@/components/app-state";
import { countdown, eventSummary, groupUpcoming } from "@/lib/planner";
import { planRow, planWeeks, prioritiesOf } from "@/lib/weekly-plan";

/**
 * PLANEJAR (docs/NAVIGATION.md): one row per planning screen, each with the
 * one fact worth seeing before opening it. Read-only; every number comes
 * from data already on screen (no new query). Challenges load on their own
 * screen, so their row keeps the duo line instead of a count.
 */
export function PlanScreen({ goal }: { goal: string }) {
  const app = useApp();
  const next = groupUpcoming(app.plannerEvents, app.today).flatMap(
    (g) => g.events,
  )[0];
  const week = planRow(
    prioritiesOf(app.priorities, planWeeks(app.today).current),
  );
  const rows = [
    {
      href: "/planner",
      label: t.plan.next,
      value: next ? eventSummary(next) : t.plan.noNext,
      meta: next
        ? [countdown(next.date, app.today), next.time]
            .filter(Boolean)
            .join(" · ")
        : "",
      testid: "plan-next",
    },
    {
      // V2 Phase 9: this week's priorities, one compact line.
      href: "/plan/week",
      label: t.plan.week,
      value: week.value,
      meta: week.meta,
      testid: "plan-week",
    },
    {
      href: "/goals",
      label: t.plan.goals,
      value: goal || t.plan.noGoal,
      meta: "",
      testid: "plan-goals",
    },
    {
      href: "/routine",
      label: t.plan.routine,
      value: t.plan.routineItems(app.routines.length),
      meta: "",
      testid: "plan-routine",
    },
    {
      href: "/challenges",
      label: t.plan.challenges,
      value: app.hasPartner ? t.plan.withPartner : t.plan.needsPartner,
      meta: "",
      testid: "plan-challenges",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-[26px] animate-[li-fade-up_.4s_ease]">
      <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
        {t.plan.title}
      </h1>
      <nav aria-label={t.plan.navAria} className="flex flex-col">
        {rows.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            data-testid={r.testid}
            className="flex min-h-[68px] items-center justify-between gap-3 border-b border-white/6 py-3 hover:bg-white/[.02]"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-[10.5px] tracking-[.18em] text-dim">
                {r.label}
              </span>
              <span className="truncate text-[15px]">{r.value}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2.5 font-mono text-[11px] tracking-[.08em] text-dim tabular-nums">
              {r.meta}
              <span aria-hidden="true" className="text-faint">
                ›
              </span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
