create table public.chains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  starting_distance_meters double precision not null default 0,
  created_at timestamptz not null default now(),
  constraint chains_name_trimmed_check check (name = btrim(name)),
  constraint chains_name_length_check check (char_length(name) between 1 and 60),
  constraint chains_starting_distance_meters_check
    check (starting_distance_meters between 0 and 100000000),
  constraint chains_user_id_id_key unique (user_id, id)
);

create unique index chains_user_id_lower_name_key
  on public.chains (user_id, lower(name));

alter table public.chains enable row level security;

create policy "Users manage their own chains"
  on public.chains for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.chains to authenticated;