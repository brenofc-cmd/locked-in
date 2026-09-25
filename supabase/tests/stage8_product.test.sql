-- Stage 8 · settings, reactions, challenges, duo end and templates (pgTAP)
--
-- A and B are a duo, C and D another duo, E has no duo (later A's new
-- partner). Everyone lives in America/Sao_Paulo; T = local today. One
-- transaction, rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(84);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-f000-00000000000a', 'a@test8.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-f000-00000000000b', 'b@test8.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-f000-00000000000c', 'c@test8.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-f000-00000000000d', 'd@test8.lockedin', '{"display_name":"Duda","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-f000-00000000000e', 'e@test8.lockedin', '{"display_name":"Eva","timezone":"America/Sao_Paulo"}');

insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-f000-0000000000ab', 'LKD-TST8AB', '00000000-0000-4000-f000-00000000000a'),
  ('00000000-0000-4000-f000-0000000000cd', 'LKD-TST8CD', '00000000-0000-4000-f000-00000000000c');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-f000-0000000000ab', '00000000-0000-4000-f000-00000000000a', 1),
  ('00000000-0000-4000-f000-0000000000ab', '00000000-0000-4000-f000-00000000000b', 2),
  ('00000000-0000-4000-f000-0000000000cd', '00000000-0000-4000-f000-00000000000c', 1),
  ('00000000-0000-4000-f000-0000000000cd', '00000000-0000-4000-f000-00000000000d', 2);

create function pg_temp.t() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-f000-00000000000' || p, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.msgs(p_topic text, p_event text) returns int language sql as $$
  select count(*)::int from realtime.messages where topic = p_topic and event = p_event
$$;
grant execute on function pg_temp.t(), pg_temp.rid(text), pg_temp.as_user(text), pg_temp.msgs(text, text)
  to anon, authenticated;

-- Tasks: A and B complete shared one-offs (feed events), C too (other duo).
insert into public.daily_tasks (owner_id, task_date, title, status) values
  ('00000000-0000-4000-f000-00000000000a', pg_temp.t(), 'Morning Run', 'completed'),
  ('00000000-0000-4000-f000-00000000000a', pg_temp.t(), 'Gym', 'completed'),
  ('00000000-0000-4000-f000-00000000000b', pg_temp.t(), 'Reading', 'completed'),
  ('00000000-0000-4000-f000-00000000000b', pg_temp.t(), 'Study', 'pending'),
  ('00000000-0000-4000-f000-00000000000c', pg_temp.t(), 'Caio task', 'completed');
insert into v select 'a_run', e.id from public.activity_events e join public.daily_tasks t on t.id = e.target_id
  where t.title = 'Morning Run' and t.owner_id = '00000000-0000-4000-f000-00000000000a';
insert into v select 'a_run_task', t.id from public.daily_tasks t
  where t.title = 'Morning Run' and t.owner_id = '00000000-0000-4000-f000-00000000000a';
insert into v select 'b_read', e.id from public.activity_events e join public.daily_tasks t on t.id = e.target_id
  where t.title = 'Reading' and t.owner_id = '00000000-0000-4000-f000-00000000000b';
insert into v select 'c_evt', e.id from public.activity_events e join public.daily_tasks t on t.id = e.target_id
  where t.title = 'Caio task' and t.owner_id = '00000000-0000-4000-f000-00000000000c';

-- ------------------------------------------------------------- SETTINGS ---
select is((select count(*)::int from public.user_settings where user_id::text like '00000000-0000-4000-f000-%'), 5,
  'every new profile gets a settings row');
select results_eq(
  $$select onboarding_completed_at is null, show_morning_briefing, share_new_tasks, notify_partner_activity,
           notify_reactions, notify_task_reminders, notify_weekly_review, quiet_hours_enabled
    from public.user_settings where user_id = '00000000-0000-4000-f000-00000000000a'$$,
  $$values (true, true, true, true, true, true, true, false)$$,
  'new users start with onboarding open and the documented defaults');

select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
update public.user_settings set show_morning_briefing = false, quiet_hours_enabled = true,
  quiet_hours_start = '23:00', quiet_hours_end = '06:30' where user_id = '00000000-0000-4000-f000-00000000000a';
select results_eq(
  $$select show_morning_briefing, quiet_hours_enabled, quiet_hours_start, quiet_hours_end
    from public.user_settings where user_id = '00000000-0000-4000-f000-00000000000a'$$,
  $$values (false, true, '23:00'::time, '06:30'::time)$$, 'a user updates their own settings');
select is((select count(*)::int from public.user_settings), 1, 'a user reads only their own settings (not the partner''s)');
update public.user_settings set show_morning_briefing = false where user_id = '00000000-0000-4000-f000-00000000000b';
select throws_ok($$update public.user_settings set quiet_hours_end = '23:00' where user_id = '00000000-0000-4000-f000-00000000000a'$$,
  '23514', null, 'quiet hours need distinct start and end');
select throws_ok($$update public.user_settings set user_id = '00000000-0000-4000-f000-00000000000b' where user_id = '00000000-0000-4000-f000-00000000000a'$$,
  '42501', null, 'the owner column is not writable');
select throws_ok($$insert into public.user_settings (user_id) values ('00000000-0000-4000-f000-00000000000e')$$,
  '42501', null, 'clients cannot insert settings rows');
update public.user_settings set onboarding_completed_at = '2001-01-01' where user_id = '00000000-0000-4000-f000-00000000000a';
select is((select onboarding_completed_at from public.user_settings where user_id = '00000000-0000-4000-f000-00000000000a'),
  now(), 'finishing onboarding stores the database time, not the client''s');
update public.user_settings set onboarding_completed_at = '2002-02-02' where user_id = '00000000-0000-4000-f000-00000000000a';
select is((select onboarding_completed_at from public.user_settings where user_id = '00000000-0000-4000-f000-00000000000a'),
  now(), 'a later write cannot rewrite the completion time');
reset role;
select is((select show_morning_briefing from public.user_settings where user_id = '00000000-0000-4000-f000-00000000000b'),
  true, 'A could not change B''s settings (RLS: 0 rows)');
select is((select count(*)::int from public.user_settings us join public.profiles p on p.id = us.user_id
           where p.id::text like '00000000-0000-4000-f000-%' and p.daily_standard_percent = 80), 5,
  'the Daily Standard stays on the profile (default 80)');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
update public.profiles set daily_standard_percent = 90, display_name = 'Ana B' where id = '00000000-0000-4000-f000-00000000000a';
update public.profiles set display_name = 'hacked' where id = '00000000-0000-4000-f000-00000000000b';
reset role;
select results_eq($$select display_name, daily_standard_percent from public.profiles where id = '00000000-0000-4000-f000-00000000000a'$$,
  $$values ('Ana B'::text, 90::smallint)$$, 'profile settings (name, standard) are updated by their owner');
select is((select display_name from public.profiles where id = '00000000-0000-4000-f000-00000000000b'), 'Beto',
  'the partner''s profile cannot be changed');

-- ------------------------------------------------------------ REACTIONS ---
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
select is(public.set_reaction(pg_temp.rid('a_run'), 'fire'), 'fire', 'B reacts to A''s completion');
select is(public.set_reaction(pg_temp.rid('a_run'), 'salute'), 'salute', 'choosing another reaction replaces it');
select is((select count(*)::int from public.reactions where activity_event_id = pg_temp.rid('a_run')), 1,
  'one active reaction per user per event');
select throws_ok(format($$select public.set_reaction(%L, 'fire')$$, pg_temp.rid('b_read')),
  'P0002', 'LI_NOT_FOUND', 'no reaction to one''s own activity');
select throws_ok(format($$insert into public.reactions (activity_event_id, reaction_type) values (%L, 'fire')$$, pg_temp.rid('b_read')),
  '42501', null, 'RLS also refuses a direct self reaction');
select throws_ok(format($$select public.set_reaction(%L, 'love')$$, pg_temp.rid('a_run')),
  '23514', null, 'only the approved reactions are stored');
select throws_ok(format($$select public.set_reaction(%L, 'fire')$$, pg_temp.rid('c_evt')),
  'P0002', 'LI_NOT_FOUND', 'no reaction to another duo''s event');
select throws_ok(format($$insert into public.reactions (activity_event_id, reaction_type, from_user_id) values (%L, 'fire', '00000000-0000-4000-f000-00000000000c')$$, pg_temp.rid('a_run')),
  '42501', null, 'from_user_id cannot be chosen by the client');
select is((select from_user_id from public.reactions where activity_event_id = pg_temp.rid('a_run')),
  '00000000-0000-4000-f000-00000000000b'::uuid, 'the reaction belongs to the caller (auth.uid())');

select pg_temp.as_user('a');
select is((select reaction_type from public.reactions where activity_event_id = pg_temp.rid('a_run')), 'salute',
  'the event owner reads the partner''s reaction');
update public.reactions set reaction_type = 'fire' where activity_event_id = pg_temp.rid('a_run');
delete from public.reactions where activity_event_id = pg_temp.rid('a_run');
select is(public.set_reaction(pg_temp.rid('b_read'), 'respect'), 'respect', 'A reacts to B''s completion');
reset role;
select is((select reaction_type from public.reactions where activity_event_id = pg_temp.rid('a_run')), 'salute',
  'the other member cannot overwrite or delete my reaction');
select set_config('role', 'authenticated', true);

select pg_temp.as_user('c');
select is((select count(*)::int from public.reactions), 0, 'another duo reads no reactions');
select throws_ok(format($$select public.set_reaction(%L, 'fire')$$, pg_temp.rid('a_run')),
  'P0002', 'LI_NOT_FOUND', 'an outsider cannot react');
select pg_temp.as_user('e');
select is((select count(*)::int from public.reactions), 0, 'a user without a duo reads no reactions');

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.reactions', '42501', null, 'anon cannot read reactions');
select throws_ok(format($$select public.set_reaction(%L, 'fire')$$, pg_temp.rid('a_run')), '42501', null, 'anon cannot react');
select throws_ok('select * from public.user_settings', '42501', null, 'anon cannot read settings');

reset role;
select ok(pg_temp.msgs('duo:00000000-0000-4000-f000-0000000000ab', 'reaction') >= 3,
  'each reaction change is broadcast on the duo channel');
select is((select count(*)::int from realtime.messages where topic = 'duo:00000000-0000-4000-f000-0000000000ab'
           and event = 'reaction' and (payload ? 'title' or payload::text like '%Morning Run%')), 0,
  'reaction broadcasts carry no title');
select is((select count(*)::int from public.activity_events where duo_id = '00000000-0000-4000-f000-0000000000ab'), 3,
  'reactions never create feed events');

-- The B-reaction survives until the event goes: undo removes both.
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
update public.daily_tasks set status = 'pending' where id = pg_temp.rid('a_run_task');
reset role;
select is((select count(*)::int from public.reactions where activity_event_id = pg_temp.rid('a_run')), 0,
  'undoing the completion removes its event and reactions');

-- ----------------------------------------------------------- CHALLENGES ---
-- Fixtures for progress: A 2 / 2 today and a 1500 s session; B 1 / 2 today
-- and a private completed task + private 600 s session.
insert into public.daily_tasks (owner_id, task_date, title, status, visible_to_partner) values
  ('00000000-0000-4000-f000-00000000000b', pg_temp.t(), 'Secret', 'completed', false);
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('a_run_task');
alter table public.focus_sessions disable trigger focus_sessions_lifecycle;
insert into public.focus_sessions (user_id, title, planned_seconds, started_at, ended_at, actual_focus_seconds, status, visible_to_partner, local_date) values
  ('00000000-0000-4000-f000-00000000000a', 'Deep', 3600, now() - interval '30 minutes', now() - interval '5 minutes', 1500, 'completed', true, pg_temp.t()),
  ('00000000-0000-4000-f000-00000000000b', 'Hidden', 3600, now() - interval '20 minutes', now() - interval '10 minutes', 600, 'completed', false, pg_temp.t()),
  ('00000000-0000-4000-f000-00000000000b', 'Running', 3600, now() - interval '5 minutes', null, null, 'active', true, pg_temp.t());
alter table public.focus_sessions enable trigger focus_sessions_lifecycle;
-- A past, completed challenge (as the superuser: clients cannot backdate).
insert into public.challenges (id, duo_id, created_by, title, challenge_type, target_value, start_date, end_date) values
  ('00000000-0000-4000-f000-0000000000c1', '00000000-0000-4000-f000-0000000000ab', '00000000-0000-4000-f000-00000000000a',
   'Past week', 'standard_days', 3, pg_temp.t() - 10, pg_temp.t() - 4);
insert into public.daily_tasks (owner_id, task_date, title, status) values
  ('00000000-0000-4000-f000-00000000000a', pg_temp.t() - 10, 'Old 1', 'completed'),
  ('00000000-0000-4000-f000-00000000000a', pg_temp.t() - 9, 'Old 2', 'completed'),
  ('00000000-0000-4000-f000-00000000000a', pg_temp.t() - 5, 'Old 3', 'pending'),
  ('00000000-0000-4000-f000-00000000000b', pg_temp.t() - 10, 'Old 4', 'completed'),
  ('00000000-0000-4000-f000-00000000000b', pg_temp.t() - 3, 'After the period', 'completed');

select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select lives_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('  No zero days ', 'standard_days', 5, pg_temp.t(), pg_temp.t() + 6)$$, 'a member creates a standard-days challenge');
select lives_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('Deep work week', 'focus_seconds', 36000, pg_temp.t(), pg_temp.t() + 6)$$, 'a member creates a focus challenge');
select lives_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('Next month', 'standard_days', 10, pg_temp.t() + 1, pg_temp.t() + 20)$$, 'a challenge can start later');
insert into v select 'ch_std', id from public.challenges where title = 'No zero days';
insert into v select 'ch_next', id from public.challenges where title = 'Next month';
select results_eq($$select title, duo_id, created_by from public.challenges where id = pg_temp.rid('ch_std')$$,
  $$values ('No zero days'::text, '00000000-0000-4000-f000-0000000000ab'::uuid, '00000000-0000-4000-f000-00000000000a'::uuid)$$,
  'title trimmed; duo and author come from the session');
select throws_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('Backdated', 'standard_days', 1, pg_temp.t() - 1, pg_temp.t())$$, '42501', null, 'a challenge cannot start in the past');
select throws_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('Backwards', 'standard_days', 1, pg_temp.t() + 5, pg_temp.t() + 2)$$, '23514', null, 'end before start is refused');
select throws_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('Zero', 'focus_seconds', 0, pg_temp.t(), pg_temp.t() + 2)$$, '23514', null, 'the target must be positive');
select throws_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('Too many', 'standard_days', 8, pg_temp.t(), pg_temp.t() + 6)$$, '23514', null, 'a standard-days goal fits the period');
select throws_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('Kind', 'pushups', 5, pg_temp.t(), pg_temp.t() + 6)$$, '23514', null, 'only the two challenge types exist');
select throws_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('   ', 'standard_days', 1, pg_temp.t(), pg_temp.t() + 6)$$, '23514', null, 'a blank title is refused');
select throws_ok($$insert into public.challenges (duo_id, title, challenge_type, target_value, start_date, end_date)
  values ('00000000-0000-4000-f000-0000000000cd', 'Theirs', 'standard_days', 1, pg_temp.t(), pg_temp.t() + 6)$$,
  '42501', null, 'the duo cannot be chosen by the client');
select throws_ok(format($$update public.challenges set target_value = 1 where id = %L$$, pg_temp.rid('ch_std')),
  '42501', null, 'challenges cannot be edited');

select results_eq(
  $$select me_value, partner_value from public.duo_challenges() where id = pg_temp.rid('ch_std')$$,
  $$values (1, 0)$$,
  'standard days: today counts once met — A 2 / 2 (1), B 2 / 3 incl. a private completion = 67 % < 80 (0)');
select results_eq(
  $$select me_value, partner_value from public.duo_challenges() where title = 'Deep work week'$$,
  $$values (1500, 900)$$,
  'focus: effective seconds of every session (a running one counts its elapsed time, Stage 9), private sessions counted in the aggregate');
select results_eq(
  $$select me_value, partner_value from public.duo_challenges() where id = '00000000-0000-4000-f000-0000000000c1'$$,
  $$values (2, 1)$$,
  'a past challenge counts only its own period (neutral days never count, later days ignored)');
select is((select count(*)::int from public.duo_challenges()), 4, 'the duo sees all its challenges');

select pg_temp.as_user('b');
select is((select count(*)::int from public.challenges), 4, 'the partner sees the duo''s challenges');
select results_eq(
  $$select me_value, partner_value from public.duo_challenges() where title = 'Deep work week'$$,
  $$values (900, 1500)$$, 'the partner sees the same challenge from their side');
delete from public.challenges where id = pg_temp.rid('ch_std');
select is((select count(*)::int from public.challenges where id = pg_temp.rid('ch_std')), 1,
  'a started challenge cannot be deleted');
delete from public.challenges where id = pg_temp.rid('ch_next');
select is((select count(*)::int from public.challenges where id = pg_temp.rid('ch_next')), 0,
  'either member deletes a challenge before it starts');

select pg_temp.as_user('c');
select is((select count(*)::int from public.challenges), 0, 'another duo sees none of them');
select is((select count(*)::int from public.duo_challenges()), 0, 'another duo gets no progress of them');
select pg_temp.as_user('e');
select throws_ok($$insert into public.challenges (title, challenge_type, target_value, start_date, end_date)
  values ('Alone', 'standard_days', 1, pg_temp.t(), pg_temp.t() + 6)$$, '42501', null, 'no duo, no challenge (RLS)');
select is((select count(*)::int from public.duo_challenges()), 0, 'no duo: duo_challenges is empty');

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.challenges', '42501', null, 'anon cannot read challenges');
select throws_ok('select * from public.duo_challenges()', '42501', null, 'anon cannot read challenge progress');
reset role;
select ok(pg_temp.msgs('duo:00000000-0000-4000-f000-0000000000ab', 'challenges_changed') >= 4,
  'creating / deleting a challenge is broadcast on the duo channel');
select is((select count(*)::int from pg_proc p cross join lateral unnest(coalesce(p.proallargtypes, array[]::oid[])) t(typ)
           where p.pronamespace = 'public'::regnamespace and p.proname = 'duo_challenges' and t.typ = 'text'::regtype), 2,
  'duo_challenges returns only the challenge''s own text (title, type) besides integers and dates');

-- ------------------------------------------------------------ TEMPLATES ---
select set_config('role', 'authenticated', true);
select pg_temp.as_user('e');
select is(array_length(public.add_routine_items(array['Read', 'read ', 'Gym'], array['work_study', 'work_study', 'body']), 1), 2,
  'template items are created once (case-insensitive duplicates skipped)');
select is(coalesce(array_length(public.add_routine_items(array['Read', 'Gym'], array['work_study', 'body']), 1), 0), 0,
  'applying the same template again (double click) creates nothing');
select is((select count(*)::int from public.routine_items where owner_id = '00000000-0000-4000-f000-00000000000e'), 2,
  'exactly two routine items exist');
select throws_ok($$select public.add_routine_items(array['A'], array['custom', 'body'])$$, '22023', 'LI_INVALID_INPUT',
  'titles and categories must match');
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.add_routine_items(array['A'], array['custom'])$$, '42501', null, 'anon cannot add routine items');

-- ------------------------------------------------------------- DUO END ----
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select lives_ok('select public.leave_duo()', 'A ends the duo');
reset role;
select is((select count(*)::int from public.duo_members where user_id in
  ('00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-00000000000b')), 0,
  'both members are duo-less after one atomic statement');
select is((select count(*)::int from public.duo_members where duo_id = '00000000-0000-4000-f000-0000000000cd'), 2,
  'a third party''s duo is unaffected');
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-f000-00000000000a'), 5,
  'personal history remains (tasks)');
select is((select count(*)::int from public.focus_sessions where user_id = '00000000-0000-4000-f000-00000000000a'), 1,
  'personal history remains (focus)');
select results_eq(
  $$select (select count(*)::int from public.activity_events where duo_id = '00000000-0000-4000-f000-0000000000ab'),
           (select count(*)::int from public.reactions r where r.from_user_id in ('00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-00000000000b')),
           (select count(*)::int from public.challenges where duo_id = '00000000-0000-4000-f000-0000000000ab')$$,
  $$values (0, 0, 0)$$, 'the old duo''s feed, reactions and challenges go with it');
select is(pg_temp.msgs('duo:00000000-0000-4000-f000-0000000000ab', 'duo_ended'), 1,
  'the partner is told on the duo channel (duo_ended)');

-- A forms a new duo with E: E sees nothing of the old duo.
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
create temp table nc on commit drop as select invite_code from public.create_duo();
grant select on nc to authenticated;
select pg_temp.as_user('e');
select lives_ok(format('select public.join_duo(%L)', (select invite_code from nc)), 'E joins A''s new duo');
select results_eq(
  $$select (select count(*)::int from public.activity_events),
           (select count(*)::int from public.reactions),
           (select count(*)::int from public.challenges),
           (select count(*)::int from public.duo_challenges())$$,
  $$values (0, 0, 0, 0)$$, 'the new partner sees no activity, reactions or challenges of the old duo');
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-f000-00000000000a'), 2,
  'the new partner reads only A''s shared tasks since the duo formed (today), not the older history');
select is((select count(*)::int from public.duo_weeks(3) where not is_current and partner_planned is not null), 0,
  'no head-to-head with the new partner before a full week together');
reset role;
select is((select count(*)::int from realtime.messages where event = 'duo_joined'
           and topic = 'duo:' || (select duo_id::text from public.duo_members where user_id = '00000000-0000-4000-f000-00000000000e')), 1,
  'joining is broadcast to the waiting creator (duo_joined)');

-- --------------------------------------------------------------- SHAPE ----
select ok(not has_function_privilege('anon', 'public.set_reaction(uuid, text)', 'execute'), 'anon cannot execute set_reaction');
select ok(not has_function_privilege('anon', 'public.duo_challenges()', 'execute'), 'anon cannot execute duo_challenges');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
           and proname in ('set_reaction', 'add_routine_items')), 0, 'set_reaction and add_routine_items are INVOKER');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
           and proname = 'duo_challenges' and 'search_path=""' = any (proconfig)), 1,
  'duo_challenges is DEFINER with an empty search_path');

select * from finish();
rollback;
