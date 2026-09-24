-- Stage 3 · profiles / duos / duo_members security tests (pgTAP)
--
-- Runs entirely inside one transaction and rolls back: no data is left behind.
-- Locally: `npx supabase test db`. Against a linked project:
-- `npx supabase test db --linked`. See docs/DATABASE.md.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(51);

-- pgTAP keeps its state in temp tables created by the current role; let the
-- simulated `authenticated` / `anon` roles write to them.
grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

-- Fixtures: four auth users. The trigger must create their profiles.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.lockedin', '{"display_name":"Brendon","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a000-00000000000b', 'b@test.lockedin', '{"display_name":"  Lucas  ","timezone":"Europe/London"}'),
  ('00000000-0000-4000-a000-00000000000c', 'c@test.lockedin', '{"timezone":"Not/AZone"}'),
  ('00000000-0000-4000-a000-00000000000d', 'd@test.lockedin', '{"display_name":"Dora"}');

select is(
  (select count(*)::int from public.profiles where id::text like '00000000-0000-4000-a000-%'),
  4, 'trigger creates one profile per new auth user');
select is(
  (select display_name || '|' || timezone from public.profiles where id = '00000000-0000-4000-a000-00000000000a'),
  'Brendon|America/Sao_Paulo', 'profile takes display_name and timezone from signup metadata');
select is(
  (select display_name || '|' || timezone from public.profiles where id = '00000000-0000-4000-a000-00000000000c'),
  'c|UTC', 'missing name falls back to email local part, invalid timezone to UTC');
update public.profiles set updated_at = '2000-01-01' where id = '00000000-0000-4000-a000-00000000000d';
select is((select updated_at from public.profiles where id = '00000000-0000-4000-a000-00000000000d'), now(),
  'updated_at is always set by the database on update');

-- ---------------------------------------------------------------- anon ----
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.duos', '42501', null, 'anon cannot read duos');
select throws_ok('select public.create_duo()', '42501', null, 'anon cannot call create_duo');
select throws_ok($$select public.join_duo('LKD-AAAAAA')$$, '42501', null, 'anon cannot call join_duo');
select throws_ok('select * from public.duo_members', '42501', null, 'anon cannot read duo_members');
select throws_ok('select public.leave_duo()', '42501', null, 'anon cannot call leave_duo');
select throws_ok('select private.current_duo_id()', '42501', null, 'anon cannot use the private schema');

-- ------------------------------------------------------------- user A ----
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'A sees only their own profile before a duo');
select lives_ok($$update public.profiles set display_name = 'Brendon C' where id = '00000000-0000-4000-a000-00000000000a'$$,
  'A can update own profile');
select is((select display_name from public.profiles where id = '00000000-0000-4000-a000-00000000000a'),
  'Brendon C', 'A''s update is stored');
select throws_ok($$update public.profiles set id = gen_random_uuid() where id = '00000000-0000-4000-a000-00000000000a'$$,
  '42501', null, 'A cannot change their profile id');
select lives_ok($$update public.profiles set display_name = 'hacked by A' where id = '00000000-0000-4000-a000-00000000000b'$$,
  'A''s update of B''s profile runs but matches no row (RLS)');
select throws_ok($$update public.profiles set created_at = now() where id = '00000000-0000-4000-a000-00000000000a'$$,
  '42501', null, 'A cannot write non-editable profile columns');
select throws_ok($$update public.profiles set timezone = 'Mars/Base' where id = '00000000-0000-4000-a000-00000000000a'$$,
  '22023', null, 'invalid timezone is rejected');
select throws_ok($$insert into public.duos (invite_code, created_by) values ('LKD-AAAAAA', '00000000-0000-4000-a000-00000000000a')$$,
  '42501', null, 'A cannot insert duos directly');
select throws_ok($$insert into public.duo_members (duo_id, user_id, seat) values (gen_random_uuid(), '00000000-0000-4000-a000-00000000000a', 1)$$,
  '42501', null, 'A cannot insert memberships directly');

create temp table t_code on commit drop as select invite_code from public.create_duo();
grant select on t_code to anon, authenticated;
select matches((select invite_code from t_code), '^LKD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$',
  'create_duo returns a readable LKD- code');
select throws_ok('select public.create_duo()', 'P0001', 'LI_ALREADY_IN_DUO', 'A cannot create a second duo');
select is((select count(*)::int from public.duo_members), 1, 'A sees their own membership (seat 1)');

-- ------------------------------------------------------------- user B ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

select is((select count(*)::int from public.duos), 0, 'B cannot see A''s duo before joining');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-a000-00000000000a'), 0,
  'B cannot see A''s profile before joining');
select lives_ok(format('select public.join_duo(%L)', lower(replace((select invite_code from t_code), '-', ' '))),
  'B joins with a lower-case, spaced code (normalised)');
select is((select count(*)::int from public.duos), 1, 'B now sees the duo');
select is((select count(*)::int from public.duo_members), 2, 'B sees both members');
select is((select display_name from public.profiles where id = '00000000-0000-4000-a000-00000000000a'),
  'Brendon C', 'B can read partner A''s profile');
select lives_ok($$update public.profiles set display_name = 'hacked by B' where id = '00000000-0000-4000-a000-00000000000a'$$,
  'B''s update of A''s profile runs but matches no row (RLS)');
select is((select display_name from public.profiles where id = '00000000-0000-4000-a000-00000000000a'),
  'Brendon C', 'B cannot change A''s profile');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.duos), 1, 'A sees the duo');
select is((select count(*)::int from public.duo_members), 2, 'A sees both members');
select is((select display_name from public.profiles where id = '00000000-0000-4000-a000-00000000000b'),
  'Lucas', 'A can read partner B''s profile (name trimmed by the trigger)');
select lives_ok($$update public.profiles set display_name = 'hacked by A' where id = '00000000-0000-4000-a000-00000000000b'$$,
  'A''s update of partner B''s profile runs but matches no row (RLS)');
select is((select display_name from public.profiles where id = '00000000-0000-4000-a000-00000000000b'),
  'Lucas', 'A cannot change partner B''s profile');

-- ------------------------------------------------------------- user C ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);

select throws_ok(format('select public.join_duo(%L)', (select invite_code from t_code)),
  'P0001', 'LI_DUO_FULL', 'C cannot become the third member');
select throws_ok($$select public.join_duo('LKD-ZZZZZZ')$$, 'P0001', 'LI_INVALID_CODE', 'unknown code is rejected');
select is((select count(*)::int from public.duos), 0, 'C (outsider) cannot see A/B duo');
select is((select count(*)::int from public.duo_members), 0, 'C (outsider) cannot see A/B members');
select is((select count(*)::int from public.profiles), 1, 'C sees only their own profile');
select lives_ok($$update public.profiles set display_name = 'hacked by C' where id = '00000000-0000-4000-a000-00000000000a'$$,
  'C''s update of A''s profile runs but matches no row (RLS)');
select lives_ok($$update public.profiles set display_name = 'hacked by C' where id = '00000000-0000-4000-a000-00000000000b'$$,
  'C''s update of B''s profile runs but matches no row (RLS)');

-- C creates a duo; B (already in a duo) cannot join it.
create temp table t_code_c on commit drop as select invite_code from public.create_duo();
grant select on t_code_c to anon, authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
select throws_ok(format('select public.join_duo(%L)', (select invite_code from t_code_c)),
  'P0001', 'LI_ALREADY_IN_DUO', 'a user already in a duo cannot join another');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
select throws_ok(format('select public.join_duo(%L)', (select invite_code from t_code_c)),
  'P0001', 'LI_ALREADY_IN_DUO', 'A (creator of a duo) cannot join a second duo');

-- ----------------------------------------------- schema-level backstops ----
reset role;
select is((select display_name from public.profiles where id = '00000000-0000-4000-a000-00000000000a'),
  'Brendon C', 'A''s profile is unchanged after B and C tried to edit it');
select is((select display_name from public.profiles where id = '00000000-0000-4000-a000-00000000000b'),
  'Lucas', 'B''s profile is unchanged after A and C tried to edit it');
select throws_ok(
  format($$insert into public.duo_members (duo_id, user_id, seat)
    select d.id, '00000000-0000-4000-a000-00000000000d', 2 from public.duos d where d.invite_code = %L$$,
    (select invite_code from t_code)),
  '23505', null, 'schema rejects a second occupant of seat 2 even without the RPC');
select throws_ok(
  format($$insert into public.duo_members (duo_id, user_id, seat)
    select d.id, '00000000-0000-4000-a000-00000000000d', 3 from public.duos d where d.invite_code = %L$$,
    (select invite_code from t_code)),
  '23514', null, 'schema rejects a third seat');

-- ------------------------------------------------------ leave the duo ----
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
select lives_ok('select public.leave_duo()', 'B can leave the duo');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.duo_members), 0, 'leaving ends the duo for both members');

select * from finish();
rollback;
