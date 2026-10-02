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
      challenge_day_definitions: {
        Row: {
          checkin_prompt: string
          created_at: string
          day_number: number
          focus: string
          phase: string
          tasks: Json
          xp: number
        }
        Insert: {
          checkin_prompt?: string
          created_at?: string
          day_number: number
          focus: string
          phase: string
          tasks?: Json
          xp: number
        }
        Update: {
          checkin_prompt?: string
          created_at?: string
          day_number?: number
          focus?: string
          phase?: string
          tasks?: Json
          xp?: number
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
      plus_gifts: {
        Row: {
          claimed_at: string | null
          created_at: string
          duration_unit: string
          duration_value: number
          expires_at: string | null
          granted_by: string | null
          id: string
          recipient_user_id: string
          sender_label: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          duration_unit: string
          duration_value: number
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          recipient_user_id: string
          sender_label?: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          duration_unit?: string
          duration_value?: number
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          recipient_user_id?: string
          sender_label?: string
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
          event_key: string | null
          id: string
          source: string
          source_id: string | null
          stat_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          event_key?: string | null
          id?: string
          source: string
          source_id?: string | null
          stat_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          event_key?: string | null
          id?: string
          source?: string
          source_id?: string | null
          stat_name?: string
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_response: string | null
          category: string
          created_at: string
          id: string
          message: string
          resolved_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          category: string
          created_at?: string
          id?: string
          message: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_activities: {
        Row: {
          activity_type: string
          auto_paused: boolean
          avg_cadence: number | null
          avg_heart_rate: number | null
          avg_pace_seconds_per_km: number | null
          avg_speed_mps: number | null
          calories_estimate: number | null
          client_session_id: string
          created_at: string
          device_platform: string | null
          distance_meters: number | null
          duration_seconds: number
          elevation_gain_meters: number | null
          elevation_loss_meters: number | null
          ended_at: string
          external_id: string | null
          gps_quality: string | null
          id: string
          max_heart_rate: number | null
          max_speed_mps: number | null
          moving_seconds: number | null
          notes: string | null
          perceived_effort: number | null
          route_id: string | null
          source: string
          split_unit: string | null
          splits: Json | null
          started_at: string
          step_count: number
          track_bounds: Json | null
          track_point_count: number | null
          track_polyline: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          activity_type: string
          auto_paused?: boolean
          avg_cadence?: number | null
          avg_heart_rate?: number | null
          avg_pace_seconds_per_km?: number | null
          avg_speed_mps?: number | null
          calories_estimate?: number | null
          client_session_id: string
          created_at?: string
          device_platform?: string | null
          distance_meters?: number | null
          duration_seconds: number
          elevation_gain_meters?: number | null
          elevation_loss_meters?: number | null
          ended_at: string
          external_id?: string | null
          gps_quality?: string | null
          id?: string
          max_heart_rate?: number | null
          max_speed_mps?: number | null
          moving_seconds?: number | null
          notes?: string | null
          perceived_effort?: number | null
          route_id?: string | null
          source: string
          split_unit?: string | null
          splits?: Json | null
          started_at: string
          step_count?: number
          track_bounds?: Json | null
          track_point_count?: number | null
          track_polyline?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          activity_type?: string
          auto_paused?: boolean
          avg_cadence?: number | null
          avg_heart_rate?: number | null
          avg_pace_seconds_per_km?: number | null
          avg_speed_mps?: number | null
          calories_estimate?: number | null
          client_session_id?: string
          created_at?: string
          device_platform?: string | null
          distance_meters?: number | null
          duration_seconds?: number
          elevation_gain_meters?: number | null
          elevation_loss_meters?: number | null
          ended_at?: string
          external_id?: string | null
          gps_quality?: string | null
          id?: string
          max_heart_rate?: number | null
          max_speed_mps?: number | null
          moving_seconds?: number | null
          notes?: string | null
          perceived_effort?: number | null
          route_id?: string | null
          source?: string
          split_unit?: string | null
          splits?: Json | null
          started_at?: string
          step_count?: number
          track_bounds?: Json | null
          track_point_count?: number | null
          track_polyline?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      svj_activity_exercises: {
        Row: {
          activity_id: string
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          position: number
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          position: number
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_activity_exercises_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_activity_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "svj_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_activity_reward_policy: {
        Row: {
          activity_type: string
          base_xp: number
          enabled: boolean
          min_duration_seconds: number
          requires_evidence: boolean
          stat_map: Json
        }
        Insert: {
          activity_type: string
          base_xp: number
          enabled?: boolean
          min_duration_seconds: number
          requires_evidence?: boolean
          stat_map?: Json
        }
        Update: {
          activity_type?: string
          base_xp?: number
          enabled?: boolean
          min_duration_seconds?: number
          requires_evidence?: boolean
          stat_map?: Json
        }
        Relationships: []
      }
      svj_activity_track_points: {
        Row: {
          accuracy_m: number | null
          activity_id: string
          cadence: number | null
          elevation_m: number | null
          heart_rate: number | null
          id: number
          lat: number
          lng: number
          moving: boolean
          seq: number
          t_offset_ms: number
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          activity_id: string
          cadence?: number | null
          elevation_m?: number | null
          heart_rate?: number | null
          id?: number
          lat: number
          lng: number
          moving?: boolean
          seq: number
          t_offset_ms: number
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          activity_id?: string
          cadence?: number | null
          elevation_m?: number | null
          heart_rate?: number | null
          id?: number
          lat?: number
          lng?: number
          moving?: boolean
          seq?: number
          t_offset_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_activity_track_points_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_activity_training_context: {
        Row: {
          activity_id: string
          created_at: string
          feedback: Json
          plan_id: string | null
          plan_session_id: string | null
          targets: Json
          template_id: string | null
          template_version: number | null
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          feedback?: Json
          plan_id?: string | null
          plan_session_id?: string | null
          targets?: Json
          template_id?: string | null
          template_version?: number | null
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          feedback?: Json
          plan_id?: string | null
          plan_session_id?: string | null
          targets?: Json
          template_id?: string | null
          template_version?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_activity_training_context_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_activity_training_context_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "svj_training_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_activity_training_context_plan_session_id_fkey"
            columns: ["plan_session_id"]
            isOneToOne: false
            referencedRelation: "svj_training_plan_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_activity_training_context_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "svj_workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_exercises: {
        Row: {
          category: string
          created_at: string
          equipment: string[]
          exercise_type: string
          id: string
          is_custom: boolean
          load_convention: string | null
          movement_pattern: string | null
          name: string
          owner_user_id: string | null
          primary_muscle: string
          secondary_muscles: string[]
          slug: string
        }
        Insert: {
          category: string
          created_at?: string
          equipment?: string[]
          exercise_type: string
          id?: string
          is_custom?: boolean
          load_convention?: string | null
          movement_pattern?: string | null
          name: string
          owner_user_id?: string | null
          primary_muscle: string
          secondary_muscles?: string[]
          slug: string
        }
        Update: {
          category?: string
          created_at?: string
          equipment?: string[]
          exercise_type?: string
          id?: string
          is_custom?: boolean
          load_convention?: string | null
          movement_pattern?: string | null
          name?: string
          owner_user_id?: string | null
          primary_muscle?: string
          secondary_muscles?: string[]
          slug?: string
        }
        Relationships: []
      }
      svj_goals: {
        Row: {
          activity_type: string | null
          created_at: string
          id: string
          metric: string
          period_end: string
          period_start: string
          period_type: string
          status: string
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type?: string | null
          created_at?: string
          id?: string
          metric: string
          period_end: string
          period_start: string
          period_type: string
          status?: string
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string | null
          created_at?: string
          id?: string
          metric?: string
          period_end?: string
          period_start?: string
          period_type?: string
          status?: string
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      svj_live_share_sessions: {
        Row: {
          activity_id: string
          activity_type: string | null
          battery_percent: number | null
          created_at: string
          display_name: string | null
          expires_at: string
          id: string
          last_accuracy_m: number | null
          last_distance_meters: number | null
          last_elapsed_seconds: number | null
          last_lat: number | null
          last_lng: number | null
          last_update_at: string | null
          revoked_at: string | null
          started_at: string
          token: string
          user_id: string
        }
        Insert: {
          activity_id: string
          activity_type?: string | null
          battery_percent?: number | null
          created_at?: string
          display_name?: string | null
          expires_at: string
          id?: string
          last_accuracy_m?: number | null
          last_distance_meters?: number | null
          last_elapsed_seconds?: number | null
          last_lat?: number | null
          last_lng?: number | null
          last_update_at?: string | null
          revoked_at?: string | null
          started_at: string
          token: string
          user_id: string
        }
        Update: {
          activity_id?: string
          activity_type?: string | null
          battery_percent?: number | null
          created_at?: string
          display_name?: string | null
          expires_at?: string
          id?: string
          last_accuracy_m?: number | null
          last_distance_meters?: number | null
          last_elapsed_seconds?: number | null
          last_lat?: number | null
          last_lng?: number | null
          last_update_at?: string | null
          revoked_at?: string | null
          started_at?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_live_share_sessions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_nutrition_meal_items: {
        Row: {
          calories: number
          carbs_g: number
          confidence: number | null
          created_at: string
          fat_g: number
          fiber_g: number
          id: string
          meal_id: string
          name: string
          position: number
          protein_g: number
          serving_label: string | null
          user_id: string
        }
        Insert: {
          calories?: number
          carbs_g?: number
          confidence?: number | null
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          meal_id: string
          name: string
          position?: number
          protein_g?: number
          serving_label?: string | null
          user_id: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          confidence?: number | null
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          meal_id?: string
          name?: string
          position?: number
          protein_g?: number
          serving_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_nutrition_meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "svj_nutrition_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_nutrition_meals: {
        Row: {
          ai_estimated: boolean
          calories: number
          carbs_g: number
          confidence: number | null
          created_at: string
          day_key: string
          eaten_at: string
          fat_g: number
          fiber_g: number
          id: string
          meal_type: string
          metadata: Json
          name: string
          notes: string | null
          protein_g: number
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_estimated?: boolean
          calories?: number
          carbs_g?: number
          confidence?: number | null
          created_at?: string
          day_key: string
          eaten_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          meal_type: string
          metadata?: Json
          name: string
          notes?: string | null
          protein_g?: number
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_estimated?: boolean
          calories?: number
          carbs_g?: number
          confidence?: number | null
          created_at?: string
          day_key?: string
          eaten_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          meal_type?: string
          metadata?: Json
          name?: string
          notes?: string | null
          protein_g?: number
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      svj_nutrition_scan_usage: {
        Row: {
          day_key: string
          scan_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          day_key: string
          scan_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          day_key?: string
          scan_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      svj_nutrition_targets: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          protein_g: number
          source: string
          updated_at: string
          user_id: string
          water_ml: number
        }
        Insert: {
          calories: number
          carbs_g: number
          created_at?: string
          fat_g: number
          fiber_g?: number
          protein_g: number
          source?: string
          updated_at?: string
          user_id: string
          water_ml?: number
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          protein_g?: number
          source?: string
          updated_at?: string
          user_id?: string
          water_ml?: number
        }
        Relationships: []
      }
      svj_personal_records: {
        Row: {
          achieved_at: string
          activity_id: string
          created_at: string
          exercise_id: string
          id: string
          record_type: string
          set_id: string | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          achieved_at?: string
          activity_id: string
          created_at?: string
          exercise_id: string
          id?: string
          record_type: string
          set_id?: string | null
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          achieved_at?: string
          activity_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          record_type?: string
          set_id?: string | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "svj_personal_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_personal_records_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "svj_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_personal_records_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "svj_strength_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_personalized_task_assignments: {
        Row: {
          assigned_for: string
          category: string
          completed_at: string | null
          created_at: string
          description: string
          difficulty: string
          duration_minutes: number | null
          expires_at: string | null
          id: string
          status: string
          template_key: string
          title: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          assigned_for?: string
          category: string
          completed_at?: string | null
          created_at?: string
          description?: string
          difficulty: string
          duration_minutes?: number | null
          expires_at?: string | null
          id?: string
          status?: string
          template_key: string
          title: string
          user_id: string
          xp_reward: number
        }
        Update: {
          assigned_for?: string
          category?: string
          completed_at?: string | null
          created_at?: string
          description?: string
          difficulty?: string
          duration_minutes?: number | null
          expires_at?: string | null
          id?: string
          status?: string
          template_key?: string
          title?: string
          user_id?: string
          xp_reward?: number
        }
        Relationships: []
      }
      svj_readiness_daily: {
        Row: {
          components: Json
          created_at: string
          id: string
          load_score: number
          readiness_date: string
          recovery_grade: string
          score: number
          training_load: string
          updated_at: string
          user_id: string
        }
        Insert: {
          components?: Json
          created_at?: string
          id?: string
          load_score: number
          readiness_date?: string
          recovery_grade: string
          score: number
          training_load: string
          updated_at?: string
          user_id: string
        }
        Update: {
          components?: Json
          created_at?: string
          id?: string
          load_score?: number
          readiness_date?: string
          recovery_grade?: string
          score?: number
          training_load?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      svj_recovery_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          energy: number | null
          id: string
          perceived_recovery: number | null
          sleep_hours: number | null
          soreness: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_date?: string
          created_at?: string
          energy?: number | null
          id?: string
          perceived_recovery?: number | null
          sleep_hours?: number | null
          soreness?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string
          energy?: number | null
          id?: string
          perceived_recovery?: number | null
          sleep_hours?: number | null
          soreness?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      svj_routes: {
        Row: {
          activity_type: string
          bounds: Json | null
          created_at: string
          distance_meters: number | null
          elevation_gain_meters: number | null
          favorite: boolean
          id: string
          name: string
          polyline: string
          source_activity_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          bounds?: Json | null
          created_at?: string
          distance_meters?: number | null
          elevation_gain_meters?: number | null
          favorite?: boolean
          id?: string
          name: string
          polyline: string
          source_activity_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          bounds?: Json | null
          created_at?: string
          distance_meters?: number | null
          elevation_gain_meters?: number | null
          favorite?: boolean
          id?: string
          name?: string
          polyline?: string
          source_activity_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_routes_source_activity_id_fkey"
            columns: ["source_activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_segment_attempts: {
        Row: {
          activity_id: string
          created_at: string
          duration_seconds: number
          id: string
          segment_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          duration_seconds: number
          id?: string
          segment_id: string
          started_at: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          segment_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_segment_attempts_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_segment_attempts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "svj_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_segments: {
        Row: {
          activity_type: string
          created_at: string
          end_lat: number
          end_lng: number
          id: string
          name: string
          source_activity_id: string | null
          start_lat: number
          start_lng: number
          tolerance_meters: number
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          end_lat: number
          end_lng: number
          id?: string
          name: string
          source_activity_id?: string | null
          start_lat: number
          start_lng: number
          tolerance_meters?: number
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          end_lat?: number
          end_lng?: number
          id?: string
          name?: string
          source_activity_id?: string | null
          start_lat?: number
          start_lng?: number
          tolerance_meters?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_segments_source_activity_id_fkey"
            columns: ["source_activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_strength_sets: {
        Row: {
          activity_exercise_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          is_warmup: boolean
          reps: number | null
          set_number: number
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          activity_exercise_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_warmup?: boolean
          reps?: number | null
          set_number: number
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          activity_exercise_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_warmup?: boolean
          reps?: number | null
          set_number?: number
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "svj_strength_sets_activity_exercise_id_fkey"
            columns: ["activity_exercise_id"]
            isOneToOne: false
            referencedRelation: "svj_activity_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_training_decisions: {
        Row: {
          action: string
          activity_id: string | null
          created_at: string
          exercise_slug: string
          id: string
          payload: Json
          policy_version: string
          rationale: string
          user_id: string
        }
        Insert: {
          action: string
          activity_id?: string | null
          created_at?: string
          exercise_slug: string
          id?: string
          payload?: Json
          policy_version: string
          rationale?: string
          user_id: string
        }
        Update: {
          action?: string
          activity_id?: string | null
          created_at?: string
          exercise_slug?: string
          id?: string
          payload?: Json
          policy_version?: string
          rationale?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_training_decisions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_training_plan_sessions: {
        Row: {
          completed_activity_id: string | null
          created_at: string
          id: string
          plan_id: string
          scheduled_date: string
          slot_index: number
          status: string
          targets: Json
          template_id: string
          template_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_activity_id?: string | null
          created_at?: string
          id?: string
          plan_id: string
          scheduled_date: string
          slot_index: number
          status?: string
          targets?: Json
          template_id: string
          template_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_activity_id?: string | null
          created_at?: string
          id?: string
          plan_id?: string
          scheduled_date?: string
          slot_index?: number
          status?: string
          targets?: Json
          template_id?: string
          template_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_training_plan_sessions_completed_activity_id_fkey"
            columns: ["completed_activity_id"]
            isOneToOne: false
            referencedRelation: "svj_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_training_plan_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "svj_training_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svj_training_plan_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "svj_workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_training_plans: {
        Row: {
          block_end: string
          block_start: string
          created_at: string
          id: string
          policy_version: string
          split_id: string
          split_name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          block_end: string
          block_start: string
          created_at?: string
          id?: string
          policy_version: string
          split_id: string
          split_name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          block_end?: string
          block_start?: string
          created_at?: string
          id?: string
          policy_version?: string
          split_id?: string
          split_name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      svj_training_profiles: {
        Row: {
          athlete: Json
          available_days: number[]
          avoid_movements: string[]
          created_at: string
          equipment: string[]
          experience: string
          familiar_movements: string[]
          goal: string
          load_convention: string
          prefers_machines: boolean
          secondary_goal: string | null
          session_minutes: number
          sessions_per_week: number
          setup_complete: boolean
          units: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          athlete?: Json
          available_days?: number[]
          avoid_movements?: string[]
          created_at?: string
          equipment?: string[]
          experience?: string
          familiar_movements?: string[]
          goal?: string
          load_convention?: string
          prefers_machines?: boolean
          secondary_goal?: string | null
          session_minutes?: number
          sessions_per_week?: number
          setup_complete?: boolean
          units?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          athlete?: Json
          available_days?: number[]
          avoid_movements?: string[]
          created_at?: string
          equipment?: string[]
          experience?: string
          familiar_movements?: string[]
          goal?: string
          load_convention?: string
          prefers_machines?: boolean
          secondary_goal?: string | null
          session_minutes?: number
          sessions_per_week?: number
          setup_complete?: boolean
          units?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      svj_user_template_library: {
        Row: {
          archived: boolean
          created_at: string
          custom_name: string | null
          id: string
          last_completed_at: string | null
          pinned: boolean
          template_id: string
          template_version: number
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          custom_name?: string | null
          id?: string
          last_completed_at?: string | null
          pinned?: boolean
          template_id: string
          template_version?: number
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          custom_name?: string | null
          id?: string
          last_completed_at?: string | null
          pinned?: boolean
          template_id?: string
          template_version?: number
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "svj_user_template_library_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "svj_workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_workout_template_versions: {
        Row: {
          created_at: string
          payload: Json
          template_id: string
          version: number
        }
        Insert: {
          created_at?: string
          payload: Json
          template_id: string
          version: number
        }
        Update: {
          created_at?: string
          payload?: Json
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "svj_workout_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "svj_workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      svj_workout_templates: {
        Row: {
          created_at: string
          current_version: number
          family: string
          id: string
          is_published: boolean
          name: string
          owner_user_id: string | null
          source_key: string | null
          variant: string
        }
        Insert: {
          created_at?: string
          current_version?: number
          family: string
          id: string
          is_published?: boolean
          name: string
          owner_user_id?: string | null
          source_key?: string | null
          variant?: string
        }
        Update: {
          created_at?: string
          current_version?: number
          family?: string
          id?: string
          is_published?: boolean
          name?: string
          owner_user_id?: string | null
          source_key?: string | null
          variant?: string
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
          last_personalized_refresh_at: string | null
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
          last_personalized_refresh_at?: string | null
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
          last_personalized_refresh_at?: string | null
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
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
      is_admin_or_mod: { Args: { uid: string }; Returns: boolean }
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
      svj_activity_load_points: {
        Args: { p_activity_type: string; p_duration_seconds: number }
        Returns: number
      }
      svj_activity_xp_earned_today: {
        Args: { p_user_id: string }
        Returns: number
      }
      svj_admin_grant_plus: {
        Args: {
          p_duration_unit: string
          p_duration_value: number
          p_granted_by: string
          p_sender_label?: string
          p_target_user_id: string
        }
        Returns: {
          expires_at: string
          grant_id: string
        }[]
      }
      svj_assert_reward_service_role: { Args: never; Returns: undefined }
      svj_award_recovery_goal_discipline: {
        Args: { p_goal_id: string; p_user_id: string }
        Returns: boolean
      }
      svj_cancel_goal: { Args: { p_goal_id: string }; Returns: Json }
      svj_cancel_rivalry: { Args: { p_rivalry_id: string }; Returns: Json }
      svj_claim_daily_checkin: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_claim_daily_checkin_impl: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_claim_my_daily_checkin: {
        Args: { p_request_id: string }
        Returns: Json
      }
      svj_claim_nutrition_scan: { Args: { p_day_key?: string }; Returns: Json }
      svj_claim_plus_gift: {
        Args: { p_grant_id: string }
        Returns: {
          expires_at: string
          ok: boolean
        }[]
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
      svj_complete_daily_mission_impl: {
        Args: {
          p_assignment_id: string
          p_confirmation_text: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      svj_complete_my_challenge_day: {
        Args: {
          p_duration_minutes: number
          p_reflection: string
          p_task_ids: Json
        }
        Returns: Json
      }
      svj_complete_my_daily_mission: {
        Args: {
          p_assignment_id: string
          p_confirmation_text: string
          p_request_id: string
        }
        Returns: Json
      }
      svj_complete_my_personalized_task: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      svj_compute_challenge_run: {
        Args: {
          p_completed_days: number[]
          p_now: string
          p_started_at: string
          p_status: string
        }
        Returns: {
          days_completed: number
          effective_status: string
          is_missed: boolean
          next_day: number
          unlock_at: string
        }[]
      }
      svj_compute_readiness: {
        Args: { p_day: string; p_user_id: string }
        Returns: Json
      }
      svj_create_custom_exercise: {
        Args: {
          p_exercise_type?: string
          p_name: string
          p_primary_muscle: string
          p_secondary_muscles?: string[]
        }
        Returns: Json
      }
      svj_create_goal: {
        Args: {
          p_activity_type?: string
          p_metric: string
          p_period_end: string
          p_period_start: string
          p_period_type: string
          p_target_value: number
        }
        Returns: Json
      }
      svj_create_rivalry: { Args: { p_opponent_id: string }; Returns: Json }
      svj_create_segment: {
        Args: {
          p_activity_id: string
          p_activity_type?: string
          p_end_lat: number
          p_end_lng: number
          p_name: string
          p_start_lat: number
          p_start_lng: number
          p_tolerance_meters?: number
        }
        Returns: Json
      }
      svj_create_training_plan: { Args: { p_payload: Json }; Returns: Json }
      svj_delete_route: { Args: { p_route_id: string }; Returns: Json }
      svj_delete_segment: { Args: { p_segment_id: string }; Returns: Json }
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
      svj_get_activity_heatmap: {
        Args: {
          p_activity_type?: string
          p_max_cells?: number
          p_since?: string
        }
        Returns: Json
      }
      svj_get_activity_track: {
        Args: { p_activity_id: string; p_max_points?: number }
        Returns: Json
      }
      svj_get_engagement_state: { Args: { p_user_id: string }; Returns: Json }
      svj_get_engagement_state_impl: {
        Args: { p_user_id: string }
        Returns: Json
      }
      svj_get_exercise_history: {
        Args: { p_exercise_id: string; p_limit?: number }
        Returns: Json
      }
      svj_get_my_challenge_state: { Args: never; Returns: Json }
      svj_get_my_engagement_state: { Args: never; Returns: Json }
      svj_get_my_live_share: { Args: never; Returns: Json }
      svj_get_my_membership: {
        Args: never
        Returns: {
          avatar_url: string
          current_streak: number
          display_name: string
          id: string
          is_plus_member: boolean
          plus_expires_at: string
          plus_unlocked_at: string
          signup_date: string
          total_xp: number
          username: string
        }[]
      }
      svj_get_my_readiness: { Args: never; Returns: Json }
      svj_get_my_training_plan: { Args: never; Returns: Json }
      svj_get_my_training_profile: { Args: never; Returns: Json }
      svj_get_or_create_my_personalized_tasks: {
        Args: { p_templates?: Json }
        Returns: Json
      }
      svj_get_public_live_share: { Args: { p_token: string }; Returns: Json }
      svj_get_strength_detail: {
        Args: { p_activity_id: string }
        Returns: Json
      }
      svj_goal_metric_units: { Args: { p_metric: string }; Returns: string }
      svj_goal_progress: {
        Args: { goal: Database["public"]["Tables"]["svj_goals"]["Row"] }
        Returns: number
      }
      svj_goal_target_error: {
        Args: {
          p_metric: string
          p_period_end: string
          p_period_start: string
          p_target: number
        }
        Returns: string
      }
      svj_goal_with_progress: {
        Args: { goal: Database["public"]["Tables"]["svj_goals"]["Row"] }
        Returns: Json
      }
      svj_grant_my_completion_code: { Args: never; Returns: string }
      svj_haversine_m: {
        Args: { p_lat1: number; p_lat2: number; p_lng1: number; p_lng2: number }
        Returns: number
      }
      svj_import_legacy_template: {
        Args: { p_exercises: Json; p_name: string; p_source_key: string }
        Returns: Json
      }
      svj_import_platform_activity: {
        Args: {
          p_activity_type: string
          p_avg_heart_rate?: number
          p_calories_estimate?: number
          p_client_session_id: string
          p_device_platform?: string
          p_distance_meters?: number
          p_duration_seconds: number
          p_ended_at: string
          p_external_id: string
          p_started_at: string
          p_step_count?: number
        }
        Returns: Json
      }
      svj_list_activities: {
        Args: { p_limit?: number }
        Returns: {
          activity_type: string
          auto_paused: boolean
          avg_cadence: number | null
          avg_heart_rate: number | null
          avg_pace_seconds_per_km: number | null
          avg_speed_mps: number | null
          calories_estimate: number | null
          client_session_id: string
          created_at: string
          device_platform: string | null
          distance_meters: number | null
          duration_seconds: number
          elevation_gain_meters: number | null
          elevation_loss_meters: number | null
          ended_at: string
          external_id: string | null
          gps_quality: string | null
          id: string
          max_heart_rate: number | null
          max_speed_mps: number | null
          moving_seconds: number | null
          notes: string | null
          perceived_effort: number | null
          route_id: string | null
          source: string
          split_unit: string | null
          splits: Json | null
          started_at: string
          step_count: number
          track_bounds: Json | null
          track_point_count: number | null
          track_polyline: string | null
          updated_at: string
          user_id: string
          visibility: string
        }[]
        SetofOptions: {
          from: "*"
          to: "svj_activities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      svj_list_exercises: { Args: never; Returns: Json }
      svj_list_goals: { Args: { p_include_completed?: boolean }; Returns: Json }
      svj_list_gps_records: { Args: never; Returns: Json }
      svj_list_my_owned_templates: { Args: never; Returns: Json }
      svj_list_my_recovery_history: {
        Args: { p_limit?: number }
        Returns: Json
      }
      svj_list_my_template_library: { Args: never; Returns: Json }
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
      svj_list_records: { Args: never; Returns: Json }
      svj_list_recovery_records: { Args: never; Returns: Json }
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
      svj_list_routes: { Args: never; Returns: Json }
      svj_list_segments: { Args: never; Returns: Json }
      svj_list_strength_records: { Args: never; Returns: Json }
      svj_list_strength_summaries: { Args: { p_limit?: number }; Returns: Json }
      svj_list_training_decisions: { Args: { p_limit?: number }; Returns: Json }
      svj_list_workout_templates: { Args: never; Returns: Json }
      svj_load_band: { Args: { p_points: number }; Returns: string }
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
      svj_lock_reward_wallet_impl: {
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
      svj_match_segments_for_activity: {
        Args: { p_activity_id: string }
        Returns: number
      }
      svj_muscle_summary: { Args: { p_activity_id: string }; Returns: Json }
      svj_process_activity_rewards: {
        Args: { p_activity_id: string }
        Returns: Json
      }
      svj_recent_muscle_history: { Args: { p_days?: number }; Returns: Json }
      svj_record_eligible: {
        Args: {
          p_distance_meters: number
          p_duration_seconds: number
          p_record_type: string
          p_source: string
          p_step_count: number
        }
        Returns: boolean
      }
      svj_record_training_context: {
        Args: { p_client_session_id: string; p_context: Json }
        Returns: Json
      }
      svj_record_training_decision: { Args: { p_payload: Json }; Returns: Json }
      svj_record_value: {
        Args: {
          p_distance_meters: number
          p_duration_seconds: number
          p_record_type: string
          p_step_count: number
        }
        Returns: number
      }
      svj_redeem_earned_plus: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_redeem_earned_plus_impl: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_redeem_my_earned_plus: {
        Args: { p_request_id: string }
        Returns: Json
      }
      svj_redeem_my_plus_code: { Args: { p_code: string }; Returns: Json }
      svj_refresh_goal_statuses: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      svj_refresh_my_personalized_tasks: {
        Args: { p_templates?: Json }
        Returns: Json
      }
      svj_remove_my_template: { Args: { p_template_id: string }; Returns: Json }
      svj_replay_reward_operation: {
        Args: {
          p_action: string
          p_request_id: string
          p_source_key: string
          p_user_id: string
        }
        Returns: Json
      }
      svj_replay_reward_operation_impl: {
        Args: {
          p_action: string
          p_request_id: string
          p_source_key: string
          p_user_id: string
        }
        Returns: Json
      }
      svj_reschedule_plan_session: {
        Args: { p_new_date: string; p_session_id: string }
        Returns: Json
      }
      svj_reserve_personalized_refresh: { Args: never; Returns: Json }
      svj_respond_to_rivalry: {
        Args: { p_action: string; p_rivalry_id: string }
        Returns: Json
      }
      svj_resume_my_challenge: { Args: never; Returns: Json }
      svj_reward_identity: {
        Args: { p_user_id: string }
        Returns: {
          account_created_at: string
          verified: boolean
          verified_identity: string
        }[]
      }
      svj_reward_identity_impl: {
        Args: { p_user_id: string }
        Returns: {
          account_created_at: string
          verified: boolean
          verified_identity: string
        }[]
      }
      svj_save_activity: {
        Args: {
          p_activity_type: string
          p_calories_estimate?: number
          p_client_session_id: string
          p_distance_meters?: number
          p_duration_seconds: number
          p_ended_at: string
          p_notes?: string
          p_perceived_effort?: number
          p_source: string
          p_started_at: string
          p_step_count?: number
        }
        Returns: Json
      }
      svj_save_gps_activity: {
        Args: {
          p_activity_type: string
          p_auto_paused?: boolean
          p_bounds?: Json
          p_client_session_id: string
          p_device_platform?: string
          p_duration_seconds: number
          p_ended_at: string
          p_gps_quality?: string
          p_moving_seconds?: number
          p_notes?: string
          p_points: Json
          p_polyline?: string
          p_split_unit?: string
          p_started_at: string
          p_step_count?: number
        }
        Returns: Json
      }
      svj_save_my_recovery_checkin: {
        Args: {
          p_energy: number
          p_perceived_recovery: number
          p_sleep_hours: number
          p_soreness: number
        }
        Returns: Json
      }
      svj_save_my_template: {
        Args: {
          p_archived?: boolean
          p_custom_name?: string
          p_pinned?: boolean
          p_template_id: string
        }
        Returns: Json
      }
      svj_save_route_from_activity: {
        Args: { p_activity_id: string; p_favorite?: boolean; p_name: string }
        Returns: Json
      }
      svj_save_strength_activity: {
        Args: {
          p_client_session_id: string
          p_duration_seconds: number
          p_ended_at: string
          p_exercises: Json
          p_notes?: string
          p_perceived_effort?: number
          p_started_at: string
        }
        Returns: Json
      }
      svj_save_training_profile: { Args: { p_profile: Json }; Returns: Json }
      svj_skip_plan_session: { Args: { p_session_id: string }; Returns: Json }
      svj_start_daily_mission: {
        Args: { p_mission_key: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_start_daily_mission_impl: {
        Args: { p_mission_key: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      svj_start_live_share: {
        Args: {
          p_activity_id: string
          p_display_name?: string
          p_ttl_minutes?: number
        }
        Returns: Json
      }
      svj_start_my_challenge: { Args: never; Returns: Json }
      svj_start_my_daily_mission: {
        Args: { p_mission_key: string; p_request_id: string }
        Returns: Json
      }
      svj_stop_live_share: { Args: { p_token?: string }; Returns: Json }
      svj_strength_summary: { Args: { p_activity_id: string }; Returns: Json }
      svj_strength_workout_qualifies: {
        Args: { p_activity_id: string }
        Returns: boolean
      }
      svj_training_load_points: {
        Args: { p_days?: number; p_user_id: string }
        Returns: number
      }
      svj_update_goal: {
        Args: { p_goal_id: string; p_target_value: number }
        Returns: Json
      }
      svj_update_live_share: {
        Args: {
          p_accuracy_m?: number
          p_battery_percent?: number
          p_distance_meters?: number
          p_elapsed_seconds?: number
          p_lat: number
          p_lng: number
          p_token: string
        }
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
      svj_update_route: {
        Args: { p_favorite?: boolean; p_name?: string; p_route_id: string }
        Returns: Json
      }
      svj_validate_personalized_payload: {
        Args: { p_templates: Json }
        Returns: undefined
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
