import { describe, expect, it } from "vitest";
import {
  EMPTY_SUMMARY,
  appendPage,
  dayHeading,
  formatFocus,
  groupByDay,
  hasProof,
  linkableGoalId,
  linkableGoals,
  periodRange,
  proofFromRow,
  proofLine,
  summaryMap,
  summaryParts,
  topGoals,
  weekRange,
  type GoalOption,
  type Proof,
  type ProofRow,
} from "@/lib/goal-proof";
import { parseResume } from "@/lib/resume-state";

const G = (
  id: string,
  title: string,
  status: GoalOption["status"] = "active",
) => ({
  id,
  title,
  status,
});
const row = (
  p: Partial<ProofRow> & Pick<ProofRow, "kind" | "id">,
): ProofRow => ({
  title: "T",
  proof_date: "2026-09-30",
  occurred_at: "2026-09-30T10:22:00Z",
  focus_seconds: null,
  ...p,
});

describe("proof model", () => {
  it("maps database rows; unknown kinds are dropped", () => {
    expect(proofFromRow(row({ kind: "task", id: "a" }))).toMatchObject({
      kind: "task",
      date: "2026-09-30",
      focusSeconds: null,
    });
    expect(
      proofFromRow(row({ kind: "focus", id: "f", focus_seconds: 2700 }))
        ?.focusSeconds,
    ).toBe(2700);
    expect(proofFromRow(row({ kind: "bonus", id: "x" }))).toBeNull();
  });

  it("focus proof is the effective seconds the database sends (never negative)", () => {
    expect(
      proofFromRow(row({ kind: "focus", id: "f", focus_seconds: -5 }))
        ?.focusSeconds,
    ).toBe(0);
  });

  it("summaries are one entry per goal; absent goals have none", () => {
    const m = summaryMap([
      { goal_id: "g1", actions: 3, focus_seconds: 8100, milestones: 1 },
    ]);
    expect(m.get("g1")).toEqual({
      actions: 3,
      focusSeconds: 8100,
      milestones: 1,
    });
    expect(m.get("g2")).toBeUndefined();
  });

  it("hasProof: less than a minute of focus alone is not shown as proof", () => {
    expect(hasProof(undefined)).toBe(false);
    expect(hasProof(EMPTY_SUMMARY)).toBe(false);
    expect(hasProof({ actions: 0, focusSeconds: 59, milestones: 0 })).toBe(
      false,
    );
    expect(hasProof({ actions: 0, focusSeconds: 60, milestones: 0 })).toBe(
      true,
    );
    expect(hasProof({ actions: 1, focusSeconds: 0, milestones: 0 })).toBe(true);
  });
});

describe("presentation", () => {
  it("focus reads as time, never as points", () => {
    expect(formatFocus(0)).toBe("0 min");
    expect(formatFocus(59)).toBe("<1 min");
    expect(formatFocus(45 * 60)).toBe("45 min");
    expect(formatFocus(95 * 60)).toBe("1h35");
    expect(formatFocus(65 * 60 + 59)).toBe("1h05");
    expect(formatFocus(120 * 60)).toBe("2h");
  });

  it("summary lines show only what exists, with Portuguese plurals", () => {
    expect(
      summaryParts({ actions: 1, focusSeconds: 0, milestones: 0 }),
    ).toEqual(["1 ação"]);
    expect(
      summaryParts({ actions: 4, focusSeconds: 8100, milestones: 2 }),
    ).toEqual(["4 ações", "2h15 de foco", "2 marcos"]);
  });

  it("day headings: HOJE, ONTEM, then the date", () => {
    expect(dayHeading("2026-09-30", "2026-09-30")).toBe("HOJE");
    expect(dayHeading("2026-09-29", "2026-09-30")).toBe("ONTEM");
    expect(dayHeading("2026-09-28", "2026-09-30")).toMatch(/28 SET/);
  });

  it("the timeline groups by day, newest first, keeping the database order", () => {
    const p = (id: string, date: string): Proof => ({
      kind: "task",
      id,
      title: id,
      date,
      at: null,
      focusSeconds: null,
    });
    const days = groupByDay(
      [
        p("a", "2026-09-30"),
        p("b", "2026-09-30"),
        p("c", "2026-09-29"),
        p("d", "2026-09-20"),
      ],
      "2026-09-30",
    );
    expect(days.map((d) => d.heading.slice(0, 5))).toEqual([
      "HOJE",
      "ONTEM",
      expect.any(String),
    ]);
    expect(days[0].items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(days.flatMap((d) => d.items).map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("lines name the kind of proof and the local time", () => {
    const task: Proof = {
      kind: "task",
      id: "t",
      title: "Academia",
      date: "2026-09-30",
      at: "2026-09-30T10:22:00Z",
      focusSeconds: null,
    };
    expect(proofLine(task, "America/Sao_Paulo")).toEqual({
      text: "Academia",
      sub: "Tarefa concluída · 07:22",
    });
    expect(
      proofLine(
        { ...task, kind: "focus", title: "Física", focusSeconds: 42 * 60 },
        "America/Sao_Paulo",
      ).text,
    ).toBe("42 min de foco · Física");
    expect(proofLine({ ...task, kind: "milestone", at: null }, "UTC").sub).toBe(
      "Marco concluído",
    );
  });

  it("loading more never shows a proof twice", () => {
    const p = (kind: Proof["kind"], id: string): Proof => ({
      kind,
      id,
      title: id,
      date: "2026-09-30",
      at: null,
      focusSeconds: null,
    });
    const merged = appendPage(
      [p("task", "1"), p("focus", "1")],
      [p("task", "1"), p("milestone", "1"), p("task", "2")],
    );
    expect(merged.map((x) => `${x.kind}:${x.id}`)).toEqual([
      "task:1",
      "focus:1",
      "milestone:1",
      "task:2",
    ]);
  });
});

describe("periods (local dates)", () => {
  it("this week is Monday → today", () => {
    expect(weekRange("2026-09-30")).toEqual({
      from: "2026-09-28",
      to: "2026-09-30",
    });
    expect(weekRange("2026-09-28")).toEqual({
      from: "2026-09-28",
      to: "2026-09-28",
    });
    // Sunday belongs to the week that started on Monday.
    expect(weekRange("2026-10-04")).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
  });

  it("Progress ranges end today and cross months and years", () => {
    expect(periodRange("7", "2026-10-02")).toEqual({
      from: "2026-09-26",
      to: "2026-10-02",
    });
    expect(periodRange("30", "2026-01-10").from).toBe("2025-12-12");
    expect(periodRange("90", "2026-09-30").from).toBe("2026-07-03");
    expect(periodRange("Y", "2026-09-30").from).toBe("2026-01-01");
  });
});

describe("goals that take actions", () => {
  const goals = [
    G("a", "Vestibular"),
    G("b", "Antiga", "archived"),
    G("c", "Concluída", "achieved"),
    G("d", "Academia"),
  ];

  it("only active goals can be picked, alphabetically", () => {
    expect(linkableGoals(goals).map((g) => g.id)).toEqual(["d", "a"]);
  });

  it("a draft / link goal survives only while it is one of my active goals", () => {
    expect(linkableGoalId("a", goals)).toBe("a");
    expect(linkableGoalId("b", goals)).toBeNull(); // archived
    expect(linkableGoalId("c", goals)).toBeNull(); // achieved
    expect(linkableGoalId("zzz", goals)).toBeNull(); // deleted / someone else's
    expect(linkableGoalId(null, goals)).toBeNull();
  });

  it("Progress shows at most 3 goals with proof, by actions then focus; history of any status", () => {
    const s = new Map([
      ["a", { actions: 2, focusSeconds: 600, milestones: 0 }],
      ["b", { actions: 8, focusSeconds: 0, milestones: 0 }], // archived: still history
      ["c", { actions: 2, focusSeconds: 9000, milestones: 1 }],
      ["d", { actions: 0, focusSeconds: 30, milestones: 0 }], // < 1 min: no proof
    ]);
    expect(topGoals(goals, s).map((x) => x.goal.id)).toEqual(["b", "c", "a"]);
    expect(topGoals(goals, s, 1)).toHaveLength(1);
    expect(topGoals(goals, new Map())).toEqual([]);
  });
});

describe("task draft goal (Resume State)", () => {
  const now = Date.now();
  const base = {
    name: "Estudar",
    repeat: false,
    repeatMode: "daily",
    days: [],
    time: "",
    reminder: false,
    category: "custom",
    visible: true,
    notes: "",
    updatedAt: now - 1000,
  };
  const parse = (draft: object) =>
    parseResume({ v: 1, drafts: { task: draft } }, now).drafts?.task;

  it("keeps a valid goal id (a reference only)", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(parse({ ...base, goalId: id })?.goalId).toBe(id);
  });

  it("drops an invalid goal id but keeps the rest of the draft", () => {
    const draft = parse({ ...base, goalId: "not-a-uuid" });
    expect(draft?.name).toBe("Estudar");
    expect(draft && "goalId" in draft).toBe(false);
  });

  it("a Phase 1–4 draft without a goal is still valid", () => {
    expect(parse(base)?.name).toBe("Estudar");
  });
});
