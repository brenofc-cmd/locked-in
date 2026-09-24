/**
 * All Stage 2 mock data lives here. Nothing else in the app should define
 * sample users, tasks or stats. Replaced by Supabase data from Stage 3 on.
 */
import type {
  Category,
  Challenge,
  Day,
  FeedEvent,
  FocusSession,
  Partner,
  PartnerTask,
  Task,
  WeekResult,
} from "@/types";

export const DAYS: Day[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** The design is drawn on Tuesday, Sep 23 2026, week 39, day 14. */
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

/** Mock presence / focus / streak. name, initial and handle are replaced by the real partner in app-state. */
export const mockPartner: Partner = {
  name: "Lucas",
  handle: "",
  initial: "L",
  status: "online",
  focusLabel: "Studying Mathematics",
  focusEnd: 0,
  seenAt: "14:02",
  flashAt: 0,
  streak: 8,
};

function task(
  id: string,
  name: string,
  category: Category,
  time: string,
  meta: string,
  doneAt: string | null,
  days: Day[] = DAYS,
): Task {
  return {
    id,
    name,
    category,
    time,
    meta,
    days,
    once: false,
    done: doneAt !== null,
    doneAt,
    skip: null,
    visible: true,
    reminder: false,
    notes: "",
    unsynced: false,
  };
}

/** 12 tasks today, 8 done → 67%. "Long run" is not scheduled on Tuesdays. */
export const mockTasks: Task[] = [
  task("t-wake", "Wake up", "Morning", "06:00", "", "05:58"),
  task("t-water", "Drink water", "Morning", "06:10", "500 ML", "06:06"),
  task("t-bed", "Make bed", "Morning", "06:05", "", "06:03"),
  task("t-run", "Morning Run", "Morning", "06:30", "5 KM", null),
  task("t-physics", "Study Physics", "Study", "07:40", "45 MIN", "08:31"),
  task("t-project", "Work on project", "Work", "09:00", "1 H", "09:12"),
  task("t-read", "Read", "Study", "07:15", "30 MIN", "07:38"),
  task("t-gym", "Gym", "Body", "08:00", "PUSH DAY", "08:42"),
  task("t-3l", "Drink 3L Water", "Body", "", "3 L", null),
  task("t-diet", "Follow diet", "Body", "", "", "09:05"),
  task("t-prep", "Prepare tomorrow", "Night", "22:00", "", null),
  task("t-sleep", "Sleep before 23:00", "Night", "22:45", "", null),
  task("t-long", "Long run", "Body", "07:00", "12 KM", null, ["SAT"]),
];

/** Lucas: 11 tasks, 7 done → 64%. */
export const mockPartnerTasks: PartnerTask[] = [
  {
    id: "p-wake",
    name: "Wake up at 06:30",
    done: true,
    at: "06:34",
    reacted: null,
  },
  { id: "p-read", name: "Reading", done: true, at: "07:51", reacted: null },
  {
    id: "p-shower",
    name: "Cold shower",
    done: true,
    at: "08:05",
    reacted: null,
  },
  { id: "p-med", name: "Meditate", done: true, at: "08:20", reacted: null },
  { id: "p-journal", name: "Journal", done: true, at: "08:40", reacted: null },
  { id: "p-stretch", name: "Stretch", done: true, at: "09:02", reacted: null },
  { id: "p-run", name: "Morning Run", done: true, at: "09:27", reacted: null },
  { id: "p-work", name: "Work", done: false, at: null, reacted: null },
  {
    id: "p-math",
    name: "Study Mathematics",
    done: false,
    at: null,
    reacted: null,
  },
  { id: "p-gym", name: "Gym", done: false, at: null, reacted: null },
  {
    id: "p-sleep",
    name: "Sleep before 23:00",
    done: false,
    at: null,
    reacted: null,
  },
];

function ev(
  id: string,
  t: string,
  who: FeedEvent["who"],
  kind: FeedEvent["kind"],
  text: string,
  target: string | null = null,
  taskId: string | null = null,
): FeedEvent {
  return { id, t, who, kind, text, target, taskId, reacted: null };
}

/** Oldest first. The UI renders newest on top. */
export const mockActivity: FeedEvent[] = [
  ev("f1", "07:02", "partner", "start", "started the day"),
  ev("f2", "07:14", "me", "start", "started the day"),
  ev("f3", "07:38", "me", "done", "completed Read", "Read", "t-read"),
  ev("f4", "07:51", "partner", "done", "completed Reading", "Reading"),
  ev(
    "f5",
    "08:31",
    "me",
    "done",
    "completed Study Physics",
    "Study Physics",
    "t-physics",
  ),
  ev("f6", "08:42", "me", "done", "completed Gym", "Gym", "t-gym"),
  ev(
    "f7",
    "09:12",
    "me",
    "done",
    "completed Work on project",
    "Work on project",
    "t-project",
  ),
  ev("f8", "09:27", "partner", "done", "completed Morning Run", "Morning Run"),
];

export const mockFocus = {
  activities: ["Project", "Physics", "Reading", "Study"],
  defaultActivity: "Project",
  sessions: [
    {
      id: "s1",
      task: "Physics",
      from: "07:41",
      to: "08:31",
      min: 50,
      note: "Finished chapter 4 problem set.",
    },
    {
      id: "s2",
      task: "Project",
      from: "08:50",
      to: "09:10",
      min: 20,
      note: "",
    },
  ] satisfies FocusSession[],
};

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

export const mockTemplates: Record<
  string,
  { name: string; category: Category }[]
> = {
  Student: [
    { name: "Wake up", category: "Morning" },
    { name: "Study block", category: "Study" },
    { name: "Read", category: "Study" },
    { name: "Review notes", category: "Study" },
    { name: "Sleep before 23:00", category: "Night" },
  ],
  Athlete: [
    { name: "Morning Run", category: "Morning" },
    { name: "Gym", category: "Body" },
    { name: "Stretch", category: "Body" },
    { name: "Drink 3L Water", category: "Body" },
    { name: "Sleep before 23:00", category: "Night" },
  ],
  Builder: [
    { name: "Deep work", category: "Work" },
    { name: "Work on project", category: "Work" },
    { name: "Read", category: "Study" },
    { name: "Prepare tomorrow", category: "Night" },
  ],
};

export const REACTIONS = ["🔥", "⚡", "🫡", "Respect."];
export const SKIP_REASONS = ["Rest", "Sick", "Travel", "Other"];
export const STANDARD_OPTIONS = [70, 80, 90, 100];
