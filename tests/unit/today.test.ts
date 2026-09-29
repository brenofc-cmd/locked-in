import { describe, expect, it } from "vitest";
import {
  groupBySection,
  nextLine,
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
