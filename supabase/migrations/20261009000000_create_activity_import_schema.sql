create table public.bikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strava_gear_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint bikes_user_id_strava_gear_id_key unique (user_id, strava_gear_id),
  constraint bikes_user_id_id_key unique (user_id, id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bike_id uuid not null,
  strava_activity_id bigint not null,
  name text not null,
  distance_meters double precision not null check (distance_meters >= 0),
  started_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint activities_user_id_strava_activity_id_key unique (user_id, strava_activity_id),
  constraint activities_user_id_bike_id_fkey
    foreign key (user_id, bike_id) references public.bikes (user_id, id) on delete restrict
);

create table public.strava_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index strava_oauth_states_user_expiry_idx
  on public.strava_oauth_states (user_id, expires_at);

create table public.strava_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token_ciphertext text not null
    check (access_token_ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$'),
  refresh_token_ciphertext text not null
    check (refresh_token_ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$'),
  token_expires_at timestamptz not null,
  athlete_id bigint not null,
  scopes text[] not null,
  updated_at timestamptz not null default now()
);

alter table public.bikes enable row level security;
alter table public.activities enable row level security;
alter table public.strava_oauth_states enable row level security;
alter table public.strava_connections enable row level security;

create policy "Users manage their own bikes"
  on public.bikes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own activities"
  on public.activities for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own OAuth states"
  on public.strava_oauth_states for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own Strava connection"
  on public.strava_connections for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.bikes to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, update, delete on public.strava_oauth_states to authenticated;
grant select, insert, update, delete on public.strava_connections to authenticated;