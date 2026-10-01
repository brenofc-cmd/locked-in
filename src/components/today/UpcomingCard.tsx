"use client";

import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { countdown, eventHeading, groupUpcoming } from "@/lib/planner";

/**
 * Today: only the next school event (mine or the partner's shared one), one
 * line that opens it. The rest lives on PLANEJAR → /planner. Hidden when
 * nothing is coming up.
 */
export function UpcomingCard() {
  const app = useApp();
  const next = groupUpcoming(app.plannerEvents, app.today).flatMap(
    (g) => g.events,
  )[0];
  if (!next) return null;
  return (
    <section aria-label={t.todayScreen.next} data-testid="today-next">
      <button
        type="button"
        onClick={() => app.openSheet({ kind: "planner", event: next })}
        className="flex min-h-[56px] w-full items-center justify-between gap-3 border-t border-white/6 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-[10.5px] tracking-[.18em] text-dim">
            {t.todayScreen.next}
            {!next.mine && ` · ${app.partner.name.toUpperCase()}`}
          </span>
          <span className="truncate font-mono text-[11.5px] tracking-[.1em]">
            {eventHeading(next)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5 font-mono text-[11px] tracking-[.08em] text-dim tabular-nums">
          {[countdown(next.date, app.today), next.time]
            .filter(Boolean)
            .join(" · ")}
          <span aria-hidden="true" className="text-faint">
            ›
          </span>
        </span>
      </button>
    </section>
  );
}
