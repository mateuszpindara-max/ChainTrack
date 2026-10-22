begin;

select plan(14);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'chains-user-a@example.test', '', now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'chains-user-b@example.test', '', now());

insert into public.chains (id, user_id, name, starting_distance_meters)
values
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Winter', 0),
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'Other chain', 100000000);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is((select count(*)::integer from public.chains), 1, 'user reads only their own chains');
select throws_ok(
  $$insert into public.chains (user_id, name) values ('20000000-0000-0000-0000-000000000002', 'Foreign chain')$$,
  '42501', null, 'user cannot insert a chain for another user'
);
update public.chains set name = 'Changed' where user_id = '20000000-0000-0000-0000-000000000002';
delete from public.chains where user_id = '20000000-0000-0000-0000-000000000002';
set local role postgres;
select is(
  (select name from public.chains where id = '20000000-0000-0000-0000-000000000022'),
  'Other chain', 'user cannot update another user chain'
);
select is(
  (select count(*)::integer from public.chains where id = '20000000-0000-0000-0000-000000000022'),
  1, 'user cannot delete another user chain'
);
set local role authenticated;
select throws_ok(
  $$insert into public.chains (user_id, name) values (auth.uid(), 'wINTER')$$,
  '23505', null, 'same user cannot reuse a chain name with different casing'
);
select throws_ok(
  $$insert into public.chains (user_id, name) values (auth.uid(), '')$$,
  '23514', null, 'blank chain names are rejected'
);
select throws_ok(
  $$insert into public.chains (user_id, name) values (auth.uid(), ' Untrimmed')$$,
  '23514', null, 'untrimmed chain names are rejected'
);
select throws_ok(
  $$insert into public.chains (user_id, name) values (auth.uid(), repeat('x', 61))$$,
  '23514', null, 'chain names longer than 60 characters are rejected'
);
select throws_ok(
  $$insert into public.chains (user_id, name, starting_distance_meters) values (auth.uid(), 'Negative', -1)$$,
  '23514', null, 'negative starting mileage is rejected'
);
select throws_ok(
  $$insert into public.chains (user_id, name, starting_distance_meters) values (auth.uid(), 'Above cap', 100000001)$$,
  '23514', null, 'starting mileage above the cap is rejected'
);
select lives_ok(
  $$insert into public.chains (user_id, name, starting_distance_meters) values (auth.uid(), repeat('x', 60), 0)$$,
  '60-character name and zero mileage are accepted'
);
select lives_ok(
  $$insert into public.chains (user_id, name, starting_distance_meters) values (auth.uid(), 'Maximum mileage', 100000000)$$,
  'maximum starting mileage is accepted'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.chains), 1, 'second user reads only their own chains');
select lives_ok(
  $$insert into public.chains (user_id, name) values (auth.uid(), 'winter')$$,
  'a second user can reuse the same chain name'
);

select * from finish();
rollback;