"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useState } from "react";
import { useApp, type TaskInput } from "@/components/app-state";
import { useSession } from "@/components/session";
import { SwitchTrack, chipTone, cx } from "@/components/ui";
import { DAYS, DAY_LETTERS, dayLabel } from "@/lib/local-date";
import { SKIP_REASONS } from "@/lib/constants";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  validateTaskInput,
} from "@/lib/task-model";
import { SECTION_OF, scheduleLabel } from "@/lib/today";
import {
  addPriority,
  priorityIds,
  removePriority,
  replacePriority,
  topThree,
} from "@/lib/north-star";
import { clearDraft, loadDraft, saveDraft } from "@/lib/resume-state";
import { linkableGoalId, linkableGoals } from "@/lib/goal-proof";
import type { Category, Day, RoutineItem, Task } from "@/types";

const WEEKDAYS: Day[] = ["MON", "TUE", "WED", "THU", "FRI"];
type Repeat = keyof typeof t.taskSheet.repeatModes;
const REPEAT_MODES: Repeat[] = ["daily", "weekdays", "custom"];

const monoLabel = "font-mono text-meta tracking-eyebrow text-dim";
const field =
  "rounded-xl border-[1.5px] border-line-strong bg-field text-text outline-none focus:border-line-bold";

function repeatOf(days: Day[]): Repeat {
  if (days.length === 7) return "daily";
  if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d)))
    return "weekdays";
  return "custom";
}

/**
 * Add task (Quick Add / new routine item), edit today's task, or edit a
 * routine item from the Routine screen. Editing a routine occurrence from
 * Today asks "APPLY CHANGE TO": Today only | Today and future days.
 */
export function TaskFormSheet({
  editing,
  routine,
  repeatByDefault = false,
  prefill,
  goalId: goalPrefill,
}: {
  editing?: Task;
  routine?: RoutineItem;
  repeatByDefault?: boolean;
  /** V2 Phase 2: a suggested title (planner "Add to tasks"); not a draft. */
  prefill?: string;
  /** V2 Phase 5: CRIAR TAREFA from a goal page. */
  goalId?: string;
}) {
  const app = useApp();
  const { me } = useSession();
  const source = editing ?? routine;
  // V2 Resume State: a new task / routine item that was typed but never
  // saved comes back when the sheet is opened again (drafts expire after
  // 24 h). Edits are never drafted: they would overwrite newer data.
  const draftKind = repeatByDefault ? "routine" : "task";
  const drafting = !source && prefill === undefined;
  const [draft] = useState(() =>
    drafting ? loadDraft(me.id, draftKind) : null,
  );
  const [name, setName] = useState(
    prefill ?? draft?.name ?? source?.name ?? "",
  );
  const [repeat, setRepeat] = useState(
    draft?.repeat ??
      (routine ? true : editing ? !editing.once : repeatByDefault),
  );
  const [repeatMode, setRepeatMode] = useState<Repeat>(
    draft?.repeatMode ??
      (source && source.days.length ? repeatOf(source.days) : "daily"),
  );
  const [days, setDays] = useState<Day[]>(
    draft?.days ?? (source && source.days.length ? source.days : DAYS),
  );
  const [more, setMore] = useState(false);
  const [time, setTime] = useState(draft?.time ?? source?.time ?? "");
  const [reminder, setReminder] = useState(
    draft?.reminder ?? source?.reminder ?? false,
  );
  const [category, setCategory] = useState<Category>(
    draft?.category ?? source?.category ?? "custom",
  );
  const [visible, setVisible] = useState(
    draft?.visible ?? source?.visible ?? app.settings.shareNewTasks,
  );
  const [notes, setNotes] = useState(draft?.notes ?? source?.notes ?? "");
  // V2 Phase 5: the goal this action feeds. The current link of an edited
  // task / routine is kept as it is (even if that goal is no longer active);
  // a new choice, a draft or a prefill must be one of my ACTIVE goals.
  const currentGoal = editing
    ? (app.taskGoals[editing.id] ?? null)
    : routine
      ? (app.routineGoals[routine.id] ?? null)
      : null;
  const [goalId, setGoalId] = useState<string | null>(
    () =>
      linkableGoalId(goalPrefill, app.goals) ??
      linkableGoalId(draft?.goalId, app.goals) ??
      currentGoal,
  );
  // V2 Phase 9: NÃO NEGOCIÁVEL (owner-only, never shared, no weight).
  const [nonNegotiable, setNonNegotiable] = useState(
    editing
      ? (app.taskFlags[editing.id] ?? false)
      : routine
        ? (app.routineFlags[routine.id] ?? false)
        : false,
  );
  const goalOptions = linkableGoals(app.goals);
  const keptGoal =
    goalId && !goalOptions.some((g) => g.id === goalId)
      ? app.goals.find((g) => g.id === goalId)
      : undefined;
  const goalTitle = app.goals.find((g) => g.id === goalId)?.title ?? "";
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!drafting || submitted) return;
    saveDraft(me.id, draftKind, {
      name,
      repeat,
      repeatMode,
      days,
      time,
      reminder,
      category,
      visible,
      notes,
      ...(goalId ? { goalId } : {}),
    });
  }, [
    drafting,
    submitted,
    me.id,
    draftKind,
    name,
    repeat,
    repeatMode,
    days,
    time,
    reminder,
    category,
    visible,
    notes,
    goalId,
  ]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 0;

  function input(): TaskInput {
    const d: Day[] = !repeat
      ? []
      : repeatMode === "daily"
        ? DAYS
        : repeatMode === "weekdays"
          ? WEEKDAYS
          : days;
    return {
      name,
      category,
      time,
      days: d,
      once: !repeat,
      visible,
      reminder,
      notes,
      goalId,
      nonNegotiable,
    };
  }

  /** Close at once (the change is optimistic or fast); errors come back as toasts. */
  function run(action: () => Promise<boolean>) {
    app.closeSheet();
    void action();
  }

  function save() {
    if (!valid) return;
    const data = input();
    const invalid = validateTaskInput(data);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (routine) return run(() => app.updateRoutine(routine.id, data));
    if (editing?.routineId) {
      setConfirm(true);
      return;
    }
    if (editing) return run(() => app.updateToday(editing.id, data));
    // The draft goes with the submit; a failed save (rolled back with a
    // toast) puts it back so nothing typed is lost.
    const form = {
      name,
      repeat,
      repeatMode,
      days,
      time,
      reminder,
      category,
      visible,
      notes,
      ...(goalId ? { goalId } : {}),
    };
    setSubmitted(true);
    if (!drafting) return run(() => app.addTask(data));
    clearDraft(me.id, draftKind);
    run(async () => {
      const ok = await app.addTask(data);
      if (!ok) saveDraft(me.id, draftKind, form);
      return ok;
    });
  }

  function remove() {
    if (routine) return run(() => app.archiveRoutine(routine.id));
    if (editing) run(() => app.deleteTask(editing.id));
  }

  if (confirm && editing?.routineId) {
    const routineId = editing.routineId;
    return (
      <div className="flex flex-col gap-2 animate-[li-fade-up_.2s_ease]">
        <span className="pb-2 font-mono text-meta tracking-eyebrow text-muted">
          {t.taskSheet.applyTo}
        </span>
        <button
          type="button"
          onClick={() => run(() => app.updateToday(editing.id, input()))}
          className="h-14 rounded-2xl border border-line-strong bg-raised text-base"
        >
          {t.taskSheet.todayOnly}
        </button>
        <button
          type="button"
          onClick={() => run(() => app.updateRoutine(routineId, input()))}
          className="h-14 rounded-2xl bg-text text-base font-semibold text-bg"
        >
          {t.taskSheet.todayAndFuture}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="h-12 text-body text-dim"
        >
          {t.taskSheet.cancel}
        </button>
      </div>
    );
  }

  const moreSummary = [
    CATEGORY_LABEL[category],
    time,
    goalTitle && t.goalPicker.tag(goalTitle),
    nonNegotiable && t.nonNegotiable.label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex min-h-8 items-center justify-between">
        <span className="font-mono text-meta tracking-eyebrow text-muted">
          {source ? t.taskSheet.editTask : t.taskSheet.addTask}
        </span>
        {source && (
          <button
            type="button"
            onClick={remove}
            className="h-9 rounded-lg px-2.5 text-body text-danger"
          >
            {t.taskSheet.delete}
          </button>
        )}
      </div>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        maxLength={80}
        placeholder={t.taskSheet.namePlaceholder}
        aria-label={t.taskSheet.nameAria}
        enterKeyHint="done"
        className="h-[54px] rounded-xl border-[1.5px] border-line-strong bg-field px-3.5 text-base outline-none focus:border-line-bold"
      />
      {!source && (
        <div
          role="radiogroup"
          aria-label={t.taskSheet.whenAria}
          className="flex gap-1.5"
        >
          {(["Today", "Repeat"] as const).map((w) => {
            const on = (w === "Repeat") === repeat;
            return (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRepeat(w === "Repeat")}
                className={cx(
                  "h-11 flex-1 rounded-xl border text-body",
                  chipTone(on),
                )}
              >
                {w === "Repeat"
                  ? t.taskSheet.whenRepeat
                  : t.taskSheet.whenToday}
              </button>
            );
          })}
        </div>
      )}
      {repeat && (
        <div className="flex flex-col gap-2.5 animate-[li-fade-up_.2s_ease]">
          <span className={monoLabel}>{t.taskSheet.repeat}</span>
          <div
            role="radiogroup"
            aria-label={t.taskSheet.repeatAria}
            className="flex gap-1.5"
          >
            {REPEAT_MODES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={repeatMode === r}
                onClick={() => setRepeatMode(r)}
                className={cx(
                  "h-11 flex-1 rounded-xl border text-body",
                  chipTone(repeatMode === r),
                )}
              >
                {t.taskSheet.repeatModes[r]}
              </button>
            ))}
          </div>
          {repeatMode === "custom" && (
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d, i) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={dayLabel(d)}
                    aria-pressed={on}
                    onClick={() =>
                      setDays(
                        on
                          ? days.filter((x) => x !== d)
                          : DAYS.filter((x) => x === d || days.includes(x)),
                      )
                    }
                    className={cx(
                      "h-12 rounded-xl border p-0 text-body font-semibold active:scale-[.92]",
                      chipTone(on),
                    )}
                  >
                    {DAY_LETTERS[i]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className="flex h-12 items-center justify-between border-t border-line text-body text-muted"
      >
        <span>{t.taskSheet.moreOptions}</span>
        <span className="min-w-0 truncate pl-3 text-small text-dim">
          {moreSummary}{" "}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200"
            style={{ transform: more ? "rotate(90deg)" : "none" }}
          >
            ›
          </span>
        </span>
      </button>
      {more && (
        <div className="flex flex-col gap-4 animate-[li-fade-up_.2s_ease]">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-2">
              <span className={monoLabel}>{t.taskSheet.time}</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={cx(
                  field,
                  "h-[46px] min-w-0 px-3 text-base [color-scheme:dark]",
                )}
              />
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={reminder}
              onClick={() => setReminder((r) => !r)}
              className="flex flex-col gap-2 text-left"
            >
              <span className={monoLabel}>{t.taskSheet.reminder}</span>
              <span className="flex h-[46px] w-full items-center justify-between rounded-xl border border-line-strong px-3 text-body">
                {reminder ? t.taskSheet.on : t.taskSheet.off}
                <SwitchTrack on={reminder} compact />
              </span>
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <span className={monoLabel}>{t.taskSheet.section}</span>
            <div
              role="radiogroup"
              aria-label={t.taskSheet.sectionAria}
              className="flex flex-wrap gap-1.5"
            >
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => setCategory(c)}
                  className={cx(
                    "h-[38px] rounded-xl border px-3 text-small",
                    chipTone(category === c),
                  )}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            onClick={() => setVisible((v) => !v)}
            className="flex min-h-[52px] items-center justify-between text-left"
          >
            <span className="flex flex-col gap-1">
              <span className="text-body">
                {t.taskSheet.visibleTo(app.partner.name)}
              </span>
              <span className="text-num-heros text-dim">
                {t.taskSheet.hiddenNote}
              </span>
            </span>
            <SwitchTrack on={visible} />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={nonNegotiable}
            data-testid="non-negotiable-switch"
            onClick={() => setNonNegotiable((v) => !v)}
            className="flex min-h-[52px] items-center justify-between text-left"
          >
            <span className="flex flex-col gap-1">
              <span className="text-body">{t.nonNegotiable.switch}</span>
              <span className="text-num-heros text-dim">
                {t.nonNegotiable.note}
              </span>
            </span>
            <SwitchTrack on={nonNegotiable} />
          </button>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.taskSheet.notes}
            aria-label={t.taskSheet.notes}
            maxLength={200}
            className={cx(field, "h-[46px] px-3.5 text-base")}
          />
          {(goalOptions.length > 0 || keptGoal) && (
            <label className="flex min-w-0 flex-col gap-2">
              <span className={monoLabel}>{t.goalPicker.label}</span>
              <select
                value={goalId ?? ""}
                onChange={(e) => setGoalId(e.target.value || null)}
                aria-label={t.goalPicker.aria}
                className={cx(
                  field,
                  "h-[46px] min-w-0 px-3 text-base [color-scheme:dark]",
                )}
              >
                <option value="">{t.goalPicker.none}</option>
                {keptGoal && (
                  <option value={keptGoal.id}>{keptGoal.title}</option>
                )}
                {goalOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="-mt-2 text-small text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        aria-disabled={!valid}
        className={cx(
          "h-14 rounded-2xl font-mono text-small font-semibold tracking-brand",
          valid ? "btn-primary" : "bg-selected text-ghost",
        )}
      >
        {source ? t.taskSheet.save : t.taskSheet.add}
      </button>
    </form>
  );
}

/** Skip / edit / delete for one task; V2 Phase 4: mark as a Top 3 priority. */
export function TaskOptionsSheet({ task }: { task: Task }) {
  const app = useApp();
  const [replacing, setReplacing] = useState(false);
  const ids = priorityIds(app.tasks);
  const temp = task.id.startsWith("tmp-");

  async function prioritize(next: string[]) {
    if (await app.setPriorities(next)) {
      app.toast({ text: t.top3.saved, sub: task.name.toUpperCase() });
      app.closeSheet();
    }
  }
  function mark() {
    const next = addPriority(ids, task.id);
    if (next) void prioritize(next);
    else setReplacing(true);
  }

  const meta = [
    SECTION_OF[task.category],
    task.time,
    task.once ? t.taskSheet.todayOnlyTag : scheduleLabel(task.days),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-title font-medium">{task.name}</span>
        <span className="font-mono text-meta tracking-meta text-dim">
          {meta}
        </span>
      </div>
      {task.skip === null ? (
        <div className="flex flex-col gap-2.5">
          <span className={monoLabel}>{t.taskSheet.skipToday}</span>
          <div className="grid grid-cols-2 gap-1.5">
            {SKIP_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => app.skipTask(task.id, r)}
                className="h-12 rounded-xl border border-line-strong bg-raised text-body active:scale-[.96]"
              >
                {r}
              </button>
            ))}
          </div>
          <span className="text-num-heros text-dim">
            {t.taskSheet.skipNote}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => app.unskipTask(task.id)}
          className="h-[52px] rounded-2xl border border-line-strong bg-raised text-body"
        >
          {t.taskSheet.unskip(
            task.skip.replace(t.tasks.skippedWith(""), "").toLowerCase(),
          )}
        </button>
      )}
      {!temp && replacing && (
        <div
          role="group"
          aria-labelledby="top3-full"
          className="flex flex-col gap-2 rounded-2xl border border-line-strong p-4"
        >
          <span id="top3-full" className={monoLabel}>
            {t.top3.fullTitle}
          </span>
          <span className="text-small text-dim">{t.top3.fullHint}</span>
          {topThree(app.tasks).map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={t.top3.replace(p.name)}
              onClick={() =>
                void prioritize(replacePriority(ids, p.id, task.id))
              }
              className="flex h-12 items-center gap-3 rounded-xl border border-line-strong bg-raised px-3 text-left text-body"
            >
              <span className="font-mono text-small text-accent">
                {p.priority}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col">
        {!temp && !replacing && (
          <button
            type="button"
            onClick={() =>
              task.priority !== null
                ? void prioritize(removePriority(ids, task.id))
                : mark()
            }
            className="flex h-[54px] items-center justify-between border-t border-line text-body"
          >
            <span>{task.priority !== null ? t.top3.unmark : t.top3.mark}</span>
            {task.priority !== null && (
              <span className="font-mono text-meta tracking-eyebrow text-accent">
                {task.priority}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "edit", taskId: task.id })}
          className="flex h-[54px] items-center justify-between border-t border-line text-body"
        >
          <span>{t.taskSheet.edit}</span>
          <span aria-hidden="true" className="text-ghost">
            ›
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            app.closeSheet();
            void app.deleteTask(task.id);
          }}
          className="flex h-[54px] items-center border-t border-line text-body text-danger"
        >
          {task.once ? t.taskSheet.delete : t.taskSheet.removeFromRoutine}
        </button>
      </div>
    </div>
  );
}
