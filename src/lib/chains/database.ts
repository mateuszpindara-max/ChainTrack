interface Table<Row, Insert, Update = Partial<Insert>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

interface View<Row> {
  Row: Row;
  Relationships: [];
}

export interface ChainsDatabase {
  public: {
    Tables: {
      chains: Table<
        {
          id: string;
          user_id: string;
          name: string;
          starting_distance_meters: number;
          threshold_km: number | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          starting_distance_meters?: number;
          threshold_km?: number | null;
          created_at?: string;
        }
      >;
      chain_waxing_marks: Table<
        { activity_id: string; user_id: string; chain_id: string | null },
        { activity_id: string; user_id: string; chain_id?: string | null }
      >;
      chain_stop_events: Table<
        { id: string; user_id: string; chain_id: string; stopped_at: string },
        { id?: string; user_id: string; chain_id: string; stopped_at?: string }
      >;
    };
    Views: {
      chain_cycles: View<{
        user_id: string;
        chain_id: string;
        mark_activity_id: string;
        bike_id: string;
        cycle_started_at: string;
        cycle_ended_at: string | null;
        distance_meters: number;
        is_open: boolean;
      }>;
      chain_metrics: View<{
        id: string;
        user_id: string;
        name: string;
        starting_distance_meters: number;
        created_at: string;
        threshold_km: number | null;
        stopped_at: string | null;
        status: "active" | "stopped" | "not_started";
        total_distance_meters: number;
        active_distance_meters: number;
        completed_cycle_count: number;
        average_completed_distance_meters: number | null;
      }>;
      bike_chain_status: View<{ bike_id: string; user_id: string; chain_id: string }>;
    };
    Functions: {
      set_chain_waxing_mark: { Args: { p_activity_id: string; p_chain_id: string | null }; Returns: string };
      stop_chain: { Args: { p_chain_id: string }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
