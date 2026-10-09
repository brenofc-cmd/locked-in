"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useRef, useState } from "react";
import { updateSetting } from "@/app/(app)/settings-actions";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import { usePartnerView } from "@/components/use-partner-view";
import { localTimeHM } from "@/lib/local-date";
import { nextEvent, type NorthStar } from "@/lib/north-star";
import { countdown, eventSummary } from "@/lib/planner";
import { loadMarks, setMark } from "@/lib/resume-state";
import {
  SECTION_OF,
  ritualState,
  type Pill,
  type RitualState,
  type TodayStats,
} from "@/lib/today";
import type { Task } from "@/types";

/**
 * Whether the Morning Ritual is open (V3.2, docs/MORNING_RITUAL.md; evolves
 * the V2 Phase 4 morning card): on the first open of the local day, per user
 * and device, never over onboarding, never restored once closed. The mark is
 * written when it opens, so a reload does not bring it back.
 */
export function useMorningRitual() {
  const app = useApp();
  const { me, settings } = useSession();
  const [open, setOpen] = useState(false);
  const shownHere = useRef(false);
  const eligible = settings.onboarded && settings.showMorningBriefing;
  const today = app.today;

  useEffect(() => {
    if (!eligible) return;
    // Seen today already (this user, this device) → not again; the ref keeps
    // it open across a development re-run of this effect.
    if (!shownHere.current && loadMarks(me.id).briefing === today) return;
    shownHere.current = true;
    setMark(me.id, "briefing", today);
    // After hydration, so the server render never contains the ritual.
    const id = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(id);
  }, [eligible, me.id, today]);

  return { open, close: () => setOpen(false) };
}

/**
 * The Morning Ritual: in Today's header, under the greeting and Rook, in
 * place of the day's numbers until the user starts — so a day that has not
 * begun opens on its first step, not on 0 %. One surface (the step and the
 * one action), then a few quiet facts. Real data only; no quotes or advice.
 * Starting never completes, starts or changes anything: it closes the ritual
 * and hands over to the task list (TodayScreen).
 */
export function MorningRitual({
  star,
  stats,
  next,
  pills,
  onStart,
  onClose,
}: {
  star: NorthStar;
  stats: TodayStats;
  next: Task | undefined;
  pills: Pill[];
  onStart: (state: RitualState) => void;
  onClose: () => void;
}) {
  const app = useApp();
  const { me, settings } = useSession();
  const pv = usePartnerView();
  const [auto, setAuto] = useState(settings.showMorningBriefing);
  const state = ritualState(stats, next);
  const event = nextEvent(
    app.plannerEvents,
    app.today,
    localTimeHM(new Date(app.now), me.timezone),
  );
  const why = star.goal
    ? {
        v: star.goal.item.title,
        // V2 Phase 5: real actions this week, only when there are some.
        extra: star.goal.item.week?.actions
          ? t.morning.goalWeek(star.goal.item.week.actions)
          : "",
      }
    : star.vision
      ? { v: star.vision.item.title, extra: "" }
      : star.mirror
        ? { v: star.mirror.item.text, extra: "" }
        : null;

  const lead = {
    fresh: t.morning.lead.fresh(stats.total),
    going: t.morning.lead.going(stats.done, stats.total),
    done: stats.perfect ? t.morning.lead.perfect : t.morning.lead.clear,
    empty: t.morning.lead.empty,
  }[state];
  const eyebrow = {
    fresh: t.morning.first,
    going: t.morning.nextStep,
    done: t.morning.dayDone,
    empty: t.morning.plan,
  }[state];
  const action = {
    fresh: t.morning.start,
    going: t.morning.resume,
    done: t.morning.see,
    empty: t.morning.planDay,
  }[state];

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

  const facts = [
    stats.total > 0 && {
      k: t.morning.standardKey,
      v: t.morning.standard(app.standard),
    },
    // A streak of 0 is not news: it simply is not listed.
    app.streak > 0 && {
      k: t.morning.streakKey,
      v: t.morning.streak(app.streak),
    },
    event && {
      k: t.morning.next,
      v: `${eventSummary(event)} · ${[countdown(event.date, app.today), event.time].filter(Boolean).join(" · ")}`,
    },
    app.hasPartner && { k: app.partner.name.toUpperCase(), v: pv.label },
  ].filter((x) => !!x);

  return (
    <section
      aria-label={t.morning.aria}
      data-testid="morning"
      data-state={state}
      className="flex flex-col gap-4 motion-safe:animate-[li-fade-up_.4s_var(--ease-out-quick)_both]"
    >
      <p className="m-0 text-body text-muted text-pretty">{lead}</p>

      <div className="flex flex-col gap-4 rounded-2xl border border-line-strong bg-card p-4.5 motion-safe:animate-[li-settle_.45s_var(--ease-settle)_60ms_both] desk:max-w-xl desk:p-6">
        <div className="-mt-1.5 -mr-2 flex items-center justify-between gap-3">
          <span className="eyebrow text-accent">{eyebrow}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.morning.close}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-lead text-dim hover:text-text"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {next ? (
          <div className="-mt-2 flex flex-col gap-1.5">
            <p
              data-testid="morning-step"
              className="m-0 line-clamp-3 cond text-heading font-bold [overflow-wrap:anywhere] max-[359px]:line-clamp-2 max-[359px]:text-title"
            >
              {next.name}
            </p>
            <span className="font-mono text-meta tracking-eyebrow text-dim tabular-nums">
              {[
                SECTION_OF[next.category],
                next.time,
                t.morning.step(stats.done + 1, stats.total),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        ) : (
          <p className="-mt-2 m-0 cond text-title font-bold text-pretty">
            {state === "empty"
              ? t.morning.emptyTitle
              : stats.perfect
                ? t.morning.doneTitle(stats.done)
                : t.morning.clearTitle(stats.done, stats.total)}
          </p>
        )}

        {/* The day as Proof Pills — the same pieces Today's bar shows once
            the ritual hands over. Decorative: the lead says the numbers. */}
        {pills.length > 1 && pills.length <= 24 && (
          <div aria-hidden="true" className="flex gap-1.5">
            {pills.map((p, i) => (
              <i
                key={i}
                className={cx(
                  "h-2 flex-1 rounded-full border-[1.5px]",
                  p === "done" && "border-accent bg-accent",
                  p === "next" && "border-accent",
                  p === "open" && "border-line-bold",
                  p === "skip" && "border-dashed border-line-bold",
                )}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => onStart(state)}
          data-testid="morning-start"
          className="h-13 w-full rounded-xl bg-text px-4 font-mono text-small font-bold tracking-brand text-bg transition-transform duration-150 ease-[var(--ease-out-quick)] active:scale-[.97]"
        >
          {action}
        </button>
      </div>

      {(facts.length > 0 || why) && (
        <dl className="m-0 flex flex-col font-mono text-meta tracking-eyebrow desk:max-w-xl">
          {facts.map((f) => (
            <div
              key={f.k}
              className="flex min-h-9 items-center justify-between gap-4 border-b border-line"
            >
              <dt className="shrink-0 text-dim">{f.k}</dt>
              <dd className="m-0 min-w-0 truncate text-right text-muted">
                {f.v}
              </dd>
            </div>
          ))}
          {why && (
            <div className="flex flex-col gap-1 border-b border-line py-2.5">
              <dt className="text-dim">{t.morning.whyKey}</dt>
              <dd className="m-0 line-clamp-2 font-sans text-small tracking-normal text-text text-pretty">
                {why.v}
              </dd>
              {why.extra && (
                <dd
                  data-testid="morning-goal-proof"
                  className="m-0 text-muted tabular-nums"
                >
                  {why.extra}
                </dd>
              )}
            </div>
          )}
        </dl>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={auto}
        onClick={() => void toggleAuto()}
        className="-mt-1 flex h-11 items-center gap-2 self-start text-small text-dim"
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
    </section>
  );
}
