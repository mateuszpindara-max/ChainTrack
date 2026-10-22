interface Table<Row, Insert, Update = Partial<Insert>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
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
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          starting_distance_meters?: number;
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
