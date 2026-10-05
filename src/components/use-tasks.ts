"use client";

/**
 * REAL task and routine state (Stage 4). Initial data comes from the server
 * ((app)/layout.tsx -> loadAppData); every change is applied optimistically,
 * persisted with a Server Action, then reconciled with the returned row or
 * rolled back with a message. No realtime (Stage 5): other devices see
 * changes on their next load.
 */
import { t } from "@/i18n/pt-BR";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addTask as addTaskAction,
  applyTemplate as applyTemplateAction,
  archiveRoutine,
  deleteOneOff,
  linkRoutineToGoal,
  reorderRoutines,
  setDailyPriorities,
  setTaskStatus,
  updateRoutine as updateRoutineAction,
  updateTaskToday,
} from "@/app/(app)/task-actions";
import type { GoalOption } from "@/lib/goal-proof";
import { localTimeHM, normalizeDays } from "@/lib/local-date";
import type { TasksData } from "@/lib/session";
import {
  routineFromRow,
  skipLabel,
  taskFromRow,
  type DailyTaskRow,
  type Flags,
  type GoalLinks,
  type RoutineRow,
  type TaskInput,
} from "@/lib/task-model";
import type { Category, RoutineItem, Task, TaskStatus, Toast } from "@/types";

type Effects = {
  toast: (t: Omit<Toast, "id">) => void;
  /** A task was completed / un-completed (optimistic line in the live feed). */
  onDone: (task: Task, done: boolean) => void;
};

const byOrder = (a: RoutineItem, b: RoutineItem) => a.sortOrder - b.sortOrder;

let tmp = 0;

export function useTasks(initial: TasksData, timeZone: string, fx: Effects) {
  const [today] = useState(initial.today);
  const [routines, setRoutines] = useState<RoutineItem[]>(() =>
    initial.routines.map(routineFromRow).sort(byOrder),
  );
  const [tasks, setTasks] = useState<Task[]>(() => {
    const map = new Map(initial.routines.map((r) => [r.id, routineFromRow(r)]));
    return initial.tasks.map((t) => taskFromRow(t, map, timeZone));
  });
  const [pop, setPop] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // V2 Phase 5: my goals and the goal of each action (owner-only links).
  const [goals, setGoals] = useState<GoalOption[]>(initial.goals);
  const [taskGoals, setTaskGoals] = useState<GoalLinks>(initial.taskGoals);
  const [routineGoals, setRoutineGoals] = useState<GoalLinks>(
    initial.routineGoals,
  );
  // V2 Phase 9: NÃO NEGOCIÁVEL flags (owner-only), merged like the links.
  const [taskFlags, setTaskFlags] = useState<Flags>(initial.taskFlags);
  const [routineFlags, setRoutineFlags] = useState<Flags>(initial.routineFlags);
  const mergeLinks = useCallback(
    (
      res: {
        taskGoals?: GoalLinks;
        routineGoals?: GoalLinks;
        taskFlags?: Flags;
        routineFlags?: Flags;
      },
      dropTaskIds: string[] = [],
    ) => {
      setTaskGoals((m) => {
        const next = { ...m };
        for (const id of dropTaskIds) delete next[id];
        return { ...next, ...res.taskGoals };
      });
      setTaskFlags((m) => {
        const next = { ...m };
        for (const id of dropTaskIds) delete next[id];
        return { ...next, ...res.taskFlags };
      });
      if (res.routineGoals)
        setRoutineGoals((m) => ({ ...m, ...res.routineGoals }));
      if (res.routineFlags)
        setRoutineFlags((m) => ({ ...m, ...res.routineFlags }));
    },
    [],
  );

  const routineMap = useMemo(
    () => new Map(routines.map((r) => [r.id, r])),
    [routines],
  );
  // Latest values for async callbacks; synced before the browser paints, so
  // every event handler sees the state it is acting on.
  const routineMapRef = useRef(routineMap);
  const tasksRef = useRef(tasks);
  const taskGoalsRef = useRef(taskGoals);
  const taskFlagsRef = useRef(taskFlags);
  useLayoutEffect(() => {
    routineMapRef.current = routineMap;
    tasksRef.current = tasks;
    taskGoalsRef.current = taskGoals;
    taskFlagsRef.current = taskFlags;
  }, [routineMap, tasks, taskGoals, taskFlags]);

  /** Latest request per task: stale responses never overwrite newer taps. */
  const versions = useRef(new Map<string, number>());
  const bump = (id: string) => {
    const v = (versions.current.get(id) ?? 0) + 1;
    versions.current.set(id, v);
    return v;
  };
  const isLatest = (id: string, v: number) => versions.current.get(id) === v;

  const patch = useCallback((id: string, change: Partial<Task>) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...change } : t)));
  }, []);

  /** Upsert rows returned by the server into local state. */
  const merge = useCallback(
    (
      routineRows: RoutineRow[],
      taskRows: DailyTaskRow[],
      removeTaskIds: string[] = [],
    ) => {
      const fresh = routineRows.map(routineFromRow);
      const map = new Map(routineMapRef.current);
      fresh.forEach((r) => map.set(r.id, r));
      if (fresh.length) {
        setRoutines((rs) => {
          const next = rs.filter((r) => !fresh.some((f) => f.id === r.id));
          return [...next, ...fresh].sort(byOrder);
        });
      }
      const mapped = taskRows
        .filter((t) => t.task_date === today)
        .map((t) => taskFromRow(t, map, timeZone));
      setTasks((ts) => {
        const drop = new Set([...removeTaskIds, ...mapped.map((m) => m.id)]);
        const next = ts
          .filter((t) => !drop.has(t.id))
          .map((t) =>
            t.routineId && map.has(t.routineId)
              ? { ...t, days: map.get(t.routineId)!.days }
              : t,
          );
        return [...next, ...mapped];
      });
    },
    [today, timeZone],
  );

  // ---- status: complete / undo / skip / unskip -----------------------------

  const setStatus = useCallback(
    async (id: string, status: TaskStatus, reason: string | null = null) => {
      const before = tasksRef.current.find((t) => t.id === id);
      if (!before || id.startsWith("tmp-")) return false;
      const v = bump(id);
      patch(id, {
        status,
        done: status === "completed",
        doneAt:
          status === "completed" ? localTimeHM(new Date(), timeZone) : null,
        skip: status === "skipped" ? skipLabel(reason) : null,
        skipReason: status === "skipped" ? reason : null,
        unsynced: false,
      });
      const res = await setTaskStatus(id, status, reason).catch(() => null);
      if (!isLatest(id, v)) return true;
      if (res?.ok) {
        const fresh = taskFromRow(res.task, routineMapRef.current, timeZone);
        patch(id, { ...fresh, unsynced: false });
        return true;
      }
      patch(id, before);
      fx.toast({
        text: res?.error ?? t.errors.network,
        sub: before.name.toUpperCase(),
      });
      return false;
    },
    [fx, patch, timeZone],
  );

  const setDone = useCallback(
    (id: string, done: boolean) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task || task.done === done) return;
      setPop(id);
      setTimeout(() => setPop((p) => (p === id ? null : p)), 180);
      if (done) {
        setFlash(id);
        setTimeout(() => setFlash((f) => (f === id ? null : f)), 700);
      }
      fx.onDone(task, done);
      void setStatus(id, done ? "completed" : "pending").then((ok) => {
        if (!ok) fx.onDone(task, !done);
      });
    },
    [fx, setStatus],
  );

  const skipTask = useCallback(
    (id: string, reason: string) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (task?.done) fx.onDone(task, false);
      void setStatus(id, "skipped", reason);
    },
    [fx, setStatus],
  );

  const unskipTask = useCallback(
    (id: string) => void setStatus(id, "pending"),
    [setStatus],
  );

  // ---- create ----------------------------------------------------------------

  const addTask = useCallback(
    async (input: TaskInput) => {
      let tempId: string | null = null;
      if (input.once) {
        // Optimistic one-off: shown at once, replaced by the real row.
        tempId = `tmp-${++tmp}`;
        const temp: Task = {
          id: tempId,
          routineId: null,
          date: today,
          name: input.name.trim(),
          category: input.category,
          time: input.time,
          meta: input.notes.trim(),
          days: [],
          once: true,
          status: "pending",
          done: false,
          doneAt: null,
          skip: null,
          skipReason: null,
          visible: input.visible,
          reminder: input.reminder,
          notes: input.notes.trim(),
          sortOrder: 100000,
          priority: null,
          unsynced: false,
        };
        setTasks((ts) => [...ts, temp]);
        const tempGoal = input.goalId ?? null;
        setTaskGoals((m) => ({ ...m, [tempId!]: tempGoal }));
        const tempFlag = Boolean(input.nonNegotiable);
        setTaskFlags((m) => ({ ...m, [tempId!]: tempFlag }));
      }
      const res = await addTaskAction({
        ...input,
        days: normalizeDays(input.days),
      }).catch(() => null);
      if (!res?.ok) {
        if (tempId) {
          setTasks((ts) => ts.filter((t) => t.id !== tempId));
          mergeLinks({}, [tempId]);
        }
        fx.toast({
          text: res?.error ?? t.errors.network,
          sub: t.taskToasts.notSaved,
        });
        return false;
      }
      merge(res.routines, res.tasks, tempId ? [tempId] : []);
      mergeLinks(res, tempId ? [tempId] : []);
      fx.toast({
        text: input.once ? t.taskToasts.addedToday : t.taskToasts.addedStandard,
        sub: input.name.trim().toUpperCase(),
      });
      return true;
    },
    [fx, merge, mergeLinks, today],
  );

  // One template application at a time (the database also serialises and
  // skips items that already exist, so a double click adds nothing twice).
  const applying = useRef(false);
  const applyTemplate = useCallback(
    async (items: { name: string; category: Category }[], visible = true) => {
      if (applying.current) return false;
      const have = new Set(routines.map((r) => r.name.toLowerCase()));
      const fresh = items.filter((i) => !have.has(i.name.toLowerCase()));
      if (fresh.length === 0) {
        fx.toast({ text: t.taskToasts.nothingNew, sub: t.taskToasts.routine });
        return true;
      }
      applying.current = true;
      const res = await applyTemplateAction(fresh, visible).catch(() => null);
      applying.current = false;
      if (!res?.ok) {
        fx.toast({
          text: res?.error ?? t.taskToasts.networkTryAgain,
          sub: t.taskToasts.routine,
        });
        return false;
      }
      merge(res.routines, res.tasks);
      mergeLinks(res);
      const n = res.routines.length;
      fx.toast({
        text: n ? t.taskToasts.itemsAdded(n) : t.taskToasts.nothingNew,
        sub: t.taskToasts.routine,
      });
      return true;
    },
    [fx, merge, mergeLinks, routines],
  );

  // ---- edit ------------------------------------------------------------------

  /** Today only: this task (or one-off) changes; the routine does not. */
  const updateToday = useCallback(
    async (id: string, input: TaskInput) => {
      const before = tasksRef.current.find((t) => t.id === id);
      if (!before) return false;
      const goalBefore = taskGoalsRef.current[id] ?? null;
      const flagBefore = taskFlagsRef.current[id] ?? false;
      const v = bump(id);
      patch(id, {
        name: input.name.trim(),
        category: input.category,
        time: input.time,
        meta: input.notes.trim(),
        notes: input.notes.trim(),
        visible: input.visible,
        reminder: input.reminder,
      });
      if (input.goalId !== undefined)
        setTaskGoals((m) => ({ ...m, [id]: input.goalId ?? null }));
      if (input.nonNegotiable !== undefined) {
        const flag = input.nonNegotiable;
        setTaskFlags((m) => ({ ...m, [id]: flag }));
      }
      const res = await updateTaskToday(id, input).catch(() => null);
      if (!isLatest(id, v)) return true;
      if (res?.ok) {
        patch(id, taskFromRow(res.task, routineMapRef.current, timeZone));
        setTaskGoals((m) => ({ ...m, [id]: res.goalId }));
        setTaskFlags((m) => ({ ...m, [id]: res.nonNegotiable }));
        fx.toast({
          text: t.taskToasts.taskUpdated,
          sub: t.taskToasts.todayOnly,
        });
        return true;
      }
      patch(id, before);
      setTaskGoals((m) => ({ ...m, [id]: goalBefore }));
      setTaskFlags((m) => ({ ...m, [id]: flagBefore }));
      fx.toast({
        text: res?.error ?? t.taskToasts.networkTryAgain,
        sub: t.taskToasts.notSaved,
      });
      return false;
    },
    [fx, patch, timeZone],
  );

  /** Today and future days: template + today's occurrence. History stays. */
  const updateRoutine = useCallback(
    async (routineId: string, input: TaskInput) => {
      const res = await updateRoutineAction(routineId, {
        ...input,
        days: normalizeDays(input.days),
      }).catch(() => null);
      if (!res?.ok) {
        fx.toast({
          text: res?.error ?? t.taskToasts.networkTryAgain,
          sub: t.taskToasts.notSaved,
        });
        return false;
      }
      // Today's occurrence may have been created, updated or removed.
      const stale = tasksRef.current
        .filter((t) => t.routineId === routineId)
        .map((t) => t.id);
      merge(res.routines, res.tasks, stale);
      mergeLinks(res, stale);
      fx.toast({
        text: t.taskToasts.routineUpdated,
        sub: t.taskToasts.todayAndFuture,
      });
      return true;
    },
    [fx, merge, mergeLinks],
  );

  /** V2 Phase 5 (goal page): a routine starts / stops feeding a goal. */
  const linkRoutine = useCallback(
    async (routineId: string, goalId: string | null) => {
      const res = await linkRoutineToGoal(routineId, goalId).catch(() => null);
      if (!res?.ok) {
        fx.toast({
          text: res?.error ?? t.proof.errors.link,
          sub: t.proof.linked,
        });
        return false;
      }
      const stale = tasksRef.current
        .filter((x) => x.routineId === routineId)
        .map((x) => x.id);
      merge(res.routines, res.tasks, stale);
      mergeLinks(res, stale);
      return true;
    },
    [fx, merge, mergeLinks],
  );

  // ---- remove ----------------------------------------------------------------

  const archive = useCallback(
    async (routineId: string) => {
      const beforeRoutines = routines;
      const beforeTasks = tasksRef.current;
      const name = routineMapRef.current.get(routineId)?.name ?? "";
      setRoutines((rs) => rs.filter((r) => r.id !== routineId));
      setTasks((ts) =>
        ts.filter(
          (t) => !(t.routineId === routineId && t.status === "pending"),
        ),
      );
      const res = await archiveRoutine(routineId).catch(() => null);
      if (!res?.ok) {
        setRoutines(beforeRoutines);
        setTasks(beforeTasks);
        fx.toast({
          text: res?.error ?? t.taskToasts.networkTryAgain,
          sub: t.taskToasts.notRemoved,
        });
        return false;
      }
      fx.toast({
        text: t.taskToasts.removedFromRoutine,
        sub: name.toUpperCase(),
      });
      return true;
    },
    [fx, routines],
  );

  /** One-off: deleted. Routine occurrence: the routine item is archived. */
  const deleteTask = useCallback(
    async (id: string) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task) return false;
      if (task.routineId) return archive(task.routineId);
      setTasks((ts) => ts.filter((t) => t.id !== id));
      const res = await deleteOneOff(id).catch(() => null);
      if (!res?.ok) {
        setTasks((ts) => [...ts, task]);
        fx.toast({
          text: res?.error ?? t.taskToasts.networkTryAgain,
          sub: t.taskToasts.notDeleted,
        });
        return false;
      }
      fx.toast({
        text: t.taskToasts.taskDeleted,
        sub: task.name.toUpperCase(),
      });
      return true;
    },
    [archive, fx],
  );

  // ---- order -------------------------------------------------------------------

  const moveRoutine = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const before = routines;
      const list = [...routines];
      const i = list.findIndex((r) => r.id === fromId);
      const j = list.findIndex((r) => r.id === toId);
      if (i < 0 || j < 0) return;
      const [moved] = list.splice(i, 1);
      list.splice(j, 0, moved);
      const next = list.map((r, k) => ({ ...r, sortOrder: (k + 1) * 10 }));
      const order = new Map(next.map((r) => [r.id, r.sortOrder]));
      setRoutines(next);
      setTasks((ts) =>
        ts.map((t) =>
          t.routineId && order.has(t.routineId)
            ? { ...t, sortOrder: order.get(t.routineId)! }
            : t,
        ),
      );
      void reorderRoutines(next.map((r) => r.id))
        .catch(() => null)
        .then((res) => {
          if (res?.ok) return;
          setRoutines(before);
          fx.toast({
            text: res?.error ?? t.taskToasts.networkOrderNotSaved,
            sub: t.taskToasts.routine,
          });
        });
    },
    [fx, routines],
  );

  // ---- Top 3 (V2 Phase 4) -----------------------------------------------------

  /** Replaces today's priorities with `ids` in rank order (0..3). */
  const setPriorities = useCallback(
    async (ids: string[]) => {
      const before = tasksRef.current;
      const rank = new Map(ids.map((id, i) => [id, i + 1]));
      setTasks((ts) =>
        ts.map((t) => ({ ...t, priority: rank.get(t.id) ?? null })),
      );
      const res = await setDailyPriorities(ids).catch(() => null);
      if (!res?.ok) {
        setTasks(before);
        fx.toast({
          text: res?.error ?? t.errors.network,
          sub: t.top3.toastSub,
        });
        return false;
      }
      const fresh = new Map(res.tasks.map((r) => [r.id, r.priority_rank]));
      setTasks((ts) =>
        ts.map((x) => ({ ...x, priority: fresh.get(x.id) ?? null })),
      );
      return true;
    },
    [fx],
  );

  return {
    today,
    tasks,
    routines,
    pop,
    flash,
    setDone,
    skipTask,
    unskipTask,
    addTask,
    applyTemplate,
    updateToday,
    updateRoutine,
    archiveRoutine: archive,
    deleteTask,
    moveRoutine,
    setPriorities,
    goals,
    /** /goals keeps this list current (new, renamed, archived goals). */
    syncGoals: setGoals,
    taskGoals,
    routineGoals,
    taskFlags,
    routineFlags,
    linkRoutine,
  };
}
