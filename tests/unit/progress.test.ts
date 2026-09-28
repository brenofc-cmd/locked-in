import { describe, expect, it } from "vitest";
import { localDateISO } from "@/lib/local-date";
import {
  bestWeekday,
  calendarMonth,
  chartBars,
  compareRatio,
  completedWeeks,
  dayState,
  focusLabel,
  habitExtremes,
  headToHead,
  insightLines,
  isoWeekNumber,
  leader,
  liveStreak,
  msUntilDateChange,
  percent,
  rangeFrom,
  rankHabits,
  seriesFrom,
  standardMet,
  totals,
  weekRangeLabel,
  weekStartOf,
  weeksWithData,
  withToday,
  type DayStat,
  type Habit,
  type WeekRow,
} from "@/lib/progress";

// Friday 2026-09-25, ISO week 39 (Monday 2026-09-21).
const TODAY = "2026-09-25";

const day = (
  d: string,
  planned: number,
  completed: number,
  focusSeconds = 0,
): DayStat => ({
  day: d,
  planned,
  completed,
  focusSeconds,
  focusSessions: focusSeconds ? 1 : 0,
});

const side = (planned: number, completed: number, focus = 0, perfect = 0) => ({
  planned,
  completed,
  focus,
  perfect,
});

const week = (
  weekStart: string,
  me: ReturnType<typeof side>,
  partner: ReturnType<typeof side> | null,
  isCurrent = false,
): WeekRow => ({ weekStart, isCurrent, me, partner });

describe("day rules", () => {
  it("completion % rounds half up; a day with nothing planned is neutral, never 0 % or 100 %", () => {
    expect(percent(2, 3)).toBe(67);
    expect(percent(1, 8)).toBe(13);
    expect(percent(8, 8)).toBe(100);
    expect(percent(0, 5)).toBe(0);
    expect(percent(0, 0)).toBeNull();
  });

  it("standard met uses the exact ratio, never the rounded %", () => {
    expect(standardMet(5, 4, 80)).toBe(true); // exactly 80 %
    expect(standardMet(3, 2, 67)).toBe(false); // 66.7 % shows as 67 but misses
    expect(standardMet(3, 2, 66)).toBe(true);
    expect(standardMet(0, 0, 80)).toBe(false);
  });

  it("skipped stays in the total: 3 done + 1 skipped is 75 %, not 100 %", () => {
    // The database counts a skipped task as planned and not completed.
    expect(percent(3, 4)).toBe(75);
    expect(dayState(4, 3, 80)).toBe("missed");
    expect(dayState(4, 3, 75)).toBe("met");
  });

  it("day states: neutral, missed, met, perfect (100 %)", () => {
    expect(dayState(0, 0, 80)).toBe("neutral");
    expect(dayState(5, 3, 80)).toBe("missed");
    expect(dayState(5, 4, 80)).toBe("met");
    expect(dayState(5, 5, 80)).toBe("perfect");
    expect(dayState(1, 1, 100)).toBe("perfect");
  });
});

describe("streak", () => {
  it("an incomplete today never breaks the streak; it counts once the standard is met", () => {
    expect(liveStreak(10, 2, 0, 80)).toBe(10);
    expect(liveStreak(10, 2, 1, 80)).toBe(10);
    expect(liveStreak(10, 2, 2, 80)).toBe(11);
  });

  it("a day with nothing scheduled today neither counts nor breaks", () => {
    expect(liveStreak(4, 0, 0, 80)).toBe(4);
  });

  it("the standard decides when today counts", () => {
    expect(liveStreak(0, 5, 4, 80)).toBe(1);
    expect(liveStreak(0, 5, 4, 90)).toBe(0);
    expect(liveStreak(0, 5, 5, 100)).toBe(1);
  });
});

describe("series", () => {
  const days = [
    day("2026-09-23", 4, 4, 1500),
    day("2026-09-24", 0, 0),
    day("2026-09-25", 3, 1, 600),
  ];

  it("today's entry is replaced by the live counts and focus", () => {
    const live = withToday(days, TODAY, {
      planned: 3,
      completed: 3,
      focusSeconds: 1800,
    });
    expect(live[2]).toMatchObject({
      planned: 3,
      completed: 3,
      focusSeconds: 1800,
    });
    expect(live[0]).toBe(days[0]);
  });

  it("keeps the loaded focus when no live value is given", () => {
    const live = withToday(days, TODAY, { planned: 4, completed: 2 });
    expect(live[2].focusSeconds).toBe(600);
  });

  it("totals: completion over the range, perfect days, days with tasks, focus", () => {
    expect(totals(days, "2026-09-23", TODAY)).toEqual({
      planned: 7,
      completed: 5,
      pct: 71,
      focusSeconds: 2100,
      focusSessions: 2,
      perfectDays: 1,
      daysWithTasks: 2,
    });
    expect(totals(days, "2026-09-24", "2026-09-24").pct).toBeNull();
  });

  it("ranges end today; YEAR is the calendar year", () => {
    expect(rangeFrom("7", TODAY)).toBe("2026-09-19");
    expect(rangeFrom("30", TODAY)).toBe("2026-08-27");
    expect(rangeFrom("90", TODAY)).toBe("2026-06-28");
    expect(rangeFrom("Y", TODAY)).toBe("2026-01-01");
  });

  it("the series covers every range and the current month", () => {
    expect(seriesFrom(TODAY)).toBe("2026-01-01");
    // In early February, 90 days reach back into the previous year.
    expect(seriesFrom("2026-02-10")).toBe("2025-11-13");
  });
});

describe("chart", () => {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = `2026-09-${String(12 + i).padStart(2, "0")}`;
    return d === "2026-09-20" ? day(d, 0, 0) : day(d, 4, 3);
  });

  it("7D: one bar per day, weekday labels, neutral bars have no %", () => {
    const bars = chartBars(days, "7", TODAY);
    expect(bars.map((b) => b.label)).toEqual([
      "SAT",
      "SUN",
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
    ]);
    expect(bars[1].pct).toBeNull(); // Sunday 20th: nothing scheduled
    expect(bars[1].title).toBe("20 SET: sem tarefas");
    expect(bars.at(-1)).toMatchObject({ pct: 75, current: true });
  });

  it("90D: one bar per ISO week (completed / planned of the whole week)", () => {
    const bars = chartBars(days, "90", TODAY);
    expect(bars.map((b) => b.label)).toEqual(["S37", "S38", "S39"]);
    expect(bars.map((b) => b.pct)).toEqual([75, 75, 75]);
    expect(bars.at(-1)?.current).toBe(true);
  });

  it("YEAR: one bar per month", () => {
    const bars = chartBars([day("2026-08-31", 2, 1), ...days], "Y", TODAY);
    expect(bars.map((b) => [b.label, b.pct])).toEqual([
      ["AGO", 50],
      ["SET", 75],
    ]);
  });
});

describe("calendar", () => {
  it("the current month, Monday first, with past states, today and future", () => {
    const { label, cells } = calendarMonth(
      [
        day("2026-09-01", 2, 2),
        day("2026-09-02", 5, 3),
        day("2026-09-03", 5, 4),
      ],
      TODAY,
      80,
    );
    expect(label).toBe("SETEMBRO");
    // 1 September 2026 is a Tuesday: one blank cell before it.
    expect(cells[0].kind).toBe("blank");
    const days = cells.filter((c) => c.kind === "day");
    expect(days).toHaveLength(30);
    const state = (n: number) => {
      const c = days[n - 1];
      return c.kind === "day" ? c.state : null;
    };
    expect(state(1)).toBe("perfect");
    expect(state(2)).toBe("missed");
    expect(state(3)).toBe("met");
    expect(state(4)).toBe("neutral");
    expect(state(25)).toBe("today");
    expect(state(26)).toBe("future");
  });
});

describe("weeks", () => {
  it("Monday start and ISO week numbers, including the year edges", () => {
    expect(weekStartOf(TODAY)).toBe("2026-09-21");
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21");
    expect(weekStartOf("2026-09-27")).toBe("2026-09-21");
    expect(isoWeekNumber("2026-09-21")).toBe(39);
    expect(isoWeekNumber("2027-01-01")).toBe(53); // 2026 has 53 ISO weeks
    expect(isoWeekNumber("2024-12-30")).toBe(1); // belongs to 2025's week 1
  });

  it("week labels", () => {
    expect(weekRangeLabel("2026-09-21")).toBe("21 – 27 SET");
    expect(weekRangeLabel("2026-09-28")).toBe("28 SET – 4 OUT");
  });
});

describe("competition", () => {
  it("compares exact ratios", () => {
    expect(
      compareRatio({ planned: 5, completed: 4 }, { planned: 10, completed: 8 }),
    ).toBe(0);
    expect(
      compareRatio(
        { planned: 3, completed: 2 },
        { planned: 100, completed: 67 },
      ),
    ).toBe(-1);
    expect(
      compareRatio({ planned: 4, completed: 4 }, { planned: 9, completed: 8 }),
    ).toBe(1);
  });

  it("this week's leader is raw completion %; a tiny exact lead shows <1%", () => {
    expect(
      leader({ planned: 12, completed: 8 }, { planned: 5, completed: 3 }),
    ).toEqual({
      who: "me",
      margin: "+7%",
    });
    expect(
      leader({ planned: 5, completed: 4 }, { planned: 10, completed: 8 }),
    ).toEqual({
      who: "tied",
      margin: "",
    });
    expect(
      leader({ planned: 3, completed: 2 }, { planned: 100, completed: 67 }),
    ).toEqual({
      who: "partner",
      margin: "<1%",
    });
  });

  it("no score while either side has nothing planned or there is no partner", () => {
    expect(
      leader({ planned: 0, completed: 0 }, { planned: 5, completed: 5 }).who,
    ).toBe("none");
    expect(
      leader({ planned: 5, completed: 5 }, { planned: 0, completed: 0 }).who,
    ).toBe("none");
    expect(leader({ planned: 5, completed: 5 }, null).who).toBe("none");
  });

  const weeks: WeekRow[] = [
    week("2026-09-21", side(10, 10), side(10, 1), true), // current: never a result
    week("2026-09-14", side(5, 4, 30_000, 1), side(10, 8, 0, 1)), // exact draw
    week("2026-09-07", side(10, 7, 90_000), side(10, 8)), // partner, despite my focus
    week("2026-08-31", side(10, 9), side(10, 8)), // me
    week("2026-08-24", side(4, 4), null), // before the duo
    week("2026-08-17", side(0, 0), side(5, 5)), // I had nothing planned
  ];

  it("completed weeks only, newest first; the current week never gives a result", () => {
    const results = completedWeeks(weeks);
    expect(results.map((r) => r.weekStart)).toEqual([
      "2026-09-14",
      "2026-09-07",
      "2026-08-31",
      "2026-08-24",
      "2026-08-17",
    ]);
    expect(results.map((r) => r.result)).toEqual([
      "draw",
      "partner",
      "me",
      "ineligible",
      "ineligible",
    ]);
    expect(results[0]).toMatchObject({ week: 38, me: 80, partner: 80 });
    expect(results[3]).toMatchObject({ me: 100, partner: null });
  });

  it("focus never decides a week: more focus and lower completion still loses", () => {
    const [w] = completedWeeks([
      week("2026-09-07", side(10, 7, 99_999), side(10, 8, 0)),
    ]);
    expect(w.result).toBe("partner");
  });

  it("head to head counts wins and draws; ineligible weeks count for no one", () => {
    expect(headToHead(completedWeeks(weeks))).toEqual({
      me: 1,
      partner: 1,
      draws: 1,
    });
  });

  it("weeks with data hide the empty ones", () => {
    const empty = week("2026-08-10", side(0, 0), side(0, 0));
    expect(weeksWithData(completedWeeks([...weeks, empty]))).toHaveLength(5);
  });

  it("order of the input does not matter", () => {
    const shuffled = [...weeks].reverse();
    expect(completedWeeks(shuffled).map((r) => r.weekStart)).toEqual(
      completedWeeks(weeks).map((r) => r.weekStart),
    );
  });
});

describe("habits and insights", () => {
  const habits: Habit[] = [
    { routineId: "gym", title: "Gym", planned: 12, completed: 11 },
    { routineId: "read", title: "Read", planned: 30, completed: 27 },
    {
      routineId: "sleep",
      title: "Sleep before 23:00",
      planned: 30,
      completed: 18,
    },
    { routineId: "new", title: "New habit", planned: 1, completed: 1 },
  ];

  it("needs 3 scheduled occurrences before a habit is ranked (no best habit from 1 / 1)", () => {
    const ranked = rankHabits(habits);
    expect(ranked.map((h) => h.routineId)).toEqual(["gym", "read", "sleep"]);
    expect(ranked.map((h) => h.rate)).toEqual([92, 90, 60]);
  });

  it("best and most missed", () => {
    const { best, missed } = habitExtremes(habits);
    expect(best?.title).toBe("Gym");
    expect(missed?.title).toBe("Sleep before 23:00");
  });

  it("no most missed when nothing is missed or there is one habit", () => {
    expect(
      habitExtremes([{ routineId: "a", title: "A", planned: 5, completed: 5 }])
        .missed,
    ).toBeNull();
    expect(
      habitExtremes([
        { routineId: "a", title: "A", planned: 5, completed: 5 },
        { routineId: "b", title: "B", planned: 4, completed: 4 },
      ]).missed,
    ).toBeNull();
    expect(habitExtremes([])).toEqual({ best: null, missed: null });
  });

  it("strongest weekday needs 3 samples of at least 3 weekdays", () => {
    // Mon 100 %, Tue 50 %, Wed 75 % — three weeks each.
    const days: DayStat[] = [];
    for (const monday of ["2026-09-07", "2026-09-14", "2026-09-21"]) {
      const d = new Date(`${monday}T00:00:00Z`);
      const iso = (n: number) =>
        new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
      days.push(day(iso(0), 2, 2), day(iso(1), 2, 1), day(iso(2), 4, 3));
    }
    expect(bestWeekday(days)).toEqual({ name: "segunda", pct: 100 });
    expect(bestWeekday(days.slice(0, 6))).toBeNull();
  });

  it("insight lines are descriptive counts and rates", () => {
    expect(insightLines(habits, [], "nos últimos 30 dias")).toEqual([
      "Gym: 11 de 12 nos últimos 30 dias (92%). Sua rotina mais consistente.",
      "Sleep before 23:00 é a sua rotina menos consistente, com 60%.",
    ]);
    expect(insightLines([], [], "nos últimos 30 dias")).toEqual([]);
  });
});

describe("focus and the day boundary", () => {
  it("focus labels", () => {
    expect(focusLabel(31_320)).toBe("8h 42m");
    expect(focusLabel(2_520)).toBe("42m");
    expect(focusLabel(59)).toBe("0m");
    expect(focusLabel(3_600)).toBe("1h 0m");
  });

  it("time until the local date changes (São Paulo, 23:30 → midnight + 1 s margin)", () => {
    const now = Date.parse("2026-09-26T02:30:00Z"); // 23:30 on the 25th in São Paulo
    const tz = "America/Sao_Paulo";
    expect(msUntilDateChange(now, tz, TODAY, localDateISO)).toBe(
      30 * 60_000 + 1000,
    );
    // Already on another date: reload now.
    expect(msUntilDateChange(now, tz, "2026-09-24", localDateISO)).toBe(0);
  });

  it("uses the user's time zone, not UTC", () => {
    const now = Date.parse("2026-09-25T12:00:00Z"); // 21:00 in Tokyo
    expect(msUntilDateChange(now, "Asia/Tokyo", TODAY, localDateISO)).toBe(
      3 * 3_600_000 + 1000,
    );
  });
});
