import { describe, expect, it } from "vitest";
import {
  dayPills,
  groupBySection,
  nextTaskId,
  nextLine,
  ritualState,
  routinesOn,
  scheduleLabel,
  todayStats,
} from "@/lib/today";
import type { RoutineItem, Task } from "@/types";
import { DESIGN_DAY } from "../fixtures/design-day";

const DAYS_ALL = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const today: Task[] = DESIGN_DAY.filter((d) => d.today !== false).map(
  (d, i) => ({
    id: `t${i}`,
    routineId: `r${i}`,
    date: "2026-09-24",
    name: d.name,
    category: d.category,
    time: d.time,
    meta: d.notes,
    days: [...DAYS_ALL],
    once: false,
    status: d.done ? "completed" : "pending",
    done: d.done,
    doneAt: d.done ? "08:00" : null,
    skip: null,
    skipReason: null,
    visible: true,
    reminder: false,
    notes: d.notes,
    sortOrder: (i + 1) * 10,
    priority: null,
    unsynced: false,
  }),
);

const skip = (t: Task): Task => ({
  ...t,
  status: "skipped",
  done: false,
  skip: "SKIPPED · REST",
});

describe("today stats", () => {
  it("matches the design numbers: 8 / 12, 67%", () => {
    const s = todayStats(today, 80);
    expect(s).toMatchObject({ done: 8, total: 12, pct: 67, perfect: false });
    expect(s.needed).toBe(2);
    expect(nextLine(s)).toBe("Faltam 2 para atingir seu padrão.");
  });

  it("keeps skipped tasks in the total: 8 done, 1 skipped, 1 pending of 10 -> 80%", () => {
    const ten = today.slice(0, 10).map((t, i) => (i === 3 ? skip(t) : t)); // Morning Run skipped
    const s = todayStats(ten, 80);
    expect(s).toMatchObject({ done: 8, total: 10, pct: 80 });
    expect(s.pct).not.toBe(89);
  });

  it("a skipped task prevents a perfect day", () => {
    const all = today.map((t, i) => (i === 0 ? skip(t) : { ...t, done: true }));
    expect(todayStats(all, 80).perfect).toBe(false);
  });

  it("reports a perfect day", () => {
    const all = today.map((t) => ({ ...t, done: true }));
    const s = todayStats(all, 80);
    expect(s.perfect).toBe(true);
    expect(nextLine(s)).toBe("Todas as tarefas concluídas.");
  });

  it("shows an empty day", () => {
    expect(todayStats([], 80)).toMatchObject({
      total: 0,
      pct: 0,
      perfect: false,
    });
    expect(nextLine(todayStats([], 80))).toBe("Nada agendado para hoje.");
  });

  it("groups into the design's sections, in order, manual order inside", () => {
    const sections = groupBySection(today);
    expect(sections.map((s) => [s.name, s.count])).toEqual([
      ["MANHÃ", "3 / 4"],
      ["TRABALHO / ESTUDO", "3 / 3"],
      ["CORPO", "2 / 3"],
      ["NOITE", "0 / 2"],
    ]);
    // sort_order wins over time: Drink water (06:10) stays before Make bed (06:05).
    expect(sections[0].tasks.map((t) => t.name)).toEqual([
      "Wake up",
      "Drink water",
      "Make bed",
      "Morning Run",
    ]);
  });

  it("lists routine items resting today", () => {
    const routines: RoutineItem[] = [
      {
        id: "a",
        name: "Gym",
        category: "body",
        time: "",
        days: ["MON", "WED", "FRI"],
        visible: true,
        reminder: false,
        notes: "",
        sortOrder: 10,
      },
      {
        id: "b",
        name: "Long run",
        category: "body",
        time: "",
        days: ["SAT"],
        visible: true,
        reminder: false,
        notes: "",
        sortOrder: 20,
      },
    ];
    expect(routinesOn(routines, "WED").off.map((r) => r.name)).toEqual([
      "Long run",
    ]);
    expect(routinesOn(routines, "SAT").on.map((r) => r.name)).toEqual([
      "Long run",
    ]);
  });

  it("labels schedules", () => {
    expect(scheduleLabel(["MON", "TUE", "WED", "THU", "FRI"])).toBe(
      "DIAS ÚTEIS",
    );
    expect(scheduleLabel([...DAYS_ALL])).toBe("TODOS OS DIAS");
    expect(scheduleLabel(["MON", "WED"])).toBe("SEG QUA");
  });
});

describe("nextTaskId (V3)", () => {
  it("points at the first open task in list order", () => {
    const first = groupBySection(today)
      .flatMap((s) => s.tasks)
      .find((t) => !t.done);
    expect(nextTaskId(today)).toBe(first?.id);
  });

  it("prefers the best-ranked open Top 3 task", () => {
    const open = today.filter((t) => !t.done);
    const tasks = today.map((t) =>
      t.id === open[2].id
        ? { ...t, priority: 1 }
        : t.id === open[1].id
          ? { ...t, priority: 2 }
          : t,
    );
    expect(nextTaskId(tasks)).toBe(open[2].id);
  });

  it("never points at a done or skipped task, and is null when nothing is open", () => {
    const firstOpen = nextTaskId(today)!;
    const skipped = today.map((t) => (t.id === firstOpen ? skip(t) : t));
    expect(nextTaskId(skipped)).not.toBe(firstOpen);
    const allDone = today.map((t) => ({ ...t, done: true }));
    expect(nextTaskId(allDone)).toBeNull();
  });
});

describe("dayPills (V3)", () => {
  it("one pill per task in list order: done, skip, next, open", () => {
    const order = groupBySection(today).flatMap((s) => s.tasks);
    const open = order.filter((t) => !t.done);
    const skipId = open[1].id;
    const tasks = today.map((t) =>
      t.id === skipId
        ? { ...t, skip: "PULADA", status: "skipped" as const }
        : t,
    );
    const next = nextTaskId(tasks);
    const pills = dayPills(tasks, next);
    expect(pills).toHaveLength(today.length);
    order.forEach((t, i) => {
      const want = t.done
        ? "done"
        : t.id === skipId
          ? "skip"
          : t.id === next
            ? "next"
            : "open";
      expect(pills[i]).toBe(want);
    });
    expect(pills.filter((p) => p === "next")).toHaveLength(1);
    expect(pills.filter((p) => p === "done")).toHaveLength(
      todayStats(tasks, 70).done,
    );
  });

  it("no next pill when nothing is open", () => {
    const all = today.map((t) => ({ ...t, done: true }));
    expect(dayPills(all, nextTaskId(all))).not.toContain("next");
  });
});

describe("ritualState (V3.2 Morning Ritual)", () => {
  const state = (tasks: Task[]) =>
    ritualState(
      todayStats(tasks, 80),
      tasks.find((x) => x.id === nextTaskId(tasks)),
    );
  const open = (t: Task): Task => ({
    ...t,
    status: "pending",
    done: false,
    doneAt: null,
  });
  const done = (t: Task): Task => ({ ...t, status: "completed", done: true });

  it("no tasks → empty (nothing is invented)", () => {
    expect(state([])).toBe("empty");
  });
  it("nothing done yet → fresh, even with a streak of 0", () => {
    expect(state(today.map(open))).toBe("fresh");
  });
  it("some proof already → going", () => {
    expect(state(today)).toBe("going");
  });
  it("every task done → done", () => {
    expect(state(today.map(done))).toBe("done");
  });
  it("the rest skipped → done (nothing left to start)", () => {
    expect(state(today.map((t) => (t.done ? t : skip(t))))).toBe("done");
  });
  it("everything skipped → done, never fresh", () => {
    expect(state(today.map((t) => skip(open(t))))).toBe("done");
  });
});
