import { describe, expect, it } from "vitest";
import {
  MILESTONES,
  hoursLabel,
  milestoneAria,
  milestoneProgress,
  milestoneTitle,
  milestones,
  nextMilestones,
  weekRangeLabel,
} from "@/lib/records";

const all = (longestStreak: number, focusHours: number, perfect: number) =>
  milestones({
    longestStreak,
    totalFocusSeconds: Math.round(focusHours * 3600),
    totalPerfectDays: perfect,
  });
const byKey = (ms: ReturnType<typeof milestones>, key: string) =>
  ms.find((m) => m.key === key)!;

describe("milestones — fixed thresholds, derived", () => {
  it("are exactly streak 7/30/100, focus 10/50/100 h, Perfect Days 5/10/30", () => {
    expect(MILESTONES).toEqual({
      streak: [7, 30, 100],
      focus: [10, 50, 100],
      perfect: [5, 10, 30],
    });
    expect(all(0, 0, 0).map((m) => m.key)).toEqual([
      "streak-7",
      "streak-30",
      "streak-100",
      "focus-10",
      "focus-50",
      "focus-100",
      "perfect-5",
      "perfect-10",
      "perfect-30",
    ]);
  });

  it("streak uses the LONGEST streak: losing the current run takes nothing back", () => {
    const ms = all(23, 0, 0);
    expect(byKey(ms, "streak-7")).toMatchObject({ reached: true, current: 7 });
    expect(byKey(ms, "streak-30")).toMatchObject({
      reached: false,
      current: 23,
    });
    expect(byKey(all(30, 0, 0), "streak-30").reached).toBe(true);
    expect(byKey(all(100, 0, 0), "streak-100").reached).toBe(true);
    expect(byKey(all(99, 0, 0), "streak-100").reached).toBe(false);
  });

  it("focus counts whole hours of effective focus (9 h 59 min is not 10 h)", () => {
    expect(byKey(all(0, 9 + 59 / 60, 0), "focus-10")).toMatchObject({
      reached: false,
      current: 9,
    });
    expect(byKey(all(0, 10, 0), "focus-10").reached).toBe(true);
    expect(byKey(all(0, 72.5, 0), "focus-100")).toMatchObject({
      reached: false,
      current: 72,
    });
    expect(byKey(all(0, 50, 0), "focus-50").reached).toBe(true);
    expect(byKey(all(0, 100, 0), "focus-100").reached).toBe(true);
  });

  it("Perfect Days total: 5 / 10 / 30", () => {
    const ms = all(0, 0, 10);
    expect(byKey(ms, "perfect-5").reached).toBe(true);
    expect(byKey(ms, "perfect-10").reached).toBe(true);
    expect(byKey(ms, "perfect-30")).toMatchObject({
      reached: false,
      current: 10,
    });
  });

  it("progress is capped at the target", () => {
    expect(byKey(all(250, 0, 0), "streak-100").current).toBe(100);
  });
});

describe("next milestones", () => {
  it("one per kind — the lowest not reached — closest first", () => {
    const next = nextMilestones(all(23, 72, 3));
    expect(next.map((m) => m.key)).toEqual([
      "streak-30",
      "focus-100",
      "perfect-5",
    ]);
  });

  it("a kind with everything reached drops out; none left → empty", () => {
    expect(nextMilestones(all(100, 0, 0)).map((m) => m.kind)).not.toContain(
      "streak",
    );
    expect(nextMilestones(all(100, 100, 30))).toEqual([]);
  });
});

describe("labels", () => {
  it("titles, progress and the accessible text", () => {
    const ms = all(23, 72, 3);
    expect(milestoneTitle(byKey(ms, "streak-30"))).toBe("30 DIAS DE SEQUÊNCIA");
    expect(milestoneProgress(byKey(ms, "streak-30"))).toBe("23 / 30");
    expect(milestoneAria(byKey(ms, "streak-30"))).toBe(
      "30 DIAS DE SEQUÊNCIA: 23 de 30 dias",
    );
    expect(milestoneProgress(byKey(ms, "focus-100"))).toBe("72h / 100h");
    expect(milestoneAria(byKey(ms, "focus-100"))).toBe(
      "100H DE FOCO: 72 de 100 horas",
    );
    expect(milestoneAria(byKey(ms, "streak-7"))).toBe(
      "7 DIAS DE SEQUÊNCIA: CONQUISTADO",
    );
    expect(milestoneTitle(byKey(ms, "perfect-5"))).toBe("5 DIAS PERFEITOS");
  });

  it("hours: 4h 32min, 16h 05min, 45min", () => {
    expect(hoursLabel(4 * 3600 + 32 * 60 + 59)).toBe("4h 32min");
    expect(hoursLabel(16 * 3600 + 5 * 60)).toBe("16h 05min");
    expect(hoursLabel(3 * 3600)).toBe("3h");
    expect(hoursLabel(45 * 60)).toBe("45min");
  });

  it("week range: same month and across months / years", () => {
    expect(weekRangeLabel("2026-09-14")).toBe("14–20 SET");
    expect(weekRangeLabel("2026-09-28")).toBe("28 SET–4 OUT");
    expect(weekRangeLabel("2026-12-28")).toBe("28 DEZ–3 JAN");
  });
});
