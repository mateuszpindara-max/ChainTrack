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
  governing_mark.chain_id,
  governing_mark.chain_name,
  exists (
    select 1
    from public.chain_waxing_marks as own_mark
    where own_mark.user_id = activities.user_id
      and own_mark.activity_id = activities.id
  ) as is_waxing_start,
  case
    when activities.bike_id is null then null
    else sum(activities.distance_meters) over (
      partition by activities.user_id, activities.bike_id
      order by activities.started_at asc, activities.id asc
      rows between unbounded preceding and current row
    )
  end as cumulative_distance_meters
from public.activities as activities
left join lateral (
  select
    marks.chain_id,
    chains.name as chain_name
  from public.chain_waxing_marks as marks
  join public.activities as marked_activity
    on marked_activity.user_id = marks.user_id
    and marked_activity.id = marks.activity_id
  left join public.chains as chains
    on chains.user_id = marks.user_id
    and chains.id = marks.chain_id
  where activities.bike_id is not null
    and marks.user_id = activities.user_id
    and marked_activity.bike_id = activities.bike_id
    and (marked_activity.started_at, marked_activity.id) <= (activities.started_at, activities.id)
  order by marked_activity.started_at desc, marked_activity.id desc
  limit 1
) as governing_mark on true;