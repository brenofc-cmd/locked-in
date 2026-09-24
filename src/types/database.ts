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
      activity_events: {
        Row: {
          actor_id: string;
          created_at: string;
          duo_id: string;
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
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      archive_routine_item: { Args: { p_id: string }; Returns: undefined };
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
      join_duo: { Args: { p_code: string }; Returns: string };
      leave_duo: { Args: never; Returns: undefined };
      my_today: { Args: never; Returns: string };
      normalize_invite_code: { Args: { p_code: string }; Returns: string };
      partner_today: {
        Args: never;
        Returns: {
          done: number;
          task_date: string;
          total: number;
        }[];
      };
      reorder_routine_items: { Args: { p_ids: string[] }; Returns: undefined };
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
