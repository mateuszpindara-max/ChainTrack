begin;

select plan(44);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'waxing-user-a@example.test', '', now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'waxing-user-b@example.test', '', now());

insert into public.bikes (id, user_id, strava_gear_id, name)
values
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'waxing-bike-a1', 'Bike A1'),
  ('10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'waxing-bike-a2', 'Bike A2'),
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'waxing-bike-b1', 'Bike B1');

insert into public.chains (id, user_id, name)
values
  ('10000000-0000-0000-0000-000000000111', '10000000-0000-0000-0000-000000000001', 'Chain A1'),
  ('10000000-0000-0000-0000-000000000112', '10000000-0000-0000-0000-000000000001', 'Chain A2'),
  ('20000000-0000-0000-0000-000000000222', '20000000-0000-0000-0000-000000000002', 'Chain B1');

insert into public.activities (id, user_id, bike_id, strava_activity_id, name, distance_meters, started_at)
values
  ('10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 101, 'Before first mark', 1000, '2026-10-23 11:00:00+00'),
  ('10000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 102, 'First mark', 1000, '2026-10-23 12:00:00+00'),
  ('10000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 103, 'After first mark', 1000, '2026-10-23 13:00:00+00'),
  ('10000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 104, 'Second mark', 1000, '2026-10-23 14:00:00+00'),
  ('10000000-0000-0000-0000-000000000105', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 105, 'Tie before mark', 1000, '2026-10-23 15:00:00+00'),
  ('10000000-0000-0000-0000-000000000106', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 106, 'Tie mark', 1000, '2026-10-23 15:00:00+00'),
  ('10000000-0000-0000-0000-000000000107', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 107, 'Tie after mark', 1000, '2026-10-23 15:00:00+00'),
  ('10000000-0000-0000-0000-000000000108', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 108, 'Moved mark', 1000, '2026-10-23 16:00:00+00'),
  ('10000000-0000-0000-0000-000000000109', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 109, 'After moved mark', 1000, '2026-10-23 17:00:00+00'),
  ('10000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 110, 'Hidden mark', 1000, '2026-10-23 18:00:00+00'),
  ('10000000-0000-0000-0000-000000000111', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 111, 'After hidden mark', 1000, '2026-10-23 19:00:00+00'),
  ('10000000-0000-0000-0000-000000000112', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 112, 'Deleted-chain mark', 1000, '2026-10-23 20:00:00+00'),
  ('10000000-0000-0000-0000-000000000113', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 113, 'After deleted-chain mark', 1000, '2026-10-23 21:00:00+00'),
  ('10000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000012', 201, 'Other bike before mark', 1000, '2026-10-23 10:00:00+00'),
  ('10000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000012', 202, 'Other bike mark', 1000, '2026-10-23 10:30:00+00'),
  ('10000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000012', 203, 'Other bike after mark', 1000, '2026-10-23 11:30:00+00'),
  ('20000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000022', 301, 'Other user ride', 1000, '2026-10-23 12:00:00+00'),
  ('20000000-0000-0000-0000-000000000302', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000022', 302, 'Other user unmarked ride', 1000, '2026-10-23 13:00:00+00');

insert into public.chain_waxing_marks (user_id, activity_id, chain_id)
values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000111'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000112'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000106', '10000000-0000-0000-0000-000000000111'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000108', '10000000-0000-0000-0000-000000000112'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000112'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000112', '10000000-0000-0000-0000-000000000111'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000112'),
  ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000222');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is((select count(*)::integer from public.chain_waxing_marks), 7, 'user reads only their own waxing marks');
select is((select count(*)::integer from public.activities_with_chain), 16, 'user reads only their own derived activity rows');
select throws_ok(
  $$insert into public.chain_waxing_marks (user_id, activity_id) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000101')$$,
  '42501', null, 'user cannot insert a mark for another user'
);
select throws_ok(
  $$insert into public.chain_waxing_marks (user_id, activity_id, chain_id) values (auth.uid(), '10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000222')$$,
  '42501', null, 'direct mark inserts are forbidden even for the user own activity'
);
select throws_ok(
  $$insert into public.chain_waxing_marks (user_id, activity_id, chain_id) values (auth.uid(), '20000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000111')$$,
  '42501', null, 'direct mark inserts cannot reference another user activity'
);
select throws_ok(
  $$insert into public.chain_waxing_marks (user_id, activity_id, chain_id) values (auth.uid(), '10000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000112')$$,
  '42501', null, 'direct updates to an existing mark are forbidden'
);
select is(public.set_chain_waxing_mark('10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000222'), 'chain-not-found', 'function refuses another user chain');
select is(public.set_chain_waxing_mark('20000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000111'), 'activity-not-found', 'function refuses another user activity');

select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000101'), null::uuid, 'ride before its first mark has no chain despite a mark on another bike');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000102'), '10000000-0000-0000-0000-000000000111'::uuid, 'marked ride carries its selected chain');
select ok((select is_waxing_start from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000102'), 'marked ride is flagged as a waxing start');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000103'), '10000000-0000-0000-0000-000000000111'::uuid, 'later ride carries the first chain');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000104'), '10000000-0000-0000-0000-000000000112'::uuid, 'next mark changes the carried chain');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000105'), '10000000-0000-0000-0000-000000000112'::uuid, 'lower id at a tied time sorts before the mark');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000107'), '10000000-0000-0000-0000-000000000111'::uuid, 'higher id at a tied time sorts after the mark');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000201'), null::uuid, 'another bike has no chain before its own mark');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000203'), '10000000-0000-0000-0000-000000000112'::uuid, 'another bike carries only its own mark');
select is((select cumulative_distance_meters from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000103'), 3000::double precision, 'an isolated older ride includes all earlier rides on its bike');
select is((select cumulative_distance_meters from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000102'), 2000::double precision, 'cumulative distance includes the current ride');
select is((select cumulative_distance_meters from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000105'), 5000::double precision, 'lower ID at a tied time accrues before the next ride');
select is((select cumulative_distance_meters from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000106'), 6000::double precision, 'tied ride total includes earlier IDs and itself');
select is((select cumulative_distance_meters from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000107'), 7000::double precision, 'higher ID at a tied time accrues after lower IDs');
select is((select cumulative_distance_meters from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000201'), 1000::double precision, 'cumulative distance is isolated to the activity bike');

select lives_ok(
  $$insert into public.activities (user_id, bike_id, strava_activity_id, name, distance_meters, started_at)
    values (auth.uid(), '10000000-0000-0000-0000-000000000011', 104, 'Repaired ride', 1200, '2026-10-23 14:00:00+00')
    on conflict (user_id, strava_activity_id) do update
      set bike_id = excluded.bike_id, name = excluded.name,
          distance_meters = excluded.distance_meters, started_at = excluded.started_at$$,
  'repair-style upsert succeeds on an existing activity'
);
select is((select count(*)::integer from public.chain_waxing_marks where activity_id = '10000000-0000-0000-0000-000000000104'), 1, 'repair-style upsert preserves the activity waxing mark');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000104'), '10000000-0000-0000-0000-000000000112'::uuid, 'repaired marked ride still carries its chain');

select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000108'), '10000000-0000-0000-0000-000000000112'::uuid, 'marked anchor initially governs its bike');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000109'), '10000000-0000-0000-0000-000000000112'::uuid, 'ride after anchor initially carries its chain');
update public.activities
set bike_id = '10000000-0000-0000-0000-000000000012'
where id = '10000000-0000-0000-0000-000000000108';
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000109'), '10000000-0000-0000-0000-000000000111'::uuid, 'moving a marked ride stops it governing its old bike');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000108'), '10000000-0000-0000-0000-000000000112'::uuid, 'moved marked ride governs its new bike');

select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000111'), '10000000-0000-0000-0000-000000000112'::uuid, 'marked ride initially governs before being hidden');
update public.activities set bike_id = null where id = '10000000-0000-0000-0000-000000000110';
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000110'), null::uuid, 'activity without a bike has no derived chain');
select is((select cumulative_distance_meters from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000110'), null::double precision, 'activity without a bike has no cumulative distance');
select ok((select is_waxing_start from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000110'), 'hidden marked ride retains its waxing-start flag');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000111'), '10000000-0000-0000-0000-000000000111'::uuid, 'hidden mark stops governing its old bike');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.chain_waxing_marks), 1, 'second user reads only their own waxing marks');
select is((select count(*)::integer from public.activities_with_chain), 2, 'second user reads only their own derived activity rows');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

delete from public.chains where id = '10000000-0000-0000-0000-000000000111';
select is((select chain_id from public.chain_waxing_marks where activity_id = '10000000-0000-0000-0000-000000000106'), null::uuid, 'deleting a chain leaves its mark with a null chain');
select ok((select is_waxing_start from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000106'), 'mark with a deleted chain remains flagged');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000107'), null::uuid, 'rides after a deleted-chain mark show no chain');
select is((select chain_name from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000107'), null::text, 'rides after a deleted-chain mark have no chain name');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000113'), null::uuid, 'deleted-chain mark prevents fallback to an earlier chain');

delete from public.activities where id = '10000000-0000-0000-0000-000000000202';
select is((select count(*)::integer from public.chain_waxing_marks where activity_id = '10000000-0000-0000-0000-000000000202'), 0, 'deleting an activity cascades to its mark');
select is((select chain_id from public.activities_with_chain where id = '10000000-0000-0000-0000-000000000203'), null::uuid, 'activity deletion removes its mark from the derived chain');

select * from finish();
rollback;