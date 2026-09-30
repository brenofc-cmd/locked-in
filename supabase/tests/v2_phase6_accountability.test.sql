-- V2 Phase 6 · Duo Accountability 2.0 (pgTAP)
--
-- A and B are a duo, C is an outsider, D is B's next partner (after the A–B
-- duo ends). A lives in Kiritimati (UTC+14), B in São Paulo, so the nudge
-- limit is counted on the recipient's local day. One transaction, rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(99);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a600-00000000000a', 'a@v2p6.lockedin', '{"display_name":"Ana","timezone":"Pacific/Kiritimati"}'),
  ('00000000-0000-4000-a600-00000000000b', 'b@v2p6.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a600-00000000000c', 'c@v2p6.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a600-00000000000d', 'd@v2p6.lockedin', '{"display_name":"Duda","timezone":"America/Sao_Paulo"}');
insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-a600-0000000000ab', 'LKD-V2P6AB', '00000000-0000-4000-a600-00000000000a');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-a600-0000000000ab', '00000000-0000-4000-a600-00000000000a', 1),
  ('00000000-0000-4000-a600-0000000000ab', '00000000-0000-4000-a600-00000000000b', 2);
update public.profiles set daily_standard_percent = 50 where id = '00000000-0000-4000-a600-00000000000a';

create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a600-00000000000' || p, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.today() returns date language sql as $$
  select private.local_today('00000000-0000-4000-a600-00000000000a') $$;
create function pg_temp.st(p text) returns text language sql as $$
  select status from public.commitments where id = pg_temp.rid(p) $$;
grant execute on function pg_temp.rid(text), pg_temp.as_user(text), pg_temp.today(), pg_temp.st(text)
  to anon, authenticated;

select set_config('role', 'authenticated', true);

-- ============================================================ CREATION ===
select pg_temp.as_user('c');
select throws_ok($$select public.create_commitment('Sozinho', 'simple')$$,
  'P0001', 'LI_NO_PARTNER', 'no commitment without a complete duo');

select pg_temp.as_user('a');
insert into public.daily_tasks (title) values ('Treino secreto'), ('Estudar'), ('Ler'), ('Correr');
update public.daily_tasks set visible_to_partner = false where title = 'Treino secreto';
insert into v select title, id from public.daily_tasks where title in ('Treino secreto', 'Estudar', 'Ler', 'Correr');

select lives_ok($$select public.create_commitment('Treinar hoje', 'task', pg_temp.rid('Treino secreto'))$$,
  'owner creates a task commitment on a private task');
insert into v select 'cTask', id from public.commitments where title = 'Treinar hoje';
select results_eq($$select duo_id, commit_date, status, owner_id from public.commitments where id = pg_temp.rid('cTask')$$,
  $$values ('00000000-0000-4000-a600-0000000000ab'::uuid, pg_temp.today(), 'active'::text, '00000000-0000-4000-a600-00000000000a'::uuid)$$,
  'the database sets duo, local date, owner and ACTIVE');
select is((select daily_task_id from public.commitment_sources where commitment_id = pg_temp.rid('cTask')),
  pg_temp.rid('Treino secreto'), 'the private source is stored apart');
select throws_ok($$select public.create_commitment('Sem tarefa', 'task')$$,
  'P0002', 'LI_NOT_FOUND', 'a task commitment needs a task');
select lives_ok($$select public.create_commitment('Focar 1 h', 'focus', null, 60)$$, 'owner creates a focus commitment');
insert into v select 'cFocus', id from public.commitments where title = 'Focar 1 h';
select is((select focus_target_seconds from public.commitments where id = pg_temp.rid('cFocus')), 3600,
  'the focus target is stored in seconds');
select throws_ok($$select public.create_commitment('Focar 1 min', 'focus', null, 1)$$,
  '23514', null, 'a focus target under 5 min is refused');
select lives_ok($$select public.create_commitment('Bater o padrão', 'standard')$$, 'owner creates a standard commitment');
insert into v select 'cStd', id from public.commitments where title = 'Bater o padrão';
select is((select standard_percent from public.commitments where id = pg_temp.rid('cStd'))::int, 50,
  'the standard in force is snapshotted');
select lives_ok($$select public.create_commitment('Ligar pra mãe', 'simple')$$, 'owner creates a simple commitment');
insert into v select 'cSimple', id from public.commitments where title = 'Ligar pra mãe';
select throws_ok($$select public.create_commitment('   ', 'simple')$$,
  '23514', null, 'a blank title is refused');
select lives_ok($$select public.create_commitment('Meditar', 'simple')$$, 'a fifth commitment is allowed');
insert into v select 'cMed', id from public.commitments where title = 'Meditar';
select throws_ok($$select public.create_commitment('Sexto', 'simple')$$,
  'P0001', 'LI_COMMITMENT_LIMIT', 'at most 5 open commitments per day');
select throws_ok($$insert into public.commitments (title, kind, status) values ('X', 'simple', 'proven')$$,
  '42501', null, 'status is not insertable');
select throws_ok($$insert into public.commitments (owner_id, title, kind) values ('00000000-0000-4000-a600-00000000000b', 'X', 'simple')$$,
  '42501', null, 'owner_id is not insertable');
select throws_ok($$update public.commitments set title = 'Outro' where id = pg_temp.rid('cSimple')$$,
  '42501', null, 'the title is not updatable');

-- B cannot create a commitment on A's task.
select pg_temp.as_user('b');
select throws_ok($$select public.create_commitment('Roubo', 'task', pg_temp.rid('Estudar'))$$,
  'P0002', 'LI_NOT_FOUND', 'a commitment cannot point at the partner''s task');
select is((select count(*)::int from public.commitments where owner_id = '00000000-0000-4000-a600-00000000000b'), 0,
  'the refused call left nothing behind');

-- ========================================================= TASK PROOF ===
select pg_temp.as_user('a');
select throws_ok($$update public.commitments set status = 'proven' where id = pg_temp.rid('cTask')$$,
  'P0001', 'LI_PROOF_REQUIRED', 'a verified commitment cannot be declared');
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('Treino secreto');
select results_eq($$select status, resolution, proof_kind, proven_at = (select completed_at from public.daily_tasks where id = pg_temp.rid('Treino secreto'))
                   from public.commitments where id = pg_temp.rid('cTask')$$,
  $$values ('proven'::text, 'verified'::text, 'task'::text, true)$$,
  'completing the source task proves it (verified, at the completion time)');
select is((select count(*)::int from public.activity_events where target_id = pg_temp.rid('cTask') and event_type = 'commitment_proven'), 1,
  'a proven commitment is one feed event');
select is((select title_snapshot from public.activity_events where target_id = pg_temp.rid('cTask')), 'Treinar hoje',
  'the feed carries the public title, not the private task');
update public.daily_tasks set status = 'pending' where id = pg_temp.rid('Treino secreto');
select is(pg_temp.st('cTask'), 'active', 'undoing the task the same day withdraws the proof');
select is((select count(*)::int from public.activity_events where target_id = pg_temp.rid('cTask')), 0,
  'and its feed event');
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('Treino secreto');
select is(pg_temp.st('cTask'), 'proven', 'completing again proves it again');
select throws_ok($$update public.commitments set status = 'cancelled' where id = pg_temp.rid('cTask')$$,
  'P0001', 'LI_COMMITMENT_CLOSED', 'a proven commitment cannot be cancelled');

-- ======================================================== FOCUS PROOF ===
-- Real flow: a session completed right away has ~0 effective seconds.
select lives_ok($$select public.start_focus_session(p_title => 'Bloco', p_planned_seconds => 3600)$$, 'owner starts a focus session');
select lives_ok($$select public.complete_focus_session((select id from public.focus_sessions
  where user_id = '00000000-0000-4000-a600-00000000000a' and status = 'active'))$$, 'and completes it');
select is(pg_temp.st('cFocus'), 'active', 'effective focus under the target does not prove');
-- 50 min effective (+ 40 min paused), then 10 min more.
reset role;
alter table public.focus_sessions disable trigger user;
insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, ended_at,
  accumulated_pause_seconds, actual_focus_seconds, local_date)
values ('00000000-0000-4000-a600-00000000000a', 'Longo', 5400, 'completed', now() - interval '3 hours', now() - interval '90 minutes',
  2400, 3000, pg_temp.today());
alter table public.focus_sessions enable trigger user;
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
update public.commitments set updated_at = now() where id = pg_temp.rid('cFocus');
select is(pg_temp.st('cFocus'), 'active', 'paused time never counts (50 min effective of 90)');
reset role;
alter table public.focus_sessions disable trigger user;
insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, ended_at,
  accumulated_pause_seconds, actual_focus_seconds, local_date)
values ('00000000-0000-4000-a600-00000000000a', 'Curto', 600, 'completed', now() - interval '20 minutes', now() - interval '10 minutes',
  0, 600, pg_temp.today());
alter table public.focus_sessions enable trigger user;
update public.focus_sessions set status = 'completed' where title = 'Curto'
  and user_id = '00000000-0000-4000-a600-00000000000a';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select results_eq($$select status, resolution, proof_kind, proven_at from public.commitments where id = pg_temp.rid('cFocus')$$,
  $$values ('proven'::text, 'verified'::text, 'focus'::text, now() - interval '10 minutes')$$,
  'the session that reaches the target proves it, at its end');

-- ===================================================== STANDARD PROOF ===
-- A has 4 tasks today with a 50 % standard; one (the private one) is done.
select is(pg_temp.st('cStd'), 'active', '1 of 4 does not meet 50 %');
select is((pg_temp.st('cStd') = 'proven'),
  private.standard_met(4, 1, 50), 'same answer as the existing standard rule (1 of 4)');
update public.daily_tasks set status = 'skipped', skip_reason = 'SICK' where id = pg_temp.rid('Ler');
select is(pg_temp.st('cStd'), 'active', 'skipped stays in the denominator');
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('Estudar');
select is(pg_temp.st('cStd'), 'proven', '2 of 4 meets 50 %');
select is((pg_temp.st('cStd') = 'proven'), private.standard_met(4, 2, 50), 'same answer as the existing rule (2 of 4)');
select is((select proven_at from public.commitments where id = pg_temp.rid('cStd')),
  (select completed_at from public.daily_tasks where id = pg_temp.rid('Estudar')), 'proven at the completion that met it');
insert into public.daily_tasks (title) values ('Extra');
insert into v select 'Extra', id from public.daily_tasks where title = 'Extra' and owner_id = '00000000-0000-4000-a600-00000000000a';
select is(pg_temp.st('cStd'), 'active', 'a new task the same day: 2 of 5 no longer meets 50 %');
select is((pg_temp.st('cStd') = 'proven'), private.standard_met(5, 2, 50), 'same answer as the existing rule (2 of 5)');
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('Correr');
select is(pg_temp.st('cStd'), 'proven', '3 of 5 meets it again');

-- ======================================================= SELF DECLARED ===
select lives_ok($$update public.commitments set status = 'proven' where id = pg_temp.rid('cSimple')$$, 'CUMPRI on a simple commitment');
select results_eq($$select status, resolution, proof_kind from public.commitments where id = pg_temp.rid('cSimple')$$,
  $$values ('proven'::text, 'self_declared'::text, 'self'::text)$$, 'marked AUTODECLARADO, never verified');
select is((select event_type from public.activity_events where target_id = pg_temp.rid('cSimple')), 'commitment_self_declared',
  'its feed event says self-declared');
select lives_ok($$update public.commitments set status = 'active' where id = pg_temp.rid('cSimple')$$, 'CUMPRI can be undone while open');
update public.commitments set status = 'proven' where id = pg_temp.rid('cSimple');
select lives_ok($$update public.commitments set status = 'cancelled' where id = pg_temp.rid('cMed')$$, 'an open commitment can be cancelled');
select ok((select cancelled_at is not null from public.commitments where id = pg_temp.rid('cMed')), 'cancelled_at stamped');
select throws_ok($$update public.commitments set status = 'active' where id = pg_temp.rid('cMed')$$,
  'P0001', 'LI_COMMITMENT_CLOSED', 'a cancelled commitment never reopens');
select lives_ok($$select public.create_commitment('Beber água', 'simple')$$, 'cancelling frees a slot');
insert into v select 'cWater', id from public.commitments where title = 'Beber água';

-- ============================================================ PRIVACY ===
select pg_temp.as_user('b');
select is((select count(*)::int from public.commitments where owner_id = '00000000-0000-4000-a600-00000000000a'), 6,
  'the partner reads the owner''s commitments');
select is((select count(*)::int from public.commitment_sources), 0, 'the partner reads no proof source');
select is((select count(*)::int from public.daily_tasks where id = pg_temp.rid('Treino secreto')), 0,
  'the partner still cannot read the private task');
select is((select count(*)::int from public.duo_commitments(pg_temp.today() - 1)
           where owner_id = '00000000-0000-4000-a600-00000000000a'), 6, 'duo_commitments lists them for the partner');
select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name = 'commitments'
             and (column_name like '%task%' or column_name like '%goal%')), 0,
  'commitments has no task / goal column');
select is((select count(*)::int from information_schema.routines r
           join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_schema = 'public' and r.routine_name = 'duo_commitments'
             and p.parameter_mode = 'OUT' and (p.parameter_name like '%task%' or p.parameter_name like '%goal%')), 0,
  'duo_commitments returns no task / goal column');
update public.commitments set status = 'cancelled' where id = pg_temp.rid('cWater');
select is(pg_temp.st('cWater'), 'active', 'the partner cannot change a commitment');
select throws_ok($$update public.commitment_sources set daily_task_id = pg_temp.rid('Estudar') where commitment_id = pg_temp.rid('cTask')$$,
  '42501', null, 'nobody rewires a source');

select pg_temp.as_user('c');
select is((select count(*)::int from public.commitments) + (select count(*)::int from public.commitment_sources)
          + (select count(*)::int from public.duo_commitments('2000-01-01')), 0, 'the outsider reads nothing');
select set_config('role', 'anon', true);
select throws_ok($$select count(*) from public.commitments$$, '42501', null, 'anon reads nothing');
select set_config('role', 'authenticated', true);

-- ============================================================= NUDGES ===
select pg_temp.as_user('a');
select throws_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cWater'))$$,
  'P0001', 'LI_NUDGE_SELF', 'the owner cannot nudge themself');
select pg_temp.as_user('c');
select throws_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cWater'))$$,
  'P0002', 'LI_NOT_FOUND', 'the outsider cannot nudge');
select pg_temp.as_user('b');
select throws_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cTask'))$$,
  'P0001', 'LI_NUDGE_CLOSED', 'no nudge on a PROVEN commitment');
select throws_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cMed'))$$,
  'P0001', 'LI_NUDGE_CLOSED', 'no nudge on a CANCELLED commitment');
select lives_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cWater'))$$, 'the partner nudges an ACTIVE commitment');
select results_eq($$select from_user, to_user, duo_id, recipient_date from public.nudges$$,
  $$values ('00000000-0000-4000-a600-00000000000b'::uuid, '00000000-0000-4000-a600-00000000000a'::uuid,
            '00000000-0000-4000-a600-0000000000ab'::uuid, private.local_today('00000000-0000-4000-a600-00000000000a'))$$,
  'the database stamps sender, recipient, duo and the RECIPIENT''s local day');
select throws_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cWater'))$$,
  'P0001', 'LI_NUDGE_COOLDOWN', 'one nudge per commitment every 2 hours');
select throws_ok($$insert into public.nudges (commitment_id, to_user) values (pg_temp.rid('cWater'), '00000000-0000-4000-a600-00000000000c')$$,
  '42501', null, 'the recipient is not insertable');
reset role;
update public.nudges set created_at = now() - interval '2 hours 1 minute';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
select lives_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cWater'))$$, 'after 2 hours the same commitment can be nudged');
reset role;
update public.nudges set created_at = now() - interval '2 hours 1 minute';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
select lives_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cWater'))$$, 'a third nudge of the recipient''s day');
reset role;
update public.nudges set created_at = now() - interval '2 hours 1 minute';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
select throws_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cWater'))$$,
  'P0001', 'LI_NUDGE_LIMIT', 'at most 3 nudges per day to the same partner');
select is((select count(*)::int from public.nudges), 3, 'the sender reads their nudges');
select pg_temp.as_user('a');
select is((select count(*)::int from public.nudges), 3, 'the recipient reads the nudges');
select pg_temp.as_user('c');
select is((select count(*)::int from public.nudges), 0, 'the outsider reads no nudge');

-- ============================================================ CHECK-IN ===
select pg_temp.as_user('a');
select lives_ok($$insert into public.checkins (state) values ('HARD_DAY')$$, 'owner checks in');
select lives_ok($$insert into public.checkins (state) values ('LOCKED_IN')$$, 'and changes it during the day');
select results_eq($$select distinct local_date, duo_id from public.checkins$$,
  $$values (pg_temp.today(), '00000000-0000-4000-a600-0000000000ab'::uuid)$$,
  'stamped with the owner''s local day and the duo');
select is((select count(*)::int from public.checkins), 2, 'history is kept');
select throws_ok($$insert into public.checkins (state) values ('SAD')$$, '23514', null, 'only the three states');
select throws_ok($$update public.checkins set state = 'HARD_DAY'$$, '42501', null, 'check-ins are append-only');
select pg_temp.as_user('b');
select is((select count(*)::int from public.checkins where user_id = '00000000-0000-4000-a600-00000000000a'), 2,
  'the partner reads the check-in');
select pg_temp.as_user('c');
select is((select count(*)::int from public.checkins), 0, 'the outsider reads no check-in');

-- ===================================================== THE DAY CLOSES ===
reset role;
update public.profiles set history_locked_through = pg_temp.today() where id = '00000000-0000-4000-a600-00000000000a';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select is((select status from public.duo_commitments(pg_temp.today() - 7) where id = pg_temp.rid('cWater')), 'missed',
  'an ACTIVE commitment of a closed day is MISSED');
select is((select closed from public.duo_commitments(pg_temp.today() - 7) where id = pg_temp.rid('cWater')), true,
  'and reported closed');
select is((select status from public.duo_commitments(pg_temp.today() - 7) where id = pg_temp.rid('cTask')), 'proven',
  'a PROVEN commitment stays PROVEN');
select throws_ok($$update public.commitments set status = 'cancelled' where id = pg_temp.rid('cWater')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a MISSED commitment cannot be cancelled');
select throws_ok($$update public.commitments set status = 'active' where id = pg_temp.rid('cSimple')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'CUMPRI of a closed day cannot be undone');
reset role;
update public.daily_tasks set status = 'pending' where id = pg_temp.rid('Treino secreto');
update public.commitments set updated_at = now() where owner_id = '00000000-0000-4000-a600-00000000000a';
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select results_eq($$select status, proven_at is not null from public.commitments where id = pg_temp.rid('cTask')$$,
  $$values ('proven'::text, true)$$, 'even a trusted change to the source never rewrites a closed result');
select pg_temp.as_user('b');
select throws_ok($$insert into public.nudges (commitment_id) values (pg_temp.rid('cWater'))$$,
  'P0001', 'LI_NUDGE_CLOSED', 'no nudge on a MISSED commitment');

-- ============================================================ OLD DUO ===
reset role;
delete from public.duos where id = '00000000-0000-4000-a600-0000000000ab';
insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-a600-0000000000bd', 'LKD-V2P6BD', '00000000-0000-4000-a600-00000000000b');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-a600-0000000000bd', '00000000-0000-4000-a600-00000000000b', 1),
  ('00000000-0000-4000-a600-0000000000bd', '00000000-0000-4000-a600-00000000000d', 2);
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select results_eq($$select count(*)::int, count(*) filter (where duo_id is null)::int from public.commitments$$,
  $$values (6, 6)$$, 'the owner keeps the history, detached from the ended duo');
select is((select count(*)::int from public.checkins where duo_id is null), 2, 'check-ins detach too');
select pg_temp.as_user('b');
select is((select count(*)::int from public.commitments) + (select count(*)::int from public.duo_commitments('2000-01-01'))
          + (select count(*)::int from public.checkins where user_id = '00000000-0000-4000-a600-00000000000a'), 0,
  'the ex-partner loses access');
select is((select count(*)::int from public.nudges), 0, 'the old duo''s nudges are gone');
select pg_temp.as_user('d');
select is((select count(*)::int from public.commitments) + (select count(*)::int from public.duo_commitments('2000-01-01')), 0,
  'the next partner never receives the old history');
select pg_temp.as_user('b');
select lives_ok($$select public.create_commitment('Nova dupla', 'simple')$$, 'a commitment in the new duo');
select pg_temp.as_user('d');
select is((select count(*)::int from public.commitments), 1, 'and the new partner sees only that one');

-- ================================================== PRIVILEGE MODEL ===
reset role;
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ('commitments', 'commitment_sources', 'nudges', 'checkins')
             and c.relrowsecurity), 4, 'RLS on all four tables');
select is((select count(*)::int from information_schema.role_table_grants
           where grantee = 'anon' and table_schema = 'public'
             and table_name in ('commitments', 'commitment_sources', 'nudges', 'checkins')), 0, 'anon has no grant');
select ok(not has_function_privilege('authenticated', 'private.sync_accountability()', 'execute'),
  'the broadcast trigger is not callable');
select ok((select prosecdef from pg_proc where oid = 'private.commitment_proof(uuid, uuid, text, date, integer, smallint)'::regprocedure) = false
  and (select prosecdef from pg_proc where oid = 'public.create_commitment(text, text, uuid, integer)'::regprocedure) = false
  and (select prosecdef from pg_proc where oid = 'public.duo_commitments(date)'::regprocedure) = false,
  'proof, create and read functions are INVOKER');

select * from finish();
rollback;
