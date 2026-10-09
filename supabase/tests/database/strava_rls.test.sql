begin;

select plan(24);

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
  ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000022', 202, 'Ride B', 2000, now());

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

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is((select count(*)::integer from public.bikes), 1, 'user reads only their own bikes');
select is((select count(*)::integer from public.activities), 1, 'user reads only their own activities');
select is((select count(*)::integer from public.strava_oauth_states), 1, 'user reads only their own OAuth states');
select is((select count(*)::integer from public.strava_connections), 1, 'user reads only their own Strava connection');
select lives_ok($$insert into public.bikes (user_id, strava_gear_id, name) values (auth.uid(), 'gear-own-write', 'Owned bike')$$, 'user can insert their own bike');
select lives_ok($$insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values (auth.uid(), '10000000-0000-0000-0000-000000000011', 505, 'Owned ride', 500, now())$$, 'user can insert their own activity');
select throws_ok($$insert into public.strava_oauth_states (state_hash, user_id, expires_at) values (repeat('e', 64), auth.uid(), now() + interval '5 minutes')$$, '23505', null, 'user can have only one pending OAuth state');
delete from public.strava_oauth_states where user_id = auth.uid();
select lives_ok($$insert into public.strava_oauth_states (state_hash, user_id, expires_at) values (repeat('d', 64), auth.uid(), now() + interval '5 minutes')$$, 'user can insert their own OAuth state');
select lives_ok($$update public.strava_connections set athlete_id = 12 where user_id = auth.uid()$$, 'user can update their own connection');

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

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok($$insert into public.bikes (user_id, strava_gear_id, name) values ('20000000-0000-0000-0000-000000000002', 'foreign-gear', 'Foreign')$$, '42501', null, 'user cannot insert a bike for another user');
select throws_ok($$insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000022', 303, 'Foreign', 1, now())$$, '42501', null, 'user cannot insert an activity for another user');
select throws_ok($$insert into public.strava_oauth_states (state_hash, user_id, expires_at) values (repeat('c', 64), '20000000-0000-0000-0000-000000000002', now() + interval '5 minutes')$$, '42501', null, 'user cannot insert OAuth state for another user');
select throws_ok($$insert into public.strava_connections (user_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, athlete_id, scopes) values ('20000000-0000-0000-0000-000000000002', 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA', 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA', now(), 33, array[]::text[])$$, '42501', null, 'user cannot insert connection for another user');
select throws_ok($$insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values (auth.uid(), '20000000-0000-0000-0000-000000000022', 404, 'Wrong bike owner', 1, now())$$, '23503', null, 'activity cannot reference another user bike');
select throws_ok($$update public.strava_connections set access_token_ciphertext = 'plaintext-access-token', refresh_token_ciphertext = 'plaintext-refresh-token' where user_id = auth.uid()$$, '23514', null, 'database rejects plaintext token values');
select ok((select access_token_ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$' and refresh_token_ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$' from public.strava_connections where user_id = auth.uid()), 'stored token values use the ciphertext envelope format');

select * from finish();
rollback;