-- Stage 9 · closed history, privilege model and adversarial access (pgTAP)
--
-- A closed local day can no longer be changed by a client: tasks, routine
-- templates, focus and challenge results. Catch-up still fills missed days.
-- A timezone change never reopens a closed day. Every SECURITY DEFINER
-- function is pinned, anon executes nothing, outsiders get nothing. Past
-- fixtures are written as the database owner (what "time passing" means in
-- a single transaction). One transaction, rolled back. docs/DATABASE.md → Tests.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(69);
-- pgTAP's own bookkeeping is written while running as anon / authenticated.
grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

-- Fixtures ------------------------------------------------------------------
-- A / B: a duo (São Paulo). C: an outsider with their own duo partner D.
-- K: alone, starts in Kiritimati (UTC+14) for the timezone attack.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-9000-00000000000a', 'a@test9.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-9000-00000000000b', 'b@test9.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-9000-00000000000c', 'c@test9.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-9000-00000000000d', 'd@test9.lockedin', '{"display_name":"Duda","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-9000-00000000000e', 'k@test9.lockedin', '{"display_name":"Kai","timezone":"Pacific/Kiritimati"}');
insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-9000-0000000000ab', 'LKD-TST9AB', '00000000-0000-4000-9000-00000000000a'),
  ('00000000-0000-4000-9000-0000000000cd', 'LKD-TST9CD', '00000000-0000-4000-9000-00000000000c');
insert into public.duo_members (duo_id, user_id, seat, joined_at) values
  ('00000000-0000-4000-9000-0000000000ab', '00000000-0000-4000-9000-00000000000a', 1, now() - interval '40 days'),
  ('00000000-0000-4000-9000-0000000000ab', '00000000-0000-4000-9000-00000000000b', 2, now() - interval '40 days'),
  ('00000000-0000-4000-9000-0000000000cd', '00000000-0000-4000-9000-00000000000c', 1, now() - interval '40 days'),
  ('00000000-0000-4000-9000-0000000000cd', '00000000-0000-4000-9000-00000000000d', 2, now() - interval '40 days');

create function pg_temp.t() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
create function pg_temp.w0() returns date language sql stable as $$
  select pg_temp.t() - (extract(isodow from pg_temp.t())::int - 1)
$$;
create function pg_temp.tk() returns date language sql stable as $$
  select (now() at time zone 'Pacific/Kiritimati')::date
$$;
create temp table v (k text primary key, id uuid, txt text);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.txt(p text) returns text language sql as $$ select txt from v where k = p $$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-9000-00000000000' || p, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.t(), pg_temp.w0(), pg_temp.tk(), pg_temp.rid(text), pg_temp.txt(text), pg_temp.as_user(text)
  to anon, authenticated;

-- Last week (closed): A 4 / 5, B 2 / 5 — A won. B also has a missed task
-- five days ago, a completion yesterday and a task today.
insert into public.daily_tasks (owner_id, task_date, title, status)
select '00000000-0000-4000-9000-00000000000a', pg_temp.w0() - 7 + (s % 5), 'A last week ' || s,
       case when s <= 4 then 'completed' else 'pending' end
from generate_series(1, 5) s;
insert into public.daily_tasks (owner_id, task_date, title, status)
select '00000000-0000-4000-9000-00000000000b', pg_temp.w0() - 7 + (s % 5), 'B last week ' || s,
       case when s <= 2 then 'completed' else 'pending' end
from generate_series(1, 5) s;
insert into public.daily_tasks (owner_id, task_date, title, status) values
  ('00000000-0000-4000-9000-00000000000b', pg_temp.t() - 5, 'B five days ago', 'pending'),
  ('00000000-0000-4000-9000-00000000000b', pg_temp.t() - 1, 'B yesterday', 'completed'),
  ('00000000-0000-4000-9000-00000000000b', pg_temp.t(), 'B today', 'pending');
insert into v (k, id) select 'b_lastweek_pending', id from public.daily_tasks where title = 'B last week 3';
insert into v (k, id) select 'b_lastweek_done', id from public.daily_tasks where title = 'B last week 1';
insert into v (k, id) select 'b_5days', id from public.daily_tasks where title = 'B five days ago';
insert into v (k, id) select 'b_yesterday', id from public.daily_tasks where title = 'B yesterday';
insert into v (k, id) select 'b_today', id from public.daily_tasks where title = 'B today';
-- A routine of B last materialised 3 days ago (the app stayed closed).
insert into public.routine_items (id, owner_id, title, days_of_week, start_date, materialized_through) values
  ('00000000-0000-4000-9000-0000000000e1', '00000000-0000-4000-9000-00000000000b', 'Stale routine',
   array[1,2,3,4,5,6,7]::smallint[], pg_temp.t() - 6, pg_temp.t() - 3);

-- Closed challenges (created while both standards were 80) and B's focus in
-- the closed period.
insert into public.challenges (id, duo_id, created_by, title, challenge_type, target_value, start_date, end_date) values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000ab', '00000000-0000-4000-9000-00000000000a',
   'Closed standard', 'standard_days', 1, pg_temp.t() - 6, pg_temp.t() - 1),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000ab', '00000000-0000-4000-9000-00000000000a',
   'Closed focus', 'focus_seconds', 3600, pg_temp.t() - 6, pg_temp.t() - 1);
alter table public.focus_sessions disable trigger focus_sessions_lifecycle;
insert into public.focus_sessions (id, user_id, title, planned_seconds, started_at, ended_at, actual_focus_seconds,
                                   status, local_date)
values ('00000000-0000-4000-9000-0000000000f1', '00000000-0000-4000-9000-00000000000b', 'Old focus', 3600,
        now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', 1800, 'completed', pg_temp.t() - 2);
-- A session of A paused yesterday, never resumed.
insert into public.focus_sessions (id, user_id, title, planned_seconds, started_at, paused_at,
                                   accumulated_pause_seconds, status, local_date)
values ('00000000-0000-4000-9000-0000000000f2', '00000000-0000-4000-9000-00000000000a', 'Paused yesterday', 3600,
        now() - interval '1 day', now() - interval '1 day' + interval '10 minutes', 0, 'paused', pg_temp.t() - 1);
alter table public.focus_sessions enable trigger focus_sessions_lifecycle;

-- ------------------------------------ routine templates + catch-up (B) ----
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
select throws_ok($$insert into public.routine_items (title, days_of_week, start_date) values ('Past routine', array[1,2,3,4,5,6,7]::smallint[], pg_temp.t() - 7)$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a routine cannot start in the past (it would manufacture closed days)');
select throws_ok($$update public.routine_items set days_of_week = array[1]::smallint[] where id = '00000000-0000-4000-9000-0000000000e1'$$,
  'P0001', 'LI_ROUTINE_STALE', 'a template cannot change before its missed days are materialised');
select lives_ok('select public.ensure_my_daily_tasks()', 'catch-up runs for the signed-in user');
select is((select count(*)::int from public.daily_tasks where routine_item_id = '00000000-0000-4000-9000-0000000000e1'), 3,
  'catch-up still creates the missed closed days (t-2, t-1) and today');
select is((select count(*)::int from public.daily_tasks where routine_item_id = '00000000-0000-4000-9000-0000000000e1'
           and task_date < pg_temp.t() and status = 'pending'), 2,
  'caught-up closed days are pending (missed)…');
select throws_ok($$update public.daily_tasks set status = 'completed'
                   where routine_item_id = '00000000-0000-4000-9000-0000000000e1' and task_date = pg_temp.t() - 1$$,
  'P0001', 'LI_HISTORY_LOCKED', '…and locked like any other closed day');
select lives_ok($$select public.reorder_routine_items(array['00000000-0000-4000-9000-0000000000e1'::uuid])$$,
  'reorder works (it materialises first)');
insert into v (k, id) select 'b_routine', public.create_routine_item('B routine', array[1,2,3,4,5,6,7]::smallint[]);
select throws_ok(format($$update public.routine_items set materialized_through = pg_temp.t() - 5 where id = %L$$, pg_temp.rid('b_routine')),
  '42501', null, 'materialized_through is not writable by clients');
select lives_ok(format('select public.archive_routine_item(%L)', pg_temp.rid('b_routine')), 'archiving works (ends yesterday)');
select throws_ok(format($$update public.routine_items set end_date = pg_temp.t() - 5 where id = %L$$, pg_temp.rid('b_routine')),
  'P0001', 'LI_HISTORY_LOCKED', 'an archive date cannot move into closed days');
reset role;
update public.routine_items set start_date = pg_temp.t() - 10, end_date = pg_temp.t() - 4 where id = pg_temp.rid('b_routine');
select set_config('role', 'authenticated', true);
select throws_ok(format($$update public.routine_items set end_date = null where id = %L$$, pg_temp.rid('b_routine')),
  'P0001', 'LI_HISTORY_LOCKED', 'a routine archived days ago cannot be reopened (its gap would be backfilled)');

-- ----------------------------------------------------- closed tasks (B) ----
insert into v (k, txt) select 'week_before',
  (select row(me_planned, me_completed, partner_planned, partner_completed)::text
   from public.duo_weeks(1) where week_start = pg_temp.w0() - 7);
insert into v (k, txt) select 'summary_before',
  (select row(streak_before_today, longest_streak)::text from public.my_progress_summary());
insert into v (k, txt) select 'challenges_before',
  (select string_agg(row(id, me_value, partner_value)::text, ',' order by id) from public.duo_challenges());

select throws_ok(format($$update public.daily_tasks set status = 'completed' where id = %L$$, pg_temp.rid('b_lastweek_pending')),
  'P0001', 'LI_HISTORY_LOCKED', 'a closed week''s pending task cannot be completed');
select throws_ok(format($$update public.daily_tasks set status = 'pending' where id = %L$$, pg_temp.rid('b_yesterday')),
  'P0001', 'LI_HISTORY_LOCKED', 'yesterday''s completion cannot be undone');
select throws_ok(format($$update public.daily_tasks set status = 'skipped', skip_reason = 'Sick' where id = %L$$, pg_temp.rid('b_5days')),
  'P0001', 'LI_HISTORY_LOCKED', 'a missed day cannot be skipped afterwards');
select throws_ok(format($$delete from public.daily_tasks where id = %L$$, pg_temp.rid('b_lastweek_pending')),
  'P0001', 'LI_HISTORY_LOCKED', 'a missed task cannot be deleted');
select throws_ok(format($$update public.daily_tasks set visible_to_partner = false where id = %L$$, pg_temp.rid('b_lastweek_done')),
  'P0001', 'LI_HISTORY_LOCKED', 'visibility of a closed day cannot change');
select throws_ok(format($$update public.daily_tasks set title = 'Renamed' where id = %L$$, pg_temp.rid('b_5days')),
  'P0001', 'LI_HISTORY_LOCKED', 'a closed task cannot be renamed');
select throws_ok($$insert into public.daily_tasks (task_date, title, status) values (pg_temp.t() - 3, 'Backdated win', 'completed')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a completed one-off cannot be backdated');
select throws_ok($$insert into public.daily_tasks (task_date, title) values (pg_temp.t() - 1, 'Backdated pending')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'no task of any status can be added to a closed day');
select throws_ok($$insert into public.daily_tasks (task_date, title, status) values (pg_temp.t() + 1, 'Tomorrow done', 'completed')$$,
  'P0001', 'LI_FUTURE_TASK', 'a future task cannot be completed in advance');
select lives_ok($$insert into public.daily_tasks (task_date, title) values (pg_temp.t() + 1, 'Tomorrow pending')$$,
  'a future task can still be planned (pending)');
select throws_ok($$update public.daily_tasks set status = 'completed' where title = 'Tomorrow pending'$$,
  'P0001', 'LI_FUTURE_TASK', 'and still cannot be completed before its day');

-- Today stays fully editable.
select lives_ok(format($$update public.daily_tasks set status = 'completed' where id = %L$$, pg_temp.rid('b_today')), 'today: complete');
select lives_ok(format($$update public.daily_tasks set status = 'pending' where id = %L$$, pg_temp.rid('b_today')), 'today: undo');
select lives_ok(format($$update public.daily_tasks set status = 'skipped', skip_reason = 'Travel' where id = %L$$, pg_temp.rid('b_today')), 'today: skip');
select lives_ok(format($$update public.daily_tasks set status = 'pending' where id = %L$$, pg_temp.rid('b_today')), 'today: unskip');
select lives_ok($$insert into public.daily_tasks (title) values ('Quick add today')$$, 'today: Quick Add');
select lives_ok($$delete from public.daily_tasks where title = 'Quick add today'$$, 'today: delete a one-off');

select is((select row(me_planned, me_completed, partner_planned, partner_completed)::text
           from public.duo_weeks(1) where week_start = pg_temp.w0() - 7), pg_temp.txt('week_before'),
  'the closed week''s numbers (and winner) are identical after every attempt');
select is((select row(streak_before_today, longest_streak)::text from public.my_progress_summary()), pg_temp.txt('summary_before'),
  'closed streak history is unchanged');

-- ------------------------------------------------------------ focus (B) ----
select throws_ok($$update public.focus_sessions set actual_focus_seconds = 36000 where id = '00000000-0000-4000-9000-0000000000f1'$$,
  '42501', null, 'completed focus: duration not writable');
select throws_ok($$update public.focus_sessions set started_at = now() - interval '9 days' where id = '00000000-0000-4000-9000-0000000000f1'$$,
  '42501', null, 'completed focus: start not writable');
select throws_ok($$update public.focus_sessions set local_date = pg_temp.t() - 3 where id = '00000000-0000-4000-9000-0000000000f1'$$,
  '42501', null, 'completed focus: day not writable');
select throws_ok($$update public.focus_sessions set status = 'active' where id = '00000000-0000-4000-9000-0000000000f1'$$,
  'P0001', 'LI_FOCUS_FINISHED', 'completed focus cannot be reopened');
select lives_ok($$update public.focus_sessions set reflection = 'Notes later' where id = '00000000-0000-4000-9000-0000000000f1'$$,
  'the reflection (personal, not competitive) can still be written');
select is((select row(actual_focus_seconds, local_date, status)::text from public.focus_sessions
           where id = '00000000-0000-4000-9000-0000000000f1'),
  row(1800, pg_temp.t() - 2, 'completed')::text, 'and nothing competitive moved');
select throws_ok($$insert into public.focus_sessions (title, planned_seconds, started_at, status, actual_focus_seconds)
                   values ('15 h yesterday', 43200, now() - interval '1 day', 'completed', 43200)$$,
  '42501', null, 'a finished / backdated session cannot be inserted (column grants)');
insert into v (k, id) select 'b_fake', s.id from public.start_focus_session('Fake yesterday', 43200) s;
select is((select row(status, local_date, started_at = now())::text from public.focus_sessions where id = pg_temp.rid('b_fake')),
  row('active', pg_temp.t(), true)::text, 'every new session starts now, on today (database time)');
select * from public.complete_focus_session(pg_temp.rid('b_fake'));

-- A paused session from yesterday cannot add focus to yesterday.
select pg_temp.as_user('a');
select throws_ok($$update public.focus_sessions set status = 'active' where id = '00000000-0000-4000-9000-0000000000f2'$$,
  'P0001', 'LI_FOCUS_FINISHED', 'a paused session of a closed day cannot be resumed');
select is((select status from public.resume_focus_session('00000000-0000-4000-9000-0000000000f2')), 'completed',
  'resuming it through the app completes it instead');
select is((select actual_focus_seconds from public.focus_sessions where id = '00000000-0000-4000-9000-0000000000f2'), 600,
  'its focus is only what ran before the pause');

-- -------------------------------------------------------- challenges (B) ----
select pg_temp.as_user('b');
update public.profiles set daily_standard_percent = 10 where id = '00000000-0000-4000-9000-00000000000b';
select pg_temp.as_user('a');
update public.profiles set daily_standard_percent = 100 where id = '00000000-0000-4000-9000-00000000000a';
select pg_temp.as_user('b');
select is((select string_agg(row(id, me_value, partner_value)::text, ',' order by id)
           from public.duo_challenges() where end_date < pg_temp.t()),
  pg_temp.txt('challenges_before'),
  'closed challenges keep their result after both Standards changed and every retroactive attempt');
select results_eq($$select creator_standard, partner_standard from public.challenges where id = '00000000-0000-4000-9000-0000000000c1'$$,
  $$values (80, 80)$$, 'the standards used are the snapshot taken at creation');
select throws_ok($$update public.challenges set partner_standard = 1 where id = '00000000-0000-4000-9000-0000000000c1'$$,
  '42501', null, 'the snapshot is not writable');
select lives_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
                  values ('Twice', 'standard_days', 1, pg_temp.t(), pg_temp.t() + 1)$$, 'a challenge is created');
select throws_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
                   values ('twice ', 'standard_days', 1, pg_temp.t(), pg_temp.t() + 1)$$,
  '23505', null, 'a double submit does not create it twice');
select is((select creator_standard from public.challenges where title = 'Twice'), 10,
  'a new challenge snapshots the author''s current Standard');

-- ------------------------------------------------ timezone attack (K) ----
reset role;
insert into public.daily_tasks (owner_id, task_date, title, status) values
  ('00000000-0000-4000-9000-00000000000e', pg_temp.tk() - 1, 'K yesterday', 'pending');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('e');
select is(public.my_today(), pg_temp.tk(), 'K''s today is the Kiritimati date');
update public.profiles set timezone = 'Pacific/Pago_Pago' where id = '00000000-0000-4000-9000-00000000000e';
select ok((now() at time zone 'Pacific/Pago_Pago')::date < pg_temp.tk(),
  'in Pago Pago (UTC-11) the local calendar date is earlier');
select is(public.my_today(), pg_temp.tk(), 'moving west does not bring "today" back');
select throws_ok($$update public.daily_tasks set status = 'completed' where title = 'K yesterday'$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a timezone change cannot reopen a closed day');
select throws_ok($$insert into public.daily_tasks (task_date, title, status) values (pg_temp.tk() - 1, 'K late', 'completed')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'nor add to it');
select throws_ok($$update public.profiles set history_locked_through = null where id = '00000000-0000-4000-9000-00000000000e'$$,
  '42501', null, 'the boundary is not writable by clients');
update public.profiles set timezone = 'Pacific/Kiritimati' where id = '00000000-0000-4000-9000-00000000000e';
select is((select history_locked_through from public.profiles where id = '00000000-0000-4000-9000-00000000000e'), pg_temp.tk() - 1,
  'the boundary only moves forward');

-- --------------------------------------------------------- outsider C ----
select pg_temp.as_user('c');
select is((select count(*)::int from public.daily_tasks where owner_id in ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-00000000000b')), 0,
  'outsider: no tasks of A / B');
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('b_today');
select is((select count(*)::int from public.challenges where duo_id = '00000000-0000-4000-9000-0000000000ab'), 0, 'outsider: no challenges of A / B');
select is(private.materialize_tasks('00000000-0000-4000-9000-00000000000b'), null,
  'outsider: catch-up cannot be run for someone else');
select set_config('realtime.topic', 'duo:00000000-0000-4000-9000-0000000000ab', true);
select is((select count(*)::int from realtime.messages), 0, 'outsider: no message of the A / B channel');
select pg_temp.as_user('b');
select ok((select count(*)::int from realtime.messages) > 0, 'a member reads their duo channel');
select set_config('realtime.topic', '', true);
reset role;
select is((select status from public.daily_tasks where id = pg_temp.rid('b_today')), 'pending', 'B''s task unchanged by the outsider');

-- ---------------------------------------------------- privilege model ----
select is(
  (select array_agg(x order by x collate "C")
   from (select n.nspname || '.' || p.proname as x
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and p.prosecdef and p.proname not like 'dev\_%') s),
  array['private.current_duo_id', 'private.duo_is_complete', 'private.handle_new_profile_settings',
        'private.handle_new_user', 'private.materialize_tasks', 'private.sync_challenge',
        'private.sync_focus_activity', 'private.sync_planner_event', 'private.sync_reaction', 'private.sync_task_activity',
        'public.create_duo', 'public.duo_challenges', 'public.duo_weeks', 'public.join_duo',
        'public.leave_duo', 'public.partner_current_focus', 'public.partner_progress_summary',
        'public.partner_today']::text[],
  'the SECURITY DEFINER set is exactly the reviewed one');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosecdef
             and not ('search_path=""' = any (coalesce(p.proconfig, array[]::text[])))), 0,
  'every DEFINER function pins an empty search_path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')), 0,
  'anon can execute no function of public / private');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where n.nspname in ('public', 'private') and a.grantee = 0 and a.privilege_type = 'EXECUTE'), 0,
  'no function is executable by PUBLIC');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.prorettype = 'trigger'::regtype
             and has_function_privilege('authenticated', p.oid, 'execute')), 0,
  'trigger functions are not callable by users');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0,
  'RLS is on for every public table');
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'public' and grantee in ('anon', 'PUBLIC')), 0,
  'anon / PUBLIC hold no table privilege');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm')), 0,
  'no views in public (nothing can bypass RLS through a view)');
-- Functions get PUBLIC EXECUTE from PostgreSQL's global default, which a
-- schema default cannot remove: every migration revokes it explicitly and the
-- two function assertions above catch an omission. Tables are covered here.
create table public.__stage9_probe_t (id int);
select ok(not has_table_privilege('anon', 'public.__stage9_probe_t', 'select'),
  'default privileges: a future public table gives anon nothing');

select * from finish();
rollback;
