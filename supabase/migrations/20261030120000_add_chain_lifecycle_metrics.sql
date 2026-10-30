alter table public.chains
  add column threshold_km numeric(7, 1),
  add constraint chains_threshold_km_check check (threshold_km > 0 and threshold_km <= 100000);

create table public.chain_stop_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_id uuid not null,
  stopped_at timestamptz not null default now(),
  constraint chain_stop_events_user_id_chain_id_fkey
    foreign key (user_id, chain_id) references public.chains (user_id, id) on delete cascade
);

create index chain_stop_events_user_chain_time_idx
  on public.chain_stop_events (user_id, chain_id, stopped_at);

alter table public.chain_stop_events enable row level security;

create policy "Users read their own chain stop events"
  on public.chain_stop_events for select to authenticated
  using (auth.uid() = user_id);

grant select on public.chain_stop_events to authenticated;
revoke insert, update, delete on public.chain_stop_events from public, anon, authenticated;

create or replace view public.activities_with_chain
with (security_invoker = true)
as
select
  activities.id,
  activities.user_id,
  activities.bike_id,
  activities.name,
  activities.distance_meters,
  activities.started_at,
  case when stopped.stopped_at is null then governing_mark.chain_id end as chain_id,
  case when stopped.stopped_at is null then governing_mark.chain_name end as chain_name,
  exists (
    select 1 from public.chain_waxing_marks as own_mark
    where own_mark.user_id = activities.user_id and own_mark.activity_id = activities.id
  ) as is_waxing_start,
  case
    when activities.bike_id is null then null
    else sum(activities.distance_meters) over (
      partition by activities.user_id, activities.bike_id
      order by activities.started_at, activities.id
      rows between unbounded preceding and current row
    )
  end as cumulative_distance_meters,
  case when stopped.stopped_at is null and governing_mark.chain_id is not null
    then governing_mark.activity_id end as governing_mark_activity_id
from public.activities as activities
left join lateral (
  select marks.activity_id, marks.chain_id, chains.name as chain_name, marked_activity.started_at
  from public.chain_waxing_marks as marks
  join public.activities as marked_activity
    on marked_activity.user_id = marks.user_id and marked_activity.id = marks.activity_id
  left join public.chains as chains on chains.user_id = marks.user_id and chains.id = marks.chain_id
  where activities.bike_id is not null
    and marks.user_id = activities.user_id
    and marked_activity.bike_id = activities.bike_id
    and (marked_activity.started_at, marked_activity.id) <= (activities.started_at, activities.id)
  order by marked_activity.started_at desc, marked_activity.id desc
  limit 1
) as governing_mark on true
left join lateral (
  select stops.stopped_at
  from public.chain_stop_events as stops
  where stops.user_id = activities.user_id
    and stops.chain_id = governing_mark.chain_id
    and stops.stopped_at >= governing_mark.started_at
    and stops.stopped_at < activities.started_at
  order by stops.stopped_at
  limit 1
) as stopped on true;

create view public.chain_cycles
with (security_invoker = true)
as
select
  marks.user_id,
  marks.chain_id,
  marks.activity_id as mark_activity_id,
  anchor.bike_id,
  anchor.started_at as cycle_started_at,
  least(next_mark.started_at, next_stop.stopped_at) as cycle_ended_at,
  coalesce(sum(attributed.distance_meters), 0)::double precision as distance_meters,
  next_mark.started_at is null and next_stop.stopped_at is null as is_open
from public.chain_waxing_marks as marks
join public.activities as anchor on anchor.user_id = marks.user_id and anchor.id = marks.activity_id
left join lateral (
  select next_activity.started_at
  from public.chain_waxing_marks as later_mark
  join public.activities as next_activity
    on next_activity.user_id = later_mark.user_id and next_activity.id = later_mark.activity_id
  where later_mark.user_id = marks.user_id and next_activity.bike_id = anchor.bike_id
    and (next_activity.started_at, next_activity.id) > (anchor.started_at, anchor.id)
  order by next_activity.started_at, next_activity.id
  limit 1
) as next_mark on true
left join lateral (
  select stops.stopped_at
  from public.chain_stop_events as stops
  where stops.user_id = marks.user_id and stops.chain_id = marks.chain_id
    and stops.stopped_at >= anchor.started_at
  order by stops.stopped_at
  limit 1
) as next_stop on true
left join public.activities_with_chain as attributed
  on attributed.user_id = marks.user_id and attributed.governing_mark_activity_id = marks.activity_id
where marks.chain_id is not null and anchor.bike_id is not null
group by marks.user_id, marks.chain_id, marks.activity_id, anchor.bike_id, anchor.started_at,
  next_mark.started_at, next_stop.stopped_at;

create view public.chain_metrics
with (security_invoker = true)
as
select
  chains.id,
  chains.user_id,
  chains.name,
  chains.starting_distance_meters,
  chains.created_at,
  chains.threshold_km,
  latest_stop.stopped_at,
  case
    when count(*) filter (where cycles.is_open) > 0 then 'active'
    when latest_stop.stopped_at is not null
      and not exists (
        select 1 from public.chain_cycles as later_cycle
        where later_cycle.user_id = chains.user_id and later_cycle.chain_id = chains.id
          and later_cycle.cycle_started_at > latest_stop.stopped_at
      ) then 'stopped'
    else 'not_started'
  end as status,
  chains.starting_distance_meters + coalesce(sum(cycles.distance_meters), 0) as total_distance_meters,
  coalesce(sum(cycles.distance_meters) filter (where cycles.is_open), 0)::double precision as active_distance_meters,
  count(cycles.mark_activity_id) filter (where not cycles.is_open) as completed_cycle_count,
  case when count(cycles.mark_activity_id) filter (where not cycles.is_open) >= 2
    then avg(cycles.distance_meters) filter (where not cycles.is_open) end as average_completed_distance_meters
from public.chains as chains
left join public.chain_cycles as cycles on cycles.user_id = chains.user_id and cycles.chain_id = chains.id
left join lateral (
  select max(stops.stopped_at) as stopped_at from public.chain_stop_events as stops
  where stops.user_id = chains.user_id and stops.chain_id = chains.id
) as latest_stop on true
group by chains.id, chains.user_id, chains.name, chains.starting_distance_meters,
  chains.created_at, chains.threshold_km, latest_stop.stopped_at;

create view public.bike_chain_status
with (security_invoker = true)
as
select bike_id, user_id, chain_id from public.chain_cycles where is_open;

grant select on public.chain_cycles, public.chain_metrics, public.bike_chain_status to authenticated;

revoke insert, update, delete on public.chain_waxing_marks from public, anon, authenticated;

create function public.set_chain_waxing_mark(p_activity_id uuid, p_chain_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_chain_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text, 0));

  perform 1 from public.activities
  where id = p_activity_id and user_id = current_user_id and bike_id is not null
  for update;
  if not found then return 'activity-not-found'; end if;

  select chain_id into previous_chain_id from public.chain_waxing_marks
  where activity_id = p_activity_id and user_id = current_user_id;

  perform 1 from public.chains
  where user_id = current_user_id and id in (previous_chain_id, p_chain_id)
  order by id for update;

  if p_chain_id is not null and not exists (
    select 1 from public.chains where id = p_chain_id and user_id = current_user_id
  ) then return 'chain-not-found'; end if;

  if p_chain_id is null then
    delete from public.chain_waxing_marks where activity_id = p_activity_id and user_id = current_user_id;
  else
    insert into public.chain_waxing_marks (activity_id, user_id, chain_id)
    values (p_activity_id, current_user_id, p_chain_id)
    on conflict (activity_id) do update set chain_id = excluded.chain_id
    where public.chain_waxing_marks.user_id = current_user_id
      and public.chain_waxing_marks.chain_id is distinct from excluded.chain_id;
  end if;
  return 'saved';
end;
$$;

create function public.stop_chain(p_chain_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text, 0));
  perform 1 from public.chains where id = p_chain_id and user_id = current_user_id for update;
  if not found then return 'chain-not-found'; end if;

  if exists (
    select 1 from public.chain_cycles
    where user_id = current_user_id and chain_id = p_chain_id and is_open
  ) then
    insert into public.chain_stop_events (user_id, chain_id, stopped_at)
    values (current_user_id, p_chain_id, pg_catalog.clock_timestamp());
  end if;
  return 'saved';
end;
$$;

revoke all on function public.set_chain_waxing_mark(uuid, uuid) from public, anon, authenticated;
revoke all on function public.stop_chain(uuid) from public, anon, authenticated;
grant execute on function public.set_chain_waxing_mark(uuid, uuid) to authenticated;
grant execute on function public.stop_chain(uuid) to authenticated;