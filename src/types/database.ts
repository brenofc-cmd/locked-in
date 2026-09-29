// Generated from the Supabase schema (project locked-in) with the Supabase type
// generator; unused helper types removed. Regenerate after each migration (docs/DATABASE.md).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      accountability_items: {
        Row: {
          created_at: string;
          id: string;
          is_featured: boolean;
          is_active: boolean;
          owner_id: string;
          sort_order: number;
          text: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_featured?: boolean;
          is_active?: boolean;
          owner_id?: string;
          sort_order?: number;
          text: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_featured?: boolean;
          is_active?: boolean;
          owner_id?: string;
          sort_order?: number;
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accountability_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_events: {
        Row: {
          actor_id: string;
          created_at: string;
          duo_id: string;
          duration_seconds: number | null;
          event_type: string;
          id: string;
          target_id: string | null;
          target_type: string | null;
          title_snapshot: string | null;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          duo_id: string;
          duration_seconds?: number | null;
          event_type: string;
          id?: string;
          target_id?: string | null;
          target_type?: string | null;
          title_snapshot?: string | null;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          duo_id?: string;
          duration_seconds?: number | null;
          event_type?: string;
          id?: string;
          target_id?: string | null;
          target_type?: string | null;
          title_snapshot?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_duo_id_fkey";
            columns: ["duo_id"];
            isOneToOne: false;
            referencedRelation: "duos";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_tasks: {
        Row: {
          category: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          notes: string;
          owner_id: string;
          priority_rank: number | null;
          reminder: boolean;
          routine_item_id: string | null;
          scheduled_time: string | null;
          skip_reason: string | null;
          skipped_at: string | null;
          sort_order: number;
          status: string;
          task_date: string;
          title: string;
          updated_at: string;
          visible_to_partner: boolean;
        };
        Insert: {
          category?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string;
          owner_id?: string;
          priority_rank?: number | null;
          reminder?: boolean;
          routine_item_id?: string | null;
          scheduled_time?: string | null;
          skip_reason?: string | null;
          skipped_at?: string | null;
          sort_order?: number;
          status?: string;
          task_date?: string;
          title: string;
          updated_at?: string;
          visible_to_partner?: boolean;
        };
        Update: {
          category?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string;
          owner_id?: string;
          priority_rank?: number | null;
          reminder?: boolean;
          routine_item_id?: string | null;
          scheduled_time?: string | null;
          skip_reason?: string | null;
          skipped_at?: string | null;
          sort_order?: number;
          status?: string;
          task_date?: string;
          title?: string;
          updated_at?: string;
          visible_to_partner?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "daily_tasks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_tasks_routine_same_owner_fkey";
            columns: ["routine_item_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "routine_items";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
      duo_members: {
        Row: {
          duo_id: string;
          joined_at: string;
          seat: number;
          user_id: string;
        };
        Insert: {
          duo_id: string;
          joined_at?: string;
          seat: number;
          user_id: string;
        };
        Update: {
          duo_id?: string;
          joined_at?: string;
          seat?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "duo_members_duo_id_fkey";
            columns: ["duo_id"];
            isOneToOne: false;
            referencedRelation: "duos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duo_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      duos: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          invite_code: string;
          name: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          invite_code: string;
          name?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          invite_code?: string;
          name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "duos_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      focus_sessions: {
        Row: {
          accumulated_pause_seconds: number;
          actual_focus_seconds: number | null;
          created_at: string;
          daily_task_id: string | null;
          duo_id: string | null;
          ended_at: string | null;
          id: string;
          local_date: string;
          paused_at: string | null;
          planned_seconds: number;
          reflection: string | null;
          started_at: string;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
          visible_to_partner: boolean;
        };
        Insert: {
          accumulated_pause_seconds?: number;
          actual_focus_seconds?: number | null;
          created_at?: string;
          daily_task_id?: string | null;
          duo_id?: string | null;
          ended_at?: string | null;
          id?: string;
          local_date?: string;
          paused_at?: string | null;
          planned_seconds: number;
          reflection?: string | null;
          started_at?: string;
          status?: string;
          title: string;
          updated_at?: string;
          user_id?: string;
          visible_to_partner?: boolean;
        };
        Update: {
          accumulated_pause_seconds?: number;
          actual_focus_seconds?: number | null;
          created_at?: string;
          daily_task_id?: string | null;
          duo_id?: string | null;
          ended_at?: string | null;
          id?: string;
          local_date?: string;
          paused_at?: string | null;
          planned_seconds?: number;
          reflection?: string | null;
          started_at?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          visible_to_partner?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "focus_sessions_duo_id_fkey";
            columns: ["duo_id"];
            isOneToOne: false;
            referencedRelation: "duos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "focus_sessions_task_same_owner_fkey";
            columns: ["daily_task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "daily_tasks";
            referencedColumns: ["id", "owner_id"];
          },
          {
            foreignKeyName: "focus_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_milestones: {
        Row: {
          created_at: string;
          goal_id: string;
          id: string;
          is_completed: boolean;
          owner_id: string;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          goal_id: string;
          id?: string;
          is_completed?: boolean;
          owner_id?: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          goal_id?: string;
          id?: string;
          is_completed?: boolean;
          owner_id?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_milestones_goal_same_owner_fkey";
            columns: ["goal_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id", "owner_id"];
          },
          {
            foreignKeyName: "goal_milestones_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          achieved_at: string | null;
          created_at: string;
          description: string | null;
          goal_type: string;
          id: string;
          is_featured: boolean;
          owner_id: string;
          sort_order: number;
          status: string;
          target_date: string | null;
          title: string;
          updated_at: string;
          vision_id: string | null;
        };
        Insert: {
          achieved_at?: string | null;
          created_at?: string;
          description?: string | null;
          goal_type: string;
          id?: string;
          is_featured?: boolean;
          owner_id?: string;
          sort_order?: number;
          status?: string;
          target_date?: string | null;
          title: string;
          updated_at?: string;
          vision_id?: string | null;
        };
        Update: {
          achieved_at?: string | null;
          created_at?: string;
          description?: string | null;
          goal_type?: string;
          id?: string;
          is_featured?: boolean;
          owner_id?: string;
          sort_order?: number;
          status?: string;
          target_date?: string | null;
          title?: string;
          updated_at?: string;
          vision_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_vision_same_owner_fkey";
            columns: ["vision_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "vision_items";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
      planner_events: {
        Row: {
          created_at: string;
          description: string | null;
          duo_id: string | null;
          event_date: string;
          event_time: string | null;
          event_type: string;
          id: string;
          owner_id: string;
          priority: string;
          reminder_days_before: number | null;
          shared_with_partner: boolean;
          subject: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          duo_id?: string | null;
          event_date: string;
          event_time?: string | null;
          event_type: string;
          id?: string;
          owner_id?: string;
          priority?: string;
          reminder_days_before?: number | null;
          shared_with_partner?: boolean;
          subject?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          duo_id?: string | null;
          event_date?: string;
          event_time?: string | null;
          event_type?: string;
          id?: string;
          owner_id?: string;
          priority?: string;
          reminder_days_before?: number | null;
          shared_with_partner?: boolean;
          subject?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planner_events_duo_id_fkey";
            columns: ["duo_id"];
            isOneToOne: false;
            referencedRelation: "duos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "planner_events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          daily_standard_percent: number;
          display_name: string;
          history_locked_through: string | null;
          id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          daily_standard_percent?: number;
          display_name: string;
          id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          daily_standard_percent?: number;
          display_name?: string;
          id?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      routine_items: {
        Row: {
          category: string;
          created_at: string;
          days_of_week: number[];
          end_date: string | null;
          id: string;
          materialized_through: string | null;
          notes: string;
          owner_id: string;
          reminder: boolean;
          scheduled_time: string | null;
          sort_order: number;
          start_date: string;
          title: string;
          updated_at: string;
          visible_to_partner: boolean;
        };
        Insert: {
          category?: string;
          created_at?: string;
          days_of_week: number[];
          end_date?: string | null;
          id?: string;
          materialized_through?: string | null;
          notes?: string;
          owner_id?: string;
          reminder?: boolean;
          scheduled_time?: string | null;
          sort_order?: number;
          start_date: string;
          title: string;
          updated_at?: string;
          visible_to_partner?: boolean;
        };
        Update: {
          category?: string;
          created_at?: string;
          days_of_week?: number[];
          end_date?: string | null;
          id?: string;
          materialized_through?: string | null;
          notes?: string;
          owner_id?: string;
          reminder?: boolean;
          scheduled_time?: string | null;
          sort_order?: number;
          start_date?: string;
          title?: string;
          updated_at?: string;
          visible_to_partner?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "routine_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      vision_items: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_featured: boolean;
          is_archived: boolean;
          owner_id: string;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_featured?: boolean;
          is_archived?: boolean;
          owner_id?: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_featured?: boolean;
          is_archived?: boolean;
          owner_id?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vision_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_presence: {
        Row: {
          last_seen_at: string;
          user_id: string;
        };
        Insert: {
          last_seen_at?: string;
          user_id?: string;
        };
        Update: {
          last_seen_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_presence_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          created_at: string;
          notify_partner_activity: boolean;
          notify_reactions: boolean;
          notify_task_reminders: boolean;
          notify_weekly_review: boolean;
          onboarding_completed_at: string | null;
          quiet_hours_enabled: boolean;
          quiet_hours_end: string;
          quiet_hours_start: string;
          share_new_tasks: boolean;
          show_morning_briefing: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: { [_ in never]: never };
        Update: {
          notify_partner_activity?: boolean;
          notify_reactions?: boolean;
          notify_task_reminders?: boolean;
          notify_weekly_review?: boolean;
          onboarding_completed_at?: string | null;
          quiet_hours_enabled?: boolean;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          share_new_tasks?: boolean;
          show_morning_briefing?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reactions: {
        Row: {
          activity_event_id: string;
          created_at: string;
          from_user_id: string;
          id: string;
          reaction_type: string;
          updated_at: string;
        };
        Insert: {
          activity_event_id: string;
          reaction_type: string;
        };
        Update: {
          reaction_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_activity_event_id_fkey";
            columns: ["activity_event_id"];
            isOneToOne: false;
            referencedRelation: "activity_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_from_user_id_fkey";
            columns: ["from_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      challenges: {
        Row: {
          challenge_type: string;
          created_at: string;
          created_by: string;
          creator_standard: number;
          duo_id: string;
          end_date: string;
          id: string;
          partner_standard: number;
          start_date: string;
          target_value: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          challenge_type: string;
          end_date: string;
          start_date: string;
          target_value: number;
          title: string;
        };
        Update: { [_ in never]: never };
        Relationships: [
          {
            foreignKeyName: "challenges_duo_id_fkey";
            columns: ["duo_id"];
            isOneToOne: false;
            referencedRelation: "duos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "challenges_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      archive_routine_item: { Args: { p_id: string }; Returns: undefined };
      complete_focus_session: {
        Args: { p_id: string; p_reflection?: string };
        Returns: Database["public"]["Tables"]["focus_sessions"]["Row"][];
      };
      create_duo: {
        Args: never;
        Returns: {
          duo_id: string;
          invite_code: string;
        }[];
      };
      create_routine_item: {
        Args: {
          p_category?: string;
          p_days: number[];
          p_notes?: string;
          p_reminder?: boolean;
          p_time?: string;
          p_title: string;
          p_visible?: boolean;
        };
        Returns: string;
      };
      ensure_my_daily_tasks: { Args: never; Returns: string };
      add_routine_items: {
        Args: {
          p_titles: string[];
          p_categories: string[];
          p_visible?: boolean;
        };
        Returns: string[];
      };
      set_reaction: {
        Args: { p_event_id: string; p_type: string };
        Returns: string;
      };
      duo_challenges: {
        Args: never;
        Returns: {
          id: string;
          title: string;
          challenge_type: string;
          target_value: number;
          start_date: string;
          end_date: string;
          created_by: string;
          created_at: string;
          me_value: number;
          partner_value: number | null;
        }[];
      };
      join_duo: { Args: { p_code: string }; Returns: string };
      leave_duo: { Args: never; Returns: undefined };
      my_active_focus: {
        Args: never;
        Returns: Database["public"]["Tables"]["focus_sessions"]["Row"][];
      };
      my_today: { Args: never; Returns: string };
      my_progress_summary: {
        Args: never;
        Returns: {
          today: string;
          standard: number;
          streak_before_today: number;
          current_streak: number;
          longest_closed: number;
          longest_streak: number;
          today_planned: number;
          today_completed: number;
          first_task_date: string | null;
        }[];
      };
      my_daily_progress: {
        Args: { p_from: string; p_to: string };
        Returns: {
          day: string;
          planned: number;
          completed: number;
          focus_seconds: number;
          focus_sessions: number;
        }[];
      };
      my_habits: {
        Args: { p_from: string; p_to: string };
        Returns: {
          routine_item_id: string;
          title: string;
          planned: number;
          completed: number;
        }[];
      };
      duo_weeks: {
        Args: { p_weeks?: number };
        Returns: {
          week_start: string;
          is_current: boolean;
          me_planned: number;
          me_completed: number;
          me_focus_seconds: number;
          me_perfect_days: number;
          partner_planned: number | null;
          partner_completed: number | null;
          partner_focus_seconds: number | null;
          partner_perfect_days: number | null;
        }[];
      };
      partner_progress_summary: {
        Args: never;
        Returns: {
          streak_before_today: number;
          current_streak: number;
          standard: number;
        }[];
      };
      normalize_invite_code: { Args: { p_code: string }; Returns: string };
      partner_current_focus: {
        Args: never;
        Returns: {
          accumulated_pause_seconds: number;
          id: string;
          paused_at: string | null;
          planned_seconds: number;
          started_at: string;
          status: string;
          title: string | null;
          user_id: string;
        }[];
      };
      server_now: { Args: never; Returns: string };
      partner_today: {
        Args: never;
        Returns: {
          done: number;
          task_date: string;
          total: number;
        }[];
      };
      pause_focus_session: {
        Args: { p_id: string };
        Returns: Database["public"]["Tables"]["focus_sessions"]["Row"][];
      };
      reconcile_my_focus: { Args: never; Returns: undefined };
      reorder_routine_items: { Args: { p_ids: string[] }; Returns: undefined };
      resume_focus_session: {
        Args: { p_id: string };
        Returns: Database["public"]["Tables"]["focus_sessions"]["Row"][];
      };
      save_focus_reflection: {
        Args: { p_id: string; p_reflection: string };
        Returns: Database["public"]["Tables"]["focus_sessions"]["Row"][];
      };
      set_my_priorities: {
        Args: { p_ids: string[] };
        Returns: Database["public"]["Tables"]["daily_tasks"]["Row"][];
      };
      start_focus_session: {
        Args: {
          p_daily_task_id?: string;
          p_planned_seconds: number;
          p_title: string;
          p_visible?: boolean;
        };
        Returns: Database["public"]["Tables"]["focus_sessions"]["Row"][];
      };
      touch_last_seen: { Args: never; Returns: string };
      update_routine_item: {
        Args: {
          p_category: string;
          p_days: number[];
          p_id: string;
          p_notes: string;
          p_reminder: boolean;
          p_time: string;
          p_title: string;
          p_visible: boolean;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;
