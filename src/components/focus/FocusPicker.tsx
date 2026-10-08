"use client";

import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { chipTone, cx } from "@/components/ui";
import { linkableGoals } from "@/lib/goal-proof";
import type { FocusDuration } from "@/types";

/**
 * V2 Phase 5 — TRABALHANDO EM: my own active goals only. Before the start it
 * sets the pick; while the session runs or is paused it changes the session
 * (ADR-067). Private: the partner only ever sees EM FOCO.
 */
export function FocusGoalSelect({ compact = false }: { compact?: boolean }) {
  const { goals, focus, setFocusGoal } = useApp();
  const options = linkableGoals(goals);
  const current = focus.goalId
    ? goals.find((g) => g.id === focus.goalId)
    : undefined;
  if (!options.length && !current) return null;
  const kept = current && !options.some((g) => g.id === current.id);
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="font-mono text-meta tracking-eyebrow text-dim">
        {t.goalPicker.focusLabel}
      </span>
      <select
        value={focus.goalId ?? ""}
        onChange={(e) => void setFocusGoal(e.target.value || null)}
        aria-label={t.goalPicker.focusAria}
        disabled={focus.phase === "complete"}
        className={cx(
          "min-w-0 rounded-xl border-[1.5px] border-line-strong bg-field px-3 text-base text-text outline-none [color-scheme:dark] focus:border-line-bold",
          compact ? "h-11" : "h-12",
        )}
      >
        <option value="">{t.goalPicker.focusNone}</option>
        {kept && <option value={current.id}>{current.title}</option>}
        {options.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title}
          </option>
        ))}
      </select>
    </label>
  );
}

const DURATIONS: { value: FocusDuration; n: string; u: string }[] = [
  { value: 25, n: "25", u: t.focusUi.min },
  { value: 50, n: "50", u: t.focusUi.min },
  { value: 90, n: "90", u: t.focusUi.min },
  { value: "custom", n: "—", u: t.focusUi.custom },
];

/**
 * Activity radio list + duration tiles. Used on /focus and in the Lock In sheet.
 * Today's open tasks come first (the session links to the task), then presets.
 */
export function FocusPicker({ compact = false }: { compact?: boolean }) {
  const {
    focus,
    focusOptions,
    setFocusTask,
    setFocusDur,
    setFocusCustom,
    taskGoals,
    goals,
  } = useApp();
  /** A task that feeds an active goal brings the goal along. */
  const goalOf = (taskId: string | null) => {
    const id = taskId ? taskGoals[taskId] : null;
    return id && goals.some((g) => g.id === id && g.status === "active")
      ? id
      : undefined;
  };

  return (
    <>
      <div
        role="radiogroup"
        aria-label={t.focusUi.questionAria}
        className="flex flex-col"
      >
        {focusOptions.map(({ title: label, taskId }) => {
          const on = focus.task === label && focus.taskId === taskId;
          return (
            <button
              key={`${taskId ?? "preset"}:${label}`}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFocusTask(label, taskId, goalOf(taskId))}
              className={cx(
                "flex items-center justify-between border-b border-line px-0.5 text-left font-medium",
                compact ? "h-[54px] text-base" : "min-h-[58px] text-lead",
                on ? "text-text" : "text-muted",
              )}
            >
              <span>{label}</span>
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-6 items-center justify-center rounded-full border-[1.5px]",
                  on ? "border-accent" : "border-line-check",
                )}
              >
                <span
                  className="size-3 rounded-full bg-accent transition-transform duration-200 ease-[cubic-bezier(.3,1.6,.5,1)]"
                  style={{ transform: on ? "scale(1)" : "scale(0)" }}
                />
              </span>
            </button>
          );
        })}
      </div>
      <div
        role="radiogroup"
        aria-label={t.focusUi.durationAria}
        className="grid grid-cols-4 gap-2"
      >
        {DURATIONS.map((d) => {
          const on = focus.dur === d.value;
          return (
            <button
              key={d.u + d.n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={
                d.value === "custom"
                  ? t.focusUi.customDurationAria
                  : t.focusUi.minutesAria(d.n)
              }
              onClick={() => setFocusDur(d.value)}
              className={cx(
                "flex flex-col items-center justify-center gap-0.5 rounded-2xl border-[1.5px] p-0 transition-all duration-150 active:scale-[.95]",
                compact ? "h-[68px]" : "h-[76px]",
                chipTone(on),
              )}
            >
              <span
                className={cx(
                  "num leading-none [font-stretch:70%]",
                  compact ? "text-[1.75rem]" : "text-[1.875rem]",
                )}
              >
                {d.value === "custom" && focus.custom ? focus.custom : d.n}
              </span>
              <span className="font-mono text-meta tracking-eyebrow text-dim">
                {d.u}
              </span>
            </button>
          );
        })}
      </div>
      {focus.dur === "custom" && (
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={5}
            max={240}
            value={focus.custom}
            onChange={(e) => setFocusCustom(e.target.value)}
            placeholder="45"
            aria-label={t.focusUi.customMinutesAria}
            className="h-12 w-[110px] rounded-xl border-[1.5px] border-line-strong bg-field px-3.5 text-lead outline-none"
          />
          <span className="font-mono text-meta tracking-eyebrow text-dim">
            {t.focusUi.minutes}
          </span>
        </div>
      )}
      <FocusGoalSelect compact={compact} />
    </>
  );
}
