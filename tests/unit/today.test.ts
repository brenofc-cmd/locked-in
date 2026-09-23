import { describe, expect, it } from "vitest";
import { mockTasks, mockToday } from "@/lib/mock-data";
import {
  groupBySection,
  nextLine,
  scheduleLabel,
  scheduledOn,
  todayStats,
} from "@/lib/today";

const today = scheduledOn(mockTasks, mockToday.day).today;

describe("today stats", () => {
  it("matches the design numbers: 8 / 12, 67%", () => {
    const s = todayStats(today, 80);
    expect(s).toMatchObject({ done: 8, total: 12, pct: 67, perfect: false });
    expect(s.needed).toBe(2);
    expect(nextLine(s)).toBe("2 more to meet your standard.");
  });

  it("excludes tasks not scheduled today (rest days)", () => {
    const { rest } = scheduledOn(mockTasks, mockToday.day);
    expect(rest.map((t) => t.name)).toEqual(["Long run"]);
  });

  it("drops skipped tasks from the total", () => {
    const skipped = today.map((t) =>
      t.id === "t-run" ? { ...t, skip: "SKIPPED · REST" } : t,
    );
    expect(todayStats(skipped, 80)).toMatchObject({
      done: 8,
      total: 11,
      pct: 73,
    });
  });

  it("reports a perfect day", () => {
    const all = today.map((t) => ({ ...t, done: true }));
    const s = todayStats(all, 80);
    expect(s.perfect).toBe(true);
    expect(nextLine(s)).toBe("Every task done.");
  });

  it("groups into the design's sections, in order", () => {
    expect(groupBySection(today).map((s) => [s.name, s.count])).toEqual([
      ["MORNING", "3 / 4"],
      ["WORK / STUDY", "3 / 3"],
      ["BODY", "2 / 3"],
      ["NIGHT", "0 / 2"],
    ]);
  });

  it("labels schedules", () => {
    expect(scheduleLabel(["MON", "TUE", "WED", "THU", "FRI"])).toBe("WEEKDAYS");
    expect(scheduleLabel(["MON", "WED"])).toBe("MO WE");
  });
});
