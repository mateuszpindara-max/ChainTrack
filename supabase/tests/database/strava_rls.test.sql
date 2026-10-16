begin;

select plan(52);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-user-a@example.test', '', now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rls-user-b@example.test', '', now());

insert into public.bikes (id, user_id, strava_gear_id, name)
values
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'gear-a', 'Bike A'),
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'gear-b', 'Bike B');

insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at)
values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 101, 'Ride A', 1000, now()),
  ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000022', 202, 'Ride B', 2000, now()),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 107, 'Verified deletion', 1000, now()),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 108, 'Unverified candidate', 1000, now());

insert into public.strava_oauth_states (state_hash, user_id, expires_at)
values
  (repeat('a', 64), '10000000-0000-0000-0000-000000000001', now() + interval '5 minutes'),
  (repeat('b', 64), '20000000-0000-0000-0000-000000000002', now() + interval '5 minutes');

insert into public.strava_connections (
  user_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, athlete_id, scopes
)
values
  ('10000000-0000-0000-0000-000000000001', 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA', 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA', now() + interval '1 hour', 11, array['activity:read_all']),
  ('20000000-0000-0000-0000-000000000002', 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA', 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA', now() + interval '1 hour', 22, array['activity:read_all']);

insert into public.strava_sync_runs (id, user_id, mode, status)
values
  ('10000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000001', 'repair', 'running'),
  ('20000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000002', 'repair', 'running');

insert into public.strava_sync_activity_ids (user_id, sync_run_id, strava_activity_id)
values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000031', 901),
  ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000032', 902);

create table public.strava_rls_test_activity_dependents (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade
);

grant select on public.strava_rls_test_activity_dependents to authenticated;

insert into public.strava_rls_test_activity_dependents (activity_id)
select id from public.activities where strava_activity_id = 101;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is((select count(*)::integer from public.bikes), 1, 'user reads only their own bikes');
select is((select count(*)::integer from public.activities), 3, 'user reads only their own activities');
select is((select count(*)::integer from public.strava_oauth_states), 1, 'user reads only their own OAuth states');
select is((select count(*)::integer from public.strava_connections), 1, 'user reads only their own Strava connection');
select is((select count(*)::integer from public.strava_sync_runs), 1, 'user reads only their own sync runs');
select is((select count(*)::integer from public.strava_sync_activity_ids), 1, 'user reads only their own staged activity IDs');
select is((select count(*)::integer from public.strava_sync_deleted_activity_ids), 0, 'user reads only their own verified deletion candidates');
select lives_ok($$insert into public.bikes (user_id, strava_gear_id, name) values (auth.uid(), 'gear-own-write', 'Owned bike')$$, 'user can insert their own bike');
select lives_ok($$insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values (auth.uid(), '10000000-0000-0000-0000-000000000011', 505, 'Owned ride', 500, now())$$, 'user can insert their own activity');
select throws_ok($$insert into public.strava_oauth_states (state_hash, user_id, expires_at) values (repeat('e', 64), auth.uid(), now() + interval '5 minutes')$$, '23505', null, 'user can have only one pending OAuth state');
delete from public.strava_oauth_states where user_id = auth.uid();
select lives_ok($$insert into public.strava_oauth_states (state_hash, user_id, expires_at) values (repeat('d', 64), auth.uid(), now() + interval '5 minutes')$$, 'user can insert their own OAuth state');
select lives_ok($$update public.strava_connections set athlete_id = 12 where user_id = auth.uid()$$, 'user can update their own connection');
select lives_ok($$insert into public.strava_sync_runs (user_id, mode, status) values (auth.uid(), 'new', 'completed')$$, 'user can insert their own completed sync run');
select throws_ok($$insert into public.strava_sync_runs (user_id, mode) values (auth.uid(), 'new')$$, '23505', null, 'user can have only one active sync run');
select lives_ok($$insert into public.strava_sync_activity_ids (user_id, sync_run_id, strava_activity_id) values (auth.uid(), '10000000-0000-0000-0000-000000000031', 903)$$, 'user can stage an ID for their active repair run');
select throws_ok($$insert into public.strava_sync_activity_ids (user_id, sync_run_id, strava_activity_id) values ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000032', 904)$$, '42501', null, 'user cannot stage IDs for another user');
select throws_ok($$insert into public.strava_sync_activity_ids (user_id, sync_run_id, strava_activity_id) values (auth.uid(), (select id from public.strava_sync_runs where user_id = auth.uid() and mode = 'new'), 905)$$, '42501', null, 'user cannot stage IDs for a new or finalized run');
select lives_ok($$insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values (auth.uid(), null, 506, 'Unmatched ride', 500, now())$$, 'user can retain an activity without an unambiguous bike');

select public.delete_strava_activity(101);
select public.delete_strava_activity(202);
select is((select count(*)::integer from public.activities where strava_activity_id = 101), 0, 'user can delete their confirmed provider activity');
select is((select count(*)::integer from public.strava_rls_test_activity_dependents), 0, 'activity deletion atomically cascades to dependent records');
select lives_ok($$update public.strava_sync_runs set status = 'partial' where id = '10000000-0000-0000-0000-000000000031'$$, 'user can pause a repair run with a partial result');
select is((select count(*)::integer from public.strava_sync_activity_ids), 2, 'partial repair retains staged activity IDs');
select throws_ok($$insert into public.strava_sync_runs (user_id, mode) values (auth.uid(), 'repair')$$, '23505', null, 'partial run remains the user active run');
select lives_ok($$insert into public.strava_sync_activity_ids (user_id, sync_run_id, strava_activity_id) values (auth.uid(), '10000000-0000-0000-0000-000000000031', 906)$$, 'user can resume staging IDs for a partial repair run');
set local role postgres;
insert into public.strava_rls_test_activity_dependents (activity_id)
select id from public.activities where strava_activity_id = 107;
set local role authenticated;
update public.strava_sync_runs set scan_complete = true where id = '10000000-0000-0000-0000-000000000031';
select lives_ok($$insert into public.strava_sync_deleted_activity_ids (user_id, sync_run_id, strava_activity_id) values (auth.uid(), '10000000-0000-0000-0000-000000000031', 107)$$, 'user can stage a verified not-found activity');
select throws_ok($$insert into public.strava_sync_deleted_activity_ids (user_id, sync_run_id, strava_activity_id) values ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000032', 202)$$, '42501', null, 'user cannot stage another user verified deletion');
select lives_ok($$select public.finalize_strava_sync_run('10000000-0000-0000-0000-000000000031', 0)$$, 'user atomically finalizes their completed repair run');
select is((select count(*)::integer from public.strava_sync_activity_ids), 0, 'finalizing a run clears its staged IDs');
select is((select count(*)::integer from public.strava_sync_deleted_activity_ids), 0, 'finalizing a run clears verified deletion staging');
select is((select count(*)::integer from public.activities where strava_activity_id = 107), 0, 'finalization deletes only the verified absent activity');
select is((select count(*)::integer from public.strava_rls_test_activity_dependents), 0, 'finalization cascades dependent records atomically');
select is((select count(*)::integer from public.activities where strava_activity_id = 108), 1, 'finalization retains candidates without verified absence');
select throws_ok($$select public.finalize_strava_sync_run('20000000-0000-0000-0000-000000000032', 0)$$, '42501', null, 'user cannot finalize another user repair run');

update public.bikes set name = 'Changed' where user_id = '20000000-0000-0000-0000-000000000002';
delete from public.bikes where user_id = '20000000-0000-0000-0000-000000000002';
update public.activities set name = 'Changed' where user_id = '20000000-0000-0000-0000-000000000002';
delete from public.activities where user_id = '20000000-0000-0000-0000-000000000002';
update public.strava_oauth_states set expires_at = now() where user_id = '20000000-0000-0000-0000-000000000002';
delete from public.strava_oauth_states where user_id = '20000000-0000-0000-0000-000000000002';
update public.strava_connections set athlete_id = 99 where user_id = '20000000-0000-0000-0000-000000000002';
delete from public.strava_connections where user_id = '20000000-0000-0000-0000-000000000002';

set local role postgres;
select is((select name from public.bikes where user_id = '20000000-0000-0000-0000-000000000002'), 'Bike B', 'user cannot update another user bike');
select is((select count(*)::integer from public.bikes where user_id = '20000000-0000-0000-0000-000000000002'), 1, 'user cannot delete another user bike');
select is((select name from public.activities where user_id = '20000000-0000-0000-0000-000000000002'), 'Ride B', 'user cannot update another user activity');
select is((select count(*)::integer from public.activities where user_id = '20000000-0000-0000-0000-000000000002'), 1, 'user cannot delete another user activity');
select ok((select expires_at > now() from public.strava_oauth_states where user_id = '20000000-0000-0000-0000-000000000002'), 'user cannot update another user OAuth state');
select is((select count(*)::integer from public.strava_oauth_states where user_id = '20000000-0000-0000-0000-000000000002'), 1, 'user cannot delete another user OAuth state');
select is((select athlete_id::integer from public.strava_connections where user_id = '20000000-0000-0000-0000-000000000002'), 22, 'user cannot update another user connection');
select is((select count(*)::integer from public.strava_connections where user_id = '20000000-0000-0000-0000-000000000002'), 1, 'user cannot delete another user connection');
select is((select count(*)::integer from public.activities where user_id = '20000000-0000-0000-0000-000000000002' and strava_activity_id = 202), 1, 'deletion cannot remove another user activity');
select is((select count(*)::integer from public.strava_sync_runs where user_id = '20000000-0000-0000-0000-000000000002'), 1, 'user cannot read or delete another user sync run');
select is((select count(*)::integer from public.strava_sync_activity_ids where user_id = '20000000-0000-0000-0000-000000000002'), 1, 'user cannot read or delete another user staged activity ID');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok($$insert into public.bikes (user_id, strava_gear_id, name) values ('20000000-0000-0000-0000-000000000002', 'foreign-gear', 'Foreign')$$, '42501', null, 'user cannot insert a bike for another user');
select throws_ok($$insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000022', 303, 'Foreign', 1, now())$$, '42501', null, 'user cannot insert an activity for another user');
select throws_ok($$insert into public.strava_oauth_states (state_hash, user_id, expires_at) values (repeat('c', 64), '20000000-0000-0000-0000-000000000002', now() + interval '5 minutes')$$, '42501', null, 'user cannot insert OAuth state for another user');
select throws_ok($$insert into public.strava_connections (user_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, athlete_id, scopes) values ('20000000-0000-0000-0000-000000000002', 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA', 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA', now(), 33, array[]::text[])$$, '42501', null, 'user cannot insert connection for another user');
select throws_ok($$insert into public.strava_sync_runs (user_id, mode) values ('20000000-0000-0000-0000-000000000002', 'new')$$, '42501', null, 'user cannot insert a sync run for another user');
select throws_ok($$insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values (auth.uid(), '20000000-0000-0000-0000-000000000022', 404, 'Wrong bike owner', 1, now())$$, '23503', null, 'activity cannot reference another user bike');
select throws_ok($$update public.strava_connections set access_token_ciphertext = 'plaintext-access-token', refresh_token_ciphertext = 'plaintext-refresh-token' where user_id = auth.uid()$$, '23514', null, 'database rejects plaintext token values');
select ok((select access_token_ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$' and refresh_token_ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$' from public.strava_connections where user_id = auth.uid()), 'stored token values use the ciphertext envelope format');

select * from finish();
rollback;