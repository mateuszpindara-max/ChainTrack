alter table public.strava_connections
  add column initial_import_athlete_id bigint;

update public.strava_connections
set initial_import_athlete_id = athlete_id
where initial_import_athlete_id is null;

alter table public.strava_connections
  alter column initial_import_athlete_id set not null;

alter table public.strava_sync_runs
  add column athlete_id bigint;

update public.strava_sync_runs as runs
set athlete_id = connections.athlete_id
from public.strava_connections as connections
where connections.user_id = runs.user_id
  and runs.athlete_id is null;