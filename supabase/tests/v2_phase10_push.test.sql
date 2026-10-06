-- V2 Phase 10 · Web Push: subscriptions, deliveries, scheduler (pgTAP)
--
-- push_subscriptions: owner-only (partner, outsider, anon: zero), endpoint
-- unique on known push services, a re-registration is a safe upsert, an
-- endpoint still owned by someone else is refused, delivery bookkeeping is
-- never client-writable. notification_deliveries: one row per (user, dedup
-- key), owner reads own, a client may only request a rate-limited test.
-- Scheduler: planner reminders (08:00 of the reminder day, 2 h before a
-- timed event on its day, never after it started, never > 24 h late),
-- quiet hours defer, preferences and devices gate, nudges, reviews and
-- weekly planning once per period; claim / finish: SKIP LOCKED batches,
-- stuck rows released, 2xx sent, 404 / 410 drop the device, 5xx retried
-- with backoff then failed, expired never sent; retention. No new SECURITY
-- DEFINER, no private push function executable by an API role.
-- docs/WEB_PUSH.md. One transaction, rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(75);

grant all on table __tcache__ to anon, authenticated;
grant all on sequence __tcache___id_seq, __tresults___numb_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a110-00000000000a', 'a@v2p10.lockedin', '{"display_name":"Ana","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a110-00000000000b', 'b@v2p10.lockedin', '{"display_name":"Beto","timezone":"America/Sao_Paulo"}'),
  ('00000000-0000-4000-a110-00000000000c', 'c@v2p10.lockedin', '{"display_name":"Caio","timezone":"America/Sao_Paulo"}');
insert into public.duos (id, invite_code, created_by)
  values ('00000000-0000-4000-a110-0000000000ab', 'LKD-V2PXAB', '00000000-0000-4000-a110-00000000000a');
insert into public.duo_members (duo_id, user_id, seat) values
  ('00000000-0000-4000-a110-0000000000ab', '00000000-0000-4000-a110-00000000000a', 1),
  ('00000000-0000-4000-a110-0000000000ab', '00000000-0000-4000-a110-00000000000b', 2);

create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a110-' || lpad(p, 12, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id(p), 'role', 'authenticated')::text, true);
$$;
-- A local wall-clock moment in São Paulo.
create function pg_temp.at(d date, t time) returns timestamptz language sql immutable as $$
  select (d + t) at time zone 'America/Sao_Paulo'
$$;
create function pg_temp.n(p_kind text) returns integer language sql stable as $$
  select count(*)::integer from public.notification_deliveries
  where user_id = pg_temp.id('a') and kind = p_kind
$$;
create temp table ids (k text primary key, id uuid);
grant all on ids to anon, authenticated;
grant execute on function pg_temp.id(text), pg_temp.as_user(text) to anon, authenticated;

-- ------------------------------------------------------------ privileges ----
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity
             and c.relname in ('push_subscriptions', 'notification_deliveries')), 2,
  'RLS is on for push_subscriptions and notification_deliveries');
select is((select count(*)::int from information_schema.role_table_grants
           where grantee = 'anon' and table_schema = 'public'
             and table_name in ('push_subscriptions', 'notification_deliveries')), 0,
  'anon holds no privilege on them');
select ok(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.proname like 'push\_%'
      and (has_function_privilege('authenticated', p.oid, 'execute')
           or has_function_privilege('anon', p.oid, 'execute'))),
  'no private push function is executable by an API role');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosecdef
             and p.proname in ('push_quiet', 'push_audience', 'push_enqueue', 'push_claim', 'push_finish',
                               'push_tick', 'guard_push_subscription', 'guard_notification_delivery')), 0,
  'Phase 10 adds no SECURITY DEFINER function');
select is((select schedule || ' ' || command || ' ' || active from cron.job where jobname = 'locked-in-push-tick'),
  '* * * * * select private.push_tick() true', 'the scheduler runs every minute');

select set_config('role', 'anon', true);
select throws_ok($$select * from public.push_subscriptions$$, '42501', null, 'anon cannot read subscriptions');
select throws_ok($$select * from public.notification_deliveries$$, '42501', null, 'anon cannot read deliveries');
reset role;

-- --------------------------------------------------------- subscriptions ----
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select lives_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth, user_agent)
                  values ('https://fcm.googleapis.com/fcm/send/ana-1', repeat('A', 87), repeat('B', 22), 'Chrome · Windows')$$,
  'the owner registers this device');
select results_eq($$select user_id, failure_count, last_success_at is null from public.push_subscriptions$$,
  $$values (pg_temp.id('a'), 0, true)$$, 'the row is mine; delivery fields start clean');
select lives_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth)
                  values ('https://fcm.googleapis.com/fcm/send/ana-1', repeat('C', 87), repeat('D', 22))
                  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth$$,
  'registering the same device again is a safe upsert');
select results_eq($$select count(*)::int, min(p256dh) from public.push_subscriptions$$,
  $$values (1, repeat('C', 87))$$, 'still one row, with the fresh keys');
select throws_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth, failure_count)
                   values ('https://fcm.googleapis.com/fcm/send/ana-2', repeat('A', 87), repeat('B', 22), 0)$$,
  '42501', null, 'a client cannot write delivery bookkeeping');
select throws_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth)
                   values ('https://evil.example/collect', repeat('A', 87), repeat('B', 22))$$,
  '23514', null, 'an endpoint outside the push services is refused');
select throws_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth)
                   values ('http://fcm.googleapis.com/fcm/send/x', repeat('A', 87), repeat('B', 22))$$,
  '23514', null, 'a plain-http endpoint is refused');
select throws_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth)
                   values ('https://fcm.googleapis.com/fcm/send/ana-3', 'short', repeat('B', 22))$$,
  '23514', null, 'malformed keys are refused');
select throws_ok($$update public.push_subscriptions set endpoint = 'https://fcm.googleapis.com/fcm/send/other'$$,
  'P0002', 'LI_NOT_FOUND', 'an endpoint never moves to another device');

select pg_temp.as_user('b');
select is_empty($$select * from public.push_subscriptions$$, 'the partner never reads my devices');
select throws_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth)
                   values ('https://fcm.googleapis.com/fcm/send/ana-1', repeat('A', 87), repeat('B', 22))
                   on conflict (endpoint) do update set p256dh = excluded.p256dh$$,
  '42501', null, 'an endpoint still owned by someone else cannot be taken over (shared device)');
delete from public.push_subscriptions;
update public.push_subscriptions set user_agent = 'x';
select pg_temp.as_user('c');
select is_empty($$select * from public.push_subscriptions$$, 'an outsider reads nothing');
reset role;
select results_eq($$select count(*)::int, min(user_agent) from public.push_subscriptions where user_id = pg_temp.id('a')$$,
  $$values (1, 'Chrome · Windows')$$, 'the partner could neither delete nor change my device');

select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select lives_ok($$delete from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ana-1'$$,
  'the owner disables this device');
select is_empty($$select * from public.push_subscriptions$$, 'the device is gone');
insert into public.push_subscriptions (endpoint, p256dh, auth)
  values ('https://fcm.googleapis.com/fcm/send/ana-1', repeat('A', 87), repeat('B', 22)),
         ('https://updates.push.services.mozilla.com/wpush/v2/ana-2', repeat('A', 87), repeat('B', 22));

-- ------------------------------------------------------------ test push ----
select lives_ok($$insert into public.notification_deliveries (kind) values ('test')$$,
  'the owner asks for a test notification');
select results_eq($$select kind, status, dedup_key like 'test:%', expires_at = now() + interval '10 minutes', user_id
                    from public.notification_deliveries$$,
  $$values ('test'::text, 'pending'::text, true, true, pg_temp.id('a'))$$,
  'the database writes every field of it');
select throws_ok($$insert into public.notification_deliveries (kind) values ('test')$$,
  'P0001', 'LI_RATE_LIMITED', 'at most one test a minute');
select throws_ok($$insert into public.notification_deliveries (kind) values ('planner')$$,
  'P0002', 'LI_NOT_FOUND', 'a client cannot create any other kind');
select throws_ok($$insert into public.notification_deliveries (kind, dedup_key) values ('test', 'x')$$,
  '42501', null, 'a client cannot choose the dedup key');
select throws_ok($$update public.notification_deliveries set status = 'sent'$$,
  '42501', null, 'a client cannot change a delivery');
select throws_ok($$delete from public.notification_deliveries$$,
  '42501', null, 'a client cannot delete a delivery');
select pg_temp.as_user('b');
select is_empty($$select * from public.notification_deliveries$$, 'the partner never reads my deliveries');
select pg_temp.as_user('c');
select is_empty($$select * from public.notification_deliveries$$, 'nor does an outsider');
reset role;
delete from public.notification_deliveries;

-- ------------------------------------------------------ planner schedule ----
-- 2030-01-07 is a Monday; events far from the real "today" on purpose.
insert into public.planner_events (owner_id, title, event_type, event_date, event_time, reminder_days_before) values
  (pg_temp.id('a'), 'Prova de Física', 'exam', '2030-01-07', null, 1),
  (pg_temp.id('a'), 'Trabalho de História', 'assignment', '2030-01-08', '09:00', 0),
  (pg_temp.id('a'), 'Entrega cedo', 'deadline', '2030-01-09', '07:30', 0),
  (pg_temp.id('a'), 'Sem lembrete', 'homework', '2030-01-07', null, null),
  (pg_temp.id('c'), 'Prova do Caio', 'exam', '2030-01-07', null, 1);
insert into ids select title, id from public.planner_events where owner_id in (pg_temp.id('a'), pg_temp.id('c'));

select is(private.push_enqueue(pg_temp.at('2030-01-06', '07:59'), pg_temp.id('a')), 0,
  'nothing before 08:00 of the reminder day');
select is(private.push_enqueue(pg_temp.at('2030-01-06', '08:00'), pg_temp.id('a')), 1,
  'the day-before reminder is due at 08:00 local');
select is(private.push_enqueue(pg_temp.at('2030-01-06', '08:05'), pg_temp.id('a')), 0,
  'evaluated again: no second delivery');
select results_eq($$select dedup_key, ref_id, scheduled_for, expires_at from public.notification_deliveries$$,
  $$values ('planner:' || (select id from ids where k = 'Prova de Física') || ':1:2030-01-07',
            (select id from ids where k = 'Prova de Física'),
            pg_temp.at('2030-01-06', '08:00'), pg_temp.at('2030-01-08', '00:00'))$$,
  'one delivery per event / reminder / date, alive until the end of the event day');
select is(private.push_enqueue(pg_temp.at('2030-01-08', '06:59'), pg_temp.id('a')), 0,
  'a timed event on its day: not before 2 h ahead');
select is(private.push_enqueue(pg_temp.at('2030-01-08', '07:00'), pg_temp.id('a')), 1,
  'a timed event on its day: 2 h before it (07:00 for 09:00)');

update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '22:00', quiet_hours_end = '07:45'
  where user_id = pg_temp.id('a');
select is(private.push_enqueue(pg_temp.at('2030-01-09', '05:30'), pg_temp.id('a')), 0,
  'quiet hours hold a due reminder back');
select is(private.push_enqueue(pg_temp.at('2030-01-09', '07:45'), pg_temp.id('a')), 0,
  'when quiet hours end after the event started, it is never sent ("hoje" after it began)');
update public.user_settings set quiet_hours_end = '07:15' where user_id = pg_temp.id('a');
select is(private.push_enqueue(pg_temp.at('2030-01-09', '07:15'), pg_temp.id('a')), 1,
  'when quiet hours end before the event, the reminder goes then');
update public.user_settings set quiet_hours_enabled = false where user_id = pg_temp.id('a');

insert into public.planner_events (owner_id, title, event_type, event_date, reminder_days_before)
  values (pg_temp.id('a'), 'Atrasado', 'exam', '2030-01-12', 1);
select is(private.push_enqueue(pg_temp.at('2030-01-12', '09:00'), pg_temp.id('a')), 0,
  'more than a day late: not sent (the event is the same day)');
select is(private.push_enqueue(pg_temp.at('2030-01-06', '08:00'), pg_temp.id('c')), 0,
  'a user without an enabled device gets nothing');
update public.user_settings set push_planner = false where user_id = pg_temp.id('a');
insert into public.planner_events (owner_id, title, event_type, event_date, reminder_days_before)
  values (pg_temp.id('a'), 'Desligado', 'exam', '2030-01-17', 1);
select is(private.push_enqueue(pg_temp.at('2030-01-16', '08:00'), pg_temp.id('a')), 0,
  'the Planner switch off: no planner push');
update public.user_settings set push_planner = true where user_id = pg_temp.id('a');

-- ------------------------------------------- reviews / weekly planning ----
insert into public.daily_tasks (owner_id, task_date, title) values
  (pg_temp.id('a'), '2030-01-09', 'Estudar'), (pg_temp.id('a'), '2030-01-10', 'Ler');
insert into public.reviews (owner_id, kind, period_start, worked) values (pg_temp.id('a'), 'day', '2030-01-10', 'ok');
select is(private.push_enqueue(pg_temp.at('2030-01-09', '20:59'), pg_temp.id('a')) , 0,
  'Review do dia: not before 21:00');
select is(private.push_enqueue(pg_temp.at('2030-01-09', '21:00'), pg_temp.id('a')), 1,
  'Review do dia: at 21:00 for a day with tasks and no reflection');
select is(private.push_enqueue(pg_temp.at('2030-01-09', '22:30'), pg_temp.id('a')), 0,
  'Review do dia: once per day');
select is(private.push_enqueue(pg_temp.at('2030-01-10', '21:00'), pg_temp.id('a')), 0,
  'Review do dia: not when the day already has a reflection');
select is(private.push_enqueue(pg_temp.at('2030-01-13', '19:00'), pg_temp.id('a')), 1,
  'Review semanal: Sunday 19:00 for a week with tasks and no reflection');
select is(private.push_enqueue(pg_temp.at('2030-01-13', '20:00'), pg_temp.id('a')), 0,
  'Review semanal: once per week');
select is((select dedup_key from public.notification_deliveries where kind = 'review_week'), 'review-week:2030-01-07',
  'the week is keyed by its Monday');
select is(private.push_enqueue(pg_temp.at('2030-01-14', '08:00'), pg_temp.id('a')), 1,
  'Planejamento semanal: Monday 08:00 without priorities');
select is(private.push_enqueue(pg_temp.at('2030-01-14', '12:00'), pg_temp.id('a')), 0,
  'Planejamento semanal: once per week');
insert into public.weekly_priorities (owner_id, week_start, position, title) values (pg_temp.id('a'), '2030-01-21', 1, 'Plano');
select is(private.push_enqueue(pg_temp.at('2030-01-21', '08:00'), pg_temp.id('a')), 0,
  'Planejamento semanal: not when the week is planned');

-- ----------------------------------------------------------------- nudge ----
select set_config('role', 'authenticated', true);
select pg_temp.as_user('a');
select public.create_commitment('Ler 30 min', 'simple');
insert into ids select 'commitment', id from public.commitments where title = 'Ler 30 min';
select pg_temp.as_user('b');
insert into public.nudges (commitment_id) select id from ids where k = 'commitment';
reset role;
insert into ids select 'nudge', id from public.nudges where to_user = pg_temp.id('a');
select private.push_enqueue(now(), pg_temp.id('a'));
select is(pg_temp.n('nudge'), 1, 'a nudge becomes one push to its recipient');
select private.push_enqueue(now() + interval '1 minute', pg_temp.id('a'));
select is(pg_temp.n('nudge'), 1, 'and never a second one (the push is delivery, not another nudge)');
select is((select dedup_key from public.notification_deliveries where kind = 'nudge'),
  'nudge:' || (select id from ids where k = 'nudge'), 'keyed by the nudge');
select is((select count(*)::int from public.notification_deliveries where user_id = pg_temp.id('b')), 0,
  'the sender gets nothing');

-- ------------------------------------------------------- claim / finish ----
delete from public.notification_deliveries;
insert into public.notification_deliveries (user_id, kind, dedup_key, ref_id, expires_at)
  select pg_temp.id('a'), 'planner', 'k-planner', id, now() + interval '1 day' from ids where k = 'Prova de Física';
insert into public.notification_deliveries (user_id, kind, dedup_key, ref_id, expires_at)
  select pg_temp.id('a'), 'nudge', 'k-nudge', id, now() + interval '1 day' from ids where k = 'nudge';
insert into public.notification_deliveries (user_id, kind, dedup_key, expires_at)
  values (pg_temp.id('a'), 'test', 'k-old', now() - interval '1 second');
update public.user_settings set push_hide_details = true where user_id = pg_temp.id('a');

create temp table claimed as select * from private.push_claim(10, now());
select is((select count(*)::int from claimed), 2, 'a batch takes the due, unexpired deliveries');
select is((select status from public.notification_deliveries where dedup_key = 'k-old'), 'expired',
  'an expired delivery is never sent');
select results_eq($$select status, attempts::int from public.notification_deliveries where dedup_key = 'k-planner'$$,
  $$values ('sending'::text, 1)$$, 'claimed rows are marked sending');
select is((select array_agg(k order by k) from claimed c, jsonb_object_keys(c.data) k where c.kind = 'planner'),
  array['days', 'time', 'title', 'type'], 'the planner message gets title, type, days and time — nothing else');
select is((select data->>'from' from claimed where kind = 'nudge'), 'Beto', 'the nudge message names the partner');
select ok((select bool_and(hide_details) from claimed), 'Ocultar detalhes travels with the claim');
select is((select jsonb_array_length(subscriptions) from claimed limit 1), 2, 'every device of the user');
select is((select count(*)::int from private.push_claim(10, now())), 0,
  'a second run right away gets nothing (no double send)');
select is((select count(*)::int from private.push_claim(10, now() + interval '6 minutes')), 2,
  'a run that died releases its rows after 5 minutes');

create temp table subs as select id, endpoint from public.push_subscriptions where user_id = pg_temp.id('a');
select is(private.push_finish((select delivery_id from claimed where kind = 'planner'),
            (select jsonb_agg(jsonb_build_object('sub', id, 'status', case when endpoint like '%mozilla%' then 410 else 201 end)) from subs)),
  'sent', 'one device accepted: sent');
select ok((select last_success_at is not null from public.push_subscriptions where endpoint like '%fcm%'),
  'the accepting device records its success');
select is((select count(*)::int from public.push_subscriptions where endpoint like '%mozilla%'), 0,
  '410 Gone: that device is dropped');
select is(private.push_finish((select delivery_id from claimed where kind = 'nudge'),
            (select jsonb_agg(jsonb_build_object('sub', id, 'status', 503)) from subs where endpoint like '%fcm%')),
  'pending', 'a temporary failure is retried');
select results_eq($$select error, next_attempt_at > now() + interval '3 minutes' from public.notification_deliveries where dedup_key = 'k-nudge'$$,
  $$values ('transient'::text, true)$$, 'with backoff (2^attempts minutes)');
update public.notification_deliveries set status = 'sending', attempts = 5 where dedup_key = 'k-nudge';
select is(private.push_finish((select delivery_id from claimed where kind = 'nudge'),
            (select jsonb_agg(jsonb_build_object('sub', id, 'status', 0)) from subs where endpoint like '%fcm%')),
  'failed', 'after 5 attempts it stops');
update public.notification_deliveries set status = 'sending' where dedup_key = 'k-planner';
select is(private.push_finish((select delivery_id from claimed where kind = 'planner'), '[]'::jsonb, 'source_gone'),
  'skipped', 'nothing left to send: skipped with its reason');
select is(private.push_finish((select delivery_id from claimed where kind = 'planner'), '[]'::jsonb), null,
  'a finished delivery cannot be finished again');

-- ------------------------------------------------------------- retention ----
insert into public.notification_deliveries (user_id, kind, dedup_key, expires_at, status, created_at)
  values (pg_temp.id('a'), 'test', 'k-ancient', now() - interval '30 days', 'sent', now() - interval '31 days');
select private.push_tick();
select is((select count(*)::int from public.notification_deliveries where dedup_key = 'k-ancient'), 0,
  'deliveries older than 30 days are deleted');

select * from finish();
rollback;
