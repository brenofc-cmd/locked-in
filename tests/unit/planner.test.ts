import { describe, expect, it } from "vitest";
import {
  compareEvents,
  countdown,
  dayAria,
  dueReminders,
  eventHeading,
  eventSummary,
  fromRow,
  groupOf,
  groupUpcoming,
  isDateISO,
  plannerErrorMessage,
  plannerMonth,
  reminderDate,
  taskSuggestion,
  toRow,
  validatePlannerInput,
  weekEnd,
  type PlannerEvent,
  type PlannerInput,
  type PlannerRow,
} from "@/lib/planner";
import {
  loadPlannerDraft,
  loadResume,
  parseResume,
  rememberPlanner,
  savePlannerDraft,
  DRAFT_TTL_MS,
  isRestorableRoute,
} from "@/lib/resume-state";

const ev = (over: Partial<PlannerEvent> = {}): PlannerEvent => ({
  id: "e1",
  ownerId: "me",
  mine: true,
  title: "Prova de Física",
  type: "exam",
  subject: "Física",
  date: "2026-10-02",
  time: "",
  notes: "",
  important: false,
  shared: false,
  reminder: null,
  ...over,
});

const input = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  title: "Prova de Física",
  type: "exam",
  subject: "Física",
  date: "2026-10-02",
  time: "",
  notes: "",
  important: false,
  shared: false,
  reminder: 1,
  ...over,
});

// 2026-09-29 is a Tuesday.
const TODAY = "2026-09-29";

describe("planner: labels and mapping", () => {
  it("types and heading", () => {
    expect(eventHeading(ev())).toBe("PROVA · FÍSICA");
    expect(eventHeading(ev({ type: "school_event", subject: "" }))).toBe(
      "EVENTO",
    );
    expect(
      ["exam", "assignment", "homework", "deadline", "school_event"].map((ty) =>
        eventHeading(ev({ type: ty as PlannerEvent["type"], subject: "" })),
      ),
    ).toEqual(["PROVA", "TRABALHO", "LIÇÃO", "ENTREGA", "EVENTO"]);
  });

  it("summary: the subject when there is one, else the title — never the type twice or alone", () => {
    expect(eventSummary(ev())).toBe("PROVA · FÍSICA");
    expect(
      eventSummary(ev({ subject: "", title: "Prova de Matemática" })),
    ).toBe("PROVA DE MATEMÁTICA");
    expect(eventSummary(ev({ subject: "", title: "prova" }))).toBe("PROVA");
    expect(
      eventSummary(
        ev({ type: "homework", subject: "", title: "Licao de casa" }),
      ),
    ).toBe("LICAO DE CASA");
    expect(eventSummary(ev({ subject: "", title: "Simulado ENEM" }))).toBe(
      "PROVA · SIMULADO ENEM",
    );
    expect(eventSummary(ev({ subject: "", title: "Provas finais" }))).toBe(
      "PROVA · PROVAS FINAIS",
    );
    expect(eventSummary(ev({ subject: "  ", title: "  " }))).toBe("PROVA");
  });

  it("row <-> event keeps local dates and times as text", () => {
    const row: PlannerRow = {
      id: "x",
      owner_id: "p",
      duo_id: "d",
      title: "Trabalho de História",
      event_type: "assignment",
      subject: null,
      event_date: "2026-10-03",
      event_time: "14:00:00",
      description: null,
      priority: "important",
      shared_with_partner: true,
      reminder_days_before: 3,
      created_at: "",
      updated_at: "",
    };
    expect(fromRow(row, "me")).toMatchObject({
      mine: false,
      date: "2026-10-03",
      time: "14:00",
      subject: "",
      important: true,
      shared: true,
      reminder: 3,
    });
    expect(toRow(input({ subject: "  ", notes: " ", time: "" }))).toMatchObject(
      {
        subject: null,
        description: null,
        event_time: null,
        priority: "normal",
      },
    );
    expect(toRow(input())).not.toHaveProperty("owner_id");
    expect(toRow(input())).not.toHaveProperty("duo_id");
  });

  it("task suggestion from an event", () => {
    expect(taskSuggestion(ev())).toBe("Estudar para Prova de Física");
    expect(
      taskSuggestion(ev({ type: "assignment", title: "Trabalho de História" })),
    ).toBe("Fazer Trabalho de História");
    expect(taskSuggestion(ev({ title: "x".repeat(200) })).length).toBe(80);
  });
});

describe("planner: validation", () => {
  it("accepts a valid event", () => {
    expect(validatePlannerInput(input(), false)).toBeNull();
    expect(
      validatePlannerInput(input({ time: "07:30", reminder: null }), true),
    ).toBeNull();
  });

  it("refuses blank title, bad type, priority, reminder, date, time", () => {
    expect(validatePlannerInput(input({ title: "   " }), true)).toMatch(
      /título/,
    );
    expect(
      validatePlannerInput(input({ title: "x".repeat(81) }), true),
    ).toMatch(/80/);
    expect(
      validatePlannerInput(
        input({ type: "party" as PlannerInput["type"] }),
        true,
      ),
    ).toMatch(/inválidos/);
    expect(
      validatePlannerInput(
        input({ reminder: 2 as PlannerInput["reminder"] }),
        true,
      ),
    ).toMatch(/inválidos/);
    expect(
      validatePlannerInput(
        input({ important: "yes" as unknown as boolean }),
        true,
      ),
    ).toMatch(/inválidos/);
    expect(validatePlannerInput(input({ date: "2026-02-30" }), true)).toMatch(
      /data/,
    );
    expect(validatePlannerInput(input({ date: "1999-12-31" }), true)).toMatch(
      /data/,
    );
    expect(validatePlannerInput(input({ time: "25:00" }), true)).toMatch(
      /Horário/,
    );
  });

  it("no partner: sharing refused", () => {
    expect(validatePlannerInput(input({ shared: true }), false)).toBe(
      "Você ainda não tem um parceiro.",
    );
    expect(validatePlannerInput(input({ shared: true }), true)).toBeNull();
  });

  it("database errors become fixed copy", () => {
    expect(
      plannerErrorMessage({ message: "P0001: LI_PLANNER_NO_PARTNER" }),
    ).toBe("Você ainda não tem um parceiro.");
    expect(
      plannerErrorMessage({
        code: "42501",
        message: "permission denied for table",
      }),
    ).not.toMatch(/permission/);
    expect(plannerErrorMessage({ code: "XX000", message: "boom" })).not.toMatch(
      /boom/,
    );
  });

  it("real calendar dates only", () => {
    expect(isDateISO("2028-02-29")).toBe(true);
    expect(isDateISO("2027-02-29")).toBe(false);
    expect(isDateISO("2026-9-1")).toBe(false);
  });
});

describe("planner: upcoming grouping and ordering", () => {
  it("week end is Sunday of today's ISO week", () => {
    expect(weekEnd(TODAY)).toBe("2026-10-04");
    expect(weekEnd("2026-10-04")).toBe("2026-10-04"); // Sunday
    expect(weekEnd("2026-10-05")).toBe("2026-10-11"); // Monday
  });

  it("today / tomorrow / this week / later; past is not upcoming", () => {
    expect(groupOf("2026-09-28", TODAY)).toBeNull();
    expect(groupOf(TODAY, TODAY)).toBe("today");
    expect(groupOf("2026-09-30", TODAY)).toBe("tomorrow");
    expect(groupOf("2026-10-04", TODAY)).toBe("week");
    expect(groupOf("2026-10-05", TODAY)).toBe("later");
    // Saturday: tomorrow is Sunday, nothing else left in the week.
    expect(groupOf("2026-10-04", "2026-10-03")).toBe("tomorrow");
    expect(groupOf("2026-10-05", "2026-10-03")).toBe("later");
  });

  it("chronological inside groups, untimed first, 60-day window", () => {
    const list = [
      ev({ id: "later", date: "2026-10-20" }),
      ev({ id: "t14", date: TODAY, time: "14:00" }),
      ev({ id: "t08", date: TODAY, time: "08:00" }),
      ev({ id: "tall", date: TODAY }),
      ev({ id: "past", date: "2026-09-01" }),
      ev({ id: "far", date: "2026-12-31" }),
      ev({ id: "tom", date: "2026-09-30" }),
    ];
    const g = groupUpcoming(list, TODAY);
    expect(g.map((x) => x.group)).toEqual(["today", "tomorrow", "later"]);
    expect(g[0].events.map((e) => e.id)).toEqual(["tall", "t08", "t14"]);
    expect(g.flatMap((x) => x.events).map((e) => e.id)).not.toContain("past");
    expect(g.flatMap((x) => x.events).map((e) => e.id)).not.toContain("far");
    expect([...list].sort(compareEvents)[0].id).toBe("past");
  });
});

describe("planner: countdown (local dates, never UTC)", () => {
  it("today, tomorrow, in X days, later date", () => {
    expect(countdown(TODAY, TODAY)).toBe("HOJE");
    expect(countdown("2026-09-30", TODAY)).toBe("AMANHÃ");
    expect(countdown("2026-10-01", TODAY)).toBe("EM 2 DIAS");
    expect(countdown("2026-10-06", TODAY)).toBe("EM 7 DIAS");
    expect(countdown("2026-10-07", TODAY)).toBe("QUA, 7 OUT");
  });

  it("month and year edges", () => {
    expect(countdown("2026-10-01", "2026-09-30")).toBe("AMANHÃ");
    expect(countdown("2027-01-01", "2026-12-31")).toBe("AMANHÃ");
    expect(countdown("2027-01-03", "2026-12-31")).toBe("EM 3 DIAS");
    expect(countdown("2028-03-01", "2028-02-28")).toBe("EM 2 DIAS"); // leap day
  });

  it("DST: a São Paulo-style clock change never shifts a school date", () => {
    // Pure calendar arithmetic: the same across a daylight-saving boundary.
    expect(countdown("2026-11-02", "2026-10-31")).toBe("EM 2 DIAS");
    expect(countdown("2026-03-30", "2026-03-28")).toBe("EM 2 DIAS");
  });
});

describe("planner: reminders", () => {
  it("reminder date is N days before", () => {
    expect(reminderDate(ev({ reminder: 0 }))).toBe("2026-10-02");
    expect(reminderDate(ev({ reminder: 1 }))).toBe("2026-10-01");
    expect(reminderDate(ev({ reminder: 7 }))).toBe("2026-09-25");
    expect(reminderDate(ev({ reminder: null }))).toBeNull();
    expect(reminderDate(ev({ date: "2027-01-02", reminder: 3 }))).toBe(
      "2026-12-30",
    );
  });

  it("due from 08:00, mine only, while the event is ahead", () => {
    const list = [
      ev({ id: "due", reminder: 3 }), // due 2026-09-29
      ev({ id: "late", reminder: 7 }), // due 2026-09-25 (app was closed), still ahead
      ev({ id: "notyet", reminder: 1 }), // due 2026-10-01
      ev({ id: "none", reminder: null }),
      ev({ id: "partner", mine: false, reminder: 3 }),
      ev({ id: "past", date: "2026-09-28", reminder: 0 }),
    ];
    expect(dueReminders(list, TODAY, "07:59")).toEqual([]);
    expect(dueReminders(list, TODAY, "08:00").map((e) => e.id)).toEqual([
      "due",
      "late",
    ]);
  });
});

describe("planner: month grid and aria", () => {
  it("Monday-first grid with counts", () => {
    const cells = plannerMonth(
      "2026-10",
      [
        ev({ date: "2026-10-02" }),
        ev({ id: "b", date: "2026-10-02", important: true }),
      ],
      TODAY,
    );
    // 1 Oct 2026 is a Thursday: 3 blanks.
    expect(cells.filter((c) => c.kind === "blank")).toHaveLength(3);
    const days = cells.filter((c) => c.kind === "day");
    expect(days).toHaveLength(31);
    const d2 = days.find((c) => c.kind === "day" && c.date === "2026-10-02");
    expect(d2).toMatchObject({ count: 2, important: true, past: false });
  });

  it("february in a leap year", () => {
    const days = plannerMonth("2028-02", [], TODAY).filter(
      (c) => c.kind === "day",
    );
    expect(days).toHaveLength(29);
  });

  it("accessible day label", () => {
    expect(dayAria("2026-10-24", 2)).toBe("24 de outubro, 2 eventos");
    expect(dayAria("2026-10-24", 1)).toBe("24 de outubro, 1 evento");
    expect(dayAria("2026-10-24", 0)).toBe("24 de outubro, nenhum evento");
  });
});

describe("planner: resume state", () => {
  const U = "11111111-1111-4111-8111-111111111111";
  const NOW = Date.UTC(2026, 8, 29, 12);
  const memory = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };

  it("/planner is restorable", () => {
    expect(isRestorableRoute("/planner")).toBe(true);
  });

  it("view and month round-trip; invalid values are dropped", () => {
    const s = memory();
    rememberPlanner(U, { view: "calendar", month: "2026-11" }, NOW, s);
    expect(loadResume(U, NOW, s).planner).toEqual({
      view: "calendar",
      month: "2026-11",
    });
    expect(
      parseResume({ v: 1, planner: { view: "list", month: "2026-13" } }, NOW)
        .planner,
    ).toBeUndefined();
  });

  it("new-event draft keeps no event data beyond the form and expires", () => {
    const s = memory();
    savePlannerDraft(
      U,
      {
        title: "Prova de Química",
        type: "exam",
        subject: "Química",
        date: "2026-10-10",
        time: "",
        notes: "",
        important: true,
        shared: false,
        reminder: 1,
      },
      NOW,
      s,
    );
    expect(loadPlannerDraft(U, NOW, s)?.title).toBe("Prova de Química");
    expect(loadPlannerDraft(U, NOW + DRAFT_TTL_MS + 1, s)).toBeNull();
    expect(
      parseResume(
        { v: 1, plannerDraft: { title: "x", type: "party", updatedAt: NOW } },
        NOW,
      ).plannerDraft,
    ).toBeUndefined();
  });
});
