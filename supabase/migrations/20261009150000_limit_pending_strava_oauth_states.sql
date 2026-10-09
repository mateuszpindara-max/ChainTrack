with ranked_states as (
  select
    ctid,
    row_number() over (
      partition by user_id
      order by created_at desc, state_hash desc
    ) as state_rank
  from public.strava_oauth_states
)
delete from public.strava_oauth_states as states
using ranked_states
where states.ctid = ranked_states.ctid
  and ranked_states.state_rank > 1;

create unique index strava_oauth_states_one_pending_per_user_key
  on public.strava_oauth_states (user_id);