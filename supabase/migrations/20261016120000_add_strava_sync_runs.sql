alter table public.activities
  alter column bike_id drop not null;

create table public.strava_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('new', 'repair')),
  status text not null default 'running'
    check (status in ('running', 'partial', 'completed', 'failed')),
  next_page integer not null default 1 check (next_page >= 1),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  removed_count integer not null default 0 check (removed_count >= 0),
  created_at timestamptz not null default now(),
  constraint strava_sync_runs_user_id_id_key unique (user_id, id)
);

create unique index strava_sync_runs_one_active_per_user_key
  on public.strava_sync_runs (user_id)
  where status in ('running', 'partial');

create index strava_sync_runs_user_status_idx
  on public.strava_sync_runs (user_id, status);

create table public.strava_sync_activity_ids (
  user_id uuid not null references auth.users(id) on delete cascade,
  sync_run_id uuid not null,
  strava_activity_id bigint not null check (strava_activity_id > 0),
  primary key (user_id, sync_run_id, strava_activity_id),
  constraint strava_sync_activity_ids_run_fkey
    foreign key (user_id, sync_run_id)
    references public.strava_sync_runs (user_id, id)
    on delete cascade
);

create index strava_sync_activity_ids_user_activity_idx
  on public.strava_sync_activity_ids (user_id, strava_activity_id);

alter table public.strava_sync_runs enable row level security;
alter table public.strava_sync_activity_ids enable row level security;

create policy "Users manage their own Strava sync runs"
  on public.strava_sync_runs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users read their own staged Strava activity IDs"
  on public.strava_sync_activity_ids for select to authenticated
  using (auth.uid() = user_id);

create policy "Users stage IDs for their active repair runs"
  on public.strava_sync_activity_ids for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.strava_sync_runs as runs
      where runs.id = public.strava_sync_activity_ids.sync_run_id
        and runs.user_id = public.strava_sync_activity_ids.user_id
        and runs.mode = 'repair'
        and runs.status in ('running', 'partial')
    )
  );

create policy "Users delete their own staged Strava activity IDs"
  on public.strava_sync_activity_ids for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.strava_sync_runs to authenticated;
grant select, insert, delete on public.strava_sync_activity_ids to authenticated;

create function public.clear_finalized_strava_sync_activity_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('running', 'partial') and new.status in ('completed', 'failed') then
    delete from public.strava_sync_activity_ids
    where user_id = new.user_id
      and sync_run_id = new.id;
  end if;

  return new;
end;
$$;

create trigger clear_finalized_strava_sync_activity_ids
  after update of status on public.strava_sync_runs
  for each row
  execute function public.clear_finalized_strava_sync_activity_ids();

create function public.delete_strava_activity(p_strava_activity_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.activities
  where user_id = (select auth.uid())
    and strava_activity_id = p_strava_activity_id;
$$;

revoke all on function public.delete_strava_activity(bigint) from public;
grant execute on function public.delete_strava_activity(bigint) to authenticated;