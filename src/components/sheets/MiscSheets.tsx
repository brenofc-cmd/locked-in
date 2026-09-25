"use client";

import { useEffect, useState } from "react";
import { loadDayTasks, type DayTask } from "@/app/(app)/progress-actions";
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

const heading = "font-mono text-[11px] tracking-[.18em] text-muted";

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
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <span className={heading}>REACT</span>
        <span className="text-[17px]">{title}</span>
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
                isEmojiReaction(r) ? `React ${label}` : `Send “${label}”`
              }
              className={cx(
                "h-[72px] rounded-[18px] border p-0 transition-transform duration-100 active:scale-[.88]",
                on
                  ? "border-accent-line bg-accent-soft"
                  : "border-white/8 bg-raised",
                isEmojiReaction(r) ? "text-[26px]" : "text-[13px]",
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
          className="h-11 self-start text-[13px] text-dim underline underline-offset-[3px]"
        >
          Remove reaction
        </button>
      )}
    </div>
  );
}

export function FocusSheet() {
  const { startFocus } = useApp();
  return (
    <div className="flex flex-col gap-5">
      <span className={heading}>WHAT ARE YOU WORKING ON?</span>
      <FocusPicker compact />
      <button
        type="button"
        onClick={startFocus}
        className="h-[58px] rounded-2xl bg-accent font-mono text-[13px] font-semibold tracking-[.32em] text-bg active:scale-[.97]"
      >
        START
      </button>
    </div>
  );
}

export function StreakSheet() {
  const { tasks, standard, streak, longestStreak, closeSheet } = useApp();
  const stats = todayStats(tasks, standard);
  const rules = [
    {
      t: `A day counts when you complete ${standard}% of scheduled tasks.`,
      on: true,
    },
    {
      t: "Skipped tasks stay in the total and don't count as done.",
      on: true,
    },
    {
      t: "Days with nothing scheduled neither count nor break it.",
      on: true,
    },
    { t: "Missing your standard resets the streak to zero.", on: false },
  ];
  const today =
    stats.total === 0
      ? "Nothing scheduled today. The streak is safe."
      : stats.standardMet
        ? `Today: ${stats.done} / ${stats.total}. Standard met — today counts.`
        : `Today: ${stats.done} / ${stats.total}. ${stats.needed} more and today counts. Today can't break the streak before it ends.`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[56px] leading-[.9] font-medium tracking-[-0.05em]">
          {streak}
        </span>
        <span className="font-mono text-xs tracking-[.16em] text-muted">
          DAY STREAK
        </span>
        <span className="ml-auto font-mono text-[11px] tracking-[.12em] text-dim">
          LONGEST {longestStreak}
        </span>
      </div>
      <div className="flex flex-col">
        {rules.map((r) => (
          <div
            key={r.t}
            className="flex gap-3 border-t border-white/6 py-3 text-[14.5px] leading-[1.45]"
          >
            <span
              aria-hidden="true"
              className={cx(
                "mt-[7px] size-1.5 shrink-0 rounded-full",
                r.on ? "bg-accent" : "border-[1.5px] border-missed",
              )}
            />
            <span>{r.t}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-raised px-4 py-3.5 text-sm leading-[1.5] text-muted">
        {today}
      </div>
      <button
        type="button"
        onClick={closeSheet}
        className="h-[52px] rounded-[14px] border border-white/12 text-[15px]"
      >
        Got it
      </button>
    </div>
  );
}

const STATE_TEXT = {
  completed: "DONE",
  skipped: "SKIPPED",
  pending: "MISSED",
} as const;

/** A past day from daily_tasks history (read-only: the record). */
export function DaySheet({ date }: { date: string }) {
  const { standard } = useApp();
  const [items, setItems] = useState<DayTask[] | null>(null);
  const [focus, setFocus] = useState({ seconds: 0, sessions: 0 });
  const [error, setError] = useState(false);

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
      ? "Perfect day"
      : state === "met"
        ? "Standard met"
        : state === "missed"
          ? "Standard missed"
          : "Nothing scheduled";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[.16em] text-muted">
            {dateLabel(date)}
          </span>
          <span
            className={cx(
              "text-[15px]",
              items === null
                ? "text-dim"
                : state === "missed"
                  ? "text-danger"
                  : "text-accent",
            )}
          >
            {error
              ? "Could not load this day."
              : items === null
                ? "Loading…"
                : summary}
          </span>
        </span>
        <span
          data-testid="day-pct"
          className="text-[44px] leading-[.85] font-medium tracking-[-0.045em] tabular-nums"
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
              className="flex min-h-12 items-center gap-3 border-t border-white/5"
            >
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px]",
                  missed
                    ? "border-dashed border-missed"
                    : "border-accent bg-accent",
                )}
              >
                <svg width="11" height="11" viewBox="0 0 16 16">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    stroke="#0A0A0B"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: missed ? 0 : 1 }}
                  />
                </svg>
              </span>
              <span
                className={cx(
                  "flex-1 text-[14.5px]",
                  missed ? "text-text" : "text-muted",
                )}
              >
                {it.title}
              </span>
              <span
                className={cx(
                  "font-mono text-[10px] tracking-[.12em]",
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
        <div className="flex items-baseline justify-between border-t border-white/8 pt-3">
          <span className="font-mono text-[10.5px] tracking-[.16em] text-dim">
            FOCUS
          </span>
          <span className="text-[15px] tabular-nums" data-testid="day-focus">
            {focusLabel(focus.seconds)}
            <span className="text-dim">
              {" "}
              · {focus.sessions} {focus.sessions === 1 ? "session" : "sessions"}
            </span>
          </span>
        </div>
      )}
      <span className="text-xs text-dim">
        Skipped tasks stay in the total. Past days are the record.
      </span>
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
  const have = new Set(routines.map((t) => t.name.toLowerCase()));

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
    <div className="flex flex-col gap-[18px]">
      <span className={heading}>USE A TEMPLATE</span>
      <div
        role="radiogroup"
        aria-label="Template"
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
              "h-10 rounded-[10px] border px-3.5 text-sm",
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
              className="flex min-h-[46px] items-center gap-3 border-t border-white/5 text-[15px]"
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
              <span className="font-mono text-[10px] tracking-[.12em] text-dim">
                {owned ? "HAVE" : "NEW"}
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
            placeholder="Add your own"
            aria-label="Add item"
            maxLength={80}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-field px-3.5 text-[15px] outline-none"
          />
          <button
            type="button"
            onClick={addOwn}
            aria-label="Add"
            className="size-11 rounded-xl border border-white/12 text-xl"
          >
            +
          </button>
        </div>
      </div>
      <span className="text-[12.5px] text-dim">
        Every item repeats daily. Items you already have are skipped.
      </span>
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
        className="h-14 rounded-2xl bg-text font-mono text-[12.5px] font-semibold tracking-[.26em] text-bg disabled:opacity-50"
      >
        {busy
          ? "ADDING…"
          : chosen.length
            ? `ADD ${chosen.length} ${chosen.length === 1 ? "ITEM" : "ITEMS"}`
            : "NOTHING NEW"}
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
      setError(res && !res.ok ? res.error : "Network error. Try again.");
      return;
    }
    closeSheet();
    toast({
      text: `Challenge set with ${partner.name}.`,
      sub: draft.title.trim().toUpperCase(),
    });
  }

  const field =
    "h-12 w-full min-w-0 rounded-xl border border-white/10 bg-field px-3.5 text-[15px] outline-none focus:border-white/30";
  const label = "font-mono text-[10.5px] tracking-[.16em] text-dim";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <span className={heading}>NEW CHALLENGE</span>
      <label className="flex flex-col gap-2">
        <span className={label}>TITLE</span>
        <input
          value={draft.title}
          maxLength={40}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className={cx(field, "uppercase")}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className={label} id="challenge-type">
          TYPE
        </span>
        <div
          role="radiogroup"
          aria-labelledby="challenge-type"
          className="grid grid-cols-2 gap-1.5"
        >
          {(
            [
              ["standard_days", "Standard days"],
              ["focus_seconds", "Focus time"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={draft.type === k}
              onClick={() => setType(k)}
              className={cx(
                "h-[46px] rounded-xl border text-[14.5px]",
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
          GOAL ·{" "}
          {draft.type === "standard_days"
            ? "DAYS MEETING YOUR STANDARD"
            : "HOURS OF FOCUS"}
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
          <span className={label}>START</span>
          <input
            type="date"
            min={today}
            value={draft.start}
            onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
            className={field}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-2">
          <span className={label}>END</span>
          <input
            type="date"
            min={draft.start}
            value={draft.end}
            onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
            className={field}
          />
        </label>
      </div>
      <span className="text-[12.5px] text-dim">
        Progress comes from your tasks and focus sessions. The higher total
        wins; the challenge never changes the weekly head-to-head.
      </span>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="h-14 rounded-2xl bg-text font-mono text-[12.5px] font-semibold tracking-[.26em] text-bg disabled:opacity-50"
      >
        {busy ? "CREATING…" : "CREATE"}
      </button>
    </form>
  );
}
