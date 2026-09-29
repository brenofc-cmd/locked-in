import { describe, expect, it } from "vitest";
import type { Goal, MirrorItem, Vision } from "@/lib/goals";
import { localDateISO } from "@/lib/local-date";
import {
  EMPTY_NORTH_STAR,
  MAX_PRIORITIES,
  addPriority,
  daypartAt,
  daypartOf,
  isEmptyNorthStar,
  movePriority,
  nextEvent,
  pickNorthStar,
  priorityIds,
  removePriority,
  replacePriority,
  topThree,
} from "@/lib/north-star";
import type { PlannerEvent } from "@/lib/planner";
import {
  LEGACY_MARK_KEYS,
  clearResume,
  loadMarks,
  marksKey,
  parseMarks,
  setMark,
} from "@/lib/resume-state";

const vision = (id: string, over: Partial<Vision> = {}): Vision => ({
  id,
  title: `Visão ${id}`,
  description: "",
  sortOrder: 10,
  archived: false,
  featured: false,
  ...over,
});
const goal = (id: string, over: Partial<Goal> = {}): Goal => ({
  id,
  visionId: null,
  title: `Meta ${id}`,
  description: "",
  type: "long_term",
  targetDate: "",
  status: "active",
  achievedAt: null,
  sortOrder: 10,
  createdAt: "2026-09-01T00:00:00Z",
  milestones: [],
  featured: false,
  ...over,
});
const mirror = (id: string, over: Partial<MirrorItem> = {}): MirrorItem => ({
  id,
  text: `Espelho ${id}`,
  active: true,
  sortOrder: 10,
  featured: false,
  ...over,
});

describe("north star: selection", () => {
  it("uses the featured item of each kind first", () => {
    const n = pickNorthStar({
      visions: [
        vision("a", { sortOrder: 10 }),
        vision("b", { sortOrder: 20, featured: true }),
      ],
      goals: [
        goal("g1", { type: "90_day" }),
        goal("g2", { type: "long_term", featured: true }),
      ],
      mirror: [mirror("m1"), mirror("m2", { sortOrder: 30, featured: true })],
    });
    expect(n.vision).toEqual({
      item: { id: "b", title: "Visão b", description: "" },
      featured: true,
    });
    expect(n.goal?.item.id).toBe("g2");
    expect(n.goal?.featured).toBe(true);
    expect(n.mirror).toEqual({
      item: { id: "m2", text: "Espelho m2" },
      featured: true,
    });
  });

  it("falls back to the first active vision by the user's order", () => {
    const n = pickNorthStar({
      visions: [
        vision("late", { sortOrder: 30 }),
        vision("first", { sortOrder: 10, archived: true }),
        vision("second", { sortOrder: 20 }),
      ],
      goals: [],
      mirror: [],
    });
    expect(n.vision?.item.id).toBe("second");
    expect(n.vision?.featured).toBe(false);
  });

  it("goal fallback: 90 DIAS before ESTE MÊS before LONGO PRAZO", () => {
    const base = [
      goal("long", { type: "long_term", sortOrder: 1 }),
      goal("month", { type: "monthly", sortOrder: 5 }),
      goal("ninety", { type: "90_day", sortOrder: 50 }),
    ];
    expect(
      pickNorthStar({ visions: [], goals: base, mirror: [] }).goal?.item.id,
    ).toBe("ninety");
    const noNinety = base.filter((g) => g.id !== "ninety");
    expect(
      pickNorthStar({ visions: [], goals: noNinety, mirror: [] }).goal?.item.id,
    ).toBe("month");
    expect(
      pickNorthStar({ visions: [], goals: [base[0]], mirror: [] }).goal?.item
        .id,
    ).toBe("long");
  });

  it("goal fallback inside a type follows the /goals order", () => {
    const n = pickNorthStar({
      visions: [],
      goals: [
        goal("b", { type: "monthly", sortOrder: 20 }),
        goal("a", { type: "monthly", sortOrder: 10 }),
      ],
      mirror: [],
    });
    expect(n.goal?.item.id).toBe("a");
  });

  it("never shows an achieved or archived goal, even if it was featured", () => {
    const n = pickNorthStar({
      visions: [],
      goals: [
        goal("done", { type: "90_day", status: "achieved", featured: true }),
        goal("old", { type: "90_day", status: "archived" }),
        goal("live", { type: "long_term" }),
      ],
      mirror: [],
    });
    expect(n.goal?.item.id).toBe("live");
    expect(n.goal?.featured).toBe(false);
    expect(
      pickNorthStar({
        visions: [],
        goals: [goal("x", { status: "achieved" })],
        mirror: [],
      }).goal,
    ).toBeNull();
  });

  it("excludes archived visions and inactive mirror items", () => {
    const n = pickNorthStar({
      visions: [vision("v", { archived: true, featured: true })],
      goals: [],
      mirror: [
        mirror("m", { active: false, featured: true }),
        mirror("ok", { sortOrder: 90 }),
      ],
    });
    expect(n.vision).toBeNull();
    expect(n.mirror?.item.id).toBe("ok");
  });

  it("partial data shows only what exists; nothing = empty state", () => {
    const n = pickNorthStar({ visions: [vision("v")], goals: [], mirror: [] });
    expect(n.vision).not.toBeNull();
    expect(n.goal).toBeNull();
    expect(n.mirror).toBeNull();
    expect(isEmptyNorthStar(n)).toBe(false);
    expect(
      isEmptyNorthStar(pickNorthStar({ visions: [], goals: [], mirror: [] })),
    ).toBe(true);
    expect(isEmptyNorthStar(EMPTY_NORTH_STAR)).toBe(true);
  });

  it("keeps the mirror text exactly as written", () => {
    const text = "Você começa muitas coisas e termina poucas.";
    expect(
      pickNorthStar({ visions: [], goals: [], mirror: [mirror("m", { text })] })
        .mirror?.item.text,
    ).toBe(text);
  });
});

describe("north star: daypart greeting", () => {
  it("morning / afternoon / evening boundaries", () => {
    expect(daypartOf(4)).toBe("evening");
    expect(daypartOf(5)).toBe("morning");
    expect(daypartOf(11)).toBe("morning");
    expect(daypartOf(12)).toBe("afternoon");
    expect(daypartOf(17)).toBe("afternoon");
    expect(daypartOf(18)).toBe("evening");
    expect(daypartOf(23)).toBe("evening");
    expect(daypartOf(0)).toBe("evening");
  });

  it("uses the user's timezone, not the device's", () => {
    const at = Date.UTC(2026, 8, 29, 22, 0); // 22:00 UTC
    expect(daypartAt(at, "UTC")).toBe("evening");
    expect(daypartAt(at, "America/Sao_Paulo")).toBe("evening"); // 19:00
    expect(daypartAt(at, "Pacific/Kiritimati")).toBe("afternoon"); // UTC+14 → 12:00 next day
    expect(daypartAt(at, "Pacific/Pago_Pago")).toBe("morning"); // UTC-11 → 11:00
  });

  it("DST: New York at 07:30 local on both sides of the March change", () => {
    // 2026-03-07 07:30 EST = 12:30 UTC; 2026-03-09 07:30 EDT = 11:30 UTC.
    expect(daypartAt(Date.UTC(2026, 2, 7, 12, 30), "America/New_York")).toBe(
      "morning",
    );
    expect(daypartAt(Date.UTC(2026, 2, 9, 11, 30), "America/New_York")).toBe(
      "morning",
    );
    // 04:59 local stays evening, 05:00 becomes morning.
    expect(daypartAt(Date.UTC(2026, 2, 9, 8, 59), "America/New_York")).toBe(
      "evening",
    );
    expect(daypartAt(Date.UTC(2026, 2, 9, 9, 0), "America/New_York")).toBe(
      "morning",
    );
  });

  it("23:59 → 00:00 changes the local day in far-apart timezones", () => {
    const before = Date.UTC(2026, 8, 29, 9, 59); // 23:59 in Kiritimati (UTC+14)
    const after = Date.UTC(2026, 8, 29, 10, 0);
    expect(localDateISO("Pacific/Kiritimati", new Date(before))).toBe(
      "2026-09-29",
    );
    expect(localDateISO("Pacific/Kiritimati", new Date(after))).toBe(
      "2026-09-30",
    );
    const b2 = Date.UTC(2026, 8, 30, 10, 59); // 23:59 in Pago Pago (UTC-11)
    expect(localDateISO("Pacific/Pago_Pago", new Date(b2))).toBe("2026-09-29");
    expect(localDateISO("Pacific/Pago_Pago", new Date(b2 + 60_000))).toBe(
      "2026-09-30",
    );
  });
});

const event = (
  id: string,
  date: string,
  time = "",
  over: Partial<PlannerEvent> = {},
): PlannerEvent => ({
  id,
  ownerId: "me",
  mine: true,
  title: id,
  type: "exam",
  subject: "Física",
  date,
  time,
  notes: "",
  important: false,
  shared: false,
  reminder: null,
  ...over,
});

describe("north star: next planner event", () => {
  const TODAY = "2026-09-29";
  it("the first upcoming event, one only", () => {
    const e = nextEvent(
      [
        event("later", "2026-10-10"),
        event("tomorrow", "2026-09-30"),
        event("past", "2026-09-20"),
      ],
      TODAY,
      "08:00",
    );
    expect(e?.id).toBe("tomorrow");
  });
  it("skips today's events whose time has passed; untimed today stays", () => {
    const list = [
      event("early", TODAY, "07:00"),
      event("untimed", TODAY),
      event("tomorrow", "2026-09-30"),
    ];
    expect(nextEvent(list, TODAY, "09:00")?.id).toBe("untimed");
    expect(
      nextEvent(list.slice(0, 1).concat(list[2]), TODAY, "09:00")?.id,
    ).toBe("tomorrow");
    expect(nextEvent([event("soon", TODAY, "10:00")], TODAY, "09:00")?.id).toBe(
      "soon",
    );
  });
  it("null when nothing is coming up", () => {
    expect(nextEvent([], TODAY, "09:00")).toBeNull();
    expect(nextEvent([event("old", "2026-09-01")], TODAY, "09:00")).toBeNull();
  });
});

describe("top 3", () => {
  const tasks = [
    { id: "a", priority: 3 },
    { id: "b", priority: null },
    { id: "c", priority: 1 },
    { id: "d", priority: 2 },
  ];
  it("orders by rank 1, 2, 3", () => {
    expect(topThree(tasks).map((t) => t.id)).toEqual(["c", "d", "a"]);
    expect(priorityIds(tasks)).toEqual(["c", "d", "a"]);
  });
  it("never more than three", () => {
    expect(MAX_PRIORITIES).toBe(3);
    expect(addPriority(["a", "b", "c"], "d")).toBeNull();
    expect(addPriority(["a", "b"], "d")).toEqual(["a", "b", "d"]);
    expect(addPriority(["a"], "a")).toEqual(["a"]);
  });
  it("replace keeps the rank; remove and move", () => {
    expect(replacePriority(["a", "b", "c"], "b", "d")).toEqual(["a", "d", "c"]);
    expect(replacePriority(["a", "b", "c"], "x", "d")).toEqual(["a", "b", "c"]);
    expect(replacePriority(["a", "b", "c"], "b", "a")).toEqual(["a", "b", "c"]);
    expect(removePriority(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(movePriority(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(movePriority(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
    expect(movePriority(["a", "b"], "a", -1)).toBeNull();
    expect(movePriority(["a", "b"], "b", 1)).toBeNull();
  });
  it("completed / skipped priorities stay in the list", () => {
    const list = [
      { id: "x", priority: 1, done: true },
      { id: "y", priority: 2, done: false },
    ];
    expect(topThree(list).map((t) => t.id)).toEqual(["x", "y"]);
  });
});

// ---------------------------------------------------------- storage marks

function memory(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}
const ANA = "11111111-1111-4111-8111-111111111111";
const BIA = "22222222-2222-4222-8222-222222222222";

describe("daily marks (briefing once per user and day)", () => {
  it("first open of the day shows; the same day does not; the next day does", () => {
    const s = memory();
    expect(setMark(ANA, "briefing", "2026-09-29", s)).toBe(true);
    expect(setMark(ANA, "briefing", "2026-09-29", s)).toBe(false);
    expect(loadMarks(ANA, s).briefing).toBe("2026-09-29");
    expect(setMark(ANA, "briefing", "2026-09-30", s)).toBe(true);
  });

  it("is scoped per user: A's mark never hides B's briefing", () => {
    const s = memory();
    setMark(ANA, "briefing", "2026-09-29", s);
    expect(loadMarks(BIA, s).briefing).toBeUndefined();
    expect(setMark(BIA, "briefing", "2026-09-29", s)).toBe(true);
    expect(marksKey(ANA)).not.toBe(marksKey(BIA));
  });

  it("drops the old unscoped V1 keys without trusting them", () => {
    const s = memory({
      "li:briefing-shown": "2026-09-29",
      "li:weekly-shown": "2026-09-28",
    });
    expect(loadMarks(ANA, s)).toEqual({ v: 1 });
    for (const k of LEGACY_MARK_KEYS) expect(s.data.has(k)).toBe(false);
    expect(setMark(ANA, "briefing", "2026-09-29", s)).toBe(true);
  });

  it("weekly and briefing marks are independent", () => {
    const s = memory();
    setMark(ANA, "weekly", "2026-09-28", s);
    expect(loadMarks(ANA, s)).toEqual({ v: 1, weekly: "2026-09-28" });
    expect(setMark(ANA, "weekly", "2026-09-28", s)).toBe(false);
  });

  it("validates what it reads; bad values and bad ids are ignored", () => {
    expect(parseMarks({ v: 1, briefing: "ontem", weekly: 3 })).toEqual({
      v: 1,
    });
    expect(parseMarks({ v: 2, briefing: "2026-09-29" })).toEqual({ v: 1 });
    expect(parseMarks("x")).toEqual({ v: 1 });
    const s = memory({ [marksKey(ANA)!]: "{not json" });
    expect(loadMarks(ANA, s)).toEqual({ v: 1 });
    expect(marksKey("not-a-user")).toBeNull();
    expect(setMark("not-a-user", "briefing", "2026-09-29", s)).toBe(false);
    expect(setMark(ANA, "briefing", "29/09/2026", s)).toBe(false);
  });

  it("works without storage (blocked / server) and never throws", () => {
    expect(loadMarks(ANA, null)).toEqual({ v: 1 });
    expect(setMark(ANA, "briefing", "2026-09-29", null)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadMarks(ANA, broken)).toEqual({ v: 1 });
    expect(() => setMark(ANA, "briefing", "2026-09-29", broken)).not.toThrow();
  });

  it("sign-out clears that user's marks only", () => {
    const s = memory();
    setMark(ANA, "briefing", "2026-09-29", s);
    setMark(BIA, "briefing", "2026-09-29", s);
    clearResume(ANA, s);
    expect(loadMarks(ANA, s)).toEqual({ v: 1 });
    expect(loadMarks(BIA, s).briefing).toBe("2026-09-29");
  });
});
