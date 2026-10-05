-- V2 Phase 9 · Celebrations + Smart Reviews + Non-Negotiables + Weekly Planning (pgTAP)
--
-- celebrations: a milestone unlock is validated against the real numbers,
-- a Perfect Day receipt only for a perfect TODAY, a month receipt only for a
-- month that has ended; rows are immutable except seen_at (stamped once);
-- the baseline never celebrates. Non-negotiables: owner-only side tables,
-- a routine's flag follows today's occurrence and is snapshotted on every
-- generated one; closed days are frozen. Weekly priorities: 3 per Monday
-- week, this week and the next only, closed weeks frozen. Reviews: optional
-- reflections, never for a period that has not started. my_review_facts():
-- objective facts from the existing sources, standard in force per day.
-- Privacy and the privilege model for all of it. No new SECURITY DEFINER
-- (stage9_integrity.test.sql keeps the set).
--
-- A has 7 standard-met closed days and a duo with B; C is an outsider with
-- 10 h of focus; R holds the review-facts fixture. Past fixtures are written
-- as the database owner. One transaction, rolled back.
-- docs/CELEBRATIONS.md, docs/WEEKLY_PLANNING.md.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(79);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a900-00000000000a', 'a@v2p9.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a900-00000000000b', 'b@v2p9.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a900-00000000000c', 'c@v2p9.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a900-000000000001', 'r@v2p9.lockedin', '{"display_name":"Rita","timezone":"America/Sao_Paulo"}');

create function pg_temp.t() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
-- Monday of the current local week.
create function pg_temp.w() returns date language sql stable as $$
  select date_trunc('week', pg_temp.t()::timestamp)::date
$$;
create function pg_temp.day(p_owner uuid, p_day date, p_done int, p_pending int) returns void language sql as $$
  insert into public.daily_tasks (owner_id, task_date, title, status)
  select p_owner, p_day, 'Task ' || s || ' ' || p_day,
         case when s <= p_done then 'completed' else 'pending' end
  from generate_series(1, p_done + p_pending) as s;
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a900-' || lpad(p, 12, '0'), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p text) returns uuid language sql stable as $$
  select ('00000000-0000-4000-a900-' || lpad(p, 12, '0'))::uuid
$$;
create temp table ids (k text primary key, id uuid);
grant all on ids to anon, authenticated;
grant execute on function pg_temp.t(), pg_temp.w(), pg_temp.as_user(text), pg_temp.id(text) to anon, authenticated;

-- ------------------------------------------------------------- fixtures ----
-- A: 7 closed days in a row, each 1 / 1 (standard met, Perfect).
select pg_temp.day(pg_temp.id('a'), pg_temp.t() - s, 1, 0) from generate_series(1, 7) as s;
-- A + B: a duo.
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-a900-0000000000ab', 'LKD-V2P9AB', pg_temp.id('a'));
insert into public.duo_members (duo_id, user_id, seat, joined_at) values
  ('00000000-0000-4000-a900-0000000000ab', pg_temp.id('a'), 1, now() - interval '9 days'),
  ('00000000-0000-4000-a900-0000000000ab', pg_temp.id('b'), 2, now() - interval '9 days');
-- C: 10 h of focus two days ago (a milestone reached before Phase 9).
-- Past sessions are written as they were (the lifecycle trigger stamps now()).
alter table public.focus_sessions disable trigger focus_sessions_lifecycle;
insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, ended_at,
  accumulated_pause_seconds, actual_focus_seconds, local_date, visible_to_partner)
values (pg_temp.id('c'), 'Bloco', 36000, 'completed', now() - interval '2 days 10 hours',
        now() - interval '2 days', 0, 36000, pg_temp.t() - 2, false);
-- A: yesterday's task flagged (closed day) and a closed week's priority.
insert into ids select 'a_yesterday', id from public.daily_tasks
  where owner_id = pg_temp.id('a') and task_date = pg_temp.t() - 1;
insert into public.daily_task_non_negotiables (daily_task_id, owner_id)
  select id, pg_temp.id('a') from ids where k = 'a_yesterday';
insert into public.weekly_priorities (owner_id, week_start, position, title)
  values (pg_temp.id('a'), pg_temp.w() - 7, 1, 'Semana passada');
-- R: three closed days for the facts. d-3: 2 / 2 (perfect), d-2: 1 / 2,
-- d-1: nothing. One flagged task each on d-3 (done) and d-2 (pending).
-- 30 min of focus on d-2. Standard: 80 now, 50 in force on closed days.
select pg_temp.day(pg_temp.id('1'), pg_temp.t() - 3, 2, 0);
select pg_temp.day(pg_temp.id('1'), pg_temp.t() - 2, 1, 1);
insert into public.daily_task_non_negotiables (daily_task_id, owner_id)
  select (select id from public.daily_tasks where owner_id = pg_temp.id('1') and task_date = pg_temp.t() - 3 limit 1), pg_temp.id('1')
  union all
  select (select id from public.daily_tasks where owner_id = pg_temp.id('1') and task_date = pg_temp.t() - 2 and status = 'pending'), pg_temp.id('1');
insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, ended_at,
  accumulated_pause_seconds, actual_focus_seconds, local_date, visible_to_partner)
values (pg_temp.id('1'), 'Bloco', 1800, 'completed', now() - interval '2 days 1 hour',
        now() - interval '2 days 30 minutes', 0, 1800, pg_temp.t() - 2, false);
alter table public.focus_sessions enable trigger focus_sessions_lifecycle;
insert into public.daily_standard_history (user_id, effective_from, standard_percent)
  values (pg_temp.id('1'), pg_temp.t() - 10, 50)
  on conflict (user_id, effective_from) do update set standard_percent = 50;
update public.profiles set daily_standard_percent = 80 where id = pg_temp.id('1');

-- ------------------------------------------------------------- access ----
select set_config('role', 'anon', true);
select throws_ok($$select * from public.celebrations$$, '42501', null, 'anon cannot read celebrations');
select throws_ok($$select * from public.weekly_priorities$$, '42501', null, 'anon cannot read priorities');
select throws_ok($$select * from public.reviews$$, '42501', null, 'anon cannot read reviews');
select throws_ok($$select * from public.daily_task_non_negotiables$$, '42501', null, 'anon cannot read task flags');
select throws_ok($$select * from public.my_review_facts(current_date - 1, current_date)$$, '42501', null,
  'anon cannot read review facts');
reset role;
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity
             and c.relname in ('celebrations', 'daily_task_non_negotiables', 'routine_non_negotiables',
                               'weekly_priorities', 'reviews')), 5,
  'RLS is on for the five new tables');
select is((select count(*)::int from information_schema.role_table_grants
           where grantee = 'anon' and table_schema = 'public'
             and table_name in ('celebrations', 'daily_task_non_negotiables', 'routine_non_negotiables',
                                'weekly_priorities', 'reviews')), 0,
  'anon holds no privilege on them');
select hasnt_column('public', 'daily_tasks', 'non_negotiable', 'no flag column on daily_tasks (the partner reads those rows)');
select hasnt_column('public', 'routine_items', 'non_negotiable', 'no flag column on routine_items');
select ok(not (select prosecdef from pg_proc where oid = 'public.my_review_facts(date,date)'::regprocedure),
  'my_review_facts is SECURITY INVOKER');
select ok((select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.my_review_facts(date,date)'::regprocedure),
  'my_review_facts pins an empty search_path');
select ok(not has_function_privilege('authenticated', 'private.baseline_milestones(uuid)', 'execute'),
  'no API role can write a baseline');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosecdef
             and p.proname in ('records', 'milestone_value', 'milestone_threshold', 'guard_celebration',
                               'baseline_milestones', 'guard_task_non_negotiable', 'guard_routine_non_negotiable',
                               'sync_routine_non_negotiable_today', 'seed_task_non_negotiable',
                               'guard_weekly_priority', 'guard_review', 'my_review_facts', 'my_records')), 0,
  'Phase 9 adds no SECURITY DEFINER function');

-- ------------------------------------------------------- celebrations ----
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select throws_ok($$insert into public.celebrations (kind, key) values ('milestone', 'streak_30')$$,
  'P0001', 'LI_MILESTONE_NOT_REACHED', 'a milestone not reached is refused');
select throws_ok($$insert into public.celebrations (kind, key) values ('milestone', 'streak_8')$$,
  'P0002', 'LI_NOT_FOUND', 'an unknown milestone is refused');
select lives_ok($$insert into public.celebrations (kind, key) values ('milestone', 'streak_7')$$,
  'a reached milestone unlocks (7 standard-met days in a row)');
select results_eq(
  $$select owner_id, source_value, baseline, seen_at is null from public.celebrations where key = 'streak_7'$$,
  $$values (pg_temp.id('a'), 7, false, true)$$,
  'the unlock is mine, records the real value, is not a baseline and is unseen');
select throws_ok($$insert into public.celebrations (kind, key) values ('milestone', 'streak_7')$$,
  '23505', null, 'an unlock happens once');
select lives_ok($$insert into public.celebrations (kind, key) values ('milestone', 'perfect_5')$$,
  'Perfect Days milestone from closed days (7 >= 5)');
select throws_ok($$insert into public.celebrations (kind, key, baseline) values ('milestone', 'perfect_10', true)$$,
  '42501', null, 'a client cannot write baseline');
select throws_ok($$insert into public.celebrations (kind, key, seen_at) values ('milestone', 'focus_10', now())$$,
  '42501', null, 'a client cannot pre-mark a row seen');
update public.celebrations set seen_at = '2000-01-01' where key = 'streak_7';
select is((select seen_at from public.celebrations where key = 'streak_7'), now(),
  'seen_at is stamped by the database, not the client');
update public.celebrations set seen_at = null where key = 'streak_7';
select is((select seen_at from public.celebrations where key = 'streak_7'), now(),
  'seen stays seen (shown once, on any device)');
select throws_ok($$update public.celebrations set key = 'streak_30' where key = 'streak_7'$$,
  '42501', null, 'an unlock is immutable (only seen_at is updatable)');
select throws_ok($$delete from public.celebrations$$, '42501', null, 'an unlock is never deleted by a client');

-- Perfect Day: only today, only while today is perfect.
select throws_ok(format($$insert into public.celebrations (kind, key) values ('perfect_day', %L)$$, pg_temp.t()),
  'P0001', 'LI_NOT_PERFECT', 'no Perfect Day receipt for a day with nothing planned');
select lives_ok($$select public.create_routine_item('Leitura', '{1,2,3,4,5,6,7}'::smallint[])$$,
  'A creates a routine (today''s occurrence comes with it)');
insert into ids select 'a_routine', id from public.routine_items where title = 'Leitura';
insert into ids select 'a_today_routine', id from public.daily_tasks
  where routine_item_id = (select id from ids where k = 'a_routine') and task_date = pg_temp.t();
select throws_ok(format($$insert into public.celebrations (kind, key) values ('perfect_day', %L)$$, pg_temp.t()),
  'P0001', 'LI_NOT_PERFECT', 'no receipt while a task is pending');
update public.daily_tasks set status = 'completed' where id = (select id from ids where k = 'a_today_routine');
select throws_ok(format($$insert into public.celebrations (kind, key) values ('perfect_day', %L)$$, pg_temp.t() - 1),
  'P0001', 'LI_NOT_PERFECT', 'never for another day (yesterday was perfect too)');
select lives_ok(format($$insert into public.celebrations (kind, key) values ('perfect_day', %L)$$, pg_temp.t()),
  'a perfect today gets one receipt');
select throws_ok(format($$insert into public.celebrations (kind, key) values ('perfect_day', %L)$$, pg_temp.t()),
  '23505', null, 'at most one Perfect Day celebration per date');

-- Month: only a month that has ended.
select throws_ok(format($$insert into public.celebrations (kind, key) values ('monthly', %L)$$,
    date_trunc('month', pg_temp.t()::timestamp)::date),
  'P0001', 'LI_MONTH_OPEN', 'never for the live month');
select throws_ok($$insert into public.celebrations (kind, key) values ('monthly', '2026-13-01')$$,
  'P0001', 'LI_MONTH_OPEN', 'a malformed month is refused');
select throws_ok($$insert into public.celebrations (kind, key) values ('perfect_day', '2026-02-30')$$,
  'P0001', 'LI_NOT_PERFECT', 'a malformed date is refused');
select lives_ok(format($$insert into public.celebrations (kind, key) values ('monthly', %L)$$,
    (date_trunc('month', pg_temp.t()::timestamp) - interval '1 month')::date),
  'a finished month can have its receipt');

-- Owner-only.
select pg_temp.as_user('b');
select is_empty($$select * from public.celebrations$$, 'the partner never reads my celebrations');
update public.celebrations set seen_at = now();
reset role;
select is((select count(*)::int from public.celebrations
           where owner_id = pg_temp.id('a') and kind = 'perfect_day' and seen_at is not null), 0,
  'the partner cannot mark mine seen');

-- Baseline: reached before Phase 9 = recorded as seen, never celebrated.
select is(private.baseline_milestones(pg_temp.id('c')), 1, 'C''s 10 h of focus is a baseline unlock');
select results_eq(
  $$select key, baseline, seen_at is not null, source_value from public.celebrations where owner_id = pg_temp.id('c')$$,
  $$values ('focus_10'::text, true, true, 36000)$$,
  'the baseline row is seen already and keeps the real value');
select is(private.baseline_milestones(pg_temp.id('c')), 0, 'the baseline runs once (idempotent)');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('c');
select throws_ok($$insert into public.celebrations (kind, key) values ('milestone', 'focus_10')$$,
  '23505', null, 'a baseline unlock is never celebrated again');

-- ----------------------------------------------------- non-negotiables ----
select pg_temp.as_user('a');
select lives_ok($$insert into public.routine_non_negotiables (routine_item_id)
                  select id from ids where k = 'a_routine'$$,
  'A marks the routine NÃO NEGOCIÁVEL');
select ok(exists (select 1 from public.daily_task_non_negotiables
                  where daily_task_id = (select id from ids where k = 'a_today_routine')),
  'today''s occurrence follows the routine''s flag');
select lives_ok($$delete from public.routine_non_negotiables where routine_item_id = (select id from ids where k = 'a_routine')$$,
  'A removes the routine''s flag');
select ok(not exists (select 1 from public.daily_task_non_negotiables
                      where daily_task_id = (select id from ids where k = 'a_today_routine')),
  'today''s occurrence loses it too');
insert into public.routine_non_negotiables (routine_item_id) select id from ids where k = 'a_routine';
-- A catch-up (the database materialises a missed occurrence) snapshots the flag.
reset role;
insert into public.daily_tasks (owner_id, task_date, title, routine_item_id, status)
  select pg_temp.id('a'), pg_temp.t() - 8, 'Leitura', id, 'completed' from ids where k = 'a_routine';
select ok(exists (select 1 from public.daily_task_non_negotiables n join public.daily_tasks t on t.id = n.daily_task_id
                  where t.owner_id = pg_temp.id('a') and t.task_date = pg_temp.t() - 8),
  'an occurrence generated from a flagged routine is flagged at that moment');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
delete from public.routine_non_negotiables where routine_item_id = (select id from ids where k = 'a_routine');
select ok(exists (select 1 from public.daily_task_non_negotiables n join public.daily_tasks t on t.id = n.daily_task_id
                  where t.owner_id = pg_temp.id('a') and t.task_date = pg_temp.t() - 8),
  'unflagging the routine never rewrites history');
select throws_ok($$delete from public.daily_task_non_negotiables where daily_task_id = (select id from ids where k = 'a_yesterday')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed day keeps its flag');
select throws_ok($$insert into public.daily_task_non_negotiables (daily_task_id)
                   select id from public.daily_tasks where owner_id = pg_temp.id('a') and task_date = pg_temp.t() - 2$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed day cannot be flagged');
select lives_ok($$insert into public.daily_task_non_negotiables (daily_task_id) select id from ids where k = 'a_today_routine'$$,
  'a task of today can be flagged on its own');
select pg_temp.as_user('b');
select is_empty($$select * from public.daily_task_non_negotiables$$, 'the partner never reads my task flags');
select is_empty($$select * from public.routine_non_negotiables$$, 'nor my routine flags');
select throws_ok($$insert into public.daily_task_non_negotiables (daily_task_id) select id from ids where k = 'a_today_routine'$$,
  'P0002', 'LI_NOT_FOUND', 'the partner cannot flag my task');

-- -------------------------------------------------- weekly priorities ----
select pg_temp.as_user('a');
select lives_ok($$insert into public.weekly_priorities (week_start, position, title) values (pg_temp.w(), 1, '  Entregar o projeto  ')$$,
  'a priority for this week');
select results_eq($$select title, status, done_at is null from public.weekly_priorities where week_start = pg_temp.w()$$,
  $$values ('Entregar o projeto'::text, 'open'::text, true)$$, 'trimmed, open, no done stamp');
select lives_ok($$insert into public.weekly_priorities (week_start, position, title) values (pg_temp.w() + 7, 1, 'Próxima')$$,
  'next week can be planned');
select throws_ok($$insert into public.weekly_priorities (week_start, position, title) values (pg_temp.w() + 14, 1, 'Longe')$$,
  'P0001', 'LI_WEEK_TOO_FAR', 'not two weeks ahead');
select throws_ok($$insert into public.weekly_priorities (week_start, position, title) values (pg_temp.w() - 7, 2, 'Atrasada')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'never a closed week');
select throws_ok($$insert into public.weekly_priorities (week_start, position, title) values (pg_temp.w() + 1, 1, 'Terça')$$,
  '23514', null, 'a week starts on Monday');
select throws_ok($$insert into public.weekly_priorities (week_start, position, title) values (pg_temp.w(), 4, 'Quarta')$$,
  '23514', null, 'at most 3 priorities');
select throws_ok($$insert into public.weekly_priorities (week_start, position, title) values (pg_temp.w(), 1, 'Outra')$$,
  '23505', null, 'one priority per position');
select throws_ok($$insert into public.weekly_priorities (week_start, position, title) values (pg_temp.w(), 2, '   ')$$,
  '23514', null, 'a title is required');
update public.weekly_priorities set status = 'done' where week_start = pg_temp.w();
select is((select done_at from public.weekly_priorities where week_start = pg_temp.w()), now(),
  'done is stamped by the database');
update public.weekly_priorities set status = 'open' where week_start = pg_temp.w();
select ok((select done_at is null from public.weekly_priorities where week_start = pg_temp.w()), 'reopened: no stamp');
select throws_ok($$update public.weekly_priorities set position = 2 where week_start = pg_temp.w()$$,
  '42501', null, 'the position is fixed');
select throws_ok($$update public.weekly_priorities set title = 'Mudou' where week_start = pg_temp.w() - 7$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed week is frozen');
select throws_ok($$delete from public.weekly_priorities where week_start = pg_temp.w() - 7$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed week''s priority is never deleted');
select pg_temp.as_user('b');
select is_empty($$select * from public.weekly_priorities$$, 'the partner never reads my priorities');

-- ------------------------------------------------------------ reviews ----
select pg_temp.as_user('a');
select lives_ok(format($$insert into public.reviews (kind, period_start, worked, hindered)
                        values ('day', %L, '  Foco cedo ', '')$$, pg_temp.t()),
  'a day reflection for today');
select results_eq(format($$select worked, hindered from public.reviews where kind = 'day' and period_start = %L$$, pg_temp.t()),
  $$values ('Foco cedo'::text, null::text)$$, 'trimmed; empty is null (every field optional)');
select throws_ok(format($$insert into public.reviews (kind, period_start) values ('day', %L)$$, pg_temp.t() + 1),
  'P0001', 'LI_FUTURE_TASK', 'never for a day that has not started');
select throws_ok(format($$insert into public.reviews (kind, period_start) values ('week', %L)$$, pg_temp.w() - 6),
  '23514', null, 'a week reflection starts on Monday');
select throws_ok(format($$insert into public.reviews (kind, period_start, worked) values ('week', %L, repeat('x', 501))$$, pg_temp.w()),
  '23514', null, 'at most 500 characters');
select throws_ok(format($$update public.reviews set period_start = %L where kind = 'day'$$, pg_temp.t() - 1),
  '42501', null, 'the period of a reflection is fixed');
select pg_temp.as_user('b');
select is_empty($$select * from public.reviews$$, 'the partner never reads my reflections');

-- -------------------------------------------------------- review facts ----
select pg_temp.as_user('1');
select results_eq(
  $$select days_with_tasks, planned, completed, focus_seconds, perfect_days, standard_days,
           non_negotiable_planned, non_negotiable_completed
    from public.my_review_facts(pg_temp.t() - 3, pg_temp.t() - 1)$$,
  $$values (2, 4, 3, 1800, 1, 2, 2, 1)$$,
  'facts: days, completion, effective focus, Perfect Days, standard days with the standard IN FORCE (50), non-negotiables 1 / 2');
select results_eq(
  $$select * from public.my_review_facts(pg_temp.t() - 3, pg_temp.t() + 5)$$,
  $$select * from public.my_review_facts(pg_temp.t() - 3, pg_temp.t())$$,
  'a period never reaches past today');
select throws_ok($$select * from public.my_review_facts(pg_temp.t() - 40, pg_temp.t())$$,
  '22023', 'LI_INVALID_RANGE', 'at most 31 days');
select pg_temp.as_user('c');
select results_eq(
  $$select planned, non_negotiable_planned from public.my_review_facts(pg_temp.t() - 3, pg_temp.t() - 1)$$,
  $$values (0, 0)$$, 'owner-only: another user gets only their own (empty) facts');

select * from finish();
rollback;
