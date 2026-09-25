-- Stage 7 · standard, streak, daily series, habits, weekly competition and
-- privacy of the progress functions (pgTAP)
--
-- D is alone (streak / standard / series / focus), A and B are a duo
-- (competition), C is an outsider (isolation, habits). Everyone lives in
-- America/Sao_Paulo. History is inserted as the superuser on dates relative
-- to the local today T and the current week's Monday W0. One transaction,
-- rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(78);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-e000-00000000000a', 'a@test7.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-e000-00000000000b', 'b@test7.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-e000-00000000000c', 'c@test7.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-e000-00000000000d', 'd@test7.lockedin', '{"display_name":"Duda","timezone":"America/Sao_Paulo"}');

create function pg_temp.t() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
create function pg_temp.w0() returns date language sql stable as $$
  select pg_temp.t() - (extract(isodow from pg_temp.t())::int - 1)
$$;
-- Local wall-clock time on a date -> timestamptz.
create function pg_temp.at(p_day date, p_time time) returns timestamptz language sql stable as $$
  select (p_day + p_time) at time zone 'America/Sao_Paulo'
$$;
-- One-off tasks on a day: n completed, n skipped, n pending.
create function pg_temp.day(p_owner uuid, p_day date, p_done int, p_skipped int, p_pending int,
                            p_visible boolean default true) returns void language sql as $$
  insert into public.daily_tasks (owner_id, task_date, title, status, visible_to_partner)
  select p_owner, p_day, 'Task ' || s || ' ' || p_day,
         case when s <= p_done then 'completed'
              when s <= p_done + p_skipped then 'skipped'
              else 'pending' end,
         p_visible
  from generate_series(1, p_done + p_skipped + p_pending) as s;
$$;
create function pg_temp.focus(p_user uuid, p_start timestamptz, p_seconds int, p_visible boolean default true)
returns void language sql as $$
  insert into public.focus_sessions (user_id, title, planned_seconds, started_at, ended_at,
                                     actual_focus_seconds, status, visible_to_partner)
  values (p_user, 'Deep work', 3600, p_start, p_start + make_interval(secs => p_seconds),
          p_seconds, 'completed', p_visible);
$$;
create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
grant execute on function pg_temp.t(), pg_temp.w0(), pg_temp.rid(text) to anon, authenticated;

-- ------------------------------------------------------------- fixtures ----
-- D (standard 80): 8 met days, a missed day, 75 % with a skip (missed),
-- a neutral day, 5 / 5, exactly 80 %, a neutral day, then 8 met days.
select pg_temp.day('00000000-0000-4000-e000-00000000000d', pg_temp.t() - s, 1, 0, 0) from generate_series(15, 22) s;
select pg_temp.day('00000000-0000-4000-e000-00000000000d', pg_temp.t() - 14, 0, 0, 2);
select pg_temp.day('00000000-0000-4000-e000-00000000000d', pg_temp.t() - 13, 3, 1, 0);
select pg_temp.day('00000000-0000-4000-e000-00000000000d', pg_temp.t() - 11, 5, 0, 0);
select pg_temp.day('00000000-0000-4000-e000-00000000000d', pg_temp.t() - 10, 4, 0, 1);
select pg_temp.day('00000000-0000-4000-e000-00000000000d', pg_temp.t() - s, 1, 0, 0) from generate_series(1, 8) s;
select pg_temp.day('00000000-0000-4000-e000-00000000000d', pg_temp.t(), 0, 0, 2);
insert into v select 'd_today_1', id from public.daily_tasks
  where owner_id = '00000000-0000-4000-e000-00000000000d' and task_date = pg_temp.t() order by title limit 1;
insert into v select 'd_today_2', id from public.daily_tasks
  where owner_id = '00000000-0000-4000-e000-00000000000d' and task_date = pg_temp.t() order by title desc limit 1;

-- D's focus: a session started at 23:50 belongs to the day it started.
alter table public.focus_sessions disable trigger focus_sessions_lifecycle;
select pg_temp.focus('00000000-0000-4000-e000-00000000000d', pg_temp.at(pg_temp.t() - 2, '23:50'), 1800);
select pg_temp.focus('00000000-0000-4000-e000-00000000000d', pg_temp.at(pg_temp.t() - 1, '10:00'), 1500);

-- A and B: a duo since W2's Monday (A joined in W3, B completed it in W2).
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-e000-0000000000ab', 'LKD-TST7AB', '00000000-0000-4000-e000-00000000000a');
insert into public.duo_members (duo_id, user_id, seat, joined_at) values
  ('00000000-0000-4000-e000-0000000000ab', '00000000-0000-4000-e000-00000000000a', 1, pg_temp.at(pg_temp.w0() - 18, '12:00')),
  ('00000000-0000-4000-e000-0000000000ab', '00000000-0000-4000-e000-00000000000b', 2, pg_temp.at(pg_temp.w0() - 14, '08:00'));

-- W3 (before the duo): both 2 / 2.
select pg_temp.day('00000000-0000-4000-e000-00000000000a', pg_temp.w0() - 20, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-e000-00000000000b', pg_temp.w0() - 20, 2, 0, 0);
-- W2: A 3 / 4 (one skipped), B 4 / 5 (one completion private) -> B wins.
select pg_temp.day('00000000-0000-4000-e000-00000000000a', pg_temp.w0() - 14, 3, 1, 0);
select pg_temp.day('00000000-0000-4000-e000-00000000000b', pg_temp.w0() - 12, 3, 0, 1);
select pg_temp.day('00000000-0000-4000-e000-00000000000b', pg_temp.w0() - 12, 1, 0, 0, false);
-- W1: A 2 / 2 + 2 / 3 = 4 / 5, B 5 / 5 + 3 / 5 = 8 / 10 -> exact draw.
select pg_temp.day('00000000-0000-4000-e000-00000000000a', pg_temp.w0() - 7, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-e000-00000000000a', pg_temp.w0() - 4, 2, 0, 1);
select pg_temp.day('00000000-0000-4000-e000-00000000000b', pg_temp.w0() - 6, 5, 0, 0);
select pg_temp.day('00000000-0000-4000-e000-00000000000b', pg_temp.w0() - 3, 3, 2, 0);
select pg_temp.focus('00000000-0000-4000-e000-00000000000a', pg_temp.at(pg_temp.w0() - 7, '10:00'), 1500);
select pg_temp.focus('00000000-0000-4000-e000-00000000000b', pg_temp.at(pg_temp.w0() - 6, '09:00'), 600, false);
alter table public.focus_sessions enable trigger focus_sessions_lifecycle;
-- Today: A 1 / 2 (the open one private), B 1 / 1 private.
select pg_temp.day('00000000-0000-4000-e000-00000000000a', pg_temp.t(), 1, 0, 0);
select pg_temp.day('00000000-0000-4000-e000-00000000000a', pg_temp.t(), 0, 0, 1, false);
insert into v select 'a_private', id from public.daily_tasks
  where owner_id = '00000000-0000-4000-e000-00000000000a' and task_date = pg_temp.t() and not visible_to_partner;
select pg_temp.day('00000000-0000-4000-e000-00000000000b', pg_temp.t(), 1, 0, 0, false);

-- C: a routine since T-5 (materialised when C opens the app), 4 of the 5
-- closed occurrences done, and a one-off (not a habit).
insert into public.routine_items (id, owner_id, title, days_of_week, start_date)
  values ('00000000-0000-4000-e000-0000000000c1', '00000000-0000-4000-e000-00000000000c', 'Read',
          array[1,2,3,4,5,6,7]::smallint[], pg_temp.t() - 5);
select pg_temp.day('00000000-0000-4000-e000-00000000000c', pg_temp.t() - 1, 1, 0, 0);

-- ------------------------------------------------------------- STANDARD ---
select is((select daily_standard_percent from public.profiles where id = '00000000-0000-4000-e000-00000000000d'),
  80::smallint, 'the daily standard defaults to 80 %');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
select throws_ok($$update public.profiles set daily_standard_percent = 0 where id = '00000000-0000-4000-e000-00000000000d'$$,
  '23514', null, 'a standard of 0 % is refused');
select throws_ok($$update public.profiles set daily_standard_percent = 101 where id = '00000000-0000-4000-e000-00000000000d'$$,
  '23514', null, 'a standard above 100 % is refused');
update public.profiles set daily_standard_percent = 10 where id = '00000000-0000-4000-e000-00000000000a';

-- ---------------------------------------------------------------- STREAK ---
select results_eq(
  $$select today, standard, streak_before_today, current_streak, longest_closed, longest_streak,
           today_planned, today_completed, first_task_date from public.my_progress_summary()$$,
  $$values (pg_temp.t(), 80, 10, 10, 10, 10, 2, 0, pg_temp.t() - 22)$$,
  'summary: 10 closed days in a row (neutral days skipped, 80 % exactly counts), today open');
select is((select current_streak from public.my_progress_summary()), 10,
  'an incomplete today does not break the streak');

update public.daily_tasks set status = 'completed' where id = pg_temp.rid('d_today_1');
select is((select current_streak from public.my_progress_summary()), 10,
  'today at 50 % (below the standard) does not count yet');
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('d_today_2');
select results_eq($$select current_streak, longest_closed, longest_streak from public.my_progress_summary()$$,
  $$values (11, 10, 11)$$, 'today meets the standard: it counts, and becomes the longest streak live');
update public.daily_tasks set status = 'pending' where id = pg_temp.rid('d_today_2');
select results_eq($$select current_streak, longest_streak from public.my_progress_summary()$$,
  $$values (10, 10)$$, 'undo: today stops counting and the longest streak is not left inflated');

update public.profiles set daily_standard_percent = 100 where id = '00000000-0000-4000-e000-00000000000d';
select results_eq($$select standard, streak_before_today, longest_closed from public.my_progress_summary()$$,
  $$values (100, 8, 8)$$, 'standard 100 %: history recalculated (the 80 % day now breaks it)');
update public.profiles set daily_standard_percent = 75 where id = '00000000-0000-4000-e000-00000000000d';
select results_eq($$select streak_before_today, longest_closed from public.my_progress_summary()$$,
  $$values (11, 11)$$, 'standard 75 %: 3 done + 1 skipped (75 %) now meets it — skipped stays in the total');
update public.profiles set daily_standard_percent = 80 where id = '00000000-0000-4000-e000-00000000000d';
select is((select streak_before_today from public.my_progress_summary()), 10, 'back to 80 %: 10 again');

-- ---------------------------------------------------------------- SERIES ---
select results_eq(
  $$select day, planned, completed from public.my_daily_progress(pg_temp.t() - 14, pg_temp.t() - 9) order by day$$,
  $$values (pg_temp.t() - 14, 2, 0), (pg_temp.t() - 13, 4, 3), (pg_temp.t() - 12, 0, 0),
           (pg_temp.t() - 11, 5, 5), (pg_temp.t() - 10, 5, 4), (pg_temp.t() - 9, 0, 0)$$,
  'daily series: one row per day, neutral days have 0 planned, skipped counts as planned');
select results_eq(
  $$select sum(planned)::int, sum(completed)::int,
           (count(*) filter (where planned > 0 and completed = planned))::int
    from public.my_daily_progress(pg_temp.t() - 22, pg_temp.t() - 1)$$,
  $$values (32, 28, 17)$$, 'totals and perfect days over closed history');
select is((select max(day) from public.my_daily_progress(pg_temp.t() - 1, pg_temp.t() + 10)), pg_temp.t(),
  'the series never goes past today');
select throws_ok($$select * from public.my_daily_progress(pg_temp.t() - 401, pg_temp.t())$$,
  '22023', 'LI_INVALID_RANGE', 'more than 400 days is refused');
select throws_ok($$select * from public.my_daily_progress(null, pg_temp.t())$$,
  '22023', 'LI_INVALID_RANGE', 'a range needs a start');

-- ----------------------------------------------------------------- FOCUS ---
select results_eq(
  $$select day, focus_seconds, focus_sessions from public.my_daily_progress(pg_temp.t() - 2, pg_temp.t() - 1) order by day$$,
  $$values (pg_temp.t() - 2, 1800, 1), (pg_temp.t() - 1, 1500, 1)$$,
  'focus belongs to the local day the session started (23:50 -> that day)');
insert into v select 'd_live', s.id from public.start_focus_session('Live', 1500) s;
reset role;
update public.focus_sessions set started_at = now() - interval '600 seconds' where id = pg_temp.rid('d_live');
select set_config('role', 'authenticated', true);
select is((select sum(focus_seconds)::int from public.my_daily_progress(pg_temp.t() - 2, pg_temp.t())), 3900,
  'a running session counts its elapsed time (600 s) before it ends');
select is((select sum(focus_sessions)::int from public.my_daily_progress(pg_temp.t() - 30, pg_temp.t())), 3,
  'three sessions in the series, none invented');

-- ------------------------------------------------------------ ISOLATION ---
select is((select daily_standard_percent from public.profiles where id = '00000000-0000-4000-e000-00000000000d'),
  80::smallint, 'D sets their own standard');
reset role;
select is((select daily_standard_percent from public.profiles where id = '00000000-0000-4000-e000-00000000000a'),
  80::smallint, 'D could not change A''s standard (RLS: 0 rows)');
select set_config('role', 'authenticated', true);
select is((select count(*)::int from public.my_habits(pg_temp.t() - 30, pg_temp.t())), 0, 'D has no habits (C''s are not visible)');
select is((select count(*)::int from public.duo_weeks(2) where partner_planned is not null), 0,
  'without a duo, duo_weeks has no partner side');
select is((select count(*)::int from public.partner_progress_summary()), 0, 'without a duo, no partner summary');

-- ---------------------------------------------------------------- HABITS ---
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
select is(public.ensure_my_daily_tasks(), pg_temp.t(), 'C opens the app: routine materialised up to today');
reset role;
update public.daily_tasks set status = 'completed'
  where routine_item_id = '00000000-0000-4000-e000-0000000000c1' and task_date between pg_temp.t() - 5 and pg_temp.t() - 2;
update public.daily_tasks set status = 'completed'
  where routine_item_id = '00000000-0000-4000-e000-0000000000c1' and task_date = pg_temp.t();
select set_config('role', 'authenticated', true);
select results_eq($$select title, planned, completed from public.my_habits(pg_temp.t() - 30, pg_temp.t())$$,
  $$values ('Read'::text, 5, 4)$$, 'habits: recurring tasks only, closed days only (today excluded), one-offs excluded');
reset role;
update public.routine_items set title = 'Read 20 pages' where id = '00000000-0000-4000-e000-0000000000c1';
select set_config('role', 'authenticated', true);
select is((select title from public.my_habits(pg_temp.t() - 30, pg_temp.t())), 'Read 20 pages', 'an active habit shows its current name');
reset role;
update public.routine_items set end_date = pg_temp.t() - 1 where id = '00000000-0000-4000-e000-0000000000c1';
select set_config('role', 'authenticated', true);
select is((select title from public.my_habits(pg_temp.t() - 30, pg_temp.t())), 'Read', 'an archived habit shows its last snapshot');
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-e000-00000000000a'), 0,
  'outsider reads none of A''s tasks');
select is((select coalesce(sum(planned), 0)::int from private.day_stats('00000000-0000-4000-e000-00000000000a', pg_temp.t() - 30, pg_temp.t())),
  0, 'outsider gets nothing of A''s through the private helper (RLS applies)');
select is((select count(*)::int from private.streaks('00000000-0000-4000-e000-00000000000a') where today_planned > 0 or streak_before_today > 0),
  0, 'outsider cannot read A''s streak inputs');

-- ----------------------------------------------------------- COMPETITION ---
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
select results_eq($$select week_start, is_current from public.duo_weeks(3)$$,
  $$values (pg_temp.w0(), true), (pg_temp.w0() - 7, false), (pg_temp.w0() - 14, false), (pg_temp.w0() - 21, false)$$,
  'duo_weeks: the current week first, then completed weeks, newest first');
select results_eq(
  $$select me_planned, me_completed, me_focus_seconds, me_perfect_days,
           partner_planned, partner_completed, partner_focus_seconds, partner_perfect_days
    from public.duo_weeks(3) where week_start = pg_temp.w0() - 7$$,
  $$values (5, 4, 1500, 1, 10, 8, 600, 1)$$,
  'W1: 4 / 5 vs 8 / 10 (an exact draw), perfect days and focus (private session counted) per member');
select results_eq(
  $$select me_planned, me_completed, me_perfect_days, partner_planned, partner_completed
    from public.duo_weeks(3) where week_start = pg_temp.w0() - 14$$,
  $$values (4, 3, 0, 5, 4)$$,
  'W2: skipped stays in my total, the partner''s private completion is in theirs');
select results_eq(
  $$select me_planned, me_completed, partner_planned, partner_completed, partner_focus_seconds, partner_perfect_days
    from public.duo_weeks(3) where week_start = pg_temp.w0() - 21$$,
  $$values (2, 2, null::int, null::int, null::int, null::int)$$,
  'W3 started before the duo was complete: no partner side (never a head-to-head result)');
select results_eq(
  $$select me_planned, me_completed, partner_planned, partner_completed from public.duo_weeks(3) where is_current$$,
  $$values (2, 1, 1, 1)$$,
  'the current week shows both sides up to today, private tasks included in the counts');
select is((select count(*)::int from public.duo_weeks(100)), 27, 'at most 26 completed weeks (+ the current one)');
select is((select count(*)::int from public.duo_weeks(-5)), 1, 'a negative count returns only the current week');

update public.profiles set daily_standard_percent = 50 where id = '00000000-0000-4000-e000-00000000000a';
select results_eq($$select me_planned, me_completed, partner_planned, partner_completed from public.duo_weeks(3) where week_start = pg_temp.w0() - 7$$,
  $$values (5, 4, 10, 8)$$, 'the standard never changes the competition (raw completion only)');
update public.profiles set daily_standard_percent = 80 where id = '00000000-0000-4000-e000-00000000000a';

select results_eq($$select streak_before_today, current_streak, standard from public.partner_progress_summary()$$,
  $$values (0, 1, 80)$$, 'partner summary: B''s streak (60 % day broke it, today private 1 / 1 counts) and standard');

-- The partner sees aggregates only.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.daily_tasks where id = pg_temp.rid('a_private')), 0,
  'B cannot read A''s private task');
select results_eq($$select partner_planned, partner_completed from public.duo_weeks(1) where is_current$$,
  $$values (2, 1)$$, 'but A''s private task is in the aggregate B sees');
select results_eq($$select me_planned, me_completed, partner_planned, partner_completed from public.duo_weeks(3) where week_start = pg_temp.w0() - 7$$,
  $$values (10, 8, 5, 4)$$, 'B sees the same week from their side');
select is((select count(*)::int from public.duo_weeks(3) where week_start = pg_temp.w0() - 21 and partner_planned is null), 1,
  'B does not see A''s history from before the duo either');
select is((select coalesce(sum(planned), 0)::int from private.day_stats('00000000-0000-4000-e000-00000000000a', pg_temp.t(), pg_temp.t())),
  1, 'the invoker helper gives the partner only shared rows (the private one is hidden)');
update public.profiles set daily_standard_percent = 100 where id = '00000000-0000-4000-e000-00000000000b';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
select is((select standard from public.partner_progress_summary()), 100, 'the partner''s streak uses the partner''s own standard');
select is((select current_streak from public.partner_progress_summary()), 1, 'B''s private 1 / 1 today still meets 100 %');

-- Outsider: no partner side at all.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.duo_weeks(3) where partner_planned is not null or partner_completed is not null
           or partner_focus_seconds is not null or partner_perfect_days is not null), 0,
  'outsider: duo_weeks returns only their own numbers');
select is((select count(*)::int from public.partner_progress_summary()), 0, 'outsider: no partner summary');

-- --------------------------------------------------------------- SHAPE ----
reset role;
select is((select count(*)::int from pg_proc p cross join lateral unnest(coalesce(p.proallargtypes, array[]::oid[])) t(typ)
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('duo_weeks', 'partner_progress_summary') and t.typ = 'text'::regtype), 0,
  'the partner-facing functions return no text column (no title, note or category can leave)');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
           and proname in ('my_progress_summary', 'my_daily_progress', 'my_habits')), 0,
  'the owner functions are SECURITY INVOKER (RLS applies)');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
           and proname in ('duo_weeks', 'partner_progress_summary')
           and 'search_path=""' = any (proconfig)), 2,
  'the two DEFINER functions pin search_path to empty');
select has_column('public', 'profiles', 'daily_standard_percent', 'profiles has daily_standard_percent');
select col_not_null('public', 'profiles', 'daily_standard_percent', 'the standard is never null');
select hasnt_table('public', 'daily_stats', 'no stats cache table');
select hasnt_table('public', 'weekly_results', 'no weekly results cache table');
select is((select count(*)::int from information_schema.tables where table_schema = 'public'), 7,
  'Stage 7 adds no table (profiles, duos, duo_members, routine_items, daily_tasks, activity_events, focus_sessions)');

-- ------------------------------------------------------------- GRANTS ----
select ok(not has_function_privilege('anon', 'public.my_progress_summary()', 'execute'), 'anon cannot execute my_progress_summary');
select ok(not has_function_privilege('anon', 'public.my_daily_progress(date, date)', 'execute'), 'anon cannot execute my_daily_progress');
select ok(not has_function_privilege('anon', 'public.my_habits(date, date)', 'execute'), 'anon cannot execute my_habits');
select ok(not has_function_privilege('anon', 'public.duo_weeks(integer)', 'execute'), 'anon cannot execute duo_weeks');
select ok(not has_function_privilege('anon', 'public.partner_progress_summary()', 'execute'), 'anon cannot execute partner_progress_summary');
select ok(not has_function_privilege('anon', 'private.day_stats(uuid, date, date)', 'execute'), 'anon cannot execute private.day_stats');
select ok(not has_function_privilege('anon', 'private.materialize_tasks(uuid)', 'execute'), 'anon cannot execute private.materialize_tasks');
select ok(has_function_privilege('authenticated', 'public.duo_weeks(integer)', 'execute'), 'authenticated can execute duo_weeks');
select ok(not has_column_privilege('anon', 'public.profiles', 'daily_standard_percent', 'update'), 'anon cannot update a standard');
select ok(has_column_privilege('authenticated', 'public.profiles', 'daily_standard_percent', 'update'), 'authenticated may update the standard column (RLS: own row)');

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.my_progress_summary()', '42501', null, 'anon: my_progress_summary refused');
select throws_ok('select * from public.duo_weeks(3)', '42501', null, 'anon: duo_weeks refused');
select throws_ok('select * from public.partner_progress_summary()', '42501', null, 'anon: partner_progress_summary refused');
select throws_ok($$select * from public.my_daily_progress('2026-01-01', '2026-01-02')$$, '42501', null, 'anon: my_daily_progress refused');
select throws_ok($$select * from public.my_habits('2026-01-01', '2026-01-02')$$, '42501', null, 'anon: my_habits refused');

-- An authenticated call without a user (no sub) is refused by the functions.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok('select * from public.my_progress_summary()', '42501', 'LI_NOT_AUTHENTICATED', 'no user: my_progress_summary refused');
select throws_ok('select * from public.duo_weeks(3)', '42501', 'LI_NOT_AUTHENTICATED', 'no user: duo_weeks refused');
select throws_ok('select * from public.partner_progress_summary()', '42501', 'LI_NOT_AUTHENTICATED', 'no user: partner_progress_summary refused');
select throws_ok($$select * from public.my_daily_progress('2026-01-01', '2026-01-02')$$, '42501', 'LI_NOT_AUTHENTICATED', 'no user: my_daily_progress refused');

-- ---------------------------------------------------------- MATERIALISE --
-- duo_weeks materialises the partner's routine too, so a partner who has
-- not opened the app today is still compared on their scheduled day.
reset role;
insert into public.routine_items (owner_id, title, days_of_week, start_date, materialized_through)
  values ('00000000-0000-4000-e000-00000000000b', 'Beto routine', array[1,2,3,4,5,6,7]::smallint[], pg_temp.t(), null);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
select results_eq($$select partner_planned, partner_completed from public.duo_weeks(0)$$,
  $$values (2, 1)$$, 'the partner''s routine for today is materialised before the comparison');
reset role;
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-e000-00000000000b'
           and task_date = pg_temp.t() and title = 'Beto routine'), 1, 'exactly one occurrence created');

select * from finish();
rollback;
