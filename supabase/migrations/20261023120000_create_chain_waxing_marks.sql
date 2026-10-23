alter table public.activities
  add constraint activities_user_id_id_key unique (user_id, id);

create table public.chain_waxing_marks (
  activity_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_id uuid,
  constraint chain_waxing_marks_user_id_activity_id_fkey
    foreign key (user_id, activity_id)
    references public.activities (user_id, id)
    on delete cascade,
  constraint chain_waxing_marks_user_id_chain_id_fkey
    foreign key (user_id, chain_id)
    references public.chains (user_id, id)
    on delete set null (chain_id)
);

create index chain_waxing_marks_user_id_chain_id_idx
  on public.chain_waxing_marks (user_id, chain_id);

alter table public.chain_waxing_marks enable row level security;

create policy "Users manage their own chain waxing marks"
  on public.chain_waxing_marks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.chain_waxing_marks to authenticated;

create view public.activities_with_chain
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
  ) as is_waxing_start
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

grant select on public.activities_with_chain to authenticated;