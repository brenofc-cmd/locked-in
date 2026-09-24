-- Stage 4 · routine_items / daily_tasks tests (pgTAP)
--
-- Generation, catch-up, timezone, status, snapshot history, RLS for owner /
-- partner / outsider / anon, spoofing and constraints. One transaction,
-- rolled back. How to run: docs/DATABASE.md → "Tests".
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(71);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

-- Fixtures ------------------------------------------------------------------
-- A (UTC+14) and B (UTC-11) form a duo; C is an outsider. Opposite timezones
-- prove that "today" comes from profiles.timezone, not from UTC.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-b000-00000000000a', 'a@test4.lockedin', '{"display_name":"Ana","timezone":"Pacific/Kiritimati"}'),
  ('00000000-0000-4000-b000-00000000000b', 'b@test4.lockedin', '{"display_name":"Beto","timezone":"Pacific/Pago_Pago"}'),
  ('00000000-0000-4000-b000-00000000000c', 'c@test4.lockedin', '{"display_name":"Caio","timezone":"UTC"}');
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-b000-0000000000d0', 'LKD-TST4AB', '00000000-0000-4000-b000-00000000000a');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-b000-0000000000d0', '00000000-0000-4000-b000-00000000000a', 1),
  ('00000000-0000-4000-b000-0000000000d0', '00000000-0000-4000-b000-00000000000b', 2);

-- Scratch values shared across roles: k -> uuid / date.
create temp table v (k text primary key, id uuid, d date);
grant all on v to anon, authenticated;
insert into v (k, d) values
  ('a_today', (now() at time zone 'Pacific/Kiritimati')::date),
  ('b_today', (now() at time zone 'Pacific/Pago_Pago')::date);

create function pg_temp.today_a() returns date language sql as $$ select d from v where k = 'a_today' $$;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.dow(p date) returns smallint language sql as $$ select extract(isodow from p)::smallint $$;
grant execute on function pg_temp.today_a(), pg_temp.rid(text), pg_temp.dow(date) to anon, authenticated;

-- --------------------------------------------------------------- anon ----
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.routine_items', '42501', null, 'anon cannot read routine_items');
select throws_ok('select * from public.daily_tasks', '42501', null, 'anon cannot read daily_tasks');
select throws_ok('select public.ensure_my_daily_tasks()', '42501', null, 'anon cannot call ensure_my_daily_tasks');
select throws_ok('select public.my_today()', '42501', null, 'anon cannot call my_today');
select throws_ok($$select public.create_routine_item('x', array[1]::smallint[])$$, '42501', null, 'anon cannot create routines');

-- ------------------------------------------------------ timezone (A/B) ----
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000b","role":"authenticated"}', true);
select is(public.my_today(), (select d from v where k = 'b_today'), 'B''s today is computed in Pacific/Pago_Pago');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000a","role":"authenticated"}', true);
select is(public.my_today(), pg_temp.today_a(), 'A''s today is computed in Pacific/Kiritimati');
select ok(pg_temp.today_a() - (select d from v where k = 'b_today') between 1 and 2,
  'the same instant is a different local day for A and B (not UTC)');

-- ------------------------------------------------- generation (as A) ----
insert into v (k, id) select 'wake', public.create_routine_item('  Wake Up ', array[1,2,3,4,5,6,7]::smallint[], 'morning', '06:00');
select is((select start_date from public.routine_items where id = pg_temp.rid('wake')), pg_temp.today_a(),
  'a new routine starts on the owner''s today');
select is((select title from public.routine_items where id = pg_temp.rid('wake')), 'Wake Up', 'titles are trimmed');
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('wake')), 1,
  'a routine created today generates today''s task, nothing before start_date');
select is((select task_date from public.daily_tasks where routine_item_id = pg_temp.rid('wake')), pg_temp.today_a(),
  'the generated task is dated the owner''s today');

insert into v (k, id) select 'nottoday', public.create_routine_item('Tomorrow only', array[pg_temp.dow(pg_temp.today_a() + 1)], 'body');
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('nottoday')), 0,
  'a weekday that is not scheduled generates nothing');

select lives_ok('select public.ensure_my_daily_tasks(); select public.ensure_my_daily_tasks();', 'ensure can run repeatedly');
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('wake')), 1,
  'repeating ensure does not duplicate');
select throws_ok(
  format($$insert into public.daily_tasks (routine_item_id, task_date, title) values (%L, %L, 'dup')$$,
         pg_temp.rid('wake'), pg_temp.today_a()),
  '23505', null, 'the database allows one occurrence per routine per date');

-- Catch-up: last materialised 4 days ago -> the 3 skipped days and today appear.
insert into public.routine_items (title, days_of_week, category, start_date)
  values ('Catchup', array[1,2,3,4,5,6,7]::smallint[], 'work_study', pg_temp.today_a() - 6);
insert into v (k, id) select 'catchup', id from public.routine_items where title = 'Catchup';
update public.routine_items set materialized_through = pg_temp.today_a() - 4 where id = pg_temp.rid('catchup');
select public.ensure_my_daily_tasks();
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('catchup')), 4,
  'days the app was not opened are materialised on the next open');
select is((select min(task_date) from public.daily_tasks where routine_item_id = pg_temp.rid('catchup')), pg_temp.today_a() - 3,
  'catch-up starts the day after materialized_through');
select is((select materialized_through from public.routine_items where id = pg_temp.rid('catchup')), pg_temp.today_a(),
  'materialized_through advances to today');

-- Weekday correctness over two weeks.
insert into public.routine_items (title, days_of_week, start_date)
  values ('Weekly', array[pg_temp.dow(pg_temp.today_a())], pg_temp.today_a() - 13);
insert into v (k, id) select 'weekly', id from public.routine_items where title = 'Weekly';
select public.ensure_my_daily_tasks();
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('weekly')), 2,
  'a one-weekday routine generates exactly the matching dates over two weeks');
select ok((select bool_and(extract(isodow from task_date)::smallint = pg_temp.dow(pg_temp.today_a()))
           from public.daily_tasks where routine_item_id = pg_temp.rid('weekly')),
  'generated dates fall on the scheduled ISO weekday');

-- end_date stops generation.
insert into public.routine_items (title, days_of_week, start_date)
  values ('Ended', array[1,2,3,4,5,6,7]::smallint[], pg_temp.today_a() - 6);
insert into v (k, id) select 'ended', id from public.routine_items where title = 'Ended';
update public.routine_items set end_date = pg_temp.today_a() - 2 where id = pg_temp.rid('ended');
select public.ensure_my_daily_tasks();
select is((select max(task_date) from public.daily_tasks where routine_item_id = pg_temp.rid('ended')), pg_temp.today_a() - 2,
  'a routine that ended generates nothing after end_date');
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('ended')), 5,
  'an ended routine still has every occurrence up to end_date');

-- ------------------------------------------------ constraints (as A) ----
insert into v (k, id) select 'norm', public.create_routine_item('Norm', array[3,1,3]::smallint[]);
select is((select days_of_week from public.routine_items where id = pg_temp.rid('norm')), array[1,3]::smallint[],
  'weekdays are sorted and de-duplicated');
select throws_ok($$select public.create_routine_item('Bad', array[8]::smallint[])$$, '23514', null, 'weekday 8 is rejected');
select throws_ok($$select public.create_routine_item('Bad', array[0]::smallint[])$$, '23514', null, 'weekday 0 is rejected (ISO 1..7 only)');
select throws_ok($$select public.create_routine_item('Bad', array[]::smallint[])$$, '23502', null, 'a routine needs at least one day (empty list normalises to null and is rejected)');
select throws_ok($$select public.create_routine_item('   ', array[1]::smallint[])$$, '23514', null, 'blank titles are rejected');
select throws_ok($$select public.create_routine_item('Bad', array[1]::smallint[], 'sleep')$$, '23514', null, 'unknown categories are rejected');
select throws_ok(format($$update public.routine_items set end_date = start_date - 5 where id = %L$$, pg_temp.rid('norm')),
  '23514', null, 'end_date before start_date is rejected');

-- ------------------------------------------------ one-off + status (A) ----
insert into public.daily_tasks (title, category) values ('Finish Physics assignment', 'work_study');
insert into v (k, id) select 'oneoff', id from public.daily_tasks where title = 'Finish Physics assignment';
select is((select task_date || '|' || status || '|' || coalesce(routine_item_id::text, 'none') from public.daily_tasks where id = pg_temp.rid('oneoff')),
  pg_temp.today_a() || '|pending|none', 'a one-off defaults to today, pending, no routine');

update public.daily_tasks set status = 'completed' where id = pg_temp.rid('oneoff');
select ok((select completed_at is not null and skipped_at is null from public.daily_tasks where id = pg_temp.rid('oneoff')),
  'completing sets completed_at (database-owned)');
update public.daily_tasks set status = 'pending' where id = pg_temp.rid('oneoff');
select ok((select completed_at is null and skipped_at is null from public.daily_tasks where id = pg_temp.rid('oneoff')),
  'undo clears completed_at');
update public.daily_tasks set status = 'skipped', skip_reason = 'Sick' where id = pg_temp.rid('oneoff');
select ok((select skipped_at is not null and completed_at is null and skip_reason = 'Sick' from public.daily_tasks where id = pg_temp.rid('oneoff')),
  'skipping sets skipped_at and keeps the reason');
update public.daily_tasks set status = 'pending' where id = pg_temp.rid('oneoff');
select ok((select skipped_at is null and skip_reason is null from public.daily_tasks where id = pg_temp.rid('oneoff')),
  'unskip returns to a clean pending row');
select throws_ok(format($$update public.daily_tasks set completed_at = now() where id = %L$$, pg_temp.rid('oneoff')),
  '42501', null, 'clients cannot write completed_at directly');
select throws_ok(format($$update public.daily_tasks set status = 'missed' where id = %L$$, pg_temp.rid('oneoff')),
  '23514', null, 'missed is not a stored status');
select throws_ok(format($$update public.daily_tasks set task_date = task_date + 1 where id = %L$$, pg_temp.rid('oneoff')),
  '42501', null, 'task_date is not editable');

-- ---------------------------------------------- history / snapshots (A) ----
select lives_ok(format($$select public.update_routine_item(%L, 'Catchup Renamed', array[1,2,3,4,5,6,7]::smallint[], 'work_study', null, true, '', false)$$, pg_temp.rid('catchup')),
  'Today and future: owner updates a routine');
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('catchup') and task_date < pg_temp.today_a() and title = 'Catchup'), 3,
  'past occurrences keep their original title (snapshot)');
select is((select title from public.daily_tasks where routine_item_id = pg_temp.rid('catchup') and task_date = pg_temp.today_a()), 'Catchup Renamed',
  'today''s occurrence takes the new title');

update public.daily_tasks set title = 'Wake Up Late', scheduled_time = '09:00'
  where routine_item_id = pg_temp.rid('wake') and task_date = pg_temp.today_a();
select is((select title || ' ' || scheduled_time from public.routine_items where id = pg_temp.rid('wake')), 'Wake Up 06:00:00',
  'Today only: editing the occurrence leaves the template unchanged');

-- Days change: today removed while pending -> occurrence removed.
select public.update_routine_item(pg_temp.rid('wake'), 'Wake Up', array[pg_temp.dow(pg_temp.today_a() + 1)], 'morning', '06:00', true, '', false);
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('wake') and task_date = pg_temp.today_a()), 0,
  'Today and future: a pending occurrence leaves Today when today is no longer scheduled');
-- Days change: today added -> occurrence appears.
select public.update_routine_item(pg_temp.rid('wake'), 'Wake Up', array[1,2,3,4,5,6,7]::smallint[], 'morning', '06:00', true, '', false);
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('wake') and task_date = pg_temp.today_a()), 1,
  'Today and future: adding today''s weekday puts the task on Today');
-- Completed occurrence survives a days change.
update public.daily_tasks set status = 'completed' where routine_item_id = pg_temp.rid('catchup') and task_date = pg_temp.today_a();
select public.update_routine_item(pg_temp.rid('catchup'), 'Catchup Renamed', array[pg_temp.dow(pg_temp.today_a() + 1)], 'work_study', null, true, '', false);
select is((select status from public.daily_tasks where routine_item_id = pg_temp.rid('catchup') and task_date = pg_temp.today_a()), 'completed',
  'Today and future: a completed occurrence is kept with its status');

-- Archive.
select lives_ok(format('select public.archive_routine_item(%L)', pg_temp.rid('weekly')), 'owner archives a routine');
select is((select end_date from public.routine_items where id = pg_temp.rid('weekly')), pg_temp.today_a() - 1,
  'archiving ends the routine yesterday');
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('weekly')), 1,
  'archiving removes today''s pending occurrence and keeps history');
select public.ensure_my_daily_tasks();
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('weekly')), 1,
  'an archived routine is not regenerated');
select throws_ok(format('select public.archive_routine_item(%L)', pg_temp.rid('weekly')), 'P0002', 'LI_NOT_FOUND',
  'an archived routine cannot be archived again');
select throws_ok(format('delete from public.routine_items where id = %L', pg_temp.rid('wake')), '42501', null,
  'routines cannot be hard-deleted through the API');

-- Reorder.
select public.reorder_routine_items(array[pg_temp.rid('norm'), pg_temp.rid('wake')]);
select is((select array_agg(sort_order order by sort_order) from public.routine_items where id in (pg_temp.rid('norm'), pg_temp.rid('wake'))),
  array[10, 20], 'reorder persists sort_order 10, 20');
select is((select sort_order from public.daily_tasks where routine_item_id = pg_temp.rid('wake') and task_date = pg_temp.today_a()), 20,
  'today''s occurrence follows the new order');

-- Private item for the partner checks.
insert into v (k, id) select 'private', public.create_routine_item('Private thing', array[1,2,3,4,5,6,7]::smallint[], 'night', null, false);

-- ------------------------------------------------------------ B partner ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000b","role":"authenticated"}', true);
insert into v (k, id) select 'b_item', public.create_routine_item('Beto run', array[1,2,3,4,5,6,7]::smallint[]);
select ok((select count(*) > 0 from public.routine_items where id = pg_temp.rid('wake')), 'partner reads a shared routine');
select ok((select count(*) > 0 from public.daily_tasks where routine_item_id = pg_temp.rid('wake')), 'partner reads a shared task');
select is((select count(*)::int from public.routine_items where id = pg_temp.rid('private')), 0, 'partner cannot read a private routine');
select is((select count(*)::int from public.daily_tasks where routine_item_id = pg_temp.rid('private')), 0, 'partner cannot read a private task');
update public.daily_tasks set status = 'completed', title = 'hacked' where routine_item_id = pg_temp.rid('wake');
delete from public.daily_tasks where routine_item_id = pg_temp.rid('wake');
update public.routine_items set title = 'hacked' where id = pg_temp.rid('wake');
select throws_ok(format($$select public.update_routine_item(%L, 'hacked', array[1]::smallint[], 'custom', null, true, '', false)$$, pg_temp.rid('wake')),
  'P0002', 'LI_NOT_FOUND', 'partner cannot edit a routine through the function');
select throws_ok(format('select public.archive_routine_item(%L)', pg_temp.rid('wake')), 'P0002', 'LI_NOT_FOUND',
  'partner cannot archive a routine');
select throws_ok($$insert into public.daily_tasks (owner_id, title) values ('00000000-0000-4000-b000-00000000000a', 'spoof')$$,
  '42501', null, 'partner cannot insert a task as the owner');

-- ------------------------------------------------------------ C outsider ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.routine_items where owner_id = '00000000-0000-4000-b000-00000000000a'), 0, 'outsider reads no routines');
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-b000-00000000000a'), 0, 'outsider reads no tasks');
update public.daily_tasks set status = 'skipped' where owner_id = '00000000-0000-4000-b000-00000000000a';
delete from public.daily_tasks where owner_id = '00000000-0000-4000-b000-00000000000a';
update public.routine_items set title = 'hacked' where owner_id = '00000000-0000-4000-b000-00000000000a';
select throws_ok($$insert into public.routine_items (owner_id, title, days_of_week, start_date) values ('00000000-0000-4000-b000-00000000000a', 'spoof', array[1]::smallint[], current_date)$$,
  '42501', null, 'outsider cannot insert a routine for someone else');

-- ------------------------------------------------------ A spoofing ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000a","role":"authenticated"}', true);
select throws_ok($$insert into public.routine_items (owner_id, title, days_of_week, start_date) values ('00000000-0000-4000-b000-00000000000b', 'spoof', array[1]::smallint[], current_date)$$,
  '42501', null, 'owner_id cannot be spoofed on routine_items');
select throws_ok($$insert into public.daily_tasks (owner_id, title) values ('00000000-0000-4000-b000-00000000000b', 'spoof')$$,
  '42501', null, 'owner_id cannot be spoofed on daily_tasks');
select throws_ok(format($$insert into public.daily_tasks (routine_item_id, task_date, title) values (%L, current_date + 30, 'link')$$, pg_temp.rid('b_item')),
  '23503', null, 'a task cannot point at another owner''s routine');

-- --------------------------------------------- backstops (superuser) ----
reset role;
select is((select title from public.daily_tasks where routine_item_id = pg_temp.rid('wake') and task_date = pg_temp.today_a()), 'Wake Up',
  'partner and outsider changes to A''s task had no effect');
select is((select status from public.daily_tasks where routine_item_id = pg_temp.rid('wake') and task_date = pg_temp.today_a()), 'pending',
  'A''s task status unchanged by partner / outsider');
select is((select title from public.routine_items where id = pg_temp.rid('wake')), 'Wake Up', 'A''s routine unchanged by partner / outsider');
select throws_ok(format('delete from public.routine_items where id = %L', pg_temp.rid('catchup')), '23503', null,
  'a routine with history cannot be hard-deleted even by an admin');
select throws_ok(format($$update public.daily_tasks set completed_at = now() where id = %L$$, pg_temp.rid('oneoff')),
  '23514', null, 'an impossible row (pending with completed_at) is rejected even for an admin');

select * from finish();
rollback;
