import { describe, expect, it } from "vitest";
import {
  challengeLeader,
  challengeStatus,
  challengeWinner,
  defaultDraft,
  formatValue,
  goalLabel,
  goalShare,
  periodLabel,
  statusLabel,
  targetValue,
  validateDraft,
  type Challenge,
} from "@/lib/challenges";
import {
  decide,
  inQuietHours,
  reminderDelays,
  type NotificationPrefs,
} from "@/lib/notifications";
import { onboardingStart } from "@/lib/onboarding";
import {
  calendarMonth,
  monthRange,
  reviewWeeks,
  shiftMonth,
  type WeekRow,
} from "@/lib/progress";
import {
  applyReaction,
  isReactionType,
  reactionLabel,
  reactionMapFrom,
  reactionToastText,
} from "@/lib/reactions";
import { settingsFromRow, validSetting } from "@/lib/settings";

const TODAY = "2026-09-25";

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: "c",
  title: "NO ZERO DAYS",
  type: "standard_days",
  target: 20,
  start: "2026-09-25",
  end: "2026-10-24",
  createdBy: "me",
  me: 0,
  partner: 0,
  ...over,
});

describe("challenges", () => {
  it("status is derived from the dates (my local today)", () => {
    expect(challengeStatus(challenge({ start: "2026-09-26" }), TODAY)).toBe(
      "upcoming",
    );
    expect(challengeStatus(challenge(), TODAY)).toBe("active");
    expect(challengeStatus(challenge({ end: TODAY }), TODAY)).toBe("active");
    expect(
      challengeStatus(
        challenge({ start: "2026-09-01", end: "2026-09-24" }),
        TODAY,
      ),
    ).toBe("completed");
  });

  it("status labels", () => {
    expect(statusLabel(challenge({ start: "2026-09-26" }), TODAY)).toBe(
      "STARTS TOMORROW",
    );
    expect(statusLabel(challenge({ start: "2026-09-28" }), TODAY)).toBe(
      "STARTS IN 3 DAYS",
    );
    expect(statusLabel(challenge({ end: TODAY }), TODAY)).toBe("LAST DAY");
    expect(statusLabel(challenge({ end: "2026-09-27" }), TODAY)).toBe(
      "3 DAYS LEFT",
    );
    expect(
      statusLabel(challenge({ start: "2026-09-01", end: "2026-09-02" }), TODAY),
    ).toBe("COMPLETED");
  });

  const closed = { start: "2026-09-01", end: "2026-09-07" };

  it("the winner exists only once the challenge is over; the higher total wins", () => {
    expect(
      challengeWinner(challenge({ ...closed, me: 12, partner: 9 }), TODAY),
    ).toBe("me");
    expect(
      challengeWinner(challenge({ ...closed, me: 3, partner: 9 }), TODAY),
    ).toBe("partner");
    expect(
      challengeWinner(challenge({ ...closed, me: 5, partner: 5 }), TODAY),
    ).toBe("draw");
    expect(
      challengeWinner(challenge({ ...closed, me: 0, partner: 0 }), TODAY),
    ).toBe("draw");
    expect(
      challengeWinner(challenge({ me: 12, partner: 9 }), TODAY),
    ).toBeNull();
    expect(
      challengeWinner(challenge({ ...closed, partner: null }), TODAY),
    ).toBeNull();
  });

  it("an active challenge has a leader, not a winner", () => {
    expect(challengeLeader(challenge({ me: 3, partner: 1 }))).toBe("me");
    expect(challengeLeader(challenge({ me: 1, partner: 3 }))).toBe("partner");
    expect(challengeLeader(challenge({ me: 2, partner: 2 }))).toBe("tied");
    expect(challengeLeader(challenge({ partner: null }))).toBeNull();
  });

  it("formats progress, goals and the period", () => {
    expect(formatValue("standard_days", 1)).toBe("1 day");
    expect(formatValue("standard_days", 12)).toBe("12 days");
    expect(formatValue("focus_seconds", 31_320)).toBe("8h 42m");
    expect(goalLabel("standard_days", 20)).toBe("20 STANDARD DAYS");
    expect(goalLabel("focus_seconds", 36_000)).toBe("10 HOURS");
    expect(goalLabel("focus_seconds", 3600)).toBe("1 HOUR");
    expect(goalLabel("focus_seconds", 5400)).toBe("1H 30M");
    expect(periodLabel("2026-09-25", "2026-10-24")).toBe("SEP 25 → OCT 24");
    expect(goalShare(5, 20)).toBe(25);
    expect(goalShare(30, 20)).toBe(100);
  });

  it("validates a draft with the database's rules", () => {
    const ok = defaultDraft("standard_days", TODAY);
    expect(validateDraft(ok, TODAY)).toBeNull();
    expect(validateDraft({ ...ok, title: "  " }, TODAY)).toMatch(/title/);
    expect(validateDraft({ ...ok, start: "2026-09-24" }, TODAY)).toMatch(
      /today or later/,
    );
    expect(validateDraft({ ...ok, end: "2026-09-20" }, TODAY)).toMatch(
      /before the start/,
    );
    expect(validateDraft({ ...ok, goal: 0 }, TODAY)).toMatch(/above zero/);
    expect(validateDraft({ ...ok, goal: 31 }, TODAY)).toMatch(
      /At most 30 days/,
    );
    expect(validateDraft({ ...ok, goal: 2.5 }, TODAY)).toMatch(/whole/);
    const focus = defaultDraft("focus_seconds", TODAY);
    expect(validateDraft(focus, TODAY)).toBeNull();
    expect(validateDraft({ ...focus, goal: 200 }, TODAY)).toMatch(
      /At most 168 hours/,
    );
    expect(targetValue(focus)).toBe(36_000);
    expect(targetValue({ ...focus, goal: 1.5 })).toBe(5400);
    expect(targetValue(ok)).toBe(20);
  });
});

const prefs: NotificationPrefs = {
  partnerActivity: true,
  reactions: true,
  taskReminders: true,
  weeklyReview: false,
  quietHoursEnabled: true,
  quietStart: "22:00",
  quietEnd: "07:00",
};

describe("notifications", () => {
  it("quiet hours, including windows across midnight", () => {
    expect(inQuietHours("23:30", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("06:59", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("07:00", "22:00", "07:00")).toBe(false);
    expect(inQuietHours("12:00", "22:00", "07:00")).toBe(false);
    expect(inQuietHours("13:00", "12:00", "14:00")).toBe(true);
    expect(inQuietHours("14:00", "12:00", "14:00")).toBe(false);
    expect(inQuietHours("10:00", "10:00", "10:00")).toBe(false);
  });

  const ctx = {
    nowHM: "12:00",
    permission: "granted" as const,
    visible: false,
  };

  it("a disabled preference: no toast, no browser notification", () => {
    expect(decide("weekly_review", prefs, ctx)).toEqual({
      toast: false,
      browser: false,
    });
  });

  it("enabled: the in-app toast always; the browser notification only in a background tab", () => {
    expect(decide("partner_activity", prefs, ctx)).toEqual({
      toast: true,
      browser: true,
    });
    expect(
      decide("partner_activity", prefs, { ...ctx, visible: true }),
    ).toEqual({
      toast: true,
      browser: false,
    });
  });

  it("quiet hours suppress the browser notification, never the in-app state", () => {
    expect(decide("reaction", prefs, { ...ctx, nowHM: "23:15" })).toEqual({
      toast: true,
      browser: false,
    });
    expect(
      decide(
        "reaction",
        { ...prefs, quietHoursEnabled: false },
        { ...ctx, nowHM: "23:15" },
      ),
    ).toEqual({ toast: true, browser: true });
  });

  it("no permission (default / denied / unsupported): never a browser notification", () => {
    for (const permission of ["default", "denied", "unsupported"] as const)
      expect(
        decide("partner_activity", prefs, { ...ctx, permission }).browser,
      ).toBe(false);
  });

  it("reminders only for pending tasks with a reminder and a time later today", () => {
    const tasks = [
      { id: "a", time: "12:30", reminder: true, done: false, skip: null },
      { id: "b", time: "12:30", reminder: false, done: false, skip: null },
      { id: "c", time: "11:00", reminder: true, done: false, skip: null },
      { id: "d", time: "13:00", reminder: true, done: true, skip: null },
      {
        id: "e",
        time: "13:00",
        reminder: true,
        done: false,
        skip: "SKIPPED · REST",
      },
      { id: "f", time: "", reminder: true, done: false, skip: null },
    ];
    expect(reminderDelays("12:00", 30, tasks)).toEqual([
      { id: "a", ms: 29.5 * 60_000 },
    ]);
  });
});

describe("onboarding", () => {
  it("returning users never see it; a new user starts at the beginning", () => {
    expect(onboardingStart({ completed: true, hasRoutine: false })).toBeNull();
    expect(onboardingStart({ completed: false, hasRoutine: false })).toBe(0);
  });

  it("an interrupted onboarding with a routine resumes at the duo step", () => {
    expect(onboardingStart({ completed: false, hasRoutine: true })).toBe(4);
  });
});

describe("reactions", () => {
  it("maps the stored types to the approved glyphs only", () => {
    expect(reactionLabel("fire")).toBe("🔥");
    expect(reactionLabel("lightning")).toBe("⚡");
    expect(reactionLabel("salute")).toBe("🫡");
    expect(reactionLabel("respect")).toBe("Respect.");
    expect(isReactionType("fire")).toBe(true);
    expect(isReactionType("love")).toBe(false);
    expect(isReactionType(null)).toBe(false);
  });

  it("one reaction per user per event: replace, remove", () => {
    let map = reactionMapFrom([
      { activity_event_id: "e1", from_user_id: "b", reaction_type: "fire" },
      { activity_event_id: "e1", from_user_id: "x", reaction_type: "bogus" },
    ]);
    expect(map).toEqual({ e1: { b: "fire" } });
    map = applyReaction(map, "e1", "b", "salute");
    expect(map).toEqual({ e1: { b: "salute" } });
    map = applyReaction(map, "e2", "a", "respect");
    expect(map.e2).toEqual({ a: "respect" });
    map = applyReaction(map, "e1", "b", null);
    expect(map.e1).toBeUndefined();
  });

  it("toast copy", () => {
    expect(reactionToastText("Lucas", "Morning Run")).toBe(
      "Lucas reacted to your Morning Run.",
    );
    expect(reactionToastText("Lucas", null)).toBe(
      "Lucas reacted to your activity.",
    );
  });
});

describe("settings", () => {
  it("defaults when the row is missing, HH:MM times", () => {
    const s = settingsFromRow(null);
    expect(s.onboarded).toBe(false);
    expect(s.showMorningBriefing).toBe(true);
    expect(s.quietHoursStart).toBe("22:00");
  });

  it("validates values before sending", () => {
    expect(validSetting("quietHoursStart", "23:30")).toBe(true);
    expect(validSetting("quietHoursStart", "24:00")).toBe(false);
    expect(validSetting("quietHoursEnd", "7:00")).toBe(false);
    expect(validSetting("notifyReactions", true)).toBe(true);
    expect(validSetting("notifyReactions", "yes")).toBe(false);
  });
});

describe("history", () => {
  const side = (planned: number, completed: number) => ({
    planned,
    completed,
    focus: 0,
    perfect: 0,
  });
  const weeks: WeekRow[] = [
    {
      weekStart: "2026-09-21",
      isCurrent: true,
      me: side(4, 1),
      partner: side(4, 3),
    },
    {
      weekStart: "2026-09-14",
      isCurrent: false,
      me: side(10, 9),
      partner: side(10, 8),
    },
    {
      weekStart: "2026-09-07",
      isCurrent: false,
      me: side(0, 0),
      partner: null,
    },
  ];

  it("review weeks: current week first (live numbers, leader), then closed weeks with a result", () => {
    const list = reviewWeeks(weeks, side(4, 4));
    expect(list.map((w) => [w.weekStart, w.current])).toEqual([
      ["2026-09-21", true],
      ["2026-09-14", false],
    ]);
    expect(list[0]).toMatchObject({ mePct: 100, partnerPct: 75, result: null });
    expect(list[0].leader).toEqual({ who: "me", margin: "+25%" });
    expect(list[1]).toMatchObject({
      mePct: 90,
      partnerPct: 80,
      result: "me",
      leader: null,
    });
  });

  it("an empty current week is not listed", () => {
    const empty = [
      { ...weeks[0], me: side(0, 0), partner: side(0, 0) },
      weeks[1],
    ];
    expect(reviewWeeks(empty).map((w) => w.weekStart)).toEqual(["2026-09-14"]);
  });

  it("months: shift and range", () => {
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(monthRange("2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(monthRange("2024-02")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("a past month in the calendar: every day closed, labelled with its year", () => {
    const { label, cells } = calendarMonth(
      [
        {
          day: "2026-08-03",
          planned: 2,
          completed: 2,
          focusSeconds: 0,
          focusSessions: 0,
        },
      ],
      TODAY,
      80,
      "2026-08",
    );
    expect(label).toBe("AUGUST 2026");
    const days = cells.filter((c) => c.kind === "day");
    expect(days).toHaveLength(31);
    const aug3 = days.find((c) => c.kind === "day" && c.date === "2026-08-03");
    expect(aug3 && aug3.kind === "day" ? aug3.state : null).toBe("perfect");
    expect(
      days.every(
        (c) => c.kind === "day" && c.state !== "future" && c.state !== "today",
      ),
    ).toBe(true);
  });
});
