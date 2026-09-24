-- Stage 5 · activity feed, partner_today and Realtime Authorization (pgTAP)
--
-- A and B are a duo, C and D another duo, E has no duo. One transaction,
-- rolled back. How to run: docs/DATABASE.md → "Tests".
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(40);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-c000-00000000000a', 'a@test5.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-c000-00000000000b', 'b@test5.lockedin', '{"display_name":"Beto","timezone":"Europe/Lisbon"}'),
  ('00000000-0000-4000-c000-00000000000c', 'c@test5.lockedin', '{"display_name":"Caio","timezone":"UTC"}'),
  ('00000000-0000-4000-c000-00000000000d', 'd@test5.lockedin', '{"display_name":"Duda","timezone":"UTC"}'),
  ('00000000-0000-4000-c000-00000000000e', 'e@test5.lockedin', '{"display_name":"Edu","timezone":"UTC"}');
insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-c000-0000000000ab', 'LKD-TST5AB', '00000000-0000-4000-c000-00000000000a'),
  ('00000000-0000-4000-c000-0000000000cd', 'LKD-TST5CD', '00000000-0000-4000-c000-00000000000c');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-c000-0000000000ab', '00000000-0000-4000-c000-00000000000a', 1),
  ('00000000-0000-4000-c000-0000000000ab', '00000000-0000-4000-c000-00000000000b', 2),
  ('00000000-0000-4000-c000-0000000000cd', '00000000-0000-4000-c000-00000000000c', 1),
  ('00000000-0000-4000-c000-0000000000cd', '00000000-0000-4000-c000-00000000000d', 2);

create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.task(p text) returns uuid language sql as $$
  select t.id from public.daily_tasks t where t.routine_item_id = (select id from v where k = p)
$$;
create function pg_temp.events(p uuid) returns int language sql as $$
  select count(*)::int from public.activity_events e where e.target_id = p
$$;
grant execute on function pg_temp.rid(text), pg_temp.task(text), pg_temp.events(uuid) to anon, authenticated;

-- ------------------------------------------------------------ A's tasks ----
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000a","role":"authenticated"}', true);
insert into v select 'run', public.create_routine_item('Morning Run', array[1,2,3,4,5,6,7]::smallint[]);
insert into v select 'gym', public.create_routine_item('Gym', array[1,2,3,4,5,6,7]::smallint[]);
insert into v select 'secret', public.create_routine_item('Secret journal', array[1,2,3,4,5,6,7]::smallint[], 'custom', null, false);

-- -------------------------------------------------------------- activity ----
update public.daily_tasks set status = 'completed' where id = pg_temp.task('run');
select is(pg_temp.events(pg_temp.task('run')), 1, 'completing a shared task creates one activity event');
select is(
  (select actor_id::text || '|' || duo_id::text || '|' || event_type || '|' || title_snapshot from public.activity_events where target_id = pg_temp.task('run')),
  '00000000-0000-4000-c000-00000000000a|00000000-0000-4000-c000-0000000000ab|task_completed|Morning Run',
  'event has the right actor, duo, type and title snapshot');
select ok((select e.created_at = t.completed_at from public.activity_events e join public.daily_tasks t on t.id = e.target_id where t.id = pg_temp.task('run')),
  'event time is the completion time');

update public.daily_tasks set title = 'Run renamed', notes = 'x' where id = pg_temp.task('run');
select is(pg_temp.events(pg_temp.task('run')), 1, 'unrelated updates do not create events');
select is((select title_snapshot from public.activity_events where target_id = pg_temp.task('run')), 'Morning Run',
  'the feed keeps the title snapshot');

update public.daily_tasks set status = 'pending' where id = pg_temp.task('run');
select is(pg_temp.events(pg_temp.task('run')), 0, 'undo removes the event (the feed does not lie)');
update public.daily_tasks set status = 'completed' where id = pg_temp.task('run');
update public.daily_tasks set status = 'pending' where id = pg_temp.task('run');
update public.daily_tasks set status = 'completed' where id = pg_temp.task('run');
select is(pg_temp.events(pg_temp.task('run')), 1, 'complete / undo / complete leaves exactly one event');

update public.daily_tasks set status = 'completed' where id = pg_temp.task('secret');
select is(pg_temp.events(pg_temp.task('secret')), 0, 'a private task creates no event');

update public.daily_tasks set visible_to_partner = false where id = pg_temp.task('run');
select is(pg_temp.events(pg_temp.task('run')), 0, 'shared -> private removes the event');
update public.daily_tasks set visible_to_partner = true where id = pg_temp.task('run');
select is(pg_temp.events(pg_temp.task('run')), 1, 'private -> shared while completed brings it back');

update public.daily_tasks set status = 'skipped', skip_reason = 'Rest' where id = pg_temp.task('gym');
select is(pg_temp.events(pg_temp.task('gym')), 0, 'skipping is not proof of work: no event');

insert into public.daily_tasks (title, status) values ('One-off done', 'completed');
insert into v select 'oneoff', id from public.daily_tasks where title = 'One-off done';
select is(pg_temp.events(pg_temp.rid('oneoff')), 1, 'a completed shared one-off creates an event');
delete from public.daily_tasks where id = pg_temp.rid('oneoff');
select is(pg_temp.events(pg_temp.rid('oneoff')), 0, 'deleting a completed task removes its event');

-- --------------------------------------------------- feed access / writes ----
select is((select count(*)::int from public.activity_events), 1, 'A reads the duo feed');
select throws_ok($$insert into public.activity_events (duo_id, actor_id, event_type) values ('00000000-0000-4000-c000-0000000000ab', '00000000-0000-4000-c000-00000000000a', 'task_completed')$$,
  '42501', null, 'clients cannot insert activity events');
select throws_ok($$update public.activity_events set title_snapshot = 'forged'$$, '42501', null, 'clients cannot edit activity events');
select throws_ok($$delete from public.activity_events$$, '42501', null, 'clients cannot delete activity events');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.activity_events), 1, 'partner B reads the duo feed');
select is((select count(*)::int from public.activity_events where title_snapshot = 'Secret journal'), 0, 'the feed never contains the private task');
select is((select done || '/' || total from public.partner_today()), '2/3',
  'partner_today counts A''s whole day: Run done, Secret (private) done, Gym skipped');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.activity_events), 0, 'outsider C reads no A/B events');
select is((select count(*)::int from public.partner_today() where total > 0), 0, 'outsider C gets nothing of A''s day');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000e","role":"authenticated"}', true);
select is((select count(*)::int from public.partner_today()), 0, 'a user without a duo gets no partner_today row');

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.activity_events', '42501', null, 'anon cannot read the feed');
select throws_ok('select * from public.partner_today()', '42501', null, 'anon cannot call partner_today');

-- ------------------------------------------------ realtime authorization ----
-- Realtime sets realtime.topic to the channel topic and checks these policies.
reset role;
select realtime.send('{"probe":true}'::jsonb, 'probe', 'duo:00000000-0000-4000-c000-0000000000ab', true);

select set_config('role', 'authenticated', true);
select set_config('realtime.topic', 'duo:00000000-0000-4000-c000-0000000000ab', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000a","role":"authenticated"}', true);
select ok((select count(*) > 0 from realtime.messages where extension = 'broadcast'), 'A may receive on duo:A/B');
select lives_ok($$insert into realtime.messages (topic, extension, event, payload, private) values ('duo:00000000-0000-4000-c000-0000000000ab', 'presence', 'presence', '{}', true)$$,
  'A may publish presence on duo:A/B');
select throws_ok($$insert into realtime.messages (topic, extension, event, payload, private) values ('duo:00000000-0000-4000-c000-0000000000ab', 'broadcast', 'activity', '{"title":"forged"}', true)$$,
  '42501', null, 'A may not send broadcasts (only the database does)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000b","role":"authenticated"}', true);
select ok((select count(*) > 0 from realtime.messages where extension = 'broadcast'), 'B may receive on duo:A/B');
select lives_ok($$insert into realtime.messages (topic, extension, event, payload, private) values ('duo:00000000-0000-4000-c000-0000000000ab', 'presence', 'presence', '{}', true)$$,
  'B may publish presence on duo:A/B');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from realtime.messages), 0, 'C (other duo) cannot receive on duo:A/B');
select throws_ok($$insert into realtime.messages (topic, extension, event, payload, private) values ('duo:00000000-0000-4000-c000-0000000000ab', 'presence', 'presence', '{}', true)$$,
  '42501', null, 'C cannot publish presence on duo:A/B');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000e","role":"authenticated"}', true);
select is((select count(*)::int from realtime.messages), 0, 'a user without a duo cannot receive on duo:A/B');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000a","role":"authenticated"}', true);
select set_config('realtime.topic', 'duo:00000000-0000-4000-8000-000000000000', true);
select is((select count(*)::int from realtime.messages), 0, 'A cannot receive on a fake duo topic');
select set_config('realtime.topic', 'duo:00000000-0000-4000-c000-0000000000cd', true);
select is((select count(*)::int from realtime.messages), 0, 'A cannot receive on another duo''s topic');
select throws_ok($$insert into realtime.messages (topic, extension, event, payload, private) values ('duo:00000000-0000-4000-c000-0000000000cd', 'presence', 'presence', '{}', true)$$,
  '42501', null, 'A cannot publish presence on another duo''s topic');

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('realtime.topic', 'duo:00000000-0000-4000-c000-0000000000ab', true);
select is((select count(*)::int from realtime.messages), 0, 'anon cannot receive on a duo topic');
select throws_ok($$insert into realtime.messages (topic, extension, event, payload, private) values ('duo:00000000-0000-4000-c000-0000000000ab', 'presence', 'presence', '{}', true)$$,
  '42501', null, 'anon cannot publish presence');

-- ------------------------------------------------------ duo break -------
reset role;
delete from public.duos where id = '00000000-0000-4000-c000-0000000000ab';
select is((select count(*)::int from public.activity_events where duo_id = '00000000-0000-4000-c000-0000000000ab'), 0,
  'ending a duo deletes its feed');
select set_config('role', 'authenticated', true);
select set_config('realtime.topic', 'duo:00000000-0000-4000-c000-0000000000ab', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from realtime.messages), 0, 'after the duo ends, A can no longer join its topic');

select * from finish();
rollback;
