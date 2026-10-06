/**
 * The signed-in user's settings (Stage 8, user_settings row, owner only).
 */
import type { NotificationPrefs } from "@/lib/notifications";
import type { Database } from "@/types/database";

export type SettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

export type UserSettings = {
  onboarded: boolean;
  showMorningBriefing: boolean;
  shareNewTasks: boolean;
  notifyPartnerActivity: boolean;
  notifyReactions: boolean;
  notifyTaskReminders: boolean;
  notifyWeeklyReview: boolean;
  quietHoursEnabled: boolean;
  /** "HH:MM" */
  quietHoursStart: string;
  quietHoursEnd: string;
  /** V2 Phase 10: which kinds are pushed to an enabled device. */
  pushPlanner: boolean;
  pushNudges: boolean;
  pushReviews: boolean;
  pushWeeklyPlan: boolean;
  /** Generic text only ("Lembrete do Planner") on the lock screen. */
  pushHideDetails: boolean;
};

/** Editable columns (camelCase -> column). */
export const SETTING_COLUMNS = {
  showMorningBriefing: "show_morning_briefing",
  shareNewTasks: "share_new_tasks",
  notifyPartnerActivity: "notify_partner_activity",
  notifyReactions: "notify_reactions",
  notifyTaskReminders: "notify_task_reminders",
  notifyWeeklyReview: "notify_weekly_review",
  quietHoursEnabled: "quiet_hours_enabled",
  quietHoursStart: "quiet_hours_start",
  quietHoursEnd: "quiet_hours_end",
  pushPlanner: "push_planner",
  pushNudges: "push_nudges",
  pushReviews: "push_reviews",
  pushWeeklyPlan: "push_weekly_plan",
  pushHideDetails: "push_hide_details",
} as const satisfies Partial<Record<keyof UserSettings, keyof SettingsRow>>;

export type SettingKey = keyof typeof SETTING_COLUMNS;

const hm = (t: string) => t.slice(0, 5);

export function settingsFromRow(row: SettingsRow | null): UserSettings {
  // A missing row (should not happen: created by trigger) means defaults.
  return {
    onboarded: row ? row.onboarding_completed_at !== null : false,
    showMorningBriefing: row?.show_morning_briefing ?? true,
    shareNewTasks: row?.share_new_tasks ?? true,
    notifyPartnerActivity: row?.notify_partner_activity ?? true,
    notifyReactions: row?.notify_reactions ?? true,
    notifyTaskReminders: row?.notify_task_reminders ?? true,
    notifyWeeklyReview: row?.notify_weekly_review ?? true,
    quietHoursEnabled: row?.quiet_hours_enabled ?? false,
    quietHoursStart: hm(row?.quiet_hours_start ?? "22:00"),
    quietHoursEnd: hm(row?.quiet_hours_end ?? "07:00"),
    pushPlanner: row?.push_planner ?? true,
    pushNudges: row?.push_nudges ?? true,
    pushReviews: row?.push_reviews ?? true,
    pushWeeklyPlan: row?.push_weekly_plan ?? true,
    pushHideDetails: row?.push_hide_details ?? false,
  };
}

export const notificationPrefs = (s: UserSettings): NotificationPrefs => ({
  partnerActivity: s.notifyPartnerActivity,
  reactions: s.notifyReactions,
  taskReminders: s.notifyTaskReminders,
  weeklyReview: s.notifyWeeklyReview,
  quietHoursEnabled: s.quietHoursEnabled,
  quietStart: s.quietHoursStart,
  quietEnd: s.quietHoursEnd,
});

/** Validates one setting's value before it is sent. */
export function validSetting(key: SettingKey, value: unknown): boolean {
  if (key === "quietHoursStart" || key === "quietHoursEnd")
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  return typeof value === "boolean";
}
