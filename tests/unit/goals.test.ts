import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX,
  MIRROR_MAX,
  TITLE_MAX,
  activeMirror,
  activeVisions,
  archivedVisions,
  goalFromRow,
  goalTypeLabel,
  goalsErrorMessage,
  groupGoals,
  inactiveMirror,
  milestonesLabel,
  move,
  nextSortOrder,
  suggestedTarget,
  targetLabel,
  validateGoal,
  validateMilestone,
  validateMirror,
  validateVision,
  type Goal,
  type GoalRow,
  type Milestone,
} from "@/lib/goals";
import {
  DRAFT_TTL_MS,
  clearGoalDraft,
  clearResume,
  isRestorableRoute,
  loadGoalDraft,
  loadResume,
  parseResume,
  rememberGoalsSection,
  saveGoalDraft,
} from "@/lib/resume-state";

const TODAY = "2026-09-29";
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g",
  visionId: null,
  title: "Meta",
  description: "",
  type: "90_day",
  targetDate: "",
  status: "active",
  achievedAt: null,
  sortOrder: 10,
  createdAt: "2026-09-01T00:00:00Z",
  milestones: [],
  ...over,
});

describe("goals: grouping and sorting", () => {
  it("active goals grouped 90 DIAS / ESTE MÊS / LONGO PRAZO, empty groups hidden", () => {
    const g = groupGoals([
      goal({ id: "l", type: "long_term" }),
      goal({ id: "n", type: "90_day" }),
      goal({ id: "a", status: "achieved", achievedAt: "2026-09-10T00:00:00Z" }),
      goal({ id: "x", status: "archived" }),
    ]);
    expect(g.active.map((x) => x.type)).toEqual(["90_day", "long_term"]);
    expect(g.achieved.map((x) => x.id)).toEqual(["a"]);
    expect(g.archived.map((x) => x.id)).toEqual(["x"]);
    expect(
      ["90_day", "monthly", "long_term"].map((t) =>
        goalTypeLabel(t as Goal["type"]),
      ),
    ).toEqual(["90 DIAS", "ESTE MÊS", "LONGO PRAZO"]);
  });

  it("inside a group: sort order, then nearest target date, then title", () => {
    const g = groupGoals([
      goal({ id: "b", sortOrder: 20 }),
      goal({ id: "late", sortOrder: 10, targetDate: "2026-12-01" }),
      goal({ id: "soon", sortOrder: 10, targetDate: "2026-10-05" }),
      goal({ id: "none", sortOrder: 10, title: "Z" }),
    ]);
    expect(g.active[0].goals.map((x) => x.id)).toEqual([
      "soon",
      "late",
      "none",
      "b",
    ]);
  });

  it("achieved newest first; archived by title", () => {
    const g = groupGoals([
      goal({
        id: "old",
        status: "achieved",
        achievedAt: "2026-01-01T00:00:00Z",
      }),
      goal({
        id: "new",
        status: "achieved",
        achievedAt: "2026-09-01T00:00:00Z",
      }),
      goal({ id: "b", status: "archived", title: "B" }),
      goal({ id: "a", status: "archived", title: "A" }),
    ]);
    expect(g.achieved.map((x) => x.id)).toEqual(["new", "old"]);
    expect(g.archived.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("vision and mirror active / archived splits", () => {
    const v = [
      { id: "2", title: "b", description: "", sortOrder: 20, archived: false },
      { id: "1", title: "a", description: "", sortOrder: 10, archived: false },
      { id: "3", title: "c", description: "", sortOrder: 5, archived: true },
    ];
    expect(activeVisions(v).map((x) => x.id)).toEqual(["1", "2"]);
    expect(archivedVisions(v).map((x) => x.id)).toEqual(["3"]);
    const m = [
      { id: "a", text: "x", active: true, sortOrder: 20 },
      { id: "b", text: "y", active: false, sortOrder: 10 },
    ];
    expect(activeMirror(m).map((x) => x.id)).toEqual(["a"]);
    expect(inactiveMirror(m).map((x) => x.id)).toEqual(["b"]);
  });

  it("move up / down and next sort order", () => {
    expect(move(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(move(["a", "b"], "a", -1)).toBeNull();
    expect(move(["a", "b"], "b", 1)).toBeNull();
    expect(move(["a"], "zz", 1)).toBeNull();
    expect(nextSortOrder([])).toBe(10);
    expect(nextSortOrder([{ sortOrder: 30 }, { sortOrder: 10 }])).toBe(40);
  });

  it("row mapping attaches only the goal's own milestones, ordered", () => {
    const row: GoalRow = {
      id: "g1",
      owner_id: "o",
      vision_id: null,
      title: "T",
      description: null,
      goal_type: "monthly",
      target_date: null,
      status: "active",
      achieved_at: null,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };
    const ms: Milestone[] = [
      { id: "2", goalId: "g1", title: "b", done: false, sortOrder: 20 },
      { id: "x", goalId: "other", title: "z", done: false, sortOrder: 1 },
      { id: "1", goalId: "g1", title: "a", done: true, sortOrder: 10 },
    ];
    const g = goalFromRow(row, ms);
    expect(g.milestones.map((m) => m.id)).toEqual(["1", "2"]);
    expect(g).toMatchObject({
      type: "monthly",
      targetDate: "",
      description: "",
    });
  });
});

describe("goals: labels (no percentage)", () => {
  it("target date: until, soon, today, passed, other year, none", () => {
    expect(targetLabel("", TODAY)).toBe("");
    expect(targetLabel("2026-12-20", TODAY)).toBe("ATÉ 20 DEZ");
    expect(targetLabel("2027-03-01", TODAY)).toBe("ATÉ 1 MAR 2027");
    expect(targetLabel("2026-10-02", TODAY)).toBe("EM 3 DIAS · 2 OUT");
    expect(targetLabel("2026-09-30", TODAY)).toBe("EM 1 DIA · 30 SET");
    expect(targetLabel(TODAY, TODAY)).toBe("HOJE · 29 SET");
    expect(targetLabel("2026-09-01", TODAY)).toBe("PRAZO PASSOU · 1 SET");
    // Achieved / archived goals never say "passed".
    expect(targetLabel("2026-09-01", TODAY, "achieved")).toBe("ATÉ 1 SET");
  });

  it("milestones are a count, never a percentage", () => {
    expect(milestonesLabel([])).toBe("");
    const ms = [
      { id: "1", goalId: "g", title: "a", done: true, sortOrder: 1 },
      { id: "2", goalId: "g", title: "b", done: false, sortOrder: 2 },
    ];
    expect(milestonesLabel(ms)).toBe("1 de 2 marcos");
    expect(milestonesLabel(ms.slice(0, 1))).toBe("1 de 1 marco");
    expect(milestonesLabel(ms)).not.toMatch(/%/);
  });

  it("suggested target dates: 90 days, end of month (year edge), none for long term", () => {
    expect(suggestedTarget("90_day", TODAY)).toBe("2026-12-28");
    expect(suggestedTarget("monthly", TODAY)).toBe("2026-09-30");
    expect(suggestedTarget("monthly", "2026-12-15")).toBe("2026-12-31");
    expect(suggestedTarget("monthly", "2028-02-10")).toBe("2028-02-29");
    expect(suggestedTarget("long_term", TODAY)).toBe("");
  });

  it("empty states", async () => {
    const { t } = await import("@/i18n/pt-BR");
    expect(t.goals.empty).toEqual({
      vision: "Que vida você quer construir?",
      goals: "O que precisa acontecer primeiro?",
      mirror: "O que você precisa parar de ignorar?",
    });
  });
});

describe("goals: validation and limits", () => {
  const input = {
    title: "Lançar produto",
    type: "90_day" as const,
    visionId: null,
    targetDate: "",
    description: "",
  };
  it("vision", () => {
    expect(validateVision({ title: "Liberdade", description: "" })).toBeNull();
    expect(validateVision({ title: "   ", description: "" })).toMatch(/título/);
    expect(
      validateVision({ title: "x".repeat(TITLE_MAX + 1), description: "" }),
    ).toMatch(/120/);
    expect(
      validateVision({
        title: "x",
        description: "y".repeat(DESCRIPTION_MAX + 1),
      }),
    ).toMatch(/1000/);
  });
  it("goal", () => {
    expect(validateGoal(input)).toBeNull();
    expect(validateGoal({ ...input, title: "" })).toMatch(/título/);
    expect(validateGoal({ ...input, type: "weekly" as never })).toMatch(
      /inválidos/,
    );
    expect(validateGoal({ ...input, visionId: "not-a-uuid" })).toMatch(
      /inválidos/,
    );
    expect(validateGoal({ ...input, targetDate: "2026-02-30" })).toMatch(
      /data/,
    );
    expect(validateGoal({ ...input, targetDate: "2028-02-29" })).toBeNull();
  });
  it("mirror and milestone", () => {
    expect(validateMirror("Eu adio coisas difíceis.")).toBeNull();
    expect(validateMirror("  ")).toMatch(/encarar/);
    expect(validateMirror("x".repeat(MIRROR_MAX + 1))).toMatch(/300/);
    expect(validateMilestone("deploy")).toBeNull();
    expect(validateMilestone(" ")).toMatch(/título/);
  });
  it("database errors become fixed copy", () => {
    expect(
      goalsErrorMessage({
        code: "23503",
        message: "fk violation goals_vision",
      }),
    ).toBe("Essa visão não existe mais.");
    expect(goalsErrorMessage({ code: "XX", message: "boom" })).not.toMatch(
      /boom/,
    );
  });
});

describe("goals: resume state", () => {
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

  it("/goals is restorable; the section round-trips; junk is dropped", () => {
    expect(isRestorableRoute("/goals")).toBe(true);
    const s = memory();
    rememberGoalsSection(U, "mirror", NOW, s);
    expect(loadResume(U, NOW, s).goals).toEqual({ section: "mirror" });
    expect(
      parseResume({ v: 1, goals: { section: "all" } }, NOW).goals,
    ).toBeUndefined();
  });

  it("drafts of a new vision / goal / mirror item, per user, 24 h", () => {
    const s = memory();
    saveGoalDraft(U, "vision", { title: "Liberdade", description: "" }, NOW, s);
    saveGoalDraft(
      U,
      "goal",
      {
        title: "Lançar",
        type: "monthly",
        visionId: "",
        targetDate: "2026-10-31",
        description: "",
      },
      NOW,
      s,
    );
    saveGoalDraft(U, "mirror", { text: "Durmo tarde." }, NOW, s);
    expect(loadGoalDraft(U, "vision", NOW, s)?.title).toBe("Liberdade");
    expect(loadGoalDraft(U, "goal", NOW, s)?.type).toBe("monthly");
    expect(loadGoalDraft(U, "mirror", NOW, s)?.text).toBe("Durmo tarde.");
    expect(loadGoalDraft(U, "goal", NOW + DRAFT_TTL_MS + 1, s)).toBeNull();
    expect(
      loadGoalDraft("22222222-2222-4222-8222-222222222222", "goal", NOW, s),
    ).toBeNull();
  });

  it("an empty form removes the draft; clear and sign-out remove it", () => {
    const s = memory();
    saveGoalDraft(U, "mirror", { text: "x" }, NOW, s);
    saveGoalDraft(U, "mirror", { text: "  " }, NOW, s);
    expect(loadGoalDraft(U, "mirror", NOW, s)).toBeNull();
    saveGoalDraft(U, "vision", { title: "x", description: "" }, NOW, s);
    clearGoalDraft(U, "vision", s);
    expect(loadGoalDraft(U, "vision", Date.now(), s)).toBeNull();
    saveGoalDraft(U, "vision", { title: "x", description: "" }, NOW, s);
    clearResume(U, s);
    expect(loadGoalDraft(U, "vision", NOW, s)).toBeNull();
  });

  it("invalid draft shapes are dropped", () => {
    expect(
      parseResume(
        {
          v: 1,
          goalDrafts: {
            goal: {
              title: "x",
              type: "weekly",
              visionId: "",
              targetDate: "",
              description: "",
              updatedAt: NOW,
            },
            vision: { title: 5, description: "", updatedAt: NOW },
            mirror: { text: "ok", updatedAt: NOW },
          },
        },
        NOW,
      ).goalDrafts,
    ).toEqual({ mirror: { text: "ok", updatedAt: NOW } });
  });
});
