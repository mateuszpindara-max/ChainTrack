begin;

select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('31000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lifecycle-a@example.test', '', now()),
  ('32000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'lifecycle-b@example.test', '', now());

insert into public.bikes (id, user_id, strava_gear_id, name) values
  ('31000000-0000-0000-0000-000000000011', '31000000-0000-0000-0000-000000000001', 'lifecycle-a', 'Bike A'),
  ('31000000-0000-0000-0000-000000000012', '31000000-0000-0000-0000-000000000001', 'lifecycle-b', 'Bike B'),
  ('32000000-0000-0000-0000-000000000022', '32000000-0000-0000-0000-000000000002', 'lifecycle-c', 'Bike C');

insert into public.chains (id, user_id, name, starting_distance_meters) values
  ('31000000-0000-0000-0000-000000000111', '31000000-0000-0000-0000-000000000001', 'Chain A', 1000),
  ('31000000-0000-0000-0000-000000000112', '31000000-0000-0000-0000-000000000001', 'Chain B', 0),
  ('32000000-0000-0000-0000-000000000222', '32000000-0000-0000-0000-000000000002', 'Chain C', 0);

insert into public.activities (id, user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values
  ('31000000-0000-0000-0000-000000000101', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000011', 3101, 'First', 1000, '2026-01-01 10:00+00'),
  ('31000000-0000-0000-0000-000000000102', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000011', 3102, 'Before stop', 2000, '2026-01-02 11:00+00'),
  ('31000000-0000-0000-0000-000000000103', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000011', 3103, 'First stopped interval', 4000, '2026-01-02 13:00+00'),
  ('31000000-0000-0000-0000-000000000104', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000011', 3104, 'First reattach', 3000, '2026-01-03 10:00+00'),
  ('31000000-0000-0000-0000-000000000105', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000011', 3105, 'Second stopped interval', 5000, '2026-01-04 13:00+00'),
  ('31000000-0000-0000-0000-000000000106', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000011', 3106, 'Second reattach', 6000, '2026-01-05 10:00+00'),
  ('31000000-0000-0000-0000-000000000107', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000011', 3107, 'At first stop', 8000, '2026-01-02 12:00+00'),
  ('31000000-0000-0000-0000-000000000201', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000012', 3201, 'Bike B first', 10000, '2026-01-01 10:00+00'),
  ('31000000-0000-0000-0000-000000000202', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000012', 3202, 'Bike B reattach', 20000, '2026-01-03 10:00+00'),
  ('31000000-0000-0000-0000-000000000203', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000012', 3203, 'Bike B second reattach', 30000, '2026-01-05 10:00+00'),
  ('32000000-0000-0000-0000-000000000301', '32000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000022', 3301, 'Foreign', 1000, '2026-01-01 10:00+00');

insert into public.chain_waxing_marks (activity_id, user_id, chain_id) values
  ('31000000-0000-0000-0000-000000000101', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000111'),
  ('31000000-0000-0000-0000-000000000104', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000111'),
  ('31000000-0000-0000-0000-000000000106', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000111'),
  ('31000000-0000-0000-0000-000000000201', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000111'),
  ('31000000-0000-0000-0000-000000000202', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000111'),
  ('31000000-0000-0000-0000-000000000203', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000111'),
  ('32000000-0000-0000-0000-000000000301', '32000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000222');

insert into public.chain_stop_events (user_id, chain_id, stopped_at) values
  ('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000111', '2026-01-02 12:00+00'),
  ('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000111', '2026-01-04 12:00+00'),
  ('32000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000222', '2026-01-02 12:00+00');

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);

select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000103'), null::uuid, 'first stopped interval is unattributed');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000105'), null::uuid, 'second stopped interval is unattributed');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000104'), '31000000-0000-0000-0000-000000000111'::uuid, 'reattachment includes the marked ride');
select is((select governing_mark_activity_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000105'), null::uuid, 'stopped ride has no governing mark');
select is((select cycle_ended_at from public.chain_cycles where mark_activity_id = '31000000-0000-0000-0000-000000000101'), '2026-01-02 12:00+00'::timestamptz, 'stop closes the cycle');
select is((select count(*)::integer from public.chain_cycles where is_open), 2, 'two bikes may each have an open cycle');
select is((select count(*)::integer from public.bike_chain_status), 2, 'both bikes report their open chain');
select is((select total_distance_meters from public.chain_metrics where id = '31000000-0000-0000-0000-000000000111'), 81000::double precision, 'total includes starting distance and both bikes, excluding stopped intervals');
select is((select active_distance_meters from public.chain_metrics where id = '31000000-0000-0000-0000-000000000111'), 36000::double precision, 'active distance sums both open cycles');
select is((select completed_cycle_count from public.chain_metrics where id = '31000000-0000-0000-0000-000000000111'), 4::bigint, 'completed cycles are counted');
select is((select average_completed_distance_meters from public.chain_metrics where id = '31000000-0000-0000-0000-000000000111'), 11000::double precision, 'average uses completed cycles only');
select is((select average_completed_distance_meters from public.chain_metrics where id = '31000000-0000-0000-0000-000000000112'), null::double precision, 'average remains null with fewer than two completed cycles');
select is((select count(*)::integer from public.chain_stop_events), 2, 'stop events are owner scoped');
select is((select count(*)::integer from public.chain_metrics), 2, 'metrics are owner scoped');
select is((select count(*)::integer from public.chain_cycles), 6, 'cycles are owner scoped');
select throws_ok($$update public.chains set threshold_km = 0 where id = '31000000-0000-0000-0000-000000000111'$$, '23514', null, 'zero threshold is rejected');
select throws_ok($$update public.chains set threshold_km = 100000.1 where id = '31000000-0000-0000-0000-000000000111'$$, '23514', null, 'threshold above maximum is rejected');
select lives_ok($$update public.chains set threshold_km = 100000 where id = '31000000-0000-0000-0000-000000000111'$$, 'maximum threshold is accepted');
select throws_ok($$insert into public.chain_stop_events (user_id, chain_id) values (auth.uid(), '31000000-0000-0000-0000-000000000111')$$, '42501', null, 'direct stop writes are forbidden');
select throws_ok($$delete from public.chain_waxing_marks where activity_id = '31000000-0000-0000-0000-000000000101'$$, '42501', null, 'direct mark deletes are forbidden');
select is(public.stop_chain('32000000-0000-0000-0000-000000000222'), 'chain-not-found', 'cannot stop a foreign chain');

reset role;
insert into public.bikes (id, user_id, strava_gear_id, name) values
  ('31000000-0000-0000-0000-000000000013', '31000000-0000-0000-0000-000000000001', 'lifecycle-ties', 'Ties');
insert into public.activities (id, user_id, bike_id, strava_activity_id, name, distance_meters, started_at) values
  ('31000000-0000-0000-0000-000000000401', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000013', 3401, 'Tie first', 1000, '2026-01-07 10:00+00'),
  ('31000000-0000-0000-0000-000000000402', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000013', 3402, 'Null boundary', 2000, '2026-01-07 10:00+00'),
  ('31000000-0000-0000-0000-000000000403', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000013', 3403, 'Tie after', 3000, '2026-01-07 10:00+00'),
  ('31000000-0000-0000-0000-000000000404', '31000000-0000-0000-0000-000000000001', null, 3404, 'Bike-less mark', 4000, '2026-01-08 10:00+00');
insert into public.chain_waxing_marks (activity_id, user_id, chain_id) values
  ('31000000-0000-0000-0000-000000000401', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000112'),
  ('31000000-0000-0000-0000-000000000402', '31000000-0000-0000-0000-000000000001', null),
  ('31000000-0000-0000-0000-000000000404', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000112');
set local role authenticated;
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000401'), '31000000-0000-0000-0000-000000000112'::uuid, 'lower tied activity id starts the cycle');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000403'), null::uuid, 'null mark at tied time ends attribution by activity id');
select is((select count(*)::integer from public.chain_cycles where mark_activity_id = '31000000-0000-0000-0000-000000000404'), 0, 'bike-less mark is not a cycle anchor');
select is((select count(*)::integer from public.chain_cycles where mark_activity_id = '31000000-0000-0000-0000-000000000402'), 0, 'null-chain mark is a boundary but not a cycle');
select is((select average_completed_distance_meters from public.chain_metrics where id = '31000000-0000-0000-0000-000000000112'), null::double precision, 'one completed cycle has no average');
select is((select count(*)::integer from (select bike_id from public.chain_cycles where is_open group by bike_id having count(*) > 1) as duplicates), 0, 'each bike has at most one open cycle');

select is(public.set_chain_waxing_mark('31000000-0000-0000-0000-000000000102', '31000000-0000-0000-0000-000000000111'), 'saved', 'historical mark before stop can be inserted');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000103'), null::uuid, 'historical mark before stop does not reopen the stopped interval');
select is(public.set_chain_waxing_mark('31000000-0000-0000-0000-000000000107', '31000000-0000-0000-0000-000000000111'), 'saved', 'historical mark at stop can be inserted');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000103'), null::uuid, 'mark at stop does not reattach');
select is(public.set_chain_waxing_mark('31000000-0000-0000-0000-000000000103', '31000000-0000-0000-0000-000000000111'), 'saved', 'mark after stop reattaches');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000103'), '31000000-0000-0000-0000-000000000111'::uuid, 'post-stop mark is attributed immediately');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000105'), null::uuid, 'historical correction preserves the later stop');
select is(public.set_chain_waxing_mark('31000000-0000-0000-0000-000000000106', '31000000-0000-0000-0000-000000000112'), 'saved', 'reattachment may be reassigned');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000106'), '31000000-0000-0000-0000-000000000112'::uuid, 'reassigned ride uses the new chain');
select is(public.set_chain_waxing_mark('31000000-0000-0000-0000-000000000106', null), 'saved', 'reattachment may be deleted');
select is((select chain_id from public.activities_with_chain where id = '31000000-0000-0000-0000-000000000106'), null::uuid, 'deleting reattachment does not erase the stop');
select is(public.stop_chain('31000000-0000-0000-0000-000000000111'), 'saved', 'active chain can be stopped');
select is(public.stop_chain('31000000-0000-0000-0000-000000000111'), 'saved', 'stopping again is idempotent');
select is((select count(*)::integer from public.chain_stop_events where chain_id = '31000000-0000-0000-0000-000000000111'), 3, 'retry creates only one additional stop');
select is((select status from public.chain_metrics where id = '31000000-0000-0000-0000-000000000111'), 'stopped', 'chain reports stopped after all cycles close');
select is((select count(*)::integer from public.bike_chain_status), 0, 'stopping clears bike status');

insert into public.activities (id, user_id, bike_id, strava_activity_id, name, distance_meters, started_at)
values ('31000000-0000-0000-0000-000000000501', auth.uid(), '31000000-0000-0000-0000-000000000011', 3501, 'New attachment', 30000, clock_timestamp());
select is(public.set_chain_waxing_mark('31000000-0000-0000-0000-000000000501', '31000000-0000-0000-0000-000000000111'), 'saved', 'mark after the new stop reattaches');
select is((select active_distance_meters from public.chain_metrics where id = '31000000-0000-0000-0000-000000000111'), 30000::double precision, 'marked ride immediately counts in the new active cycle');
select is(public.stop_chain('31000000-0000-0000-0000-000000000111'), 'saved', 'reattachment permits a subsequent stop');
select is((select count(*)::integer from public.chain_stop_events where chain_id = '31000000-0000-0000-0000-000000000111'), 4, 'subsequent stop preserves all earlier events');

select * from finish();
rollback;