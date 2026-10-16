alter table public.strava_sync_runs
  add column scan_complete boolean not null default false,
  add column verification_step integer not null default 0 check (verification_step >= 0),
  add constraint strava_sync_runs_scan_complete_mode_check check (not scan_complete or mode = 'repair');

create table public.strava_sync_deleted_activity_ids (
  user_id uuid not null references auth.users(id) on delete cascade,
  sync_run_id uuid not null,
  strava_activity_id bigint not null check (strava_activity_id > 0),
  primary key (user_id, sync_run_id, strava_activity_id),
  constraint strava_sync_deleted_activity_ids_run_fkey
    foreign key (user_id, sync_run_id)
    references public.strava_sync_runs (user_id, id)
    on delete cascade
);

alter table public.strava_sync_deleted_activity_ids enable row level security;

create policy "Users read their own verified Strava deletions"
  on public.strava_sync_deleted_activity_ids for select to authenticated
  using (auth.uid() = user_id);

create policy "Users stage verified deletions for completed repair scans"
  on public.strava_sync_deleted_activity_ids for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.strava_sync_runs as runs
      where runs.id = public.strava_sync_deleted_activity_ids.sync_run_id
        and runs.user_id = public.strava_sync_deleted_activity_ids.user_id
        and runs.mode = 'repair'
        and runs.scan_complete
        and runs.status in ('running', 'partial')
    )
  );

create policy "Users clear their own verified Strava deletions"
  on public.strava_sync_deleted_activity_ids for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.strava_sync_deleted_activity_ids to authenticated;

create or replace function public.clear_finalized_strava_sync_activity_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('running', 'partial') and new.status in ('completed', 'failed') then
    delete from public.strava_sync_activity_ids
    where user_id = new.user_id
      and sync_run_id = new.id;

    delete from public.strava_sync_deleted_activity_ids
    where user_id = new.user_id
      and sync_run_id = new.id;
  end if;

  return new;
end;
$$;

create function public.finalize_strava_sync_run(p_run_id uuid, p_expected_verification_step integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  v_removed_count integer;
begin
  if current_user_id is null then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;

  perform 1
  from public.strava_sync_runs as runs
  where runs.id = p_run_id
    and runs.user_id = current_user_id
    and runs.mode = 'repair'
    and runs.scan_complete
    and runs.verification_step = p_expected_verification_step
    and runs.status in ('running', 'partial')
  for update;

  if not found then
    raise exception 'The repair run is not ready to finalize' using errcode = '42501';
  end if;

  delete from public.activities as activities
  using public.strava_sync_deleted_activity_ids as verified
  where activities.user_id = current_user_id
    and verified.user_id = current_user_id
    and verified.sync_run_id = p_run_id
    and activities.strava_activity_id = verified.strava_activity_id
    and not exists (
      select 1
      from public.strava_sync_activity_ids as observed
      where observed.user_id = current_user_id
        and observed.sync_run_id = p_run_id
        and observed.strava_activity_id = activities.strava_activity_id
    );
  get diagnostics v_removed_count = row_count;

  update public.strava_sync_runs as runs
  set removed_count = runs.removed_count + v_removed_count,
      status = 'completed'
  where runs.id = p_run_id
    and runs.user_id = current_user_id
    and runs.mode = 'repair'
    and runs.scan_complete
    and runs.verification_step = p_expected_verification_step
    and runs.status in ('running', 'partial');

  if not found then
    raise exception 'The repair run changed before finalization' using errcode = '42501';
  end if;

  return v_removed_count;
end;
$$;

revoke all on function public.finalize_strava_sync_run(uuid, integer) from public;
grant execute on function public.finalize_strava_sync_run(uuid, integer) to authenticated;