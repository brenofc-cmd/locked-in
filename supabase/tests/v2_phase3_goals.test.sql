-- V2 Phase 3 · vision, goals, milestones and the accountability mirror (pgTAP)
--
-- Everything is owner-only. A and B are a duo (B = partner), C is an
-- outsider (own duo with D). One transaction, rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(61);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a300-00000000000a', 'a@v2p3.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a300-00000000000b', 'b@v2p3.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a300-00000000000c', 'c@v2p3.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a300-00000000000d', 'd@v2p3.lockedin', '{"display_name":"Duda","timezone":"America/Sao_Paulo"}');
insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-a300-0000000000ab', 'LKD-V2P3AB', '00000000-0000-4000-a300-00000000000a'),
  ('00000000-0000-4000-a300-0000000000cd', 'LKD-V2P3CD', '00000000-0000-4000-a300-00000000000c');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-a300-0000000000ab', '00000000-0000-4000-a300-00000000000a', 1),
  ('00000000-0000-4000-a300-0000000000ab', '00000000-0000-4000-a300-00000000000b', 2),
  ('00000000-0000-4000-a300-0000000000cd', '00000000-0000-4000-a300-00000000000c', 1),
  ('00000000-0000-4000-a300-0000000000cd', '00000000-0000-4000-a300-00000000000d', 2);

create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a300-00000000000' || p, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.rid(text), pg_temp.as_user(text) to anon, authenticated;

-- B owns a vision and a goal (targets for A's IDOR attempts).
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
insert into public.vision_items (title) values ('Visão do Beto');
insert into v select 'b_vision', id from public.vision_items where title = 'Visão do Beto';
insert into public.goals (title, goal_type) values ('Meta do Beto', 'monthly');
insert into v select 'b_goal', id from public.goals where title = 'Meta do Beto';

-- ============================================================= VISION ===
select pg_temp.as_user('a');
select lives_ok($$insert into public.vision_items (title, description) values ('Independência financeira', 'Liberdade.')$$,
  'owner creates a vision');
insert into v select 'a_vision', id from public.vision_items where title = 'Independência financeira';
select results_eq($$select owner_id, is_archived from public.vision_items where id = pg_temp.rid('a_vision')$$,
  $$values ('00000000-0000-4000-a300-00000000000a'::uuid, false)$$, 'owner comes from the session; not archived');
select is((select count(*)::int from public.vision_items), 1, 'owner reads only their own visions');
update public.vision_items set title = 'Ter independência financeira', sort_order = 10 where id = pg_temp.rid('a_vision');
select is((select title from public.vision_items where id = pg_temp.rid('a_vision')), 'Ter independência financeira', 'owner updates');
update public.vision_items set is_archived = true where id = pg_temp.rid('a_vision');
select is((select is_archived from public.vision_items where id = pg_temp.rid('a_vision')), true, 'owner archives');
update public.vision_items set is_archived = false where id = pg_temp.rid('a_vision');
select throws_ok($$insert into public.vision_items (owner_id, title) values ('00000000-0000-4000-a300-00000000000b', 'spoof')$$,
  '42501', null, 'owner_id cannot be spoofed');
select throws_ok(format($$update public.vision_items set owner_id = '00000000-0000-4000-a300-00000000000b' where id = %L$$, pg_temp.rid('a_vision')),
  '42501', null, 'owner_id cannot be moved');
select throws_ok($$insert into public.vision_items (title) values ('   ')$$, '23514', null, 'blank vision title refused');
select throws_ok($$insert into public.vision_items (title) values (repeat('x', 121))$$, '23514', null, 'vision title over 120 refused');
select throws_ok($$insert into public.vision_items (title, description) values ('x', repeat('x', 1001))$$, '23514', null, 'vision description over 1000 refused');
update public.vision_items set title = 'hacked' where id = pg_temp.rid('b_vision');
delete from public.vision_items where id = pg_temp.rid('b_vision');

-- ============================================================== GOALS ===
select lives_ok(format($$insert into public.goals (title, goal_type, vision_id, target_date) values ('Lançar produto pago', '90_day', %L, current_date + 80)$$, pg_temp.rid('a_vision')),
  'owner creates a 90-day goal linked to their vision');
insert into v select 'a_goal', id from public.goals where title = 'Lançar produto pago';
select results_eq($$select status, achieved_at, vision_id from public.goals where id = pg_temp.rid('a_goal')$$,
  $$values ('active'::text, null::timestamptz, pg_temp.rid('a_vision'))$$, 'a new goal is active, not achieved, linked');
select lives_ok($$insert into public.goals (title, goal_type) values ('Ler 2 livros', 'monthly'), ('Construir algo meu', 'long_term')$$,
  'monthly and long-term goals, no vision needed');
select is((select count(*)::int from public.goals), 3, 'owner reads only their own goals');
update public.goals set status = 'achieved' where id = pg_temp.rid('a_goal');
select is((select achieved_at from public.goals where id = pg_temp.rid('a_goal')), now(), 'achieving stamps achieved_at (database clock)');
update public.goals set status = 'archived' where id = pg_temp.rid('a_goal');
select is((select achieved_at from public.goals where id = pg_temp.rid('a_goal')), now(), 'archiving an achieved goal keeps achieved_at');
update public.goals set status = 'active' where id = pg_temp.rid('a_goal');
select is((select achieved_at from public.goals where id = pg_temp.rid('a_goal')), null::timestamptz, 'back to active clears achieved_at');
select throws_ok(format($$update public.goals set achieved_at = '2001-01-01' where id = %L$$, pg_temp.rid('a_goal')),
  '42501', null, 'achieved_at is not writable');
select throws_ok($$insert into public.goals (title, goal_type) values ('x', 'weekly')$$, '23514', null, 'invalid goal type refused');
select throws_ok($$insert into public.goals (title, goal_type, status) values ('x', 'monthly', 'paused')$$, '23514', null, 'invalid status refused');
select throws_ok($$insert into public.goals (title, goal_type) values ('  ', 'monthly')$$, '23514', null, 'blank goal title refused');
select throws_ok($$insert into public.goals (title, goal_type) values (repeat('x', 121), 'monthly')$$, '23514', null, 'goal title over 120 refused');
select throws_ok($$insert into public.goals (owner_id, title, goal_type) values ('00000000-0000-4000-a300-00000000000b', 'x', 'monthly')$$,
  '42501', null, 'goal owner_id cannot be spoofed');
-- IDOR: another user's vision.
select throws_ok(format($$insert into public.goals (title, goal_type, vision_id) values ('IDOR', 'monthly', %L)$$, pg_temp.rid('b_vision')),
  '23503', null, 'a goal cannot point at another user''s vision');
select throws_ok(format($$update public.goals set vision_id = %L where id = %L$$, pg_temp.rid('b_vision'), pg_temp.rid('a_goal')),
  '23503', null, 'nor be moved to another user''s vision');
update public.goals set status = 'achieved' where id = pg_temp.rid('b_goal');

-- ========================================================= MILESTONES ===
select lives_ok(format($$insert into public.goal_milestones (goal_id, title) values (%L, 'domínio'), (%L, 'deploy')$$,
  pg_temp.rid('a_goal'), pg_temp.rid('a_goal')), 'owner adds milestones to their goal');
select is((select count(*)::int from public.goal_milestones where goal_id = pg_temp.rid('a_goal')), 2, 'owner reads them');
update public.goal_milestones set is_completed = true where goal_id = pg_temp.rid('a_goal') and title = 'domínio';
select is((select count(*)::int from public.goal_milestones where is_completed), 1, 'owner completes a milestone');
select throws_ok(format($$insert into public.goal_milestones (goal_id, title) values (%L, 'IDOR')$$, pg_temp.rid('b_goal')),
  '23503', null, 'a milestone cannot be attached to another user''s goal');
select throws_ok(format($$update public.goal_milestones set goal_id = %L where goal_id = %L$$, pg_temp.rid('b_goal'), pg_temp.rid('a_goal')),
  '42501', null, 'a milestone cannot be moved to another goal');
select throws_ok(format($$insert into public.goal_milestones (goal_id, title) values (%L, '  ')$$, pg_temp.rid('a_goal')),
  '23514', null, 'blank milestone refused');

-- ============================================================= MIRROR ===
select lives_ok($$insert into public.accountability_items (text) values ('Eu adio coisas difíceis.')$$, 'owner adds a mirror item');
insert into v select 'a_mirror', id from public.accountability_items where text = 'Eu adio coisas difíceis.';
select is((select is_active from public.accountability_items where id = pg_temp.rid('a_mirror')), true, 'active by default');
update public.accountability_items set text = 'Eu adio coisas difíceis demais.' where id = pg_temp.rid('a_mirror');
select is((select text from public.accountability_items where id = pg_temp.rid('a_mirror')), 'Eu adio coisas difíceis demais.', 'owner edits');
update public.accountability_items set is_active = false where id = pg_temp.rid('a_mirror');
select is((select is_active from public.accountability_items where id = pg_temp.rid('a_mirror')), false, 'owner deactivates');
select throws_ok($$insert into public.accountability_items (text) values ('   ')$$, '23514', null, 'blank mirror text refused');
select throws_ok($$insert into public.accountability_items (text) values (repeat('x', 301))$$, '23514', null, 'mirror text over 300 refused');
select throws_ok($$insert into public.accountability_items (owner_id, text) values ('00000000-0000-4000-a300-00000000000b', 'x')$$,
  '42501', null, 'mirror owner_id cannot be spoofed');

-- ==================================================== PARTNER / OUTSIDER ===
select pg_temp.as_user('b');
select is((select count(*)::int from public.vision_items where owner_id = '00000000-0000-4000-a300-00000000000a'), 0, 'partner sees no vision of A');
select is((select count(*)::int from public.goals where owner_id = '00000000-0000-4000-a300-00000000000a'), 0, 'partner sees no goal of A');
select is((select count(*)::int from public.goal_milestones where owner_id = '00000000-0000-4000-a300-00000000000a'), 0, 'partner sees no milestone of A');
select is((select count(*)::int from public.accountability_items where owner_id = '00000000-0000-4000-a300-00000000000a'), 0, 'partner sees no mirror item of A');
update public.goals set title = 'hacked' where id = pg_temp.rid('a_goal');
delete from public.accountability_items where id = pg_temp.rid('a_mirror');
select pg_temp.as_user('c');
select is((select count(*)::int from public.vision_items) + (select count(*)::int from public.goals)
          + (select count(*)::int from public.goal_milestones) + (select count(*)::int from public.accountability_items), 0,
  'outsider sees nothing at all');
update public.vision_items set title = 'hacked';
delete from public.goals;
reset role;
select is((select title from public.goals where id = pg_temp.rid('a_goal')), 'Lançar produto pago', 'partner / outsider could not change A''s goal');
select is((select count(*)::int from public.accountability_items where id = pg_temp.rid('a_mirror')), 1, 'nor delete A''s mirror item');
select is((select title from public.vision_items where id = pg_temp.rid('b_vision')), 'Visão do Beto', 'A could not change B''s vision');
select is((select status from public.goals where id = pg_temp.rid('b_goal')), 'active', 'A could not change B''s goal');
select is((select count(*)::int from public.vision_items where owner_id = '00000000-0000-4000-a300-00000000000a'), 1, 'A''s vision untouched by the outsider');

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '', true);
select throws_ok('select * from public.vision_items', '42501', null, 'anon cannot read visions');
select throws_ok('select * from public.goals', '42501', null, 'anon cannot read goals');
select throws_ok('select * from public.goal_milestones', '42501', null, 'anon cannot read milestones');
select throws_ok('select * from public.accountability_items', '42501', null, 'anon cannot read the mirror');

-- ============================================================= DELETE ===
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
delete from public.vision_items where id = pg_temp.rid('a_vision');
select results_eq($$select count(*)::int, count(vision_id)::int from public.goals where id = pg_temp.rid('a_goal')$$,
  $$values (1, 0)$$, 'deleting a vision keeps its goals, unlinked');
delete from public.goals where id = pg_temp.rid('a_goal');
select is((select count(*)::int from public.goal_milestones), 0, 'deleting a goal removes its milestones');
delete from public.accountability_items where id = pg_temp.rid('a_mirror');
select is((select count(*)::int from public.accountability_items), 0, 'owner deletes a mirror item');

-- ============================================================= SHAPE ===
reset role;
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.vision_items'::regclass, 'public.goals'::regclass,
                         'public.goal_milestones'::regclass, 'public.accountability_items'::regclass)),
  'RLS on all four tables');
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'public' and grantee in ('anon', 'PUBLIC')
             and table_name in ('vision_items', 'goals', 'goal_milestones', 'accountability_items')), 0,
  'anon / PUBLIC hold no privilege');
select is((select count(*)::int from pg_policies
           where tablename in ('vision_items', 'goals', 'goal_milestones', 'accountability_items')
             and qual not like '%auth.uid()%'), 0, 'every policy is owner-only (no partner / duo condition)');
select ok(not has_function_privilege('authenticated', 'private.stamp_goal_achieved()', 'execute'), 'the trigger function is not callable');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosecdef and p.proname like '%goal%'), 0,
  'no SECURITY DEFINER function for goals');
select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name in ('vision_items', 'goals', 'accountability_items')
             and column_name in ('shared_with_partner', 'duo_id', 'progress', 'percent')), 0,
  'no sharing and no stored percentage columns');

select * from finish();
rollback;
