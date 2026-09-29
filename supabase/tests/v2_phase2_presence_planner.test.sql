-- V2 Phase 2 · partner last seen + school planner (pgTAP)
--
-- A and B are a duo, C and D another duo, E has no duo (later A's new
-- partner). One transaction, rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(63);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a200-00000000000a', 'a@v2p2.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a200-00000000000b', 'b@v2p2.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a200-00000000000c', 'c@v2p2.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a200-00000000000d', 'd@v2p2.lockedin', '{"display_name":"Duda","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a200-00000000000e', 'e@v2p2.lockedin', '{"display_name":"Eva","timezone":"America/Sao_Paulo"}');

insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-a200-0000000000ab', 'LKD-V2P2AB', '00000000-0000-4000-a200-00000000000a'),
  ('00000000-0000-4000-a200-0000000000cd', 'LKD-V2P2CD', '00000000-0000-4000-a200-00000000000c');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-a200-0000000000ab', '00000000-0000-4000-a200-00000000000a', 1),
  ('00000000-0000-4000-a200-0000000000ab', '00000000-0000-4000-a200-00000000000b', 2),
  ('00000000-0000-4000-a200-0000000000cd', '00000000-0000-4000-a200-00000000000c', 1),
  ('00000000-0000-4000-a200-0000000000cd', '00000000-0000-4000-a200-00000000000d', 2);

create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a200-00000000000' || p)::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a200-00000000000' || p, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.msgs(p_topic text) returns int language sql as $$
  select count(*)::int from realtime.messages where topic = p_topic and event = 'planner_changed'
$$;
grant execute on function pg_temp.rid(text), pg_temp.u(text), pg_temp.as_user(text), pg_temp.msgs(text)
  to anon, authenticated;

-- ============================================================ LAST SEEN ===

select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select is((select public.touch_last_seen()), now(), 'the heartbeat stores the database clock');
select is((select count(*)::int from public.user_presence where user_id = pg_temp.u('a')), 1,
  'owner can read its own last seen');
select pg_temp.as_user('b');
select lives_ok($$select public.touch_last_seen()$$, 'B heartbeat');
select is((select public.touch_last_seen()), now(), 'a second heartbeat updates the same row');
select is((select count(*)::int from public.user_presence where user_id = pg_temp.u('b')), 1,
  'one row per user');

-- Sentinel values (trigger off only for this setup, as the table owner).
reset role;
alter table public.user_presence disable trigger user_presence_stamp;
update public.user_presence set last_seen_at = '2020-01-01 10:00+00' where user_id = pg_temp.u('b');
update public.user_presence set last_seen_at = '2020-01-01 09:00+00' where user_id = pg_temp.u('a');
alter table public.user_presence enable trigger user_presence_stamp;

select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
update public.user_presence set last_seen_at = '2099-01-01' where user_id = pg_temp.u('b');
select is((select last_seen_at from public.user_presence where user_id = pg_temp.u('b')),
  '2020-01-01 10:00+00'::timestamptz, 'A cannot update B''s last seen');
select throws_ok($$insert into public.user_presence (user_id) values ('00000000-0000-4000-a200-00000000000c')$$,
  '42501', null, 'A cannot create a last seen for someone else');
update public.user_presence set last_seen_at = '2099-01-01' where user_id = pg_temp.u('a');
select is((select last_seen_at from public.user_presence where user_id = pg_temp.u('a')), now(),
  'a client-sent time is replaced by the database clock (no spoofing)');
select throws_ok($$update public.user_presence set user_id = '00000000-0000-4000-a200-00000000000b' where user_id = '00000000-0000-4000-a200-00000000000a'$$,
  '42501', null, 'user_id is not writable');
select throws_ok($$delete from public.user_presence where user_id = '00000000-0000-4000-a200-00000000000a'$$,
  '42501', null, 'no delete');

select pg_temp.as_user('b');
select is((select count(*)::int from public.user_presence where user_id = pg_temp.u('a')), 1,
  'current partner reads last seen');
select pg_temp.as_user('c');
select is((select count(*)::int from public.user_presence where user_id in (pg_temp.u('a'), pg_temp.u('b'))), 0,
  'outsider reads nothing');
select pg_temp.as_user('e');
select is((select count(*)::int from public.user_presence where user_id <> pg_temp.u('e')), 0,
  'a user without a duo reads nobody');

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '', true);
select throws_ok($$select * from public.user_presence$$, '42501', null, 'anon cannot read last seen');
select throws_ok($$select public.touch_last_seen()$$, '42501', null, 'anon cannot heartbeat');

-- ============================================================== PLANNER ===

select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');

insert into public.planner_events (title, event_type, subject, event_date, priority, reminder_days_before)
  values ('  Prova de Física  ', 'exam', ' Física ', current_date + 3, 'important', 1);
insert into v select 'a_priv', id from public.planner_events where title = 'Prova de Física';
select results_eq(
  $$select owner_id, duo_id, title, subject, shared_with_partner from public.planner_events where id = pg_temp.rid('a_priv')$$,
  $$values ('00000000-0000-4000-a200-00000000000a'::uuid, null::uuid, 'Prova de Física', 'Física', false)$$,
  'owner creates a private event (owner from the session, text trimmed)');
select is(pg_temp.msgs('duo:00000000-0000-4000-a200-0000000000ab'), 0, 'a private event broadcasts nothing');

insert into public.planner_events (title, event_type, subject, event_date, event_time, shared_with_partner)
  values ('Trabalho de História', 'assignment', 'História', current_date + 5, '14:00', true);
insert into v select 'a_shared', id from public.planner_events where title = 'Trabalho de História';
select is((select duo_id from public.planner_events where id = pg_temp.rid('a_shared')),
  '00000000-0000-4000-a200-0000000000ab'::uuid, 'a shared event is bound to the current duo by the database');
select is(pg_temp.msgs('duo:00000000-0000-4000-a200-0000000000ab'), 1, 'sharing broadcasts planner_changed to the duo');
select is((select count(*)::int from realtime.messages
           where event = 'planner_changed' and (payload::text like '%História%' or payload::text like '%14:00%')), 0,
  'the broadcast carries no title, subject or time');
select ok(exists (select 1 from realtime.messages where event = 'planner_changed'
           and payload ->> 'event_id' = pg_temp.rid('a_shared')::text and payload ->> 'operation' = 'insert'),
  'the broadcast carries the event id and the operation');

select is((select count(*)::int from public.planner_events where owner_id = pg_temp.u('a')), 2, 'owner reads both');
update public.planner_events set title = 'Trabalho de História (grupo)' where id = pg_temp.rid('a_shared');
select is((select title from public.planner_events where id = pg_temp.rid('a_shared')), 'Trabalho de História (grupo)',
  'owner updates');
select is(pg_temp.msgs('duo:00000000-0000-4000-a200-0000000000ab'), 2, 'an update of a shared event broadcasts');

-- Spoofing and validation.
select throws_ok($$insert into public.planner_events (owner_id, title, event_type, event_date) values ('00000000-0000-4000-a200-00000000000b', 'x', 'exam', current_date)$$,
  '42501', null, 'owner_id cannot be written (spoofing)');
select throws_ok($$insert into public.planner_events (duo_id, title, event_type, event_date) values ('00000000-0000-4000-a200-0000000000cd', 'x', 'exam', current_date)$$,
  '42501', null, 'duo_id cannot be written (spoofing another duo)');
select throws_ok($$update public.planner_events set duo_id = '00000000-0000-4000-a200-0000000000cd' where id = pg_temp.rid('a_shared')$$,
  '42501', null, 'duo_id cannot be updated');
select throws_ok($$insert into public.planner_events (title, event_type, event_date) values ('x', 'party', current_date)$$,
  '23514', null, 'invalid event_type refused');
select throws_ok($$insert into public.planner_events (title, event_type, event_date) values ('   ', 'exam', current_date)$$,
  '23514', null, 'blank title refused');
select throws_ok($$insert into public.planner_events (title, event_type, event_date, priority) values ('x', 'exam', current_date, 'urgent')$$,
  '23514', null, 'invalid priority refused');
select throws_ok($$insert into public.planner_events (title, event_type, event_date, reminder_days_before) values ('x', 'exam', current_date, 2)$$,
  '23514', null, 'invalid reminder refused');
select throws_ok($$insert into public.planner_events (title, event_type, event_date) values (repeat('x', 81), 'exam', current_date)$$,
  '23514', null, 'title too long refused');

-- Partner: shared only, read-only.
select pg_temp.as_user('b');
select is((select count(*)::int from public.planner_events where owner_id = pg_temp.u('a')), 1,
  'current partner sees only the shared event');
select is((select count(*)::int from public.planner_events where id = pg_temp.rid('a_priv')), 0,
  'a private event is invisible to the partner');
update public.planner_events set title = 'hacked' where id = pg_temp.rid('a_shared');
delete from public.planner_events where id = pg_temp.rid('a_shared');
reset role;
select is((select title from public.planner_events where id = pg_temp.rid('a_shared')), 'Trabalho de História (grupo)',
  'partner cannot update the owner''s event');
select is((select count(*)::int from public.planner_events where id = pg_temp.rid('a_shared')), 1,
  'partner cannot delete the owner''s event');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
insert into public.planner_events (title, event_type, event_date, shared_with_partner)
  values ('Lição de Química', 'homework', current_date, true);
select pg_temp.as_user('a');
select is((select count(*)::int from public.planner_events where title = 'Lição de Química'), 1,
  'both directions: A sees B''s shared event');

-- Outsider, no duo, anon.
select pg_temp.as_user('c');
select is((select count(*)::int from public.planner_events where owner_id in (pg_temp.u('a'), pg_temp.u('b'))), 0,
  'outsider sees nothing');
update public.planner_events set title = 'x' where id = pg_temp.rid('a_shared');
select pg_temp.as_user('e');
select throws_ok($$insert into public.planner_events (title, event_type, event_date, shared_with_partner) values ('E', 'exam', current_date, true)$$,
  'P0001', 'LI_PLANNER_NO_PARTNER', 'without a partner an event cannot be shared');
select lives_ok($$insert into public.planner_events (title, event_type, event_date) values ('Evento da Eva', 'school_event', current_date)$$,
  'without a partner a private event is fine');
select is((select count(*)::int from public.planner_events where owner_id <> pg_temp.u('e')), 0,
  'a user without a duo sees only their own events');
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '', true);
select throws_ok($$select * from public.planner_events$$, '42501', null, 'anon cannot read');
select throws_ok($$insert into public.planner_events (title, event_type, event_date) values ('x', 'exam', current_date)$$,
  '42501', null, 'anon cannot write');

-- Unsharing tells the duo and hides the event.
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
insert into public.planner_events (title, event_type, event_date, shared_with_partner)
  values ('Entrega de Artes', 'deadline', current_date + 1, true);
insert into v select 'a_unshare', id from public.planner_events where title = 'Entrega de Artes';
update public.planner_events set shared_with_partner = false where id = pg_temp.rid('a_unshare');
select is((select duo_id from public.planner_events where id = pg_temp.rid('a_unshare')), null::uuid,
  'unsharing clears the duo');
select ok(exists (select 1 from realtime.messages where event = 'planner_changed'
           and topic = 'duo:00000000-0000-4000-a200-0000000000ab'
           and payload ->> 'event_id' = pg_temp.rid('a_unshare')::text and payload ->> 'operation' = 'update'),
  'unsharing tells the old duo');
select pg_temp.as_user('b');
select is((select count(*)::int from public.planner_events where id = pg_temp.rid('a_unshare')), 0,
  'an unshared event disappears for the partner');
select pg_temp.as_user('a');
delete from public.planner_events where id = pg_temp.rid('a_unshare');
select is((select count(*)::int from public.planner_events where id = pg_temp.rid('a_unshare')), 0, 'owner deletes');

-- ======================================================== DUO LIFECYCLE ===

select pg_temp.as_user('a');
select lives_ok($$select public.leave_duo()$$, 'A ends the duo with B');
reset role;
select results_eq(
  $$select shared_with_partner, duo_id from public.planner_events where id = pg_temp.rid('a_shared')$$,
  $$values (false, null::uuid)$$,
  'the old duo''s shared event is private again (kept by its owner)');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
select is((select count(*)::int from public.planner_events where owner_id = pg_temp.u('a')), 0,
  'old partner loses the planner');
select is((select count(*)::int from public.user_presence where user_id = pg_temp.u('a')), 0,
  'old partner loses last seen');
select pg_temp.as_user('a');
select is((select count(*)::int from public.planner_events where owner_id = pg_temp.u('a')), 2,
  'the owner keeps every event');
select is((select count(*)::int from public.planner_events where owner_id = pg_temp.u('b')), 0,
  'A no longer sees B''s events');

-- A forms a new duo with E.
select set_config('li.code', (select invite_code from public.create_duo()), true);
select pg_temp.as_user('e');
select lives_ok($$select public.join_duo(current_setting('li.code'))$$, 'E joins A');
select is((select count(*)::int from public.planner_events where owner_id = pg_temp.u('a')), 0,
  'the new partner sees none of the old duo''s events');
select is((select count(*)::int from public.user_presence where user_id = pg_temp.u('a')), 1,
  'the new partner reads last seen');
select pg_temp.as_user('a');
insert into public.planner_events (title, event_type, event_date, shared_with_partner)
  values ('Prova de Química', 'exam', current_date + 2, true);
select pg_temp.as_user('e');
select is((select count(*)::int from public.planner_events where owner_id = pg_temp.u('a')), 1,
  'the new partner sees what is shared in the new duo');
select pg_temp.as_user('b');
select is((select count(*)::int from public.planner_events where owner_id = pg_temp.u('a')), 0,
  'the old partner does not');
select is((select count(*)::int from public.user_presence where user_id = pg_temp.u('a')), 0,
  'nor A''s last seen');

-- ================================================================ GRANTS ===
reset role;
select ok(not has_table_privilege('anon', 'public.planner_events', 'select')
          and not has_table_privilege('anon', 'public.user_presence', 'select'), 'anon holds no privilege');
select ok((select relrowsecurity from pg_class where oid = 'public.planner_events'::regclass)
          and (select relrowsecurity from pg_class where oid = 'public.user_presence'::regclass), 'RLS on both tables');
select ok(not has_function_privilege('authenticated', 'private.sync_planner_event()', 'execute')
          and not has_function_privilege('authenticated', 'private.normalize_planner_event()', 'execute')
          and not has_function_privilege('authenticated', 'private.stamp_last_seen()', 'execute'),
  'trigger functions are not callable');
select ok(not (select prosecdef from pg_proc where oid = 'public.touch_last_seen()'::regprocedure),
  'the heartbeat is SECURITY INVOKER');

select * from finish();
rollback;
