import { t } from "@/i18n/pt-BR";
import { loadDuoData, type DuoData } from "@/lib/duo-data";
import { loadFocusData, type FocusData } from "@/lib/focus-data";
import type { ProgressData } from "@/lib/progress";
import { loadProgress } from "@/lib/progress-data";
import { settingsFromRow, type UserSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { DailyTaskRow, RoutineRow } from "@/lib/task-model";

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
    } | null;
  } | null;
};

/** The user's real day (Stage 4): local date, today's tasks, active routine. */
export type TasksData = {
  /** "YYYY-MM-DD" in profiles.timezone, from the database. */
  today: string;
  tasks: DailyTaskRow[];
  routines: RoutineRow[];
};

export type AppData = {
  session: SessionData;
  tasks: TasksData;
  duo: DuoData;
  focus: FocusData & { serverNow: number };
  progress: ProgressData;
};

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
    const [tasks, routines] = await Promise.all([
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
    ]);
    if (tasks.error || routines.error) throw new Error(t.loadErrors.today);
    return { today, tasks: tasks.data, routines: routines.data };
  }

  // Progress after the tasks: both materialise today's routine first.
  const tasksAndProgress = loadTasks().then(async (tasks) => ({
    tasks,
    progress: await loadProgress(supabase),
  }));

  const [profiles, duos, members, settings, { tasks, progress }, duo, focus] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, timezone, created_at"),
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
  };
}
