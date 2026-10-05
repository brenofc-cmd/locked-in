-- V2 Phase 8 · Monthly Champion + Personal Records + Milestones (pgTAP)
--
-- duo_duel_months() returns the Phase 7 per-day duel numbers for whole
-- months; the month is decided on the client (src/lib/monthly.ts, unit
-- tests). Here: which days come back (window, duel_since, pre-duo, old duo),
-- FINAL, equality with duo_duels, immutability of a FINAL month, timezones,
-- privacy and the privilege model; my_records(): every record, ties, pauses,
-- running sessions, closed days, owner-only.
--
-- A and B are a duo since the first day of the previous month (P), C is an
-- outsider, D is B's next partner, E (UTC+14) and F (UTC-11) are a duo in
-- far-apart time zones, R and S hold records. Past fixtures are written as
-- the database owner. One transaction, rolled back. docs/MONTHLY_COMPETITION.md.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(51);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a800-00000000000a', 'a@v2p8.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a800-00000000000b', 'b@v2p8.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a800-00000000000c', 'c@v2p8.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a800-00000000000d', 'd@v2p8.lockedin', '{"display_name":"Duda","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a800-00000000000e', 'e@v2p8.lockedin', '{"display_name":"Eva","timezone":"Pacific/Kiritimati"}'),
  ('00000000-0000-4000-a800-00000000000f', 'f@v2p8.lockedin', '{"display_name":"Fabio","timezone":"Pacific/Pago_Pago"}'),
  ('00000000-0000-4000-a800-000000000001', 'r@v2p8.lockedin', '{"display_name":"Rita","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a800-000000000002', 's@v2p8.lockedin', '{"display_name":"Saulo","timezone":"America/Sao_Paulo"}');

create function pg_temp.t() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
-- First day of the month k months before today's month (k = 0: this month).
create function pg_temp.m(k int) returns date language sql stable as $$
  select (date_trunc('month', pg_temp.t()::timestamp) - make_interval(months => k))::date
$$;
create function pg_temp.at(p_day date, p_time time) returns timestamptz language sql stable as $$
  select (p_day + p_time) at time zone 'America/Sao_Paulo'
$$;
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
create function pg_temp.focus(p_user uuid, p_day date, p_secs int, p_pause int default 0) returns void language sql as $$
  insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, ended_at,
    accumulated_pause_seconds, actual_focus_seconds, local_date, visible_to_partner)
  values (p_user, 'Bloco', greatest(p_secs, 60), 'completed', pg_temp.at(p_day, '09:00'),
          pg_temp.at(p_day, '09:00') + make_interval(secs => p_secs + p_pause), p_pause, p_secs, p_day, false);
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a800-' || lpad(p, 12, '0'), 'role', 'authenticated')::text, true);
$$;
create temp table snap (duel_date date, is_final boolean, me_planned int, me_completed int, me_standard int,
  me_focus_seconds int, me_focus_running boolean, partner_planned int, partner_completed int, partner_standard int,
  partner_focus_seconds int, partner_focus_running boolean);
grant all on snap to anon, authenticated;
grant execute on function pg_temp.t(), pg_temp.m(int), pg_temp.as_user(text) to anon, authenticated;

-- ------------------------------------------------------------- fixtures ----
-- A + B complete on P (the first day of the previous month).
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-a800-0000000000ab', 'LKD-V2P8AB', '00000000-0000-4000-a800-00000000000a');
insert into public.duo_members (duo_id, user_id, seat, joined_at) values
  ('00000000-0000-4000-a800-0000000000ab', '00000000-0000-4000-a800-00000000000a', 1, pg_temp.at(pg_temp.m(1), '07:00')),
  ('00000000-0000-4000-a800-0000000000ab', '00000000-0000-4000-a800-00000000000b', 2, pg_temp.at(pg_temp.m(1), '08:00'));
update public.profiles set daily_standard_percent = 50 where id = '00000000-0000-4000-a800-00000000000b';

-- Before the duo (two months ago): A 1 / 1 — never returned.
select pg_temp.day('00000000-0000-4000-a800-00000000000a', pg_temp.m(2) + 3, 1, 0, 0);
-- P+0, P+1: A 2/2, B 1/2.  P+2: A 1/2, B 2/2.  P+3: both 2/2.  P+4: nothing.
-- P+5: A 1/2; B 1/1 private (counts, never listed).  P+6: B focus 25 min.
select pg_temp.day('00000000-0000-4000-a800-00000000000a', pg_temp.m(1) + 0, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-00000000000b', pg_temp.m(1) + 0, 1, 0, 1);
select pg_temp.day('00000000-0000-4000-a800-00000000000a', pg_temp.m(1) + 1, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-00000000000b', pg_temp.m(1) + 1, 1, 1, 0);
select pg_temp.day('00000000-0000-4000-a800-00000000000a', pg_temp.m(1) + 2, 1, 0, 1);
select pg_temp.day('00000000-0000-4000-a800-00000000000b', pg_temp.m(1) + 2, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-00000000000a', pg_temp.m(1) + 3, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-00000000000b', pg_temp.m(1) + 3, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-00000000000a', pg_temp.m(1) + 5, 1, 0, 1);
select pg_temp.day('00000000-0000-4000-a800-00000000000b', pg_temp.m(1) + 5, 1, 0, 0, false);

alter table public.focus_sessions disable trigger user;
select pg_temp.focus('00000000-0000-4000-a800-00000000000b', pg_temp.m(1) + 6, 1500);
-- R: best day / week / month, pauses, running, open days.
-- Closed week W = the Monday two weeks ago: 10 000 s + 10 000 s + 1 800 s
-- (a session of 1 h with 30 min of pause counts 1 800 s).
select pg_temp.focus('00000000-0000-4000-a800-000000000001', date_trunc('week', (pg_temp.t() - 14)::timestamp)::date, 10000);
select pg_temp.focus('00000000-0000-4000-a800-000000000001', date_trunc('week', (pg_temp.t() - 14)::timestamp)::date + 1, 10000);
select pg_temp.focus('00000000-0000-4000-a800-000000000001', date_trunc('week', (pg_temp.t() - 14)::timestamp)::date + 2, 1800, 1800);
-- Today (open, current week): 25 000 s settled + a running session.
select pg_temp.focus('00000000-0000-4000-a800-000000000001', pg_temp.t(), 25000);
insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, local_date)
  values ('00000000-0000-4000-a800-000000000001', 'Agora', 3600, 'active', now() - interval '10 minutes', pg_temp.t());
-- S: ties — two days of 7 200 s (two months ago, different weeks).
select pg_temp.focus('00000000-0000-4000-a800-000000000002', pg_temp.m(2) + 1, 7200);
select pg_temp.focus('00000000-0000-4000-a800-000000000002', pg_temp.m(2) + 15, 7200);
alter table public.focus_sessions enable trigger user;

-- R Perfect Days: three months ago 3 (+1 day with a skip), two months ago 2,
-- an empty day is nothing, today (open) perfect does not count.
select pg_temp.day('00000000-0000-4000-a800-000000000001', pg_temp.m(3) + 1, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-000000000001', pg_temp.m(3) + 2, 1, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-000000000001', pg_temp.m(3) + 3, 3, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-000000000001', pg_temp.m(3) + 4, 2, 1, 0);
select pg_temp.day('00000000-0000-4000-a800-000000000001', pg_temp.m(2) + 1, 1, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-000000000001', pg_temp.m(2) + 2, 1, 0, 0, false);
select pg_temp.day('00000000-0000-4000-a800-000000000001', pg_temp.t(), 4, 0, 0);
-- S Perfect Days: 2 three months ago, 2 two months ago (tie → the earlier).
select pg_temp.day('00000000-0000-4000-a800-000000000002', pg_temp.m(3) + 5, 1, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-000000000002', pg_temp.m(3) + 6, 1, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-000000000002', pg_temp.m(2) + 5, 1, 0, 0);
select pg_temp.day('00000000-0000-4000-a800-000000000002', pg_temp.m(2) + 6, 1, 0, 0);

-- ------------------------------------------------------------- access ----
select set_config('role', 'anon', true);
select throws_ok($$select * from public.duo_duel_months()$$, '42501', null, 'anon cannot read months');
select throws_ok($$select * from public.my_records()$$, '42501', null, 'anon cannot read records');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('c');
select is_empty($$select * from public.duo_duel_months()$$, 'outsider / no duo: no month');

-- ------------------------------------------------------- which days ----
select pg_temp.as_user('a');
select is((select min(duel_date) from public.duo_duel_months()), pg_temp.m(1),
  'the months start on the day the duo became complete (P)');
select is((select count(*)::int from public.duo_duel_months() where duel_date < pg_temp.m(1)), 0,
  'no pre-duo day (two months ago) is ever returned');
select is((select max(duel_date) from public.duo_duel_months()), pg_temp.t(),
  'the last row is my local today');
select is((select count(*)::int from public.duo_duel_months()), (pg_temp.t() - pg_temp.m(1) + 1)::int,
  'one row per day from P through today (no gap, no future)');
select is((select count(*)::int from public.duo_duel_months(1) where duel_date < pg_temp.m(0)), 0,
  'p_months = 1: the current month only');
select is((select min(duel_date) from public.duo_duel_months(2)), pg_temp.m(1),
  'p_months = 2: the previous month too');
select is((select bool_and(is_final) from public.duo_duel_months() where duel_date < pg_temp.t()), true,
  'every closed day is FINAL (closed for both, nothing running)');
select is((select is_final from public.duo_duel_months() where duel_date = pg_temp.t()), false,
  'today is never FINAL');
select results_eq(
  $$select duel_date, me_planned, me_completed, me_standard, partner_planned, partner_completed, partner_standard,
           partner_focus_seconds
    from public.duo_duel_months() where duel_date between pg_temp.m(1) and pg_temp.m(1) + 6 order by duel_date$$,
  $$values (pg_temp.m(1) + 0, 2, 2, 80, 2, 1, 80, 0),
           (pg_temp.m(1) + 1, 2, 2, 80, 2, 1, 80, 0),
           (pg_temp.m(1) + 2, 2, 1, 80, 2, 2, 80, 0),
           (pg_temp.m(1) + 3, 2, 2, 80, 2, 2, 80, 0),
           (pg_temp.m(1) + 4, 0, 0, 80, 0, 0, 80, 0),
           (pg_temp.m(1) + 5, 2, 1, 80, 1, 1, 80, 0),
           (pg_temp.m(1) + 6, 0, 0, 80, 0, 0, 80, 1500)$$,
  'the numbers of P: skipped stays in planned, B''s private task counts, B''s focus to the second, the standard of each closed day (B''s 50 % only from today)');
select is(
  (select count(*)::int from (
     (select * from public.duo_duel_months() where duel_date > pg_temp.t() - 8
      except select * from public.duo_duels(8))
     union all
     (select * from public.duo_duels(8)
      except select * from public.duo_duel_months() where duel_date > pg_temp.t() - 8)) x), 0,
  'the same per-day numbers as duo_duels (the Daily Duel is the unit)');
select pg_temp.as_user('b');
select results_eq(
  $$select me_planned, me_completed, partner_planned, partner_completed
    from public.duo_duel_months() where duel_date = pg_temp.m(1) + 2$$,
  $$values (2, 2, 2, 1)$$, 'B sees the same day from the other side');
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-a800-00000000000a'
           and task_date < pg_temp.m(1)), 0, 'B still cannot read A''s pre-duo task');

-- ------------------------------------------- window, year boundary ----
reset role;
update public.duo_members set joined_at = now() - interval '400 days'
  where duo_id = '00000000-0000-4000-a800-0000000000ab';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select is((select min(duel_date) from public.duo_duel_months()), pg_temp.m(5),
  'an old duo: six calendar months back from this month (across a year boundary when needed)');
select is((select min(duel_date) from public.duo_duel_months(100)), pg_temp.m(11),
  'p_months is clamped to 12');
select is((select count(distinct date_trunc('month', duel_date::timestamp))::int from public.duo_duel_months()), 6,
  'exactly six distinct months by default');
reset role;
update public.duo_members set joined_at = pg_temp.at(pg_temp.m(1), '07:00')
  where duo_id = '00000000-0000-4000-a800-0000000000ab' and user_id = '00000000-0000-4000-a800-00000000000a';
update public.duo_members set joined_at = pg_temp.at(pg_temp.m(1), '08:00')
  where duo_id = '00000000-0000-4000-a800-0000000000ab' and user_id = '00000000-0000-4000-a800-00000000000b';
select is((select duel_since from public.duos where id = '00000000-0000-4000-a800-0000000000ab'), pg_temp.m(1),
  'duel_since is back to P');

-- ------------------------------------------------ immutability ----
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
insert into snap select * from public.duo_duel_months() where duel_date < pg_temp.m(0);
reset role;
-- B and A change their standard, A moves east (UTC+14) and back, A edits a
-- routine and gets a goal: nothing of a FINAL month may move.
update public.profiles set daily_standard_percent = 100 where id = '00000000-0000-4000-a800-00000000000b';
update public.profiles set daily_standard_percent = 10 where id = '00000000-0000-4000-a800-00000000000a';
update public.profiles set timezone = 'Pacific/Kiritimati' where id = '00000000-0000-4000-a800-00000000000a';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select ok((select count(*) from public.duo_duel_months()) > 0, 'A after moving east still reads the months');
reset role;
update public.profiles set timezone = 'America/Sao_Paulo' where id = '00000000-0000-4000-a800-00000000000a';
insert into public.goals (owner_id, title, goal_type) values ('00000000-0000-4000-a800-00000000000a', 'Meta nova', 'monthly');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select is(
  (select count(*)::int from (
     (select * from snap except select * from public.duo_duel_months() where duel_date < pg_temp.m(0))
     union all
     (select * from public.duo_duel_months() where duel_date < pg_temp.m(0) except select * from snap)) x), 0,
  'a FINAL month is identical after standards, timezone, goal changes (the standard of each day is its version)');
select ok(not exists (select 1 from snap where not is_final), 'every day of the closed month was FINAL');

-- ------------------------------------------------------- timezones ----
reset role;
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-a800-0000000000ef', 'LKD-V2P8EF', '00000000-0000-4000-a800-00000000000e');
insert into public.duo_members (duo_id, user_id, seat, joined_at) values
  ('00000000-0000-4000-a800-0000000000ef', '00000000-0000-4000-a800-00000000000e', 1, now() - interval '20 days'),
  ('00000000-0000-4000-a800-0000000000ef', '00000000-0000-4000-a800-00000000000f', 2, now() - interval '19 days');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('e');
select is((select max(duel_date) from public.duo_duel_months()), (now() at time zone 'Pacific/Kiritimati')::date,
  'UTC+14: the list ends on E''s own local today');
select results_eq(
  $$select is_final, partner_planned from public.duo_duel_months() where duel_date = (now() at time zone 'Pacific/Kiritimati')::date$$,
  $$values (false, 0)$$, 'a day F (UTC-11) has not reached is an empty, open side');
select is((select bool_or(is_final) from public.duo_duel_months()
           where duel_date > (now() at time zone 'Pacific/Pago_Pago')::date - 1), false,
  'nothing F has not closed is FINAL for E');
select pg_temp.as_user('f');
select is((select max(duel_date) from public.duo_duel_months()), (now() at time zone 'Pacific/Pago_Pago')::date,
  'UTC-11: the list ends on F''s own local today');
select is((select is_final from public.duo_duel_months() where duel_date = (now() at time zone 'Pacific/Pago_Pago')::date - 1),
  true, 'F''s yesterday is FINAL: closed for both (E is a day or two ahead)');
select is((select min(duel_date) from public.duo_duel_months()),
  (select duel_since from public.duos where id = '00000000-0000-4000-a800-0000000000ef'),
  'both members start on the stamped duel_since');

-- ------------------------------------------------ duo lifecycle ----
select pg_temp.as_user('a');
select lives_ok($$select public.leave_duo()$$, 'A ends the duo');
select is_empty($$select * from public.duo_duel_months()$$, 'after the end: A reads no month');
select pg_temp.as_user('b');
select is_empty($$select * from public.duo_duel_months()$$, 'after the end: B reads no month');
reset role;
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-a800-0000000000bd', 'LKD-V2P8BD', '00000000-0000-4000-a800-00000000000b');
insert into public.duo_members (duo_id, user_id, seat, joined_at) values
  ('00000000-0000-4000-a800-0000000000bd', '00000000-0000-4000-a800-00000000000b', 1, now() - interval '1 minute'),
  ('00000000-0000-4000-a800-0000000000bd', '00000000-0000-4000-a800-00000000000d', 2, now());
select set_config('role', 'authenticated', true);
select pg_temp.as_user('d');
select is((select min(duel_date) from public.duo_duel_months()), pg_temp.t(),
  'a new partner starts fresh: only the new duo''s days');
select is((select count(*)::int from public.duo_duel_months() where duel_date < pg_temp.t()), 0,
  'D never reads the old A–B month');
select pg_temp.as_user('b');
select is((select count(*)::int from public.duo_duel_months()), 1, 'B reads only the new duo (today)');

-- ------------------------------------------------------- privacy ----
reset role;
select is((select count(*)::int
           from pg_proc p, unnest(p.proallargtypes) as a(t)
           where p.oid = 'public.duo_duel_months(integer)'::regprocedure
             and a.t not in ('date'::regtype, 'integer'::regtype, 'boolean'::regtype)), 0,
  'duo_duel_months returns dates, integers and booleans only (no title, id or time)');
select ok((select prosecdef from pg_proc where oid = 'public.duo_duel_months(integer)'::regprocedure),
  'duo_duel_months is SECURITY DEFINER (the partner''s private tasks count, like duo_duels)');
select ok((select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.duo_duel_months(integer)'::regprocedure),
  'duo_duel_months pins an empty search_path');
select ok(not has_function_privilege('anon', 'public.duo_duel_months(integer)', 'execute'), 'anon: no EXECUTE on months');
select ok(has_function_privilege('authenticated', 'public.duo_duel_months(integer)', 'execute'), 'authenticated may read months');
select ok(not (select prosecdef from pg_proc where oid = 'public.my_records()'::regprocedure),
  'my_records is SECURITY INVOKER (RLS + owner filter)');
select ok((select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.my_records()'::regprocedure),
  'my_records pins an empty search_path');
select ok(not has_function_privilege('anon', 'public.my_records()', 'execute'), 'anon: no EXECUTE on records');
select is((select count(*)::int
           from pg_proc p, unnest(p.proallargtypes) as a(t)
           where p.oid = 'public.my_records()'::regprocedure
             and a.t not in ('date'::regtype, 'integer'::regtype)), 0,
  'my_records returns dates and integers only');
select is((select count(*)::int from information_schema.tables
           where table_schema in ('public', 'private')
             and (table_name ilike '%month%' or table_name ilike '%record%' or table_name ilike '%milestone%'
                  or table_name ilike '%achievement%' or table_name ilike '%champion%')
             -- goal_milestones: the Phase 3 steps of a goal, not a progression milestone
             and table_name <> 'goal_milestones'), 0,
  'no monthly result / record / milestone table: everything is derived');

-- ------------------------------------------------------- records ----
select set_config('role', 'authenticated', true);
select pg_temp.as_user('1');
select results_eq(
  $$select best_focus_day_seconds, best_focus_day from public.my_records()$$,
  $$values (25000, pg_temp.t())$$,
  'best focus day: settled effective focus (today''s finished session counts, the running one does not)');
select results_eq(
  $$select best_focus_week_seconds, best_focus_week from public.my_records()$$,
  $$values (21800, date_trunc('week', (pg_temp.t() - 14)::timestamp)::date)$$,
  'best focus week: closed weeks only (the current week''s 25 000 s does not count); pauses excluded (1 800 s of a 1 h session)');
select results_eq(
  $$select best_perfect_month_days, best_perfect_month from public.my_records()$$,
  $$values (3, pg_temp.m(3))$$,
  'most Perfect Days in a month: 3 (a skipped task breaks a day; today does not count)');
select results_eq(
  $$select total_focus_seconds, total_perfect_days from public.my_records()$$,
  $$values (46800, 5)$$,
  'totals for milestones: settled focus (no running session) and Perfect Days of closed days');
select is((select longest_streak from public.my_progress_summary()), 3,
  'the longest streak is the existing one (3 standard-met days in a row)');
select pg_temp.as_user('2');
select results_eq(
  $$select best_focus_day, best_perfect_month from public.my_records()$$,
  $$values (pg_temp.m(2) + 1, pg_temp.m(3))$$,
  'ties keep the FIRST day and the FIRST month');
select pg_temp.as_user('c');
select results_eq(
  $$select best_focus_day_seconds, best_focus_week_seconds, best_perfect_month_days, total_focus_seconds, total_perfect_days
    from public.my_records()$$,
  $$values (null::int, null::int, null::int, 0, 0)$$,
  'owner-only: another user reads only their own (empty) records');

select * from finish();
rollback;
