import { t } from "@/i18n/pt-BR";
import { loadDuoData, type DuoData } from "@/lib/duo-data";
import { loadFocusData, type FocusData } from "@/lib/focus-data";
import type { ProgressData } from "@/lib/progress";
import { addDays } from "@/lib/local-date";
import { UPCOMING_DAYS, type PlannerRow } from "@/lib/planner";
import { loadPlannerRows } from "@/lib/planner-data";
import { loadProgress } from "@/lib/progress-data";
import { settingsFromRow, type UserSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { GoalOption } from "@/lib/goal-proof";
import { GOAL_STATUSES, type GoalStatus } from "@/lib/goals";
import type { DailyTaskRow, GoalLinks, RoutineRow } from "@/lib/task-model";

/** Real identity for the signed-in user (Stage 3). */
export type SessionData = {
  me: {
    id: string;
    email: string;
    displayName: string;
    timezone: string;
    createdAt: string;
  };
  /** Owner-only settings (Stage 8). */
  settings: UserSettings;
  /** null = no duo. partner null = waiting for the partner to join. */
  duo: {
    id: string;
    inviteCode: string;
    /** When I joined (ISO). */
    joinedAt: string;
    partner: {
      id: string;
      displayName: string;
      /** When the partner joined (ISO). */
      joinedAt: string;
      /** V2 Phase 6: the partner's profile timezone (their local day). */
      timezone: string;
    } | null;
  } | null;
};

/** The user's real day (Stage 4): local date, today's tasks, active routine. */
export type TasksData = {
  /** "YYYY-MM-DD" in profiles.timezone, from the database. */
  today: string;
  tasks: DailyTaskRow[];
  routines: RoutineRow[];
  /** V2 Phase 5: my goals (for the pickers and the META tag; owner-only). */
  goals: GoalOption[];
  /** V2 Phase 5: goal of each of today's tasks / active routines. */
  taskGoals: GoalLinks;
  routineGoals: GoalLinks;
};

export type AppData = {
  session: SessionData;
  tasks: TasksData;
  duo: DuoData;
  focus: FocusData & { serverNow: number };
  progress: ProgressData;
  /** V2 Phase 2: planner events from today to today + UPCOMING_DAYS. */
  planner: PlannerRow[];
};

/**
 * ISSUE-001, after loadAppData() failed: does the database refuse this
 * session? Asked once, with the same cookies, through the same client (and
 * the same single ADR-063 repeat): no claims, or a 401 on a trivial
 * signed-in-only call, means the session is gone — case B, back to login.
 * Anything else (network, a real query error) is not an auth problem.
 */
export async function isSessionRejected(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return true;
  const probe = await supabase.rpc("server_now");
  return probe.status === 401;
}

/**
 * Everything the (app) layout needs, in few round trips: the session queries
 * and the task loading run in parallel. Returns null when signed out.
 * RLS decides visibility; queries still filter by owner because the partner's
 * shared rows are readable too.
 */
export async function loadAppData(): Promise<AppData | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const sub = claims?.claims?.sub;
  if (!sub) return null;
  const userId: string = sub;

  async function loadTasks(): Promise<TasksData> {
    // Materialise routine occurrences up to the user's local today (idempotent).
    const ensured = await supabase.rpc("ensure_my_daily_tasks");
    if (ensured.error || !ensured.data) throw new Error(t.loadErrors.today);
    const today = ensured.data;
    const [tasks, routines, goals, routineLinks] = await Promise.all([
      supabase
        .from("daily_tasks")
        .select("*")
        .eq("owner_id", userId)
        .eq("task_date", today)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("routine_items")
        .select("*")
        .eq("owner_id", userId)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("sort_order")
        .order("created_at"),
      // V2 Phase 5: owner-only (RLS); titles never leave this user's session.
      supabase.from("goals").select("id, title, status").limit(200),
      supabase.from("routine_item_goals").select("routine_item_id, goal_id"),
    ]);
    if (tasks.error || routines.error || goals.error || routineLinks.error)
      throw new Error(t.loadErrors.today);
    const taskLinks = tasks.data.length
      ? await supabase
          .from("daily_task_goals")
          .select("daily_task_id, goal_id")
          .in(
            "daily_task_id",
            tasks.data.map((x) => x.id),
          )
      : { data: [], error: null };
    if (taskLinks.error) throw new Error(t.loadErrors.today);
    return {
      today,
      tasks: tasks.data,
      routines: routines.data,
      goals: goals.data.map((g) => ({
        id: g.id,
        title: g.title,
        status: (GOAL_STATUSES as readonly string[]).includes(g.status)
          ? (g.status as GoalStatus)
          : "archived",
      })),
      taskGoals: Object.fromEntries(
        taskLinks.data.map((l) => [l.daily_task_id, l.goal_id]),
      ),
      routineGoals: Object.fromEntries(
        routineLinks.data.map((l) => [l.routine_item_id, l.goal_id]),
      ),
    };
  }

  // Progress after the tasks: both materialise today's routine first.
  const tasksAndProgress = loadTasks().then(async (tasks) => {
    const [progress, planner] = await Promise.all([
      loadProgress(supabase),
      // V2 Phase 2: the upcoming window (Today card, reminders, Planner).
      loadPlannerRows(
        supabase,
        tasks.today,
        addDays(tasks.today, UPCOMING_DAYS),
      ),
    ]);
    return { tasks, progress, planner };
  });

  const [
    profiles,
    duos,
    members,
    settings,
    { tasks, progress, planner },
    duo,
    focus,
  ] = await Promise.all([
    supabase.from("profiles").select("id, display_name, timezone, created_at"),
    supabase.from("duos").select("id, invite_code").maybeSingle(),
    supabase.from("duo_members").select("user_id, joined_at"),
    supabase.from("user_settings").select("*").maybeSingle(),
    tasksAndProgress,
    loadDuoData(supabase, userId),
    loadFocusData(supabase),
  ]);
  if (profiles.error || duos.error || members.error || settings.error) {
    throw new Error(t.loadErrors.account);
  }

  const mine = profiles.data.find((p) => p.id === userId);
  if (!mine) throw new Error(t.loadErrors.profileMissing);

  const partnerMember = members.data.find((m) => m.user_id !== userId);
  const partnerId = partnerMember?.user_id;
  const myMember = members.data.find((m) => m.user_id === userId);
  const partner = profiles.data.find((p) => p.id === partnerId);

  return {
    session: {
      me: {
        id: userId,
        email:
          typeof claims.claims.email === "string" ? claims.claims.email : "",
        displayName: mine.display_name,
        timezone: mine.timezone,
        createdAt: mine.created_at,
      },
      settings: settingsFromRow(settings.data),
      duo: duos.data
        ? {
            id: duos.data.id,
            inviteCode: duos.data.invite_code,
            joinedAt: myMember?.joined_at ?? "",
            partner:
              partner && partnerMember
                ? {
                    id: partner.id,
                    displayName: partner.display_name,
                    joinedAt: partnerMember.joined_at,
                    timezone: partner.timezone,
                  }
                : null,
          }
        : null,
    },
    tasks,
    duo,
    // Database clock at render: the client derives its display offset from it.
    focus: { ...focus, serverNow: Date.now() + focus.dbOffset },
    progress,
    planner,
  };
}
