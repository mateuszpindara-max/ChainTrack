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
          created_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
