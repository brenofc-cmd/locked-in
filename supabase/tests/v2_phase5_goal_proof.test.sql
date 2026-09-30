-- V2 Phase 5 · Goals → Actions → Proof (pgTAP)
--
-- A and B are a duo (B = partner), C is an outsider. One transaction,
-- rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(66);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a500-00000000000a', 'a@v2p5.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a500-00000000000b', 'b@v2p5.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a500-00000000000c', 'c@v2p5.lockedin', '{"display_name":"Caio","timezone":"Pacific/Kiritimati"}');
insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-a500-0000000000ab', 'LKD-V2P5AB', '00000000-0000-4000-a500-00000000000a');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-a500-0000000000ab', '00000000-0000-4000-a500-00000000000a', 1),
  ('00000000-0000-4000-a500-0000000000ab', '00000000-0000-4000-a500-00000000000b', 2);

create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a500-00000000000' || p, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.today() returns date language sql as $$
  select private.local_today('00000000-0000-4000-a500-00000000000a') $$;
grant execute on function pg_temp.rid(text), pg_temp.as_user(text), pg_temp.today() to anon, authenticated;

-- B's goal (A must never link to it).
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
insert into public.goals (title, goal_type) values ('Meta do Beto', 'monthly');
insert into v select 'gB', id from public.goals where title = 'Meta do Beto';

-- A's goals: two active, one to archive, one to achieve.
select pg_temp.as_user('a');
insert into public.goals (title, goal_type) values
  ('Passar no vestibular', '90_day'), ('Melhorar o físico', 'monthly'),
  ('Antiga', 'long_term'), ('Concluída', 'monthly');
insert into v select 'g1', id from public.goals where title = 'Passar no vestibular';
insert into v select 'g2', id from public.goals where title = 'Melhorar o físico';
insert into v select 'gArch', id from public.goals where title = 'Antiga';
insert into v select 'gDone', id from public.goals where title = 'Concluída';
update public.goals set status = 'archived' where id = pg_temp.rid('gArch');
update public.goals set status = 'achieved' where id = pg_temp.rid('gDone');

insert into public.daily_tasks (title) values ('Estudar Física'), ('Sem meta'), ('Pulada'), ('Privada');
update public.daily_tasks set visible_to_partner = false where title = 'Privada';
insert into v select title, id from public.daily_tasks where title in ('Estudar Física', 'Sem meta', 'Pulada', 'Privada');

-- ========================================================= TASK → GOAL ===
select lives_ok($$insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Estudar Física'), pg_temp.rid('g1'))$$,
  'owner links an own task to an own active goal');
select throws_ok($$insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Sem meta'), pg_temp.rid('gB'))$$,
  'P0001', 'LI_GOAL_INACTIVE', 'a task cannot point at another user''s goal (same answer as a missing goal)');
select throws_ok($$insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Sem meta'), pg_temp.rid('gArch'))$$,
  'P0001', 'LI_GOAL_INACTIVE', 'an archived goal takes no new task');
select throws_ok($$insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Sem meta'), pg_temp.rid('gDone'))$$,
  'P0001', 'LI_GOAL_INACTIVE', 'an achieved goal takes no new task');
select throws_ok($$insert into public.daily_task_goals (daily_task_id, owner_id, goal_id) values (pg_temp.rid('Sem meta'), '00000000-0000-4000-a500-00000000000b', pg_temp.rid('g1'))$$,
  'P0001', 'LI_GOAL_INACTIVE', 'owner_id cannot be spoofed (the goal is not that owner''s)');
select lives_ok($$update public.daily_task_goals set goal_id = pg_temp.rid('g2') where daily_task_id = pg_temp.rid('Estudar Física')$$,
  'owner changes the goal of today''s task');
update public.daily_task_goals set goal_id = pg_temp.rid('g1') where daily_task_id = pg_temp.rid('Estudar Física');
insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Pulada'), pg_temp.rid('g1'));
insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Privada'), pg_temp.rid('g1'));

-- The partner sees the shared task, never its goal.
select pg_temp.as_user('b');
select is((select count(*)::int from public.daily_tasks where id = pg_temp.rid('Estudar Física')), 1,
  'the partner still reads A''s shared task');
select is((select count(*)::int from public.daily_task_goals), 0, 'the partner reads no task link');
select is((select count(*)::int from public.goals where owner_id = '00000000-0000-4000-a500-00000000000a'), 0,
  'the partner reads none of A''s goals');
update public.daily_task_goals set goal_id = pg_temp.rid('gB') where daily_task_id = pg_temp.rid('Estudar Física');
delete from public.daily_task_goals where daily_task_id = pg_temp.rid('Estudar Física');
select throws_ok($$insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Sem meta'), pg_temp.rid('gB'))$$,
  'P0002', 'LI_NOT_FOUND', 'the partner cannot link A''s task (to any goal)');
select pg_temp.as_user('c');
select is((select count(*)::int from public.daily_task_goals) + (select count(*)::int from public.goals), 0,
  'the outsider reads no link and no goal');
select pg_temp.as_user('a');
select is((select goal_id from public.daily_task_goals where daily_task_id = pg_temp.rid('Estudar Física')), pg_temp.rid('g1'),
  'partner / outsider writes changed nothing');
select set_config('role', 'anon', true);
select throws_ok($$select count(*) from public.daily_task_goals$$, '42501', null, 'anon reads nothing');
select set_config('role', 'authenticated', true);

-- Closed history: yesterday's goal link is part of the record.
reset role;
insert into public.daily_tasks (owner_id, task_date, title, status)
values ('00000000-0000-4000-a500-00000000000a', pg_temp.today() - 1, 'Ontem com meta', 'completed'),
       ('00000000-0000-4000-a500-00000000000a', pg_temp.today() - 1, 'Ontem sem meta', 'completed');
insert into v select title, id from public.daily_tasks
  where title in ('Ontem com meta', 'Ontem sem meta') and owner_id = '00000000-0000-4000-a500-00000000000a';
insert into public.daily_task_goals (daily_task_id, owner_id, goal_id)
values (pg_temp.rid('Ontem com meta'), '00000000-0000-4000-a500-00000000000a', pg_temp.rid('g1'));
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select throws_ok($$insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Ontem sem meta'), pg_temp.rid('g1'))$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed day''s task cannot be linked');
select throws_ok($$update public.daily_task_goals set goal_id = pg_temp.rid('g2') where daily_task_id = pg_temp.rid('Ontem com meta')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed day''s link cannot be changed');
select throws_ok($$delete from public.daily_task_goals where daily_task_id = pg_temp.rid('Ontem com meta')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed day''s link cannot be removed');

-- ====================================================== ROUTINE → GOAL ===
-- A routine that started three days ago and was never materialised.
reset role;
insert into public.routine_items (owner_id, title, days_of_week, start_date)
values ('00000000-0000-4000-a500-00000000000a', 'Academia', '{1,2,3,4,5,6,7}', pg_temp.today() - 3);
insert into v select 'rGym', id from public.routine_items
  where title = 'Academia' and owner_id = '00000000-0000-4000-a500-00000000000a';
insert into public.routine_item_goals (routine_item_id, owner_id, goal_id)
values (pg_temp.rid('rGym'), '00000000-0000-4000-a500-00000000000a', pg_temp.rid('g2'));
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select public.ensure_my_daily_tasks();
select is((select count(*)::int from public.daily_tasks d join public.daily_task_goals l on l.daily_task_id = d.id
           where d.routine_item_id = pg_temp.rid('rGym') and l.goal_id = pg_temp.rid('g2')), 4,
  'every generated occurrence (catch-up and today) gets the routine''s goal');
insert into v select 'gymToday', id from public.daily_tasks where routine_item_id = pg_temp.rid('rGym') and task_date = pg_temp.today();
insert into v select 'gymPast', id from public.daily_tasks where routine_item_id = pg_temp.rid('rGym') and task_date = pg_temp.today() - 2;

update public.routine_item_goals set goal_id = pg_temp.rid('g1') where routine_item_id = pg_temp.rid('rGym');
select is((select goal_id from public.daily_task_goals where daily_task_id = pg_temp.rid('gymPast')), pg_temp.rid('g2'),
  'changing the routine''s goal never rewrites a past occurrence');
select is((select goal_id from public.daily_task_goals where daily_task_id = pg_temp.rid('gymToday')), pg_temp.rid('g1'),
  'today''s occurrence follows the template (like every template edit)');
select throws_ok($$update public.routine_item_goals set goal_id = pg_temp.rid('gB') where routine_item_id = pg_temp.rid('rGym')$$,
  'P0001', 'LI_GOAL_INACTIVE', 'a routine cannot point at another user''s goal');
select throws_ok($$update public.routine_item_goals set goal_id = pg_temp.rid('gArch') where routine_item_id = pg_temp.rid('rGym')$$,
  'P0001', 'LI_GOAL_INACTIVE', 'a routine cannot be linked to an archived goal');

-- A new routine through the RPC, then linked: today's occurrence follows.
select public.create_routine_item('Leitura', '{1,2,3,4,5,6,7}'::smallint[], 'night', null, true, '', false);
insert into v select 'rRead', id from public.routine_items where title = 'Leitura';
insert into public.routine_item_goals (routine_item_id, goal_id) values (pg_temp.rid('rRead'), pg_temp.rid('g1'));
select is((select l.goal_id from public.daily_tasks d join public.daily_task_goals l on l.daily_task_id = d.id
           where d.routine_item_id = pg_temp.rid('rRead') and d.task_date = pg_temp.today()), pg_temp.rid('g1'),
  'linking a routine links today''s occurrence');
delete from public.routine_item_goals where routine_item_id = pg_temp.rid('rRead');
select is((select count(*)::int from public.daily_tasks d join public.daily_task_goals l on l.daily_task_id = d.id
           where d.routine_item_id = pg_temp.rid('rRead')), 0, 'unlinking the routine unlinks today''s occurrence');

select pg_temp.as_user('b');
select is((select count(*)::int from public.routine_item_goals), 0, 'the partner reads no routine link');
select pg_temp.as_user('a');

-- ========================================================= FOCUS → GOAL ===
select lives_ok($$select public.start_focus_session(p_title => 'Sem meta', p_planned_seconds => 60)$$,
  'the current client''s call (named arguments, no goal) still works');
update public.focus_sessions set status = 'completed'
where user_id = '00000000-0000-4000-a500-00000000000a' and status = 'active';
select lives_ok($$select public.start_focus_session('Física', 1500, null, true, pg_temp.rid('g1'))$$,
  'owner starts a focus session on an own active goal');
insert into v select 'f1', id from public.focus_sessions where user_id = '00000000-0000-4000-a500-00000000000a' and status = 'active';
select is((select goal_id from public.focus_sessions where id = pg_temp.rid('f1')), pg_temp.rid('g1'), 'the session carries the goal');
select is((select count(*)::int from public.focus_sessions where user_id = '00000000-0000-4000-a500-00000000000a'
           and status in ('active', 'paused')), 1, 'one unfinished session per user still holds');

select pg_temp.as_user('b');
select is((select count(*)::int from public.partner_current_focus()), 1, 'the partner sees A focusing');
select is((select count(*)::int from information_schema.routines r
           join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_schema = 'public' and r.routine_name = 'partner_current_focus'
             and p.parameter_mode = 'OUT' and p.parameter_name like '%goal%'), 0,
  'partner_current_focus returns no goal column');
select is((select count(*)::int from public.focus_sessions where user_id = '00000000-0000-4000-a500-00000000000a'), 0,
  'the partner reads no focus row (and so no goal_id)');
update public.focus_sessions set goal_id = null where id = pg_temp.rid('f1');
select pg_temp.as_user('a');
select is((select goal_id from public.focus_sessions where id = pg_temp.rid('f1')), pg_temp.rid('g1'), 'the partner cannot touch it');

select lives_ok($$update public.focus_sessions set goal_id = pg_temp.rid('g2') where id = pg_temp.rid('f1')$$,
  'the goal can change while the session runs');
select throws_ok($$update public.focus_sessions set goal_id = pg_temp.rid('gB') where id = pg_temp.rid('f1')$$,
  'P0001', 'LI_GOAL_INACTIVE', 'never another user''s goal');
select throws_ok($$update public.focus_sessions set goal_id = pg_temp.rid('gDone') where id = pg_temp.rid('f1')$$,
  'P0001', 'LI_GOAL_INACTIVE', 'never an achieved goal');
select is((select count(*)::int from public.my_goal_proof_summaries(pg_temp.today() - 6, pg_temp.today())
           where focus_seconds > 0), 0, 'a running session is not proof');
update public.focus_sessions set status = 'completed' where id = pg_temp.rid('f1');
select throws_ok($$update public.focus_sessions set goal_id = pg_temp.rid('g1') where id = pg_temp.rid('f1')$$,
  'P0001', 'LI_FOCUS_FINISHED', 'the goal is fixed once the session is completed');
select throws_ok($$select public.start_focus_session('X', 60, null, true, pg_temp.rid('gB'))$$,
  'P0001', 'LI_GOAL_INACTIVE', 'a session cannot start on another user''s goal');

-- Effective seconds only: a completed 1 h session with 40 min of pause.
reset role;
alter table public.focus_sessions disable trigger user;
insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, ended_at,
  accumulated_pause_seconds, actual_focus_seconds, local_date, goal_id)
values ('00000000-0000-4000-a500-00000000000a', 'Lista', 3600, 'completed', now() - interval '1 hour', now(),
  2400, 1200, pg_temp.today(), pg_temp.rid('g1'));
alter table public.focus_sessions enable trigger user;
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select is((select focus_seconds from public.my_goal_proof_summaries(pg_temp.today() - 6, pg_temp.today())
           where goal_id = pg_temp.rid('g1')), 1200, 'paused time is never proof (effective seconds only)');

-- ========================================================== MILESTONES ===
insert into public.goal_milestones (goal_id, title) values (pg_temp.rid('g1'), 'Simulado 1'), (pg_temp.rid('g1'), 'Simulado 2');
insert into v select title, id from public.goal_milestones where title in ('Simulado 1', 'Simulado 2');
update public.goal_milestones set is_completed = true where id = pg_temp.rid('Simulado 1');
select results_eq($$select completed_on, completed_at is not null from public.goal_milestones where id = pg_temp.rid('Simulado 1')$$,
  $$values (pg_temp.today(), true)$$, 'completing a milestone stamps its local day');
select throws_ok($$update public.goal_milestones set completed_on = '2020-01-01' where id = pg_temp.rid('Simulado 1')$$,
  '42501', null, 'the stamp is database-owned');
select is((select milestones from public.my_goal_proof_summaries(pg_temp.today() - 6, pg_temp.today())
           where goal_id = pg_temp.rid('g1')), 1, 'a completed milestone is proof, an open one is not');
update public.goal_milestones set is_completed = false where id = pg_temp.rid('Simulado 1');
select is((select coalesce(sum(milestones), 0)::int from public.my_goal_proof_summaries(pg_temp.today() - 6, pg_temp.today())), 0,
  'unchecking a milestone removes the proof');
update public.goal_milestones set is_completed = true where id = pg_temp.rid('Simulado 1');

-- =============================================================== PROOF ===
update public.daily_tasks set status = 'completed' where id in (pg_temp.rid('Estudar Física'), pg_temp.rid('Sem meta'), pg_temp.rid('gymToday'));
update public.daily_tasks set status = 'skipped', skip_reason = 'Doente' where id = pg_temp.rid('Pulada');
-- g1 today: Estudar Física + gymToday (routine now on g1) = 2 actions;
-- Privada pending, Pulada skipped, Sem meta unlinked. Yesterday: Ontem com meta.
select is((select actions from public.my_goal_proof_summaries(pg_temp.today(), pg_temp.today())
           where goal_id = pg_temp.rid('g1')), 2,
  'completed linked tasks count once each; skipped / pending / unlinked do not');
select is((select actions from public.my_goal_proof_summaries(pg_temp.today() - 6, pg_temp.today())
           where goal_id = pg_temp.rid('g1')), 3, 'the period includes yesterday''s completed task');
select is((select count(*)::int from public.my_goal_proofs(pg_temp.rid('g1')) where kind = 'task' and title = 'Academia'), 1,
  'a routine is proof only through its completed occurrence (no double count)');
select results_eq($$select kind, count(*)::int from public.my_goal_proofs(pg_temp.rid('g1'), 50, 0) group by kind order by kind$$,
  $$values ('focus'::text, 1), ('milestone', 1), ('task', 3)$$, 'the timeline holds the three kinds of proof');
select is((select proof_date from public.my_goal_proofs(pg_temp.rid('g1'), 1, 0)), pg_temp.today(), 'newest first');
select is((select count(*)::int from public.my_goal_proofs(pg_temp.rid('g1'), 2, 0)), 2, 'a page has at most the limit');
select is((select count(*)::int from public.my_goal_proofs(pg_temp.rid('g1'), 1000, 0)), 5, 'the page size is capped (50) and all 5 fit');
select is((select count(*)::int from public.my_goal_proofs(pg_temp.rid('g1'), 20, 4)), 1, 'the next page continues after the offset');
update public.daily_tasks set status = 'pending' where id = pg_temp.rid('Estudar Física');
select is((select actions from public.my_goal_proof_summaries(pg_temp.today(), pg_temp.today())
           where goal_id = pg_temp.rid('g1')), 1, 'undoing a task today removes its proof');
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('Estudar Física');

-- Archived / achieved goals keep their history.
update public.goals set status = 'archived' where id = pg_temp.rid('g1');
select is((select actions from public.my_goal_proof_summaries(pg_temp.today() - 6, pg_temp.today())
           where goal_id = pg_temp.rid('g1')), 3, 'an archived goal keeps its proof');
select throws_ok($$insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Sem meta'), pg_temp.rid('g1'))$$,
  'P0001', 'LI_GOAL_INACTIVE', 'and takes no new action');
update public.goals set status = 'active' where id = pg_temp.rid('g1');
select lives_ok($$insert into public.daily_task_goals (daily_task_id, goal_id) values (pg_temp.rid('Sem meta'), pg_temp.rid('g1'))$$,
  'a reactivated goal takes actions again');

-- Other users see no proof.
select pg_temp.as_user('b');
select is((select count(*)::int from public.my_goal_proofs(pg_temp.rid('g1'), 50, 0)), 0, 'the partner gets no proof of A''s goal');
select is((select count(*)::int from public.my_goal_proof_summaries(pg_temp.today() - 90, pg_temp.today())), 0,
  'the partner''s summaries never include A''s goals');
select pg_temp.as_user('c');
select is((select count(*)::int from public.my_goal_proofs(pg_temp.rid('g1'), 50, 0)), 0, 'the outsider gets no proof');
select set_config('role', 'anon', true);
select throws_ok($$select * from public.my_goal_proof_summaries(current_date - 6, current_date)$$, '42501', null,
  'anon cannot call the proof functions');
select set_config('role', 'authenticated', true);

-- The feed carries the task title only, never a goal.
select pg_temp.as_user('b');
select is((select count(*)::int from public.activity_events
           where title_snapshot in ('Passar no vestibular', 'Melhorar o físico')), 0,
  'no goal title reaches the partner''s feed');
select pg_temp.as_user('a');

-- Deleting a goal keeps the actions (links cleared).
delete from public.goals where id = pg_temp.rid('g2');
select is((select count(*)::int from public.daily_tasks where id = pg_temp.rid('gymPast')), 1, 'deleting a goal keeps its tasks');
select is((select count(*)::int from public.daily_task_goals where goal_id = pg_temp.rid('g2')), 0, 'and clears their links');

-- ===================================================== PRIVILEGE MODEL ===
reset role;
select ok(not exists (select 1 from pg_proc where proname in ('my_goal_proof_summaries', 'my_goal_proofs', 'start_focus_session',
            'guard_task_goal', 'guard_routine_goal', 'sync_routine_goal_today', 'seed_task_goal', 'guard_focus_goal',
            'stamp_milestone_completion', 'goal_is_active') and prosecdef),
  'Phase 5 adds no SECURITY DEFINER function');
select is((select count(*)::int from pg_class where relname in ('daily_task_goals', 'routine_item_goals') and relrowsecurity), 2,
  'RLS is on for both link tables');
select is((select count(*)::int from pg_policies where tablename in ('daily_task_goals', 'routine_item_goals')), 2,
  'one owner-only policy per link table (no partner policy)');
select ok(to_regprocedure('public.start_focus_session(text, integer, uuid, boolean)') is null
          and has_function_privilege('authenticated', 'public.start_focus_session(text, integer, uuid, boolean, uuid)', 'execute')
          and not has_function_privilege('anon', 'public.start_focus_session(text, integer, uuid, boolean, uuid)', 'execute'),
  'start_focus_session has one signature (goal optional), for signed-in users only');

select * from finish();
rollback;
