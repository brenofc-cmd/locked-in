import { describe, expect, it } from "vitest";
import { t } from "@/i18n/pt-BR";
import {
  accountDay,
  addDays,
  dateLabel,
  dayToIso,
  daysBetween,
  isoToDay,
  isoWeekday,
  localDateISO,
  localTimeHM,
  normalizeDays,
  weekdayName,
} from "@/lib/local-date";
import {
  daysFromDb,
  daysToDb,
  routineFromRow,
  skipLabel,
  taskErrorMessage,
  taskFromRow,
  timeFromDb,
  timeToDb,
  validateTaskInput,
  type DailyTaskRow,
  type RoutineRow,
  type TaskInput,
} from "@/lib/task-model";

describe("ISO weekdays", () => {
  it("uses 1 = Monday … 7 = Sunday everywhere", () => {
    expect(dayToIso("MON")).toBe(1);
    expect(dayToIso("SUN")).toBe(7);
    expect(isoToDay(3)).toBe("WED");
    expect(isoWeekday("2026-09-21")).toBe(1); // Monday
    expect(isoWeekday("2026-09-24")).toBe(4); // Thursday
    expect(isoWeekday("2026-09-27")).toBe(7); // Sunday
  });

  it("normalises order and duplicates", () => {
    expect(normalizeDays(["FRI", "MON", "FRI"])).toEqual(["MON", "FRI"]);
    expect(daysToDb(["SUN", "MON", "MON"])).toEqual([1, 7]);
    expect(daysFromDb([7, 3, 3, 9, 0])).toEqual(["WED", "SUN"]);
  });
});

describe("local dates (timezone, not UTC)", () => {
  // 2026-09-24T02:30Z: still the 23rd in São Paulo, already the 24th in Tokyo.
  const instant = new Date("2026-09-24T02:30:00Z");

  it("derives the calendar date from the timezone", () => {
    expect(localDateISO("America/Sao_Paulo", instant)).toBe("2026-09-23");
    expect(localDateISO("Asia/Tokyo", instant)).toBe("2026-09-24");
    expect(localDateISO("UTC", instant)).toBe("2026-09-24");
    expect(localDateISO("Pacific/Kiritimati", instant)).toBe("2026-09-24");
    expect(localDateISO("Pacific/Pago_Pago", instant)).toBe("2026-09-23");
  });

  it("formats local times of an instant", () => {
    expect(localTimeHM(instant, "America/Sao_Paulo")).toBe("23:30");
    expect(localTimeHM("2026-09-24T09:05:00Z", "Europe/London")).toBe("10:05");
  });

  it("does date arithmetic on calendar dates (DST-safe)", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-09-20", "2026-09-24")).toBe(4);
    // Across the European DST change (2026-10-25).
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("labels days", () => {
    expect(dateLabel("2026-09-24")).toBe("QUI, 24 SET");
    expect(weekdayName("2026-09-27")).toBe(t.dates.weekdaysLong[6]);
    expect(
      accountDay("2026-09-11T12:00:00Z", "America/Sao_Paulo", "2026-09-24"),
    ).toBe(14);
    // Account created at 23:30 local on the 10th is day 1 on the 10th, not the 11th.
    expect(
      accountDay("2026-09-11T02:30:00Z", "America/Sao_Paulo", "2026-09-10"),
    ).toBe(1);
  });
});

const routineRow: RoutineRow = {
  id: "r1",
  owner_id: "u1",
  title: "Morning Run",
  category: "morning",
  days_of_week: [1, 2, 3, 4, 5],
  scheduled_time: "06:30:00",
  sort_order: 20,
  visible_to_partner: true,
  notes: "5 KM",
  reminder: false,
  start_date: "2026-09-20",
  end_date: null,
  materialized_through: "2026-09-24",
  created_at: "2026-09-20T09:00:00Z",
  updated_at: "2026-09-20T09:00:00Z",
};

const taskRow: DailyTaskRow = {
  id: "t1",
  owner_id: "u1",
  routine_item_id: "r1",
  task_date: "2026-09-24",
  title: "Morning Run",
  category: "morning",
  scheduled_time: "06:30:00",
  sort_order: 20,
  visible_to_partner: true,
  notes: "5 KM",
  reminder: false,
  status: "completed",
  skip_reason: null,
  completed_at: "2026-09-24T09:41:00Z",
  skipped_at: null,
  created_at: "2026-09-24T03:00:00Z",
  updated_at: "2026-09-24T09:41:00Z",
};

describe("row mapping", () => {
  const routine = routineFromRow(routineRow);
  const routines = new Map([[routine.id, routine]]);

  it("maps a routine item", () => {
    expect(routine).toMatchObject({
      name: "Morning Run",
      time: "06:30",
      days: ["MON", "TUE", "WED", "THU", "FRI"],
      sortOrder: 20,
    });
  });

  it("maps a completed occurrence with a local completion time", () => {
    expect(taskFromRow(taskRow, routines, "America/Sao_Paulo")).toMatchObject({
      routineId: "r1",
      once: false,
      done: true,
      doneAt: "06:41",
      skip: null,
      meta: "5 KM",
      days: ["MON", "TUE", "WED", "THU", "FRI"],
    });
  });

  it("maps skipped and one-off tasks", () => {
    const skipped = taskFromRow(
      {
        ...taskRow,
        status: "skipped",
        completed_at: null,
        skipped_at: taskRow.completed_at,
        skip_reason: "Sick",
      },
      routines,
      "UTC",
    );
    expect(skipped).toMatchObject({
      done: false,
      skip: "PULADA · SICK",
      status: "skipped",
    });
    const once = taskFromRow(
      {
        ...taskRow,
        routine_item_id: null,
        status: "pending",
        completed_at: null,
      },
      routines,
      "UTC",
    );
    expect(once).toMatchObject({ once: true, days: [], doneAt: null });
    expect(skipLabel(null)).toBe("PULADA");
  });

  it("converts times", () => {
    expect(timeFromDb("22:45:00")).toBe("22:45");
    expect(timeFromDb(null)).toBe("");
    expect(timeToDb("")).toBeNull();
    expect(timeToDb("07:05")).toBe("07:05");
  });
});

describe("task input validation", () => {
  const base: TaskInput = {
    name: "Gym",
    category: "body",
    time: "",
    days: ["MON", "WED", "FRI"],
    once: false,
    visible: true,
    reminder: false,
    notes: "",
  };

  it("accepts a valid routine and a valid one-off", () => {
    expect(validateTaskInput(base)).toBeNull();
    expect(validateTaskInput({ ...base, once: true, days: [] })).toBeNull();
  });

  it("rejects what the database would reject", () => {
    expect(validateTaskInput({ ...base, name: "   " })).toMatch(/nome/);
    expect(validateTaskInput({ ...base, name: "x".repeat(81) })).toMatch(/80/);
    expect(validateTaskInput({ ...base, days: [] })).toMatch(/dia/);
    expect(validateTaskInput({ ...base, time: "7pm" })).toMatch(/horário/);
    expect(validateTaskInput({ ...base, notes: "x".repeat(201) })).toMatch(
      /200/,
    );
  });

  it("maps errors to safe copy", () => {
    expect(taskErrorMessage({ message: "LI_NOT_FOUND" })).toMatch(
      /não existe mais/,
    );
    expect(
      taskErrorMessage({
        code: "23514",
        message: 'violates check constraint "daily_tasks_status"',
      }),
    ).toBe("Confira os dados da tarefa e tente de novo.");
    expect(taskErrorMessage({ message: "TypeError: fetch failed" })).toMatch(
      /conexão/,
    );
    expect(taskErrorMessage(null)).toBe(
      "Não foi possível salvar. Tente de novo.",
    );
  });
});
