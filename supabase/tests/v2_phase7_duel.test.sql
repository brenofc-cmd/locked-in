-- V2 Phase 7 · Daily Duel (pgTAP)
--
-- A and B are a duo since T-3 (both in São Paulo), C is an outsider, D is B's
-- next partner (after the A–B duo ends). duo_duels() derives every number
-- from daily_tasks / focus_sessions; nothing is stored. Past fixtures are
-- written as the database owner (what "time passing" means in one
-- transaction). One transaction, rolled back. docs/DUEL.md.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(40);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a700-00000000000a', 'a@v2p7.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a700-00000000000b', 'b@v2p7.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a700-00000000000c', 'c@v2p7.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a700-00000000000d', 'd@v2p7.lockedin', '{"display_name":"Duda","timezone":"America/Sao_Paulo"}');

create function pg_temp.t() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
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
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a700-00000000000' || p, 'role', 'authenticated')::text, true);
$$;
create temp table codes (code text);
grant all on codes to anon, authenticated;
create temp table snap (duel_date date, is_final boolean, me_planned int, me_completed int, me_standard int,
  me_focus_seconds int, me_focus_running boolean, partner_planned int, partner_completed int, partner_standard int,
  partner_focus_seconds int, partner_focus_running boolean);
grant all on snap to anon, authenticated;
grant execute on function pg_temp.t(), pg_temp.as_user(text) to anon, authenticated;

-- ------------------------------------------------------------- fixtures ----
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-a700-0000000000ab', 'LKD-V2P7AB', '00000000-0000-4000-a700-00000000000a');
insert into public.duo_members (duo_id, user_id, seat, joined_at) values
  ('00000000-0000-4000-a700-0000000000ab', '00000000-0000-4000-a700-00000000000a', 1, pg_temp.at(pg_temp.t() - 4, '20:00')),
  ('00000000-0000-4000-a700-0000000000ab', '00000000-0000-4000-a700-00000000000b', 2, pg_temp.at(pg_temp.t() - 3, '08:00'));
update public.profiles set daily_standard_percent = 50 where id = '00000000-0000-4000-a700-00000000000b';

-- T-5 (before the duo): A 1 / 1.
select pg_temp.day('00000000-0000-4000-a700-00000000000a', pg_temp.t() - 5, 1, 0, 0);
-- T-3: A 2 / 2; B 1 / 2 and 25 min of focus.
select pg_temp.day('00000000-0000-4000-a700-00000000000a', pg_temp.t() - 3, 2, 0, 0);
select pg_temp.day('00000000-0000-4000-a700-00000000000b', pg_temp.t() - 3, 1, 0, 1);
-- T-1: A 2 / 3 (one skipped); B 2 / 2 (one private).
select pg_temp.day('00000000-0000-4000-a700-00000000000a', pg_temp.t() - 1, 2, 1, 0);
select pg_temp.day('00000000-0000-4000-a700-00000000000b', pg_temp.t() - 1, 1, 0, 0);
select pg_temp.day('00000000-0000-4000-a700-00000000000b', pg_temp.t() - 1, 1, 0, 0, false);
-- Today: A 1 / 2 (the completed one private); 10 min done + a running session.
select pg_temp.day('00000000-0000-4000-a700-00000000000a', pg_temp.t(), 1, 0, 0, false);
select pg_temp.day('00000000-0000-4000-a700-00000000000a', pg_temp.t(), 0, 0, 1);

alter table public.focus_sessions disable trigger user;
insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, ended_at,
  actual_focus_seconds, local_date, visible_to_partner) values
  ('00000000-0000-4000-a700-00000000000b', 'Bloco', 3600, 'completed', pg_temp.at(pg_temp.t() - 3, '10:00'),
   pg_temp.at(pg_temp.t() - 3, '10:25'), 1500, pg_temp.t() - 3, false),
  ('00000000-0000-4000-a700-00000000000a', 'Cedo', 3600, 'completed', now() - interval '3 hours',
   now() - interval '170 minutes', 600, pg_temp.t(), true);
insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, local_date)
  values ('00000000-0000-4000-a700-00000000000a', 'Agora', 3600, 'active', now() - interval '10 minutes', pg_temp.t());
alter table public.focus_sessions enable trigger user;

-- ------------------------------------------------------------- access ----
select set_config('role', 'anon', true);
select throws_ok($$select * from public.duo_duels()$$, '42501', null, 'anon cannot read duels');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('c');
select is_empty($$select * from public.duo_duels()$$, 'no duo: no duel');

-- ------------------------------------------------------------ numbers ----
select pg_temp.as_user('a');
select results_eq(
  $$select duel_date, is_final, me_planned, me_completed, me_standard, me_focus_seconds, me_focus_running,
           partner_planned, partner_completed, partner_standard, partner_focus_seconds, partner_focus_running
    from public.duo_duels()$$,
  $$values (pg_temp.t(),     false, 2, 1, 80, 600, true,  0, 0, 50, 0,    false),
           (pg_temp.t() - 1, true,  3, 2, 80, 0,   false, 2, 2, 50, 0,    false),
           (pg_temp.t() - 2, true,  0, 0, 80, 0,   false, 0, 0, 50, 0,    false),
           (pg_temp.t() - 3, true,  2, 2, 80, 0,   false, 2, 1, 50, 1500, false)$$,
  'A: today and the closed days since the duo, newest first (skipped and private count; running focus apart)');
select is((select count(*)::int from public.duo_duels() where duel_date < pg_temp.t() - 3), 0,
  'no duel before the day the duo became complete (in both calendars)');
select pg_temp.as_user('b');
select results_eq(
  $$select duel_date, is_final, me_planned, me_completed, me_standard, me_focus_seconds, me_focus_running,
           partner_planned, partner_completed, partner_standard, partner_focus_seconds, partner_focus_running
    from public.duo_duels()$$,
  $$values (pg_temp.t(),     false, 0, 0, 50, 0,    false, 2, 1, 80, 600, true),
           (pg_temp.t() - 1, true,  2, 2, 50, 0,    false, 3, 2, 80, 0,   false),
           (pg_temp.t() - 2, true,  0, 0, 50, 0,    false, 0, 0, 80, 0,   false),
           (pg_temp.t() - 3, true,  2, 1, 50, 1500, false, 2, 2, 80, 0,   false)$$,
  'B sees the same duels from the other side');
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-a700-00000000000a'
           and not visible_to_partner), 0, 'B still cannot read A''s private task (only its count)');

-- ------------------------------------------------------------ privacy ----
reset role;
select is((select count(*)::int
           from pg_proc p, unnest(p.proallargtypes) as a(t)
           where p.oid = 'public.duo_duels(integer)'::regprocedure
             and a.t not in ('date'::regtype, 'integer'::regtype, 'boolean'::regtype)), 0,
  'duo_duels returns dates, integers and booleans only (no title, note or time)');
select ok((select prosecdef from pg_proc where oid = 'public.duo_duels(integer)'::regprocedure),
  'duo_duels is SECURITY DEFINER (the partner''s private tasks count, like duo_weeks)');
select ok((select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.duo_duels(integer)'::regprocedure),
  'duo_duels pins an empty search_path');
select ok(not (select prosecdef from pg_proc where oid = 'private.duel_side(uuid, date, date)'::regprocedure),
  'the side helper is INVOKER');
select ok(not has_function_privilege('authenticated', 'private.duel_side(uuid, date, date)', 'execute'),
  'authenticated cannot call the side helper directly');
select ok(not has_function_privilege('anon', 'public.duo_duels(integer)', 'execute'), 'anon has no EXECUTE');
select ok(has_function_privilege('authenticated', 'public.duo_duels(integer)', 'execute'),
  'authenticated may call duo_duels');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'duo_duels'), 1, 'one duo_duels, no overload');
select is((select count(*)::int from information_schema.tables
           where table_schema in ('public', 'private') and table_name ilike '%duel%'), 0,
  'no duel table: the duel is derived, never stored');

-- ------------------------------------------------------------- p_days ----
update public.duo_members set joined_at = pg_temp.at(pg_temp.t() - 60, '08:00')
  where duo_id = '00000000-0000-4000-a700-0000000000ab';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select is((select count(*)::int from public.duo_duels(100)), 31, 'at most 31 days');
select is((select count(*)::int from public.duo_duels(0)), 1, 'at least today');
select is((select count(*)::int from public.duo_duels(null)), 8, 'null means the default 8');
select is((select max(duel_date) from public.duo_duels(3)), pg_temp.t(), 'the list ends at my local today');
reset role;
update public.duo_members set joined_at = pg_temp.at(pg_temp.t() - 4, '20:00')
  where user_id = '00000000-0000-4000-a700-00000000000a';
update public.duo_members set joined_at = pg_temp.at(pg_temp.t() - 3, '08:00')
  where user_id = '00000000-0000-4000-a700-00000000000b';

-- ----------------------------------------------------------- timezone ----
-- B lives a day ahead: B's T is closed, B's today is T+1.
update public.profiles set history_locked_through = pg_temp.t() where id = '00000000-0000-4000-a700-00000000000b';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
select results_eq(
  $$select duel_date, is_final, me_planned, partner_planned from public.duo_duels(2)$$,
  $$values (pg_temp.t() + 1, false, 0, 0), (pg_temp.t(), false, 0, 2)$$,
  'B''s list is framed by B''s today; A has not reached T+1 (empty side, never a future row)');
select pg_temp.as_user('a');
select is((select is_final from public.duo_duels() where duel_date = pg_temp.t()), false,
  'T closed for B but open for A: still live');
select is((select count(*)::int from public.duo_duels() where duel_date > pg_temp.t()), 0,
  'A never sees a duel date after A''s own today');

-- -------------------------------------------------------- live vs final ----
reset role;
update public.profiles set history_locked_through = pg_temp.t() where id = '00000000-0000-4000-a700-00000000000a';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select results_eq(
  $$select is_final, me_focus_seconds, me_focus_running from public.duo_duels() where duel_date = pg_temp.t()$$,
  $$values (false, 600, true)$$,
  'closed for both, but a session of that day still runs: not final');
reset role;
alter table public.focus_sessions disable trigger user;
update public.focus_sessions set status = 'completed', ended_at = now(), actual_focus_seconds = 300
  where user_id = '00000000-0000-4000-a700-00000000000a' and status = 'active';
alter table public.focus_sessions enable trigger user;
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select results_eq(
  $$select is_final, me_focus_seconds, me_focus_running from public.duo_duels() where duel_date = pg_temp.t()$$,
  $$values (true, 900, false)$$,
  'the session ends: the day is final with its effective focus');

-- -------------------------------------------------- historical integrity ----
insert into snap select * from public.duo_duels() where is_final;
select is((select count(*)::int from snap), 4, 'four final duels recorded before the attacks');
select throws_ok($$update public.daily_tasks set status = 'completed'
                   where owner_id = '00000000-0000-4000-a700-00000000000a' and task_date = pg_temp.t() and status = 'pending'$$,
  'P0001', 'LI_HISTORY_LOCKED', 'A cannot complete a task of a final duel day');
select throws_ok($$insert into public.daily_tasks (task_date, title, status)
                   values (pg_temp.t() - 1, 'Tarde demais', 'completed')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'A cannot add a task to a final duel day');
select throws_ok($$delete from public.daily_tasks
                   where owner_id = '00000000-0000-4000-a700-00000000000a' and task_date = pg_temp.t() - 1 and status = 'skipped'$$,
  'P0001', 'LI_HISTORY_LOCKED', 'A cannot delete a skipped task of a final duel day');
select pg_temp.as_user('b');
select throws_ok($$update public.daily_tasks set status = 'completed'
                   where owner_id = '00000000-0000-4000-a700-00000000000b' and task_date = pg_temp.t() - 3 and status = 'pending'$$,
  'P0001', 'LI_HISTORY_LOCKED', 'B cannot fix the lost day afterwards');
reset role;
update public.profiles set timezone = 'Pacific/Pago_Pago' where id = '00000000-0000-4000-a700-00000000000a';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select set_eq(
  $$select duel_date, is_final, me_planned, me_completed, me_focus_seconds, partner_planned, partner_completed, partner_focus_seconds
    from public.duo_duels() where duel_date <= pg_temp.t()$$,
  $$select duel_date, is_final, me_planned, me_completed, me_focus_seconds, partner_planned, partner_completed, partner_focus_seconds
    from snap$$,
  'a timezone change does not reopen or move a final duel');
select set_eq(
  $$select duel_date from public.duo_duels() where is_final and duel_date <= pg_temp.t()$$,
  $$select duel_date from snap$$,
  'every final duel stays final');
-- Known limitation (ADR-076): Consistency reads the standard as it is now.
select pg_temp.as_user('b');
update public.profiles set daily_standard_percent = 90 where id = '00000000-0000-4000-a700-00000000000b';
select pg_temp.as_user('a');
select is((select distinct partner_standard from public.duo_duels()), 90,
  'the Daily Standard has no history: duels read the current one (ADR-038 / ADR-076)');

-- ------------------------------------------------------- duo lifecycle ----
select pg_temp.as_user('b');
select lives_ok('select public.leave_duo()', 'B ends the duo');
select is_empty($$select * from public.duo_duels()$$, 'B: no duel without a duo');
select pg_temp.as_user('a');
select is_empty($$select * from public.duo_duels()$$, 'A: the ex-partner''s duels are gone');
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-a700-00000000000a'), 8,
  'A keeps their own history');
select pg_temp.as_user('b');
insert into codes select invite_code from public.create_duo();
select is_empty($$select * from public.duo_duels()$$, 'waiting for a partner: no duel');
select pg_temp.as_user('d');
insert into public.daily_tasks (title) values ('Primeiro dia');
select lives_ok($$select public.join_duo((select code from codes))$$, 'D joins B');
select pg_temp.as_user('b');
select results_eq(
  $$select duel_date, partner_planned, partner_completed, partner_standard from public.duo_duels() order by duel_date$$,
  $$values (pg_temp.t(), 1, 0, 80), (pg_temp.t() + 1, 0, 0, 80)$$,
  'B with D: only from the new duo''s first day; D''s numbers, none of A''s');
select pg_temp.as_user('d');
select results_eq(
  $$select duel_date, me_planned, partner_planned, partner_completed from public.duo_duels()$$,
  $$values (pg_temp.t(), 1, 0, 0)$$,
  'D never receives a duel of the old duo (B''s earlier days are not returned)');

select * from finish();
rollback;
