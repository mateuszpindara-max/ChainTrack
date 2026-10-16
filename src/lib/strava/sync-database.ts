interface Table<Row, Insert, Update = Partial<Insert>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface StravaSyncDatabase {
  public: {
    Tables: {
      activities: Table<
        {
          id: string;
          user_id: string;
          bike_id: string | null;
          strava_activity_id: number;
          name: string;
          distance_meters: number;
          started_at: string;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          bike_id: string | null;
          strava_activity_id: number;
          name: string;
          distance_meters: number;
          started_at: string;
          created_at?: string;
        }
      >;
      bikes: Table<
        { id: string; user_id: string; strava_gear_id: string; name: string; created_at: string },
        { id?: string; user_id: string; strava_gear_id: string; name: string; created_at?: string }
      >;
      strava_connections: Table<
        {
          user_id: string;
          access_token_ciphertext: string;
          refresh_token_ciphertext: string;
          token_expires_at: string;
          athlete_id: number;
          scopes: string[];
          updated_at: string;
          initial_import_completed_at: string | null;
          initial_import_next_page: number;
        },
        {
          user_id: string;
          access_token_ciphertext: string;
          refresh_token_ciphertext: string;
          token_expires_at: string;
          athlete_id: number;
          scopes: string[];
          updated_at?: string;
          initial_import_completed_at?: string | null;
          initial_import_next_page?: number;
        }
      >;
      strava_sync_runs: Table<
        {
          id: string;
          user_id: string;
          mode: "new" | "repair";
          status: "running" | "partial" | "completed" | "failed";
          next_page: number;
          inserted_count: number;
          updated_count: number;
          skipped_count: number;
          removed_count: number;
          scan_complete: boolean;
          verification_step: number;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          mode: "new" | "repair";
          status?: "running" | "partial" | "completed" | "failed";
          next_page?: number;
          inserted_count?: number;
          updated_count?: number;
          skipped_count?: number;
          removed_count?: number;
          scan_complete?: boolean;
          verification_step?: number;
          created_at?: string;
        }
      >;
      strava_sync_activity_ids: Table<
        { user_id: string; sync_run_id: string; strava_activity_id: number },
        { user_id: string; sync_run_id: string; strava_activity_id: number }
      >;
      strava_sync_deleted_activity_ids: Table<
        { user_id: string; sync_run_id: string; strava_activity_id: number },
        { user_id: string; sync_run_id: string; strava_activity_id: number }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      finalize_strava_sync_run: {
        Args: { p_run_id: string; p_expected_verification_step: number };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
