alter table public.strava_connections
  add column initial_import_completed_at timestamptz,
  add column initial_import_next_page integer not null default 1 check (initial_import_next_page >= 1);