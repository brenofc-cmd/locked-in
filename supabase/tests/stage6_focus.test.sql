-- Stage 6 · focus_sessions lifecycle, privacy and realtime (pgTAP)
--
-- A and B are a duo, C is an outsider. now() is constant inside a
-- transaction, so elapsed time is simulated by moving started_at / paused_at
-- back as the superuser. One transaction, rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(63);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-d000-00000000000a', 'a@test6.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-d000-00000000000b', 'b@test6.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-d000-00000000000c', 'c@test6.lockedin', '{"display_name":"Caio","timezone":"UTC"}');
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-d000-0000000000ab', 'LKD-TST6AB', '00000000-0000-4000-d000-00000000000a');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-d000-0000000000ab', '00000000-0000-4000-d000-00000000000a', 1),
  ('00000000-0000-4000-d000-0000000000ab', '00000000-0000-4000-d000-00000000000b', 2);

create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.fs(p text) returns public.focus_sessions language sql as $$
  select s.* from public.focus_sessions s where s.id = (select id from v where k = p)
$$;
create function pg_temp.events(p uuid) returns int language sql as $$
  select count(*)::int from public.activity_events e where e.target_id = p
$$;
create function pg_temp.focus_msgs() returns int language sql as $$
  select count(*)::int from realtime.messages
  where topic = 'duo:00000000-0000-4000-d000-0000000000ab' and event = 'focus'
$$;
grant execute on function pg_temp.rid(text), pg_temp.fs(text), pg_temp.events(uuid), pg_temp.focus_msgs() to anon, authenticated;

-- Tasks: A has a shared and a private one, B has one.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000b","role":"authenticated"}', true);
insert into v select 'b_routine', public.create_routine_item('Beto run', array[1,2,3,4,5,6,7]::smallint[]);
insert into v select 'b_task', t.id from public.daily_tasks t where t.routine_item_id = pg_temp.rid('b_routine');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000a","role":"authenticated"}', true);
insert into v select 'physics_r', public.create_routine_item('Study Physics', array[1,2,3,4,5,6,7]::smallint[]);
insert into v select 'physics', t.id from public.daily_tasks t where t.routine_item_id = pg_temp.rid('physics_r');
insert into v select 'secret_r', public.create_routine_item('Secret thesis', array[1,2,3,4,5,6,7]::smallint[], 'custom', null, false);
insert into v select 'secret', t.id from public.daily_tasks t where t.routine_item_id = pg_temp.rid('secret_r');

-- ---------------------------------------------------------------- CREATE ----
select throws_ok(format($$select * from public.start_focus_session('Steal', 1500, %L)$$, pg_temp.rid('b_task')),
  '23503', null, 'a session cannot link another user''s task');
select throws_ok($$insert into public.focus_sessions (user_id, title, planned_seconds) values ('00000000-0000-4000-d000-00000000000b', 'Spoof', 1500)$$,
  '42501', null, 'A cannot start a session on behalf of B');
select throws_ok($$select * from public.start_focus_session('Too long', 43201)$$, '23514', null, 'planned time is capped at 12 hours');
select throws_ok($$select * from public.start_focus_session('Negative', -600)$$, '23514', null, 'planned time must be positive');

insert into v select 's1', s.id from public.start_focus_session(' Study Physics ', 3000, pg_temp.rid('physics')) s;
select is((pg_temp.fs('s1')).status, 'active', 'owner starts a session: active');
select is((pg_temp.fs('s1')).title, 'Study Physics', 'title is a trimmed snapshot');
select is((pg_temp.fs('s1')).started_at, now(), 'started_at is the database time');
select is((pg_temp.fs('s1')).duo_id, '00000000-0000-4000-d000-0000000000ab'::uuid, 'duo recorded from membership');
select is((pg_temp.fs('s1')).daily_task_id, pg_temp.rid('physics'), 'task link to own task succeeds');
select throws_ok($$select * from public.start_focus_session('Again', 1500)$$, 'P0001', 'LI_FOCUS_RUNNING',
  'a second start is refused while one is unfinished');
select throws_ok($$insert into public.focus_sessions (title, planned_seconds) values ('Direct', 1500)$$, '23505', null,
  'the database allows only one unfinished session per user');
select throws_ok(format($$update public.focus_sessions set started_at = now() - interval '1 hour' where id = %L$$, pg_temp.rid('s1')),
  '42501', null, 'clients cannot write timestamps');
select is(pg_temp.events(pg_temp.rid('s1')), 1, 'start creates one focus_started event');
select is((select title_snapshot from public.activity_events where target_id = pg_temp.rid('s1')), 'Study Physics',
  'the start event carries the shared title');

-- B / C cannot touch A's session.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000b","role":"authenticated"}', true);
select throws_ok(format('select * from public.pause_focus_session(%L)', pg_temp.rid('s1')), 'P0002', 'LI_NOT_FOUND',
  'partner cannot pause the owner''s session');
select throws_ok(format('select * from public.complete_focus_session(%L)', pg_temp.rid('s1')), 'P0002', 'LI_NOT_FOUND',
  'partner cannot complete the owner''s session');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000c","role":"authenticated"}', true);
select throws_ok(format('select * from public.resume_focus_session(%L)', pg_temp.rid('s1')), 'P0002', 'LI_NOT_FOUND',
  'outsider cannot resume the owner''s session');

-- ----------------------------------------------------------------- PAUSE ----
reset role;
update public.focus_sessions set started_at = now() - interval '20 minutes' where id = pg_temp.rid('s1');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000a","role":"authenticated"}', true);
select lives_ok(format('select * from public.pause_focus_session(%L)', pg_temp.rid('s1')), 'owner pauses');
select is((pg_temp.fs('s1')).status || '|' || ((pg_temp.fs('s1')).paused_at = now())::text, 'paused|true',
  'paused with paused_at = database time');
select lives_ok(format('select * from public.pause_focus_session(%L)', pg_temp.rid('s1')), 'pausing again is idempotent');
select is((pg_temp.fs('s1')).accumulated_pause_seconds, 0, 'a pause adds nothing until resumed');

-- ---------------------------------------------------------------- RESUME ----
reset role;
update public.focus_sessions set paused_at = now() - interval '10 minutes' where id = pg_temp.rid('s1');
select set_config('role', 'authenticated', true);
select lives_ok(format('select * from public.resume_focus_session(%L)', pg_temp.rid('s1')), 'owner resumes');
select is((pg_temp.fs('s1')).status, 'active', 'paused -> active');
select is((pg_temp.fs('s1')).accumulated_pause_seconds, 600, 'the 10 paused minutes are accumulated');
select ok((pg_temp.fs('s1')).paused_at is null, 'paused_at cleared');
select is(pg_temp.events(pg_temp.rid('s1')), 1, 'pause / resume do not add feed events');

-- -------------------------------------------------------------- COMPLETE ----
select lives_ok(format($$select * from public.complete_focus_session(%L, 'Finished problem set 6.')$$, pg_temp.rid('s1')),
  'owner ends early');
select is((pg_temp.fs('s1')).status, 'completed', 'active -> completed');
select is((pg_temp.fs('s1')).actual_focus_seconds, 600, 'actual focus excludes the pause: 20 min wall - 10 min paused = 600 s');
select is((pg_temp.fs('s1')).ended_at, now(), 'ended_at = database time');
select is((pg_temp.fs('s1')).reflection, 'Finished problem set 6.', 'owner stores a reflection');
select lives_ok(format('select * from public.resume_focus_session(%L)', pg_temp.rid('s1')), 'resume on a completed session is refused quietly');
select is((pg_temp.fs('s1')).status, 'completed', 'a completed session cannot be resumed');
select throws_ok(format($$update public.focus_sessions set status = 'paused' where id = %L$$, pg_temp.rid('s1')),
  'P0001', 'LI_FOCUS_FINISHED', 'completed -> paused is impossible');
select is(pg_temp.events(pg_temp.rid('s1')), 2, 'completion adds one focus_completed event');
select is((select duration_seconds from public.activity_events where target_id = pg_temp.rid('s1') and event_type = 'focus_completed'), 600,
  'the completed event carries the real duration');
update public.daily_tasks set title = 'Physics Review' where id = pg_temp.rid('physics');
select is((pg_temp.fs('s1')).title, 'Study Physics', 'renaming the task never rewrites the session');

-- paused -> completed
insert into v select 's2', s.id from public.start_focus_session('Reading', 1500) s;
reset role;
update public.focus_sessions set started_at = now() - interval '5 minutes' where id = pg_temp.rid('s2');
select set_config('role', 'authenticated', true);
select * from public.pause_focus_session(pg_temp.rid('s2'));
reset role;
update public.focus_sessions set paused_at = now() - interval '1 minute' where id = pg_temp.rid('s2');
select set_config('role', 'authenticated', true);
select * from public.complete_focus_session(pg_temp.rid('s2'));
select is((pg_temp.fs('s2')).actual_focus_seconds, 240, 'paused -> completed counts only the time before the pause');

-- ------------------------------------------------------------ EXPIRATION ----
insert into v select 's3', s.id from public.start_focus_session('Project', 1500) s;
reset role;
update public.focus_sessions set started_at = now() - interval '40 minutes' where id = pg_temp.rid('s3');
select set_config('role', 'authenticated', true);
select is((select count(*)::int from public.my_active_focus()), 0, 'an expired session is not returned as active');
select is((pg_temp.fs('s3')).status || '|' || (pg_temp.fs('s3')).actual_focus_seconds, 'completed|1500',
  'expired while closed: completed with exactly the planned duration');
select is((pg_temp.fs('s3')).ended_at, now() - interval '15 minutes', 'ended when the plan ended, not when the app reopened');
select lives_ok('select public.reconcile_my_focus(); select public.reconcile_my_focus();', 'reconciliation is idempotent');

insert into v select 's4', s.id from public.start_focus_session('With pauses', 600) s;
reset role;
update public.focus_sessions set started_at = now() - interval '30 minutes', accumulated_pause_seconds = 900 where id = pg_temp.rid('s4');
select set_config('role', 'authenticated', true);
select public.reconcile_my_focus();
select is((pg_temp.fs('s4')).ended_at, now() - interval '5 minutes', 'expiry accounts for pauses (start + 15 min paused + 10 min plan)');

-- --------------------------------------------------------------- PRIVACY ----
insert into v select 's5', s.id from public.start_focus_session('Secret thesis', 1500, pg_temp.rid('secret')) s;
select is((pg_temp.fs('s5')).visible_to_partner, false, 'a session on a private task is private');
select ok((select title_snapshot is null from public.activity_events where target_id = pg_temp.rid('s5')),
  'the start event of a private session has no title');
select is((select count(*)::int from public.focus_sessions where reflection is not null), 1, 'owner reads full sessions incl. reflection');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.focus_sessions), 0, 'partner cannot select the owner''s rows (no reflection leak)');
select is((select count(*)::int from public.partner_current_focus()), 1, 'partner sees the current session through the projection');
select ok((select title is null from public.partner_current_focus()), 'the projection hides a private title');
select is((select count(*)::int from public.activity_events where title_snapshot like '%Secret%' or title_snapshot like '%problem set%'), 0,
  'no private title or reflection in the feed');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000a","role":"authenticated"}', true);
select * from public.complete_focus_session(pg_temp.rid('s5'));
insert into v select 's6', s.id from public.start_focus_session('Deep work', 3000) s;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000b","role":"authenticated"}', true);
select is((select title || '|' || status || '|' || planned_seconds from public.partner_current_focus()), 'Deep work|active|3000',
  'partner sees a shared session''s title and timer fields');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.partner_current_focus()), 0, 'outsider gets no focus projection');
select is((select count(*)::int from public.focus_sessions), 0, 'outsider reads no sessions');
select is((select count(*)::int from public.activity_events), 0, 'outsider reads no focus activity');
select is(public.server_now(), now(), 'server_now returns the database clock (the timers'' reference)');

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.focus_sessions', '42501', null, 'anon cannot read sessions');
select throws_ok('select * from public.partner_current_focus()', '42501', null, 'anon cannot call partner_current_focus');
select throws_ok($$select * from public.start_focus_session('x', 60)$$, '42501', null, 'anon cannot start a session');
select throws_ok('select public.server_now()', '42501', null, 'anon cannot call server_now');

-- -------------------------------------------------------------- REALTIME ----
reset role;
select ok(pg_temp.focus_msgs() >= 10, 'one focus broadcast per transition (start / pause / resume / complete), no more');
select is((select count(*)::int from realtime.messages
           where topic = 'duo:00000000-0000-4000-d000-0000000000ab' and payload ? 'reflection'), 0,
  'no broadcast ever carries a reflection');
select is((select count(*)::int from realtime.messages
           where topic = 'duo:00000000-0000-4000-d000-0000000000ab' and payload::text like '%Secret thesis%'), 0,
  'no broadcast carries the private title');
select is((select count(*)::int from realtime.messages
           where topic = 'duo:00000000-0000-4000-d000-0000000000ab' and event = 'focus'
             and payload->>'id' = pg_temp.rid('s1')::text), 4,
  's1 sent exactly 4 state messages: start, pause, resume, complete');

select * from finish();
rollback;
