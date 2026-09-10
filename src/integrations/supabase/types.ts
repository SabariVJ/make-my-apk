export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          created_at: string
          event_key: string
          event_type: string
          id: string
          lifetime_xp_delta: number
          metadata: Json
          occurred_at: string
          qualifying_xp_delta: number
          rivalry_xp_delta: number
          source_class: string
          source_id: string
          stat_deltas: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event_key: string
          event_type: string
          id?: string
          lifetime_xp_delta?: number
          metadata?: Json
          occurred_at: string
          qualifying_xp_delta?: number
          rivalry_xp_delta?: number
          source_class: string
          source_id: string
          stat_deltas?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          lifetime_xp_delta?: number
          metadata?: Json
          occurred_at?: string
          qualifying_xp_delta?: number
          rivalry_xp_delta?: number
          source_class?: string
          source_id?: string
          stat_deltas?: Json
          user_id?: string
        }
        Relationships: []
      }
      challenge_day_progress: {
        Row: {
          checkin_duration_minutes: number | null
          checkin_reflection: string | null
          completed_at: string | null
          created_at: string
          day_number: number
          enrollment_id: string
          id: string
          status: string
          tasks_completed: Json
        }
        Insert: {
          checkin_duration_minutes?: number | null
          checkin_reflection?: string | null
          completed_at?: string | null
          created_at?: string
          day_number: number
          enrollment_id: string
          id?: string
          status?: string
          tasks_completed?: Json
        }
        Update: {
          checkin_duration_minutes?: number | null
          checkin_reflection?: string | null
          completed_at?: string | null
          created_at?: string
          day_number?: number
          enrollment_id?: string
          id?: string
          status?: string
          tasks_completed?: Json
        }
        Relationships: [
          {
            foreignKeyName: "challenge_day_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "challenge_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_enrollments: {
        Row: {
          best_streak: number
          code_granted: boolean
          completed_at: string | null
          created_at: string
          current_streak: number
          id: string
          paused_at: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          code_granted?: boolean
          completed_at?: string | null
          created_at?: string
          current_streak?: number
          id?: string
          paused_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          code_granted?: boolean
          completed_at?: string | null
          created_at?: string
          current_streak?: number
          id?: string
          paused_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      in_app_notifications: {
        Row: {
          body: string
          created_at: string
          from_user_id: string | null
          handled: boolean
          id: string
          read: boolean
          reference_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          from_user_id?: string | null
          handled?: boolean
          id?: string
          read?: boolean
          reference_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          from_user_id?: string | null
          handled?: boolean
          id?: string
          read?: boolean
          reference_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          current_streak: number
          display_name: string | null
          email: string | null
          engagement_profile_xp: number
          id: string
          is_plus_member: boolean
          leaderboard_eligible: boolean
          location: string | null
          plus_expires_at: string | null
          plus_unlocked_at: string | null
          qualifying_xp: number
          signup_date: string
          total_xp: number
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_streak?: number
          display_name?: string | null
          email?: string | null
          engagement_profile_xp?: number
          id: string
          is_plus_member?: boolean
          leaderboard_eligible?: boolean
          location?: string | null
          plus_expires_at?: string | null
          plus_unlocked_at?: string | null
          qualifying_xp?: number
          signup_date?: string
          total_xp?: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_streak?: number
          display_name?: string | null
          email?: string | null
          engagement_profile_xp?: number
          id?: string
          is_plus_member?: boolean
          leaderboard_eligible?: boolean
          location?: string | null
          plus_expires_at?: string | null
          plus_unlocked_at?: string | null
          qualifying_xp?: number
          signup_date?: string
          total_xp?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      promotion_eligibility: {
        Row: {
          campaign_id: string
          claimed: boolean
          claimed_at: string | null
          created_at: string
          eligibility_key: string
          expires_at: string | null
          id: string
          reward_granted: boolean
        }
        Insert: {
          campaign_id: string
          claimed?: boolean
          claimed_at?: string | null
          created_at?: string
          eligibility_key: string
          expires_at?: string | null
          id?: string
          reward_granted?: boolean
        }
        Update: {
          campaign_id?: string
          claimed?: boolean
          claimed_at?: string | null
          created_at?: string
          eligibility_key?: string
          expires_at?: string | null
          id?: string
          reward_granted?: boolean
        }
        Relationships: []
      }
      redeem_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          redeemed: boolean
          redeemed_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          redeemed?: boolean
          redeemed_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          redeemed?: boolean
          redeemed_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reward_daily_checkins: {
        Row: {
          checked_in_at: string
          id: string
          policy_day: string
          profile_xp_awarded: number
          streak_after: number
          user_id: string
        }
        Insert: {
          checked_in_at?: string
          id?: string
          policy_day: string
          profile_xp_awarded: number
          streak_after: number
          user_id: string
        }
        Update: {
          checked_in_at?: string
          id?: string
          policy_day?: string
          profile_xp_awarded?: number
          streak_after?: number
          user_id?: string
        }
        Relationships: []
      }
      reward_mission_assignments: {
        Row: {
          assigned_at: string
          completed_at: string | null
          definition_version: number
          id: string
          minimum_seconds: number
          mission_key: string
          policy_day: string
          profile_xp: number
          reward_xp: number
          user_id: string
        }
        Insert: {
          assigned_at?: string
          completed_at?: string | null
          definition_version: number
          id?: string
          minimum_seconds: number
          mission_key: string
          policy_day: string
          profile_xp: number
          reward_xp: number
          user_id: string
        }
        Update: {
          assigned_at?: string
          completed_at?: string | null
          definition_version?: number
          id?: string
          minimum_seconds?: number
          mission_key?: string
          policy_day?: string
          profile_xp?: number
          reward_xp?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_mission_assignments_mission_key_definition_version_fkey"
            columns: ["mission_key", "definition_version"]
            isOneToOne: false
            referencedRelation: "reward_mission_definitions"
            referencedColumns: ["mission_key", "version"]
          },
        ]
      }
      reward_mission_definitions: {
        Row: {
          active: boolean
          category: string
          description: string
          display_order: number
          minimum_seconds: number
          mission_key: string
          profile_xp: number
          reward_xp: number
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          category: string
          description: string
          display_order: number
          minimum_seconds: number
          mission_key: string
          profile_xp: number
          reward_xp: number
          title: string
          version: number
        }
        Update: {
          active?: boolean
          category?: string
          description?: string
          display_order?: number
          minimum_seconds?: number
          mission_key?: string
          profile_xp?: number
          reward_xp?: number
          title?: string
          version?: number
        }
        Relationships: []
      }
      reward_mission_sessions: {
        Row: {
          assignment_id: string
          completed_at: string | null
          confirmation_text: string | null
          eligible_at: string
          expired_at: string | null
          expires_at: string
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          confirmation_text?: string | null
          eligible_at: string
          expired_at?: string | null
          expires_at: string
          id?: string
          started_at: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          confirmation_text?: string | null
          eligible_at?: string
          expired_at?: string | null
          expires_at?: string
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_mission_sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "reward_mission_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_operations: {
        Row: {
          action: string
          created_at: string
          id: string
          receipt: Json
          request_id: string
          source_key: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          receipt: Json
          request_id: string
          source_key: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          receipt?: Json
          request_id?: string
          source_key?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_policies: {
        Row: {
          campaign_id: string
          checkin_profile_xp: number
          claims_enabled: boolean
          daily_reward_xp_cap: number
          enabled: boolean
          launched_at: string | null
          plus_days: number
          required_account_age_days: number
          required_qualifying_days: number
          reward_timezone: string
          reward_xp_cost: number
          streak_milestone_days: number
          streak_milestone_profile_xp: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          checkin_profile_xp: number
          claims_enabled?: boolean
          daily_reward_xp_cap: number
          enabled?: boolean
          launched_at?: string | null
          plus_days: number
          required_account_age_days: number
          required_qualifying_days: number
          reward_timezone?: string
          reward_xp_cost: number
          streak_milestone_days: number
          streak_milestone_profile_xp: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          checkin_profile_xp?: number
          claims_enabled?: boolean
          daily_reward_xp_cap?: number
          enabled?: boolean
          launched_at?: string | null
          plus_days?: number
          required_account_age_days?: number
          required_qualifying_days?: number
          reward_timezone?: string
          reward_xp_cost?: number
          streak_milestone_days?: number
          streak_milestone_profile_xp?: number
          updated_at?: string
        }
        Relationships: []
      }
      reward_redemptions: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          plus_expires_at: string
          plus_starts_at: string
          reward_xp_spent: number
          user_id: string
          verified_identity: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          plus_expires_at: string
          plus_starts_at: string
          reward_xp_spent: number
          user_id: string
          verified_identity: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          plus_expires_at?: string
          plus_starts_at?: string
          reward_xp_spent?: number
          user_id?: string
          verified_identity?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reward_policies"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      reward_wallets: {
        Row: {
          best_login_streak: number
          created_at: string
          current_login_streak: number
          last_checkin_day: string | null
          last_qualifying_day: string | null
          profile_xp_earned: number
          qualifying_days: number
          reward_xp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_login_streak?: number
          created_at?: string
          current_login_streak?: number
          last_checkin_day?: string | null
          last_qualifying_day?: string | null
          profile_xp_earned?: number
          qualifying_days?: number
          reward_xp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_login_streak?: number
          created_at?: string
          current_login_streak?: number
          last_checkin_day?: string | null
          last_qualifying_day?: string | null
          profile_xp_earned?: number
          qualifying_days?: number
          reward_xp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_xp_ledger: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          policy_day: string
          profile_xp_delta: number
          reward_xp_delta: number
          source_key: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          policy_day: string
          profile_xp_delta?: number
          reward_xp_delta?: number
          source_key: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          policy_day?: string
          profile_xp_delta?: number
          reward_xp_delta?: number
          source_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_xp_ledger_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reward_policies"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      rivalries: {
        Row: {
          challenger_baseline_xp: number
          challenger_id: string
          created_at: string
          ended_at: string | null
          expires_at: string | null
          id: string
          opponent_baseline_xp: number
          opponent_id: string
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          challenger_baseline_xp?: number
          challenger_id: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string | null
          id?: string
          opponent_baseline_xp?: number
          opponent_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          challenger_baseline_xp?: number
          challenger_id?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string | null
          id?: string
          opponent_baseline_xp?: number
          opponent_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      rivalry_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          rivalry_id: string
          source_id: string | null
          user_id: string
          xp_delta: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          rivalry_id: string
          source_id?: string | null
          user_id: string
          xp_delta?: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          rivalry_id?: string
          source_id?: string | null
          user_id?: string
          xp_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "rivalry_events_rivalry_id_fkey"
            columns: ["rivalry_id"]
            isOneToOne: false
            referencedRelation: "rivalries"
            referencedColumns: ["id"]
          },
        ]
      }
      stat_events: {
        Row: {
          created_at: string
          delta: number
          id: string
          source: string
          source_id: string | null
          stat_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          source: string
          source_id?: string | null
          stat_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          source?: string
          source_id?: string | null
          stat_name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_body_profiles: {
        Row: {
          activity_level: string | null
          bmi: number | null
          bmi_category: string | null
          bmr: number | null
          body_goal: string | null
          created_at: string
          daily_calorie_target: number | null
          date_of_birth: string | null
          height_cm: number | null
          sex: string | null
          target_weight_kg: number | null
          tdee: number | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          bmi?: number | null
          bmi_category?: string | null
          bmr?: number | null
          body_goal?: string | null
          created_at?: string
          daily_calorie_target?: number | null
          date_of_birth?: string | null
          height_cm?: number | null
          sex?: string | null
          target_weight_kg?: number | null
          tdee?: number | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          bmi?: number | null
          bmi_category?: string | null
          bmr?: number | null
          body_goal?: string | null
          created_at?: string
          daily_calorie_target?: number | null
          date_of_birth?: string | null
          height_cm?: number | null
          sex?: string | null
          target_weight_kg?: number | null
          tdee?: number | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      user_personalization: {
        Row: {
          assessment_completed: boolean
          assessment_step: number
          assessment_version: number
          confidence_general: number | null
          confidence_goals: number | null
          confidence_initiative: number | null
          confidence_setbacks: number | null
          confidence_speaking_up: number | null
          confidence_unfamiliar: number | null
          created_at: string
          discipline_commitments: number | null
          discipline_distractibility: number | null
          discipline_habits: number | null
          discipline_procrastination: number | null
          discipline_routine: number | null
          discipline_task_completion: number | null
          fitness_activity_level: string | null
          fitness_confidence: number | null
          fitness_consistency: number | null
          fitness_days_per_week: number | null
          fitness_primary_goal: string | null
          focus_deep_work: number | null
          focus_distraction_frequency: number | null
          focus_phone_resistance: number | null
          focus_planned_completion: number | null
          focus_study_consistency: number | null
          focus_time_management: number | null
          goals: string[]
          goals_selected: boolean
          nutrition_allergies: string[]
          nutrition_dietary_preference: string | null
          nutrition_eating_schedule: number | null
          nutrition_food_quality: number | null
          nutrition_protein_consistency: number | null
          recovery_morning_energy: number | null
          recovery_perception: number | null
          recovery_sleep_consistency: number | null
          recovery_sleep_hours: number | null
          social_avoidance_frequency: number | null
          social_comfort_conversations: number | null
          social_comfort_groups: number | null
          social_comfort_new_people: number | null
          social_self_description: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assessment_completed?: boolean
          assessment_step?: number
          assessment_version?: number
          confidence_general?: number | null
          confidence_goals?: number | null
          confidence_initiative?: number | null
          confidence_setbacks?: number | null
          confidence_speaking_up?: number | null
          confidence_unfamiliar?: number | null
          created_at?: string
          discipline_commitments?: number | null
          discipline_distractibility?: number | null
          discipline_habits?: number | null
          discipline_procrastination?: number | null
          discipline_routine?: number | null
          discipline_task_completion?: number | null
          fitness_activity_level?: string | null
          fitness_confidence?: number | null
          fitness_consistency?: number | null
          fitness_days_per_week?: number | null
          fitness_primary_goal?: string | null
          focus_deep_work?: number | null
          focus_distraction_frequency?: number | null
          focus_phone_resistance?: number | null
          focus_planned_completion?: number | null
          focus_study_consistency?: number | null
          focus_time_management?: number | null
          goals?: string[]
          goals_selected?: boolean
          nutrition_allergies?: string[]
          nutrition_dietary_preference?: string | null
          nutrition_eating_schedule?: number | null
          nutrition_food_quality?: number | null
          nutrition_protein_consistency?: number | null
          recovery_morning_energy?: number | null
          recovery_perception?: number | null
          recovery_sleep_consistency?: number | null
          recovery_sleep_hours?: number | null
          social_avoidance_frequency?: number | null
          social_comfort_conversations?: number | null
          social_comfort_groups?: number | null
          social_comfort_new_people?: number | null
          social_self_description?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assessment_completed?: boolean
          assessment_step?: number
          assessment_version?: number
          confidence_general?: number | null
          confidence_goals?: number | null
          confidence_initiative?: number | null
          confidence_setbacks?: number | null
          confidence_speaking_up?: number | null
          confidence_unfamiliar?: number | null
          created_at?: string
          discipline_commitments?: number | null
          discipline_distractibility?: number | null
          discipline_habits?: number | null
          discipline_procrastination?: number | null
          discipline_routine?: number | null
          discipline_task_completion?: number | null
          fitness_activity_level?: string | null
          fitness_confidence?: number | null
          fitness_consistency?: number | null
          fitness_days_per_week?: number | null
          fitness_primary_goal?: string | null
          focus_deep_work?: number | null
          focus_distraction_frequency?: number | null
          focus_phone_resistance?: number | null
          focus_planned_completion?: number | null
          focus_study_consistency?: number | null
          focus_time_management?: number | null
          goals?: string[]
          goals_selected?: boolean
          nutrition_allergies?: string[]
          nutrition_dietary_preference?: string | null
          nutrition_eating_schedule?: number | null
          nutrition_food_quality?: number | null
          nutrition_protein_consistency?: number | null
          recovery_morning_energy?: number | null
          recovery_perception?: number | null
          recovery_sleep_consistency?: number | null
          recovery_sleep_hours?: number | null
          social_avoidance_frequency?: number | null
          social_comfort_conversations?: number | null
          social_comfort_groups?: number | null
          social_comfort_new_people?: number | null
          social_self_description?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          baseline_confidence: number | null
          baseline_consistency: number | null
          baseline_discipline: number | null
          baseline_fitness: number | null
          baseline_focus: number | null
          baseline_nutrition: number | null
          baseline_recovery: number | null
          baseline_social: number | null
          confidence: number
          consistency: number
          created_at: string
          discipline: number
          fitness: number
          focus: number
          nutrition: number
          recovery: number
          social: number
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          baseline_confidence?: number | null
          baseline_consistency?: number | null
          baseline_discipline?: number | null
          baseline_fitness?: number | null
          baseline_focus?: number | null
          baseline_nutrition?: number | null
          baseline_recovery?: number | null
          baseline_social?: number | null
          confidence?: number
          consistency?: number
          created_at?: string
          discipline?: number
          fitness?: number
          focus?: number
          nutrition?: number
          recovery?: number
          social?: number
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          baseline_confidence?: number | null
          baseline_consistency?: number | null
          baseline_discipline?: number | null
          baseline_fitness?: number | null
          baseline_focus?: number | null
          baseline_nutrition?: number | null
          baseline_recovery?: number | null
          baseline_social?: number | null
          confidence?: number
          consistency?: number
          created_at?: string
          discipline?: number
          fitness?: number
          focus?: number
          nutrition?: number
          recovery?: number
          social?: number
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_rivalry_notification: {
        Args: {
          p_body: string
          p_notification_type: string
          p_rivalry_id: string
          p_title: string
        }
        Returns: undefined
      }
      db_now: { Args: never; Returns: string }
      get_friend_requests: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          current_streak: number
          direction: string
          display_name: string
          friendship_id: string
          id: string
          total_xp: number
          username: string
        }[]
      }
      get_friends: {
        Args: never
        Returns: {
          avatar_url: string
          current_streak: number
          display_name: string
          friendship_id: string
          id: string
          since: string
          total_xp: number
          username: string
        }[]
      }
      increment_total_xp: {
        Args: { amount: number; target_user: string }
        Returns: number
      }
      search_profiles: {
        Args: { _q: string }
        Returns: {
          avatar_url: string
          current_streak: number
          display_name: string
          friendship_status: string
          id: string
          is_incoming: boolean
          total_xp: number
          username: string
        }[]
      }
      svj_assert_reward_service_role: { Args: never; Returns: undefined }
      svj_cancel_rivalry: { Args: { p_rivalry_id: string }; Returns: Json }
      svj_claim_daily_checkin: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_complete_daily_mission: {
        Args: {
          p_assignment_id: string
          p_confirmation_text: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      svj_create_rivalry: { Args: { p_opponent_id: string }; Returns: Json }
      svj_finalize_assessment_baseline: {
        Args: never
        Returns: {
          baseline_confidence: number | null
          baseline_consistency: number | null
          baseline_discipline: number | null
          baseline_fitness: number | null
          baseline_focus: number | null
          baseline_nutrition: number | null
          baseline_recovery: number | null
          baseline_social: number | null
          confidence: number
          consistency: number
          created_at: string
          discipline: number
          fitness: number
          focus: number
          nutrition: number
          recovery: number
          social: number
          updated_at: string
          user_id: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "user_stats"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      svj_get_engagement_state: { Args: { p_user_id: string }; Returns: Json }
      svj_list_public_profiles: {
        Args: { p_include_self?: boolean; p_limit?: number; p_query?: string }
        Returns: {
          avatar_url: string
          current_streak: number
          display_name: string
          id: string
          rank: number
          total_xp: number
          username: string
        }[]
      }
      svj_list_rivalries: {
        Args: never
        Returns: {
          challenger_baseline_xp: number
          challenger_id: string
          created_at: string
          ended_at: string
          expires_at: string
          id: string
          my_events: number
          my_score: number
          opponent_avatar_url: string
          opponent_baseline_xp: number
          opponent_display_name: string
          opponent_events: number
          opponent_id: string
          opponent_score: number
          opponent_username: string
          started_at: string
          status: string
          winner_id: string
        }[]
      }
      svj_lock_reward_wallet: {
        Args: { p_claim?: boolean; p_user_id: string }
        Returns: {
          best_login_streak: number
          created_at: string
          current_login_streak: number
          last_checkin_day: string | null
          last_qualifying_day: string | null
          profile_xp_earned: number
          qualifying_days: number
          reward_xp: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reward_wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      svj_redeem_earned_plus: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_replay_reward_operation: {
        Args: {
          p_action: string
          p_request_id: string
          p_source_key: string
          p_user_id: string
        }
        Returns: Json
      }
      svj_respond_to_rivalry: {
        Args: { p_action: string; p_rivalry_id: string }
        Returns: Json
      }
      svj_reward_identity: {
        Args: { p_user_id: string }
        Returns: {
          account_created_at: string
          verified: boolean
          verified_identity: string
        }[]
      }
      svj_start_daily_mission: {
        Args: { p_mission_key: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_update_my_profile: {
        Args: {
          p_avatar_changed?: boolean
          p_avatar_url?: string
          p_bio?: string
          p_display_name: string
          p_location?: string
          p_username: string
        }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          id: string
          location: string
          updated_at: string
          username: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
