"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useState } from "react";
import { loadDayTasks, type DayTask } from "@/app/(app)/progress-actions";
import { loadDayReview } from "@/app/(app)/reflection-actions";
import { FactRows, ReflectionView } from "@/components/reviews/Reflection";
import { dayFactLines, type Reflection, type ReviewFacts } from "@/lib/reviews";
import { useApp } from "@/components/app-state";
import { FocusPicker } from "@/components/focus/FocusPicker";
import { MiniCheck, chipTone, cx } from "@/components/ui";
import { dateLabel } from "@/lib/local-date";
import { createChallenge } from "@/app/(app)/social-actions";
import { useSession } from "@/components/session";
import {
  defaultDraft,
  validateDraft,
  type ChallengeDraft,
  type ChallengeType,
} from "@/lib/challenges";
import {
  REACTION_TYPES,
  isEmojiReaction,
  reactionLabel,
} from "@/lib/reactions";
import { dayState, focusLabel, percent } from "@/lib/progress";
import { ROUTINE_TEMPLATES, TEMPLATE_NAMES } from "@/lib/routine-templates";
import { todayStats } from "@/lib/today";

const heading = "font-mono text-meta tracking-eyebrow text-muted";

export function ReactSheet({
  eventId,
  title,
}: {
  eventId: string;
  title: string;
}) {
  const { react, reactions } = useApp();
  const { me } = useSession();
  const mine = reactions[eventId]?.[me.id] ?? null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className={heading}>{t.miscSheets.react}</span>
        <span className="text-lead">{title}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {REACTION_TYPES.map((r) => {
          const label = reactionLabel(r);
          const on = mine === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              onClick={() => void react(eventId, r)}
              aria-label={
                isEmojiReaction(r)
                  ? t.miscSheets.reactAria(label)
                  : t.miscSheets.sendAria(label)
              }
              className={cx(
                "h-[72px] rounded-2xl border p-0 transition-transform duration-100 active:scale-[.88]",
                on
                  ? "border-accent-line bg-accent-soft"
                  : "border-line bg-raised",
                isEmojiReaction(r) ? "text-heading" : "text-small",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {mine && (
        <button
          type="button"
          onClick={() => void react(eventId, null)}
          className="h-11 self-start text-small text-dim underline underline-offset-[3px]"
        >
          {t.miscSheets.removeReaction}
        </button>
      )}
    </div>
  );
}

export function FocusSheet() {
  const { startFocus } = useApp();
  return (
    <div className="flex flex-col gap-5">
      <span className={heading}>{t.miscSheets.focusQuestion}</span>
      <FocusPicker compact />
      <button
        type="button"
        onClick={startFocus}
        className="h-[58px] rounded-2xl bg-accent font-mono text-small font-semibold tracking-brand text-bg active:scale-[.97]"
      >
        {t.miscSheets.startFocus}
      </button>
    </div>
  );
}

export function StreakSheet() {
  const { tasks, standard, streak, longestStreak, closeSheet } = useApp();
  const stats = todayStats(tasks, standard);
  const rules = [
    { text: t.miscSheets.ruleCounts(standard), on: true },
    { text: t.miscSheets.ruleSkipped, on: true },
    { text: t.miscSheets.ruleNeutral, on: true },
    { text: t.miscSheets.ruleReset, on: false },
  ];
  const today =
    stats.total === 0
      ? t.miscSheets.todayNothing
      : stats.standardMet
        ? t.miscSheets.todayMet(stats.done, stats.total)
        : t.miscSheets.todayNeeds(stats.done, stats.total, stats.needed);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-num-xl leading-[.9] font-medium tracking-number">
          {streak}
        </span>
        <span className="font-mono text-small tracking-eyebrow text-muted">
          {t.miscSheets.dayStreak}
        </span>
        <span className="ml-auto font-mono text-meta tracking-meta text-dim">
          {t.miscSheets.longest(longestStreak)}
        </span>
      </div>
      <div className="flex flex-col">
        {rules.map((r) => (
          <div
            key={r.text}
            className="flex gap-3 border-t border-line py-3 text-body leading-[1.45]"
          >
            <span
              aria-hidden="true"
              className={cx(
                "mt-2 size-1.5 shrink-0 rounded-full",
                r.on ? "bg-accent" : "border-[1.5px] border-missed",
              )}
            />
            <span>{r.text}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-raised px-4 py-3.5 text-body leading-[1.5] text-muted">
        {today}
      </div>
      <button
        type="button"
        onClick={closeSheet}
        className="h-[52px] rounded-2xl border border-line-strong text-body"
      >
        {t.miscSheets.gotIt}
      </button>
    </div>
  );
}

const STATE_TEXT = t.miscSheets.stateText;

/** A past day from daily_tasks history (read-only: the record). */
export function DaySheet({ date }: { date: string }) {
  const { standard } = useApp();
  const [items, setItems] = useState<DayTask[] | null>(null);
  const [focus, setFocus] = useState({ seconds: 0, sessions: 0 });
  const [error, setError] = useState(false);
  // V2 Phase 9: that day's non-negotiables and my reflection (read-only).
  const [review, setReview] = useState<{
    facts: ReviewFacts;
    reflection: Reflection;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    void loadDayReview(date)
      .catch(() => null)
      .then((res) => {
        if (alive && res?.ok) setReview(res);
      });
    return () => {
      alive = false;
    };
  }, [date]);

  useEffect(() => {
    let alive = true;
    void loadDayTasks(date)
      .catch(() => null)
      .then((res) => {
        if (!alive) return;
        if (res?.ok) {
          setItems(res.tasks);
          setFocus({ seconds: res.focusSeconds, sessions: res.focusSessions });
        } else setError(true);
      });
    return () => {
      alive = false;
    };
  }, [date]);

  const done = items?.filter((i) => i.status === "completed").length ?? 0;
  const total = items?.length ?? 0;
  const pct = percent(done, total);
  const state = dayState(total, done, standard);
  const summary =
    state === "perfect"
      ? t.miscSheets.perfectDay
      : state === "met"
        ? t.miscSheets.standardMet
        : state === "missed"
          ? t.miscSheets.standardMissed
          : t.miscSheets.nothingScheduled;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col gap-1.5">
          <span className="font-mono text-meta tracking-eyebrow text-muted">
            {dateLabel(date)}
          </span>
          <span
            className={cx(
              "text-body",
              items === null
                ? "text-dim"
                : state === "missed"
                  ? "text-danger"
                  : "text-accent",
            )}
          >
            {error
              ? t.miscSheets.dayLoadFailed
              : items === null
                ? t.miscSheets.loading
                : summary}
          </span>
        </span>
        <span
          data-testid="day-pct"
          className="text-num-l leading-[.85] font-medium tracking-number tabular-nums"
        >
          {pct === null ? "—" : `${pct}%`}
        </span>
      </div>
      <div className="flex flex-col">
        {(items ?? []).map((it) => {
          const missed = it.status !== "completed";
          return (
            <div
              key={it.id}
              className="flex min-h-12 items-center gap-3 border-t border-line"
            >
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-lg border-[1.5px]",
                  missed
                    ? "border-dashed border-missed"
                    : "border-accent bg-accent",
                )}
              >
                <svg width="11" height="11" viewBox="0 0 16 16">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    stroke="var(--color-bg)"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: missed ? 0 : 1 }}
                  />
                </svg>
              </span>
              <span
                className={cx(
                  "flex-1 text-body",
                  missed ? "text-text" : "text-muted",
                )}
              >
                {it.title}
              </span>
              <span
                className={cx(
                  "font-mono text-meta tracking-meta",
                  missed ? "text-danger" : "text-dim",
                )}
              >
                {STATE_TEXT[it.status]}
              </span>
            </div>
          );
        })}
      </div>
      {items !== null && (
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-mono text-meta tracking-eyebrow text-dim">
            {t.miscSheets.focus}
          </span>
          <span className="text-body tabular-nums" data-testid="day-focus">
            {focusLabel(focus.seconds)}
            <span className="text-dim">
              {" "}
              · {t.miscSheets.sessions(focus.sessions)}
            </span>
          </span>
        </div>
      )}
      {review && (
        <>
          <div className="-mt-3 flex flex-col">
            <FactRows lines={dayFactLines(review.facts)} />
          </div>
          <ReflectionView kind="day" reflection={review.reflection} />
        </>
      )}
      <span className="text-num-heros text-dim">{t.miscSheets.dayNote}</span>
    </div>
  );
}

export function TemplateSheet() {
  const { routines, applyTemplate, closeSheet, settings } = useApp();
  const [pick, setPick] = useState(TEMPLATE_NAMES[0]);
  const [items, setItems] = useState(() =>
    ROUTINE_TEMPLATES[TEMPLATE_NAMES[0]].map((i) => ({ ...i, on: true })),
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const have = new Set(routines.map((r) => r.name.toLowerCase()));

  function choose(name: string) {
    setPick(name);
    setItems(ROUTINE_TEMPLATES[name].map((i) => ({ ...i, on: true })));
  }

  function addOwn() {
    const name = draft.trim().slice(0, 80);
    if (!name) return;
    setItems((l) => [...l, { name, category: "custom" as const, on: true }]);
    setDraft("");
  }

  const chosen = items.filter((i) => i.on && !have.has(i.name.toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <span className={heading}>{t.miscSheets.useTemplate}</span>
      <div
        role="radiogroup"
        aria-label={t.miscSheets.templateAria}
        className="flex flex-wrap gap-1.5"
      >
        {TEMPLATE_NAMES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={pick === n}
            onClick={() => choose(n)}
            className={cx(
              "h-10 rounded-xl border px-3.5 text-body",
              chipTone(pick === n),
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex flex-col">
        {items.map((it, i) => {
          const owned = have.has(it.name.toLowerCase());
          return (
            <div
              key={it.name + i}
              className="flex min-h-[46px] items-center gap-3 border-t border-line text-body"
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={it.on && !owned}
                aria-label={it.name}
                disabled={owned}
                onClick={() =>
                  setItems((l) =>
                    l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)),
                  )
                }
                className="flex size-11 shrink-0 items-center justify-center disabled:opacity-50"
              >
                <MiniCheck done={it.on && !owned} size={22} radius={6} />
              </button>
              <span className={cx("flex-1", !it.on && "text-dim")}>
                {it.name}
              </span>
              <span className="font-mono text-meta tracking-meta text-dim">
                {owned ? t.miscSheets.have : t.miscSheets.new}
              </span>
            </div>
          );
        })}
        <div className="flex gap-2 pt-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOwn();
              }
            }}
            placeholder={t.miscSheets.addOwn}
            aria-label={t.miscSheets.addItemAria}
            maxLength={80}
            className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-field px-3.5 text-body outline-none"
          />
          <button
            type="button"
            onClick={addOwn}
            aria-label={t.miscSheets.addAria}
            className="size-11 rounded-xl border border-line-strong text-title"
          >
            +
          </button>
        </div>
      </div>
      <span className="text-small text-dim">{t.miscSheets.templateNote}</span>
      <button
        type="button"
        disabled={busy || chosen.length === 0}
        onClick={async () => {
          setBusy(true);
          const ok = await applyTemplate(
            chosen.map(({ name, category }) => ({ name, category })),
            settings.shareNewTasks,
          );
          setBusy(false);
          if (ok) closeSheet();
        }}
        className="h-14 rounded-2xl bg-text font-mono text-small font-semibold tracking-brand text-bg disabled:opacity-50"
      >
        {busy
          ? t.miscSheets.adding
          : chosen.length
            ? t.miscSheets.addItems(chosen.length)
            : t.miscSheets.nothingNew}
      </button>
    </div>
  );
}

export function ChallengeSheet() {
  const { closeSheet, today, toast, partner } = useApp();
  const [draft, setDraft] = useState<ChallengeDraft>(() =>
    defaultDraft("standard_days", today),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setType(type: ChallengeType) {
    const d = defaultDraft(type, today);
    setDraft((x) => ({
      ...d,
      start: x.start,
      end: x.end < x.start ? d.end : x.end,
    }));
  }

  async function create() {
    const invalid = validateDraft(draft, today);
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    const res = await createChallenge(draft, today).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(res && !res.ok ? res.error : t.errors.network);
      return;
    }
    closeSheet();
    toast({
      text: t.miscSheets.challengeSet(partner.name),
      sub: draft.title.trim().toUpperCase(),
    });
  }

  const field =
    "h-12 w-full min-w-0 rounded-xl border border-line-strong bg-field px-3.5 text-body outline-none focus:border-line-bold";
  const label = "font-mono text-meta tracking-eyebrow text-dim";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <span className={heading}>{t.miscSheets.newChallenge}</span>
      <label className="flex flex-col gap-2">
        <span className={label}>{t.miscSheets.title}</span>
        <input
          value={draft.title}
          maxLength={40}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className={cx(field, "uppercase")}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className={label} id="challenge-type">
          {t.miscSheets.type}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="challenge-type"
          className="grid grid-cols-2 gap-1.5"
        >
          {(
            [
              ["standard_days", t.miscSheets.typeStandard],
              ["focus_seconds", t.miscSheets.typeFocus],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={draft.type === k}
              onClick={() => setType(k)}
              className={cx(
                "h-[46px] rounded-xl border text-body",
                chipTone(draft.type === k),
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-2">
        <span className={label}>
          {t.miscSheets.goal} ·{" "}
          {draft.type === "standard_days"
            ? t.miscSheets.goalStandard
            : t.miscSheets.goalFocus}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step={draft.type === "standard_days" ? 1 : 0.5}
          value={Number.isFinite(draft.goal) ? draft.goal : ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, goal: Number(e.target.value) }))
          }
          className={field}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-2">
          <span className={label}>{t.miscSheets.start}</span>
          <input
            type="date"
            min={today}
            value={draft.start}
            onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
            className={field}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-2">
          <span className={label}>{t.miscSheets.end}</span>
          <input
            type="date"
            min={draft.start}
            value={draft.end}
            onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
            className={field}
          />
        </label>
      </div>
      <span className="text-small text-dim">{t.miscSheets.challengeNote}</span>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="h-14 rounded-2xl bg-text font-mono text-small font-semibold tracking-brand text-bg disabled:opacity-50"
      >
        {busy ? t.miscSheets.creating : t.miscSheets.create}
      </button>
    </form>
  );
}
