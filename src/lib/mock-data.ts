/**
 * All remaining mock data lives here (Stage 6): stats, streak, weekly
 * competition, head-to-head and challenges. Nothing else in the app defines sample
 * data. Real data: identity, duo, routine, tasks, partner presence, partner's
 * day and the activity feed (Supabase).
 */
import type { Challenge, Day, Partner, WeekResult } from "@/types";

/** Calendar of the mock Progress / Partner screens (Stage 7). Today itself is real. */
export const mockToday = {
  day: "TUE" as Day,
  label: "TUE, SEP 23",
  weekday: "TUESDAY",
  date: 23,
  monthLabel: "SEPTEMBER",
  dayNumber: 14,
  week: 39,
  daysLeftInWeek: 5,
};

/** Mock stats for the signed-in user. Identity (name, email, timezone) is real: see useSession(). */
export const mockUser = {
  streak: 13,
  longestStreak: 21,
  /** Share of scheduled tasks needed for a day to count. */
  standard: 80,
};

/** Mock partner streak (Stage 7). Name, presence and focus are replaced by real data in app-state. */
export const mockPartner: Partner = {
  name: "Lucas",
  handle: "",
  initial: "L",
  status: "online",
  focusLabel: "Studying Mathematics",
  focusSession: null,
  seenAt: "14:02",
  flashAt: 0,
  streak: 8,
};

/** Lucas: 11 tasks, 7 done → 64%. */
/** Week 39 so far (Partner → THIS WEEK). */
export const mockWeek = {
  me: 87,
  partner: 81,
  focusMe: "8h 42m",
  focusPartner: "7h 18m",
};

/** Completed weeks, newest first. */
export const mockWeeks: WeekResult[] = [
  { week: 38, me: 88, partner: 91 },
  { week: 37, me: 93, partner: 82 },
  { week: 36, me: 89, partner: 84 },
  { week: 35, me: 86, partner: 88 },
  { week: 34, me: 90, partner: 85 },
  { week: 33, me: 84, partner: 87 },
  { week: 32, me: 91, partner: 80 },
  { week: 31, me: 88, partner: 83 },
];

export type Range = "7" | "30" | "90" | "Y";

export const mockStats = {
  /** Completion for the 6 days before today (WED → MON). Today is live. */
  lastSixDays: [88, 100, 91, 86, 96, 93],
  byRange: {
    "7": { focus: "11.7h", perfect: 2 },
    "30": { pct: 84, focus: "42.5h", perfect: 6 },
    "90": { pct: 81, focus: "118h", perfect: 14 },
    Y: { pct: 79, focus: "318h", perfect: 29 },
  },
  /** September calendar: day → state. Days after today are future. */
  september: {
    missed: [2, 9],
    perfect: [4, 6, 11, 17, 20],
  },
  habits: [
    { name: "Gym", rate: 96 },
    { name: "Read", rate: 91 },
    { name: "Wake up", rate: 90 },
    { name: "Morning Run", rate: 86 },
    { name: "Make bed", rate: 84 },
    { name: "Study Physics", rate: 82 },
    { name: "Drink 3L Water", rate: 74 },
    { name: "Sleep before 23:00", rate: 68 },
  ],
  insights: [
    "Mornings are your strongest block: 94% this month.",
    "Sleep before 23:00 is your most missed task at 68%.",
    "Days with a focus session before 09:00 finish 11% higher.",
  ],
};

export const mockChallenges: Challenge[] = [
  {
    id: "c1",
    title: "NO ZERO DAYS",
    desc: "30 days. At least one task every day.",
    status: "ACTIVE",
    progLabel: "DAY",
    prog: "18 / 30",
    me: "94%",
    meWidth: 94,
    partner: "89%",
    partnerWidth: 89,
  },
  {
    id: "c2",
    title: "20 HOURS OF FOCUS",
    desc: "This week. First to 20 hours.",
    status: "ENDS SUN",
    progLabel: "LEADER",
    prog: "Brendon",
    me: "8h 42m",
    meWidth: 44,
    partner: "7h 18m",
    partnerWidth: 37,
  },
];

export const mockChallengeOptions = [
  { id: "zero", label: "No zero days", sub: "At least one task every day." },
  {
    id: "perfect",
    label: "Perfect week",
    sub: "Meet your standard every day.",
  },
  { id: "focus", label: "Most focus", sub: "Most focus hours wins." },
];

export const REACTIONS = ["🔥", "⚡", "🫡", "Respect."];
export const SKIP_REASONS = ["Rest", "Sick", "Travel", "Other"];
export const STANDARD_OPTIONS = [70, 80, 90, 100];
