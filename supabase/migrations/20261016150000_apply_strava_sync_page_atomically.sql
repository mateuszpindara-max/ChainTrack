create function public.apply_strava_sync_page(
  p_run_id uuid,
  p_expected_page integer,
  p_next_page integer,
  p_activities jsonb,
  p_staged_activity_ids bigint[],
  p_skipped_delta integer,
  p_scan_complete boolean,
  p_next_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  v_run public.strava_sync_runs%rowtype;
  v_activity jsonb;
  v_activity_id bigint;
  v_existing boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_rows integer;
begin
  if current_user_id is null then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;
  if p_expected_page < 1 or p_next_page <= p_expected_page or p_skipped_delta < 0
    or jsonb_typeof(p_activities) <> 'array'
    or p_next_status not in ('running', 'partial', 'completed') then
    raise exception 'Invalid synchronization page' using errcode = '22023';
  end if;

  select * into v_run
  from public.strava_sync_runs as runs
  where runs.id = p_run_id
    and runs.user_id = current_user_id
  for update;

  if not found or v_run.next_page <> p_expected_page or v_run.status not in ('running', 'partial') then
    return null;
  end if;
  if (v_run.mode = 'repair' and p_next_status = 'completed' and not p_scan_complete)
    or (v_run.mode = 'new' and p_scan_complete) then
    raise exception 'Invalid synchronization completion state' using errcode = '22023';
  end if;

  for v_activity in select value from jsonb_array_elements(p_activities)
  loop
    v_activity_id := (v_activity ->> 'strava_activity_id')::bigint;
    if v_run.mode = 'new' then
      insert into public.activities (
        user_id, bike_id, strava_activity_id, name, distance_meters, started_at
      ) values (
        current_user_id,
        (v_activity ->> 'bike_id')::uuid,
        v_activity_id,
        v_activity ->> 'name',
        (v_activity ->> 'distance_meters')::double precision,
        (v_activity ->> 'started_at')::timestamptz
      ) on conflict (user_id, strava_activity_id) do nothing;
      get diagnostics v_rows = row_count;
      v_inserted := v_inserted + v_rows;
    else
      select exists (
        select 1 from public.activities as activities
        where activities.user_id = current_user_id
          and activities.strava_activity_id = v_activity_id
      ) into v_existing;
      insert into public.activities (
        user_id, bike_id, strava_activity_id, name, distance_meters, started_at
      ) values (
        current_user_id,
        nullif(v_activity ->> 'bike_id', '')::uuid,
        v_activity_id,
        v_activity ->> 'name',
        (v_activity ->> 'distance_meters')::double precision,
        (v_activity ->> 'started_at')::timestamptz
      ) on conflict (user_id, strava_activity_id) do update
        set bike_id = excluded.bike_id,
            name = excluded.name,
            distance_meters = excluded.distance_meters,
            started_at = excluded.started_at;
      if v_existing then
        v_updated := v_updated + 1;
      else
        v_inserted := v_inserted + 1;
      end if;
    end if;
  end loop;

  if v_run.mode = 'repair' then
    foreach v_activity_id in array coalesce(p_staged_activity_ids, array[]::bigint[])
    loop
      insert into public.strava_sync_activity_ids (user_id, sync_run_id, strava_activity_id)
      values (current_user_id, p_run_id, v_activity_id)
      on conflict (user_id, sync_run_id, strava_activity_id) do nothing;
    end loop;
  end if;

  update public.strava_sync_runs as runs
  set next_page = p_next_page,
      inserted_count = runs.inserted_count + v_inserted,
      updated_count = runs.updated_count + v_updated,
      skipped_count = runs.skipped_count + p_skipped_delta,
      scan_complete = p_scan_complete,
      status = p_next_status
  where runs.id = p_run_id
    and runs.user_id = current_user_id
  returning runs.* into v_run;

  return to_jsonb(v_run);
end;
$$;

revoke all on function public.apply_strava_sync_page(uuid, integer, integer, jsonb, bigint[], integer, boolean, text)
  from public;
grant execute on function public.apply_strava_sync_page(uuid, integer, integer, jsonb, bigint[], integer, boolean, text)
  to authenticated;