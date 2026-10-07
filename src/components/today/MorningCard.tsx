"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useRef, useState } from "react";
import { updateSetting } from "@/app/(app)/settings-actions";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import { usePartnerView } from "@/components/use-partner-view";
import { addDays, localTimeHM, weekdayName } from "@/lib/local-date";
import { nextEvent, topThree, type NorthStar } from "@/lib/north-star";
import { countdown, eventSummary } from "@/lib/planner";
import { percent } from "@/lib/progress";
import { loadMarks, setMark } from "@/lib/resume-state";

/**
 * The morning (V2 Phase 4, evolves the Stage 8 briefing): an inline card at
 * the top of Today on the first open of the local day, per user — never a
 * modal, never over onboarding, never restored once closed. Real data only:
 * streak, daily standard, today's tasks, yesterday, the North Star (as the
 * user wrote it), the Top 3 and the next planner event. No quotes, no advice.
 */
export function MorningCard({ star }: { star: NorthStar }) {
  const app = useApp();
  const { me, settings } = useSession();
  const [show, setShow] = useState(false);
  const shownHere = useRef(false);
  const eligible = settings.onboarded && settings.showMorningBriefing;
  const today = app.today;

  useEffect(() => {
    if (!eligible) return;
    // Seen today already (this user, this device) → not again; the ref keeps
    // it visible across a development re-run of this effect.
    if (!shownHere.current && loadMarks(me.id).briefing === today) return;
    shownHere.current = true;
    setMark(me.id, "briefing", today);
    // After hydration, so the server render never contains the card.
    const id = setTimeout(() => setShow(true), 0);
    return () => clearTimeout(id);
  }, [eligible, me.id, today]);

  if (!show) return null;
  return <Morning star={star} onClose={() => setShow(false)} />;
}

function Morning({ star, onClose }: { star: NorthStar; onClose: () => void }) {
  const app = useApp();
  const { me, settings } = useSession();
  const pv = usePartnerView();
  const [auto, setAuto] = useState(settings.showMorningBriefing);
  const now = new Date(app.now);
  const y = app.progressDays.find((d) => d.day === addDays(app.today, -1));
  const yesterday = y ? percent(y.completed, y.planned) : null;
  const next = nextEvent(
    app.plannerEvents,
    app.today,
    localTimeHM(now, me.timezone),
  );
  const top = topThree(app.tasks);
  const facts = [
    t.morning.streak(app.streak),
    t.morning.standard(app.standard),
    t.morning.planned(app.tasks.length),
    yesterday !== null ? t.morning.yesterday(`${yesterday}%`) : null,
  ].filter(Boolean);
  const lines = [
    star.vision && { k: t.northStar.vision, v: star.vision.item.title },
    star.goal && {
      k: t.northStar.goal,
      v: star.goal.item.title,
      // V2 Phase 5: real actions this week, only when there are some.
      extra: star.goal.item.week?.actions
        ? t.morning.goalWeek(star.goal.item.week.actions)
        : "",
    },
    star.mirror && { k: t.northStar.mirror, v: star.mirror.item.text },
  ].filter((x) => !!x);

  async function toggleAuto() {
    const nextValue = !auto;
    setAuto(nextValue);
    const res = await updateSetting("showMorningBriefing", nextValue).catch(
      () => null,
    );
    if (!res?.ok) {
      setAuto(!nextValue);
      app.toast({ text: t.moments.couldNotSave, sub: t.moments.briefingSub });
    }
  }

  return (
    <section
      aria-label={t.morning.aria}
      data-testid="morning"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-5 animate-[li-fade-up_.4s_ease] desk:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-meta tracking-eyebrow text-dim tabular-nums">
          {t.morning.eyebrow(
            localTimeHM(now, me.timezone),
            weekdayName(app.today),
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.morning.close}
          className="-mr-2 flex size-10 items-center justify-center rounded-lg text-lead text-dim hover:text-text"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <p className="m-0 font-mono text-meta leading-[1.9] tracking-eyebrow text-muted">
        {facts.join(" · ")}
      </p>

      {lines.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h2 className="m-0 font-mono text-meta font-normal tracking-eyebrow text-accent">
            {t.northStar.title}
          </h2>
          {lines.map((l) => (
            <p key={l.k} className="m-0 flex flex-col gap-0.5">
              <span className="font-mono text-meta tracking-eyebrow text-dim">
                {l.k}
              </span>
              <span className="line-clamp-2 text-body leading-[1.4] text-pretty">
                {l.v}
              </span>
              {"extra" in l && l.extra && (
                <span
                  data-testid="morning-goal-proof"
                  className="font-mono text-meta tracking-eyebrow text-muted tabular-nums"
                >
                  {l.extra}
                </span>
              )}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-meta tracking-eyebrow text-dim">
            {t.morning.today}
          </span>
          {top.length > 0 ? (
            <span className="font-mono text-meta tracking-meta text-muted tabular-nums">
              {t.top3.title} · {top.filter((x) => x.done).length} / {top.length}
            </span>
          ) : app.tasks.length > 0 ? (
            <button
              type="button"
              onClick={() => app.openSheet({ kind: "priorities" })}
              className="flex h-9 items-center font-mono text-meta tracking-eyebrow text-accent"
            >
              {t.top3.define}
            </button>
          ) : null}
        </div>
        {next && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-meta tracking-eyebrow text-dim">
              {t.morning.next}
            </span>
            <span className="min-w-0 truncate text-right font-mono text-meta tracking-meta">
              {eventSummary(next)} ·{" "}
              {[countdown(next.date, app.today), next.time]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        )}
        {app.hasPartner && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-meta tracking-eyebrow text-dim">
              {app.partner.name.toUpperCase()}
            </span>
            <span className="font-mono text-meta tracking-meta text-muted">
              {pv.label}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-xl bg-text px-5 font-mono text-small font-semibold tracking-brand text-bg active:scale-[.97]"
        >
          {t.morning.start}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          onClick={() => void toggleAuto()}
          className="flex h-11 items-center gap-2 text-small text-dim"
        >
          <span
            aria-hidden="true"
            className={cx(
              "flex size-4 items-center justify-center rounded-sm border-[1.5px]",
              auto ? "border-text bg-text" : "border-line-bold",
            )}
          />
          {t.morning.autoShow}
        </button>
      </div>
    </section>
  );
}
