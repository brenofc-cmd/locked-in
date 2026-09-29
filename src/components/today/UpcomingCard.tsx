"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useApp } from "@/components/app-state";
import { countdown, eventHeading, groupUpcoming } from "@/lib/planner";

/**
 * Today (V2 Phase 2): the next school events, at most three, mine and the
 * partner's shared ones. Hidden when nothing is coming up.
 */
export function UpcomingCard() {
  const app = useApp();
  const next = groupUpcoming(app.plannerEvents, app.today)
    .flatMap((g) => g.events)
    .slice(0, 3);
  if (next.length === 0) return null;
  return (
    <section aria-label={t.planner.upcomingCard} className="flex flex-col">
      <div className="flex items-center justify-between pb-1">
        <h2 className="font-mono text-[11px] font-normal tracking-[.2em]">
          {t.planner.upcomingCard}
        </h2>
        <Link
          href="/planner"
          className="flex h-9 items-center font-mono text-[11px] tracking-[.14em] text-dim hover:text-text"
        >
          {t.planner.seePlanner}
        </Link>
      </div>
      {next.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => app.openSheet({ kind: "planner", event: e })}
          className="flex min-h-[52px] items-center justify-between gap-3 border-t border-white/6 text-left"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            {!e.mine && (
              <span className="font-mono text-[10px] tracking-[.14em] text-muted">
                {app.partner.name.toUpperCase()}
              </span>
            )}
            <span className="truncate font-mono text-[11.5px] tracking-[.1em]">
              {eventHeading(e)}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[11px] tracking-[.08em] text-dim tabular-nums">
            {[countdown(e.date, app.today), e.time].filter(Boolean).join(" · ")}
          </span>
        </button>
      ))}
    </section>
  );
}
