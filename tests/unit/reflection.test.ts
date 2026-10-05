import { describe, expect, it } from "vitest";
import {
  celebrationCopy,
  claimsToMake,
  milestoneCode,
  monthToCelebrate,
  pendingCelebrations,
  unlockedCodes,
  type CelebrationRow,
} from "@/lib/celebrations";
import type { Month, MonthLeader, MonthState } from "@/lib/monthly";
import { milestones } from "@/lib/records";
import {
  dayFactLines,
  emptyReflection,
  factsFromRow,
  isEmptyReflection,
  normalizeReflection,
  ratio,
  reflectionFromRow,
  sameReflection,
  weekFactLines,
  type ReviewFacts,
} from "@/lib/reviews";
import {
  freePosition,
  planRow,
  planWeeks,
  prioritiesOf,
  prioritiesRatio,
  validatePriorityTitle,
  type Priority,
} from "@/lib/weekly-plan";

/** V2 Phase 9: celebrations, weekly planning and Reviews 2.0 (pure parts). */

const month = (
  m: string,
  leader: MonthLeader,
  state: MonthState = "final",
  final = true,
): Month => ({
  month: m,
  final,
  me: { wins: 8, completed: 0, planned: 0, focusSeconds: 0 },
  partner: { wins: 5, completed: 0, planned: 0, focusSeconds: 0 },
  draws: 0,
  insufficientDays: 0,
  officialDays: 13,
  openDays: 0,
  state,
  leader,
  decidedBy: leader === "draw" ? "draw" : "daily_wins",
});

const row = (r: Partial<CelebrationRow>): CelebrationRow => ({
  kind: "milestone",
  key: "streak_7",
  baseline: false,
  seenAt: null,
  ...r,
});

const none = milestones({
  longestStreak: 0,
  totalFocusSeconds: 0,
  totalPerfectDays: 0,
});

describe("monthToCelebrate", () => {
  it("only a FINAL month I won or drew, ended within 7 days", () => {
    expect(
      monthToCelebrate([month("2026-09-01", "me")], "2026-10-05")?.month,
    ).toBe("2026-09-01");
    expect(
      monthToCelebrate([month("2026-09-01", "draw")], "2026-10-07")?.month,
    ).toBe("2026-09-01");
    // 8 days after the end: too late.
    expect(monthToCelebrate([month("2026-09-01", "me")], "2026-10-09")).toBe(
      null,
    );
  });

  it("never a live month, a lost month or an insufficient month", () => {
    expect(
      monthToCelebrate(
        [month("2026-10-01", "me", "live", false)],
        "2026-10-05",
      ),
    ).toBe(null);
    expect(
      monthToCelebrate([month("2026-09-01", "partner")], "2026-10-02"),
    ).toBe(null);
    expect(
      monthToCelebrate(
        [month("2026-09-01", null, "insufficient")],
        "2026-10-02",
      ),
    ).toBe(null);
  });
});

describe("claimsToMake", () => {
  it("claims today's Perfect Day once per date", () => {
    const input = {
      today: "2026-10-05",
      todayPerfect: true,
      milestones: none,
      months: [],
      rows: [] as CelebrationRow[],
    };
    expect(claimsToMake(input)).toEqual([
      { kind: "perfect_day", key: "2026-10-05" },
    ]);
    expect(
      claimsToMake({
        ...input,
        rows: [row({ kind: "perfect_day", key: "2026-10-05", seenAt: "x" })],
      }),
    ).toEqual([]);
    expect(claimsToMake({ ...input, todayPerfect: false })).toEqual([]);
  });

  it("claims each reached milestone without a row (baseline counts as a row)", () => {
    const reached = milestones({
      longestStreak: 30,
      totalFocusSeconds: 0,
      totalPerfectDays: 0,
    });
    const claims = claimsToMake({
      today: "2026-10-05",
      todayPerfect: false,
      milestones: reached,
      months: [],
      rows: [row({ key: "streak_7", baseline: true, seenAt: "x" })],
    });
    expect(claims).toEqual([{ kind: "milestone", key: "streak_30" }]);
  });

  it("claims the finished month once", () => {
    const months = [month("2026-09-01", "me")];
    const base = {
      today: "2026-10-03",
      todayPerfect: false,
      milestones: none,
      months,
    };
    expect(claimsToMake({ ...base, rows: [] })).toEqual([
      { kind: "monthly", key: "2026-09-01" },
    ]);
    expect(
      claimsToMake({
        ...base,
        rows: [row({ kind: "monthly", key: "2026-09-01", seenAt: "x" })],
      }),
    ).toEqual([]);
  });
});

describe("pendingCelebrations / unlocks", () => {
  it("shows unseen, non-baseline rows, Perfect Day first", () => {
    const rows = [
      row({ key: "focus_10" }),
      row({ key: "streak_7", baseline: true, seenAt: "x" }),
      row({ kind: "monthly", key: "2026-09-01" }),
      row({ kind: "perfect_day", key: "2026-10-05" }),
      row({ key: "perfect_5", seenAt: "2026-10-05T10:00:00Z" }),
    ];
    expect(pendingCelebrations(rows).map((r) => r.key)).toEqual([
      "2026-10-05",
      "focus_10",
      "2026-09-01",
    ]);
  });

  it("an unlock stays CONQUISTADO even when the numbers say otherwise", () => {
    const rows = [row({ key: "streak_7", baseline: true, seenAt: "x" })];
    const ms = milestones({
      longestStreak: 3,
      totalFocusSeconds: 0,
      totalPerfectDays: 0,
      unlocked: unlockedCodes(rows),
    });
    const s7 = ms.find((m) => m.key === "streak-7")!;
    expect(s7.reached).toBe(true);
    expect(s7.current).toBe(7);
    expect(ms.find((m) => m.key === "streak-30")!.reached).toBe(false);
    expect(milestoneCode(s7)).toBe("streak_7");
  });
});

describe("celebrationCopy", () => {
  const ctx = { months: [month("2026-09-01", "me")], todayTasks: 4 };
  it("is factual", () => {
    expect(
      celebrationCopy({ kind: "perfect_day", key: "2026-10-05" }, ctx),
    ).toEqual({
      title: "DIA PERFEITO",
      line: "As 4 tarefas de hoje estão feitas.",
    });
    expect(
      celebrationCopy({ kind: "milestone", key: "focus_50" }, ctx),
    ).toEqual({ title: "50H DE FOCO", line: "MARCO CONQUISTADO" });
    expect(
      celebrationCopy({ kind: "monthly", key: "2026-09-01" }, ctx)?.title,
    ).toBe("CAMPEÃO DE SETEMBRO");
  });

  it("a drawn month says MÊS ENCERRADO · EMPATE; a lost month has no copy", () => {
    expect(
      celebrationCopy(
        { kind: "monthly", key: "2026-09-01" },
        { months: [month("2026-09-01", "draw")], todayTasks: 0 },
      )?.title,
    ).toBe("MÊS ENCERRADO · EMPATE");
    expect(
      celebrationCopy(
        { kind: "monthly", key: "2026-09-01" },
        { months: [month("2026-09-01", "partner")], todayTasks: 0 },
      ),
    ).toBe(null);
    expect(celebrationCopy({ kind: "milestone", key: "nope" }, ctx)).toBe(null);
  });
});

describe("weekly plan", () => {
  const p = (position: number, status: "open" | "done" = "open"): Priority => ({
    id: `id-${position}`,
    weekStart: "2026-10-05",
    position,
    title: `P${position}`,
    status,
  });

  it("plans this week and the next (Monday to Sunday)", () => {
    expect(planWeeks("2026-10-11")).toEqual({
      current: "2026-10-05",
      next: "2026-10-12",
    });
    expect(planWeeks("2026-10-05").current).toBe("2026-10-05");
  });

  it("3 positions at most; the first free one is used", () => {
    expect(freePosition([])).toBe(1);
    expect(freePosition([p(1), p(3)])).toBe(2);
    expect(freePosition([p(1), p(2), p(3)])).toBe(null);
  });

  it("validates the title", () => {
    expect(validatePriorityTitle("  ")).toBe("Escreva a prioridade.");
    expect(validatePriorityTitle("x".repeat(121))).toBe(
      "No máximo 120 caracteres.",
    );
    expect(validatePriorityTitle(" Entregar o projeto ")).toBe(null);
  });

  it("summarises done / planned for PLANEJAR", () => {
    const week = [p(2, "done"), p(1)];
    expect(prioritiesOf(week, "2026-10-05").map((x) => x.position)).toEqual([
      1, 2,
    ]);
    expect(prioritiesRatio(week)).toBe("1 / 2");
    expect(planRow(week)).toEqual({
      value: "2 prioridades",
      meta: "1 / 2 feitas",
    });
    expect(planRow([p(1)]).value).toBe("1 prioridade");
    expect(planRow([])).toEqual({ value: "Planeje sua semana", meta: "" });
  });
});

describe("reviews", () => {
  const facts: ReviewFacts = factsFromRow({
    days_with_tasks: 7,
    planned: 30,
    completed: 25,
    focus_seconds: 3600,
    perfect_days: 2,
    standard_days: 5,
    non_negotiable_planned: 7,
    non_negotiable_completed: 5,
  });

  it("ratio is neutral without data", () => {
    expect(ratio(5, 7)).toBe("5 / 7");
    expect(ratio(0, 0)).toBe(null);
  });

  it("week facts: Daily Standard days, non-negotiables, priorities", () => {
    const lines = weekFactLines(facts, [
      {
        id: "a",
        weekStart: "2026-09-28",
        position: 1,
        title: "A",
        status: "done",
      },
    ]);
    expect(lines.map((l) => [l.testId, l.v])).toEqual([
      ["fact-standard", "5 / 7"],
      ["fact-nn", "5 / 7"],
      ["fact-priorities", "1 / 1"],
    ]);
    const empty = factsFromRow({
      days_with_tasks: 0,
      planned: 0,
      completed: 0,
      focus_seconds: 0,
      perfect_days: 0,
      standard_days: 0,
      non_negotiable_planned: 0,
      non_negotiable_completed: 0,
    });
    expect(weekFactLines(empty, [])).toEqual([]);
    expect(dayFactLines(empty)).toEqual([]);
    expect(dayFactLines(facts)[0].v).toBe("5 / 7");
  });

  it("reflections are optional, trimmed and capped", () => {
    expect(isEmptyReflection(emptyReflection())).toBe(true);
    const r = normalizeReflection({
      worked: "  foco cedo ",
      hindered: "x".repeat(600),
      changeNext: "",
    });
    expect(r.worked).toBe("foco cedo");
    expect(r.hindered).toHaveLength(500);
    expect(sameReflection(r, { ...r, worked: "foco cedo  " })).toBe(true);
    expect(
      reflectionFromRow({ worked: null, hindered: "a", change_next: null }),
    ).toEqual({ worked: "", hindered: "a", changeNext: "" });
  });
});
