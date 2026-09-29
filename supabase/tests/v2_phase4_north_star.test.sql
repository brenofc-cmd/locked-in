-- V2 Phase 4 · North Star (featured items) and the daily Top 3 (pgTAP)
--
-- A and B are a duo (B = partner), C is an outsider. One transaction,
-- rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(57);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a400-00000000000a', 'a@v2p4.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a400-00000000000b', 'b@v2p4.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a400-00000000000c', 'c@v2p4.lockedin', '{"display_name":"Caio","timezone":"Pacific/Kiritimati"}');
insert into public.duos (id, invite_code, created_by) values
  ('00000000-0000-4000-a400-0000000000ab', 'LKD-V2P4AB', '00000000-0000-4000-a400-00000000000a');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-a400-0000000000ab', '00000000-0000-4000-a400-00000000000a', 1),
  ('00000000-0000-4000-a400-0000000000ab', '00000000-0000-4000-a400-00000000000b', 2);

create temp table v (k text primary key, id uuid);
grant all on v to anon, authenticated;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from v where k = p $$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a400-00000000000' || p, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.rid(text), pg_temp.as_user(text) to anon, authenticated;

-- B owns a featured vision (A must never touch it).
select set_config('role', 'authenticated', true);
select pg_temp.as_user('b');
insert into public.vision_items (title) values ('Visão do Beto');
insert into v select 'b_vision', id from public.vision_items where title = 'Visão do Beto';
update public.vision_items set is_featured = true where id = pg_temp.rid('b_vision');

-- ====================================================== FEATURED: VISION ===
select pg_temp.as_user('a');
insert into public.vision_items (title, sort_order) values ('Independência', 10), ('Saúde', 20);
insert into v select 'v1', id from public.vision_items where title = 'Independência';
insert into v select 'v2', id from public.vision_items where title = 'Saúde';

select throws_ok($$insert into public.vision_items (title, is_featured) values ('x', true)$$,
  '42501', null, 'is_featured cannot be set on insert (only by an explicit update)');
select is((select count(*)::int from public.vision_items where is_featured), 0, 'nothing is featured by default');
update public.vision_items set is_featured = true where id = pg_temp.rid('v1');
select is((select array_agg(title) from public.vision_items where is_featured), array['Independência'],
  'owner features a vision');
update public.vision_items set is_featured = true where id = pg_temp.rid('v2');
select is((select array_agg(title) from public.vision_items where is_featured), array['Saúde'],
  'featuring another vision replaces the previous one');
update public.vision_items set is_featured = false where id = pg_temp.rid('v2');
select is((select count(*)::int from public.vision_items where is_featured), 0, 'owner un-features');
update public.vision_items set is_featured = true where id = pg_temp.rid('v2');
update public.vision_items set is_archived = true where id = pg_temp.rid('v2');
select results_eq($$select is_archived, is_featured from public.vision_items where id = pg_temp.rid('v2')$$,
  $$values (true, false)$$, 'archiving a featured vision drops the flag');
select throws_ok($$update public.vision_items set is_featured = true where id = pg_temp.rid('v2')$$,
  '23514', null, 'an archived vision cannot be featured');
update public.vision_items set is_featured = true where id = pg_temp.rid('b_vision');
select is((select count(*)::int from public.vision_items where id = pg_temp.rid('b_vision')), 0,
  'A cannot see B''s vision (and the update touched nothing)');
update public.vision_items set is_featured = true where id = pg_temp.rid('v1');
reset role;
select is((select is_featured from public.vision_items where id = pg_temp.rid('b_vision')), true,
  'featuring A''s vision leaves B''s featured vision alone');
select is((select count(*)::int from public.vision_items where is_featured
           and owner_id = '00000000-0000-4000-a400-00000000000a'), 1, 'A has exactly one featured vision');

-- The database (not only the trigger) refuses a second featured row.
alter table public.vision_items disable trigger vision_items_keep_one_featured;
update public.vision_items set is_archived = false where id = pg_temp.rid('v2');
select throws_ok($$update public.vision_items set is_featured = true where id = pg_temp.rid('v2')$$,
  '23505', null, 'unique index: never two featured visions for one owner (without the trigger too)');
alter table public.vision_items enable trigger vision_items_keep_one_featured;
select set_config('role', 'authenticated', true);

-- ======================================================== FEATURED: GOAL ===
select pg_temp.as_user('a');
insert into public.goals (title, goal_type) values ('Ler 3 livros', 'monthly'), ('Lançar produto', '90_day');
insert into v select 'g1', id from public.goals where title = 'Ler 3 livros';
insert into v select 'g2', id from public.goals where title = 'Lançar produto';
update public.goals set is_featured = true where id = pg_temp.rid('g1');
update public.goals set is_featured = true where id = pg_temp.rid('g2');
select is((select array_agg(title) from public.goals where is_featured), array['Lançar produto'],
  'one featured goal: the newest choice wins');
update public.goals set status = 'achieved' where id = pg_temp.rid('g2');
select results_eq($$select status, is_featured, achieved_at is not null from public.goals where id = pg_temp.rid('g2')$$,
  $$values ('achieved'::text, false, true)$$, 'an achieved goal is no longer featured (achieved_at still stamped)');
select throws_ok($$update public.goals set is_featured = true where id = pg_temp.rid('g2')$$,
  '23514', null, 'an achieved goal cannot be featured');
update public.goals set is_featured = true where id = pg_temp.rid('g1');
update public.goals set status = 'archived' where id = pg_temp.rid('g1');
select is((select is_featured from public.goals where id = pg_temp.rid('g1')), false, 'archiving drops the flag');
select throws_ok($$update public.goals set is_featured = true where id = pg_temp.rid('g1')$$,
  '23514', null, 'an archived goal cannot be featured');
update public.goals set status = 'active' where id = pg_temp.rid('g1');
update public.goals set is_featured = true where id = pg_temp.rid('g1');
select is((select count(*)::int from public.goals where is_featured), 1, 'reactivated goal can be featured again');

-- ====================================================== FEATURED: MIRROR ===
insert into public.accountability_items (text) values ('Eu adio coisas difíceis.'), ('Eu começo e não termino.');
insert into v select 'm1', id from public.accountability_items where text = 'Eu adio coisas difíceis.';
insert into v select 'm2', id from public.accountability_items where text = 'Eu começo e não termino.';
update public.accountability_items set is_featured = true where id = pg_temp.rid('m1');
update public.accountability_items set is_featured = true where id = pg_temp.rid('m2');
select is((select array_agg(text) from public.accountability_items where is_featured),
  array['Eu começo e não termino.'], 'one featured mirror item');
update public.accountability_items set is_active = false where id = pg_temp.rid('m2');
select is((select is_featured from public.accountability_items where id = pg_temp.rid('m2')), false,
  'deactivating drops the flag');
select throws_ok($$update public.accountability_items set is_featured = true where id = pg_temp.rid('m2')$$,
  '23514', null, 'an inactive mirror item cannot be featured');

-- ================================================ FEATURED: OTHER USERS ===
select pg_temp.as_user('b');
select is((select count(*)::int from public.vision_items where owner_id <> '00000000-0000-4000-a400-00000000000b')
          + (select count(*)::int from public.goals where owner_id <> '00000000-0000-4000-a400-00000000000b')
          + (select count(*)::int from public.accountability_items where owner_id <> '00000000-0000-4000-a400-00000000000b'),
  0, 'the partner sees none of A''s vision / goals / mirror (featured or not)');
update public.goals set is_featured = false where id = pg_temp.rid('g1');
select pg_temp.as_user('c');
update public.accountability_items set is_featured = true where id = pg_temp.rid('m1');
select pg_temp.as_user('a');
select is((select is_featured from public.goals where id = pg_temp.rid('g1')), true, 'the partner cannot un-feature A''s goal');
select is((select is_featured from public.accountability_items where id = pg_temp.rid('m1')), false,
  'an outsider cannot feature A''s mirror item');
select set_config('role', 'anon', true);
select throws_ok($$select count(*) from public.goals$$, '42501', null, 'anon reads nothing');
select set_config('role', 'authenticated', true);

-- ================================================================ TOP 3 ===
select pg_temp.as_user('a');
insert into public.daily_tasks (title) values ('T1'), ('T2'), ('T3'), ('T4');
insert into public.daily_tasks (title, visible_to_partner) values ('Privada', false);
insert into v select title, id from public.daily_tasks where title in ('T1', 'T2', 'T3', 'T4', 'Privada');
select is((select count(*)::int from public.daily_tasks where priority_rank is not null), 0, 'no priority by default');

select results_eq($$select title, priority_rank::int from public.set_my_priorities(array[pg_temp.rid('T1'), pg_temp.rid('T2'), pg_temp.rid('T3')])$$,
  $$values ('T1'::text, 1), ('T2', 2), ('T3', 3)$$, 'owner sets a Top 3 of today''s tasks, ranks 1..3 in order');
select throws_ok($$select public.set_my_priorities(array[pg_temp.rid('T1'), pg_temp.rid('T2'), pg_temp.rid('T3'), pg_temp.rid('T4')])$$,
  '22023', 'LI_TOO_MANY_PRIORITIES', 'a fourth priority is refused');
select throws_ok($$select public.set_my_priorities(array[pg_temp.rid('T1'), pg_temp.rid('T1')])$$,
  '22023', 'LI_INVALID_PRIORITIES', 'the same task twice is refused');
select throws_ok($$update public.daily_tasks set priority_rank = 1 where id = pg_temp.rid('T4')$$,
  '23505', null, 'two tasks can never share a rank on a day (direct update)');
select throws_ok($$update public.daily_tasks set priority_rank = 4 where id = pg_temp.rid('T4')$$,
  '23514', null, 'ranks are 1..3 only');
select throws_ok($$update public.daily_tasks set priority_rank = 0 where id = pg_temp.rid('T4')$$,
  '23514', null, 'rank 0 refused');
select is((select array_agg(title order by priority_rank) from public.daily_tasks where priority_rank is not null),
  array['T1', 'T2', 'T3'], 'failed attempts changed nothing');

select results_eq($$select title, priority_rank::int from public.set_my_priorities(array[pg_temp.rid('T3'), pg_temp.rid('T1')])$$,
  $$values ('T3'::text, 1), ('T1', 2)$$, 'reorder / remove: the new list replaces the old one');
select is((select priority_rank from public.daily_tasks where id = pg_temp.rid('T2')), null, 'the removed task has no rank');

-- Completion and skip keep the rank.
update public.daily_tasks set status = 'completed' where id = pg_temp.rid('T3');
update public.daily_tasks set status = 'skipped', skip_reason = 'Doente' where id = pg_temp.rid('T1');
select results_eq($$select title, status, priority_rank::int from public.daily_tasks where priority_rank is not null order by priority_rank$$,
  $$values ('T3'::text, 'completed'::text, 1), ('T1', 'skipped', 2)$$, 'a completed / skipped priority keeps its rank');
select is((select count(*)::int from public.activity_events where target_id in (pg_temp.rid('T1'), pg_temp.rid('T2'), pg_temp.rid('T4'))), 0,
  'setting priorities creates no feed event');

-- Private stays private.
select lives_ok($$select public.set_my_priorities(array[pg_temp.rid('T3'), pg_temp.rid('T1'), pg_temp.rid('Privada')])$$,
  'a private task can be a priority');
select pg_temp.as_user('b');
select is((select count(*)::int from public.daily_tasks where id = pg_temp.rid('Privada')), 0,
  'the partner still cannot read the private priority');
select is((select count(*)::int from public.daily_tasks where owner_id = '00000000-0000-4000-a400-00000000000a'
           and not visible_to_partner), 0, 'no private task of A reaches the partner');
select throws_ok($$select public.set_my_priorities(array[pg_temp.rid('T4')])$$,
  'P0002', 'LI_NOT_FOUND', 'the partner cannot set A''s priorities through the function');
update public.daily_tasks set priority_rank = null where id = pg_temp.rid('T3');
select pg_temp.as_user('c');
select throws_ok($$select public.set_my_priorities(array[pg_temp.rid('T2')])$$,
  'P0002', 'LI_NOT_FOUND', 'an outsider cannot set A''s priorities');
update public.daily_tasks set priority_rank = 3 where id = pg_temp.rid('T2');
select pg_temp.as_user('a');
select results_eq($$select title, priority_rank::int from public.daily_tasks where priority_rank is not null order by priority_rank$$,
  $$values ('T3'::text, 1), ('T1', 2), ('Privada', 3)$$, 'partner / outsider updates changed nothing');

-- B's own Top 3 is independent of A's.
select pg_temp.as_user('b');
insert into public.daily_tasks (title) values ('B1');
insert into v select 'B1', id from public.daily_tasks where title = 'B1';
select results_eq($$select priority_rank::int from public.set_my_priorities(array[pg_temp.rid('B1')])$$,
  $$values (1)$$, 'another user has their own rank 1 the same day');
select pg_temp.as_user('a');

-- Delete: the priority goes with the task.
select lives_ok($$delete from public.daily_tasks where id = pg_temp.rid('Privada')$$, 'owner deletes a prioritised one-off');
select is((select array_agg(title order by priority_rank) from public.daily_tasks where priority_rank is not null
           and owner_id = '00000000-0000-4000-a400-00000000000a'),
  array['T3', 'T1'], 'the other priorities stay');
select results_eq($$select title, priority_rank::int from public.set_my_priorities(array[pg_temp.rid('T3'), pg_temp.rid('T1'), pg_temp.rid('T4')])$$,
  $$values ('T3'::text, 1), ('T1', 2), ('T4', 3)$$, 'the freed rank can be used again');
select results_eq($$select count(*)::int from public.set_my_priorities(array[]::uuid[])$$,
  $$values (0)$$, 'an empty list clears today''s Top 3');

-- Closed history: yesterday's priorities are frozen.
reset role;
insert into public.daily_tasks (owner_id, task_date, title, status, priority_rank)
values ('00000000-0000-4000-a400-00000000000a', private.local_today('00000000-0000-4000-a400-00000000000a') - 1, 'Ontem', 'completed', 1),
       ('00000000-0000-4000-a400-00000000000a', private.local_today('00000000-0000-4000-a400-00000000000a') - 1, 'Ontem 2', 'pending', null);
insert into v select title, id from public.daily_tasks where title in ('Ontem', 'Ontem 2');
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select throws_ok($$update public.daily_tasks set priority_rank = 2 where id = pg_temp.rid('Ontem 2')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed day cannot get a new priority');
select throws_ok($$update public.daily_tasks set priority_rank = null where id = pg_temp.rid('Ontem')$$,
  'P0001', 'LI_HISTORY_LOCKED', 'a closed day''s priority cannot be removed');
select throws_ok($$select public.set_my_priorities(array[pg_temp.rid('Ontem 2')])$$,
  'P0002', 'LI_NOT_FOUND', 'the function only takes today''s tasks');
select is((select priority_rank::int from public.daily_tasks where id = pg_temp.rid('Ontem')), 1,
  'clearing today left yesterday''s Top 3 untouched');

-- ===================================================== PRIVILEGE MODEL ===
reset role;
select ok(not (select prosecdef from pg_proc where oid = 'public.set_my_priorities(uuid[])'::regprocedure),
  'set_my_priorities is INVOKER (RLS and the history guard apply)');
select ok(not (select prosecdef from pg_proc where oid = 'private.keep_one_featured()'::regprocedure),
  'keep_one_featured is INVOKER');
select ok(not has_function_privilege('anon', 'public.set_my_priorities(uuid[])', 'execute'), 'anon cannot set priorities');
select ok(not has_function_privilege('authenticated', 'private.keep_one_featured()', 'execute'),
  'the trigger function is not callable');
select ok(not has_column_privilege('authenticated', 'public.daily_tasks', 'priority_rank', 'insert'),
  'priority_rank is not insertable (set through updates / the function only)');
select is((select count(*)::int from pg_indexes where schemaname = 'public'
           and indexname in ('vision_items_one_featured', 'goals_one_featured',
                             'accountability_items_one_featured', 'daily_tasks_priority_key')
           and indexdef like 'CREATE UNIQUE INDEX%'), 4, 'the four partial unique indexes exist');

select * from finish();
rollback;
