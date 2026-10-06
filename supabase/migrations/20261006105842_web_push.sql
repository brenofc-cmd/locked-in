-- V2 Phase 10 · Web Push + advanced reminders (docs/WEB_PUSH.md, ADR-092…099).
--
--   push_subscriptions       one row per device / browser (endpoint unique),
--                            owner-only. Endpoints only on known push services.
--   notification_deliveries  one row per logical notification
--                            (unique user + dedup key): exactly-once delivery
--                            on an at-least-once scheduler. No payload stored.
--   user_settings.push_*     which kinds are pushed (default on — nothing is
--                            sent without an explicitly enabled device).
--   private.push_tick()      pg_cron, every minute: enqueue what is due
--                            (planner reminders, nudges, reviews, weekly
--                            planning — outside quiet hours, before expiry),
--                            then wake the Edge Function `push-dispatch`
--                            through pg_net only when something is pending.
--   private.push_claim/finish  used by the Edge Function (database owner
--                            connection): claim with SKIP LOCKED, record the
--                            outcome, drop 404 / 410 subscriptions, retry
--                            transient failures with backoff.
--
-- No new SECURITY DEFINER function, no API role can execute any private
-- push function, no channel, no broadcast. The dispatch URL and secret and
-- the VAPID keys live in Supabase Vault (per environment, never in this file).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- --------------------------------------------------------- preferences ----

alter table public.user_settings
  add column push_planner boolean not null default true,
  add column push_nudges boolean not null default true,
  add column push_reviews boolean not null default true,
  add column push_weekly_plan boolean not null default true,
  add column push_hide_details boolean not null default false;

grant update (push_planner, push_nudges, push_reviews, push_weekly_plan, push_hide_details)
  on table public.user_settings to authenticated;

-- -------------------------------------------------- push subscriptions ----

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  endpoint text not null
    constraint push_subscriptions_endpoint_unique unique
    constraint push_subscriptions_endpoint_service check (
      char_length(endpoint) <= 1024
      and endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/'
    ),
  p256dh text not null
    constraint push_subscriptions_p256dh check (p256dh ~ '^[A-Za-z0-9_-]{86,88}={0,2}$'),
  auth text not null
    constraint push_subscriptions_auth check (auth ~ '^[A-Za-z0-9_-]{21,24}={0,2}$'),
  user_agent text
    constraint push_subscriptions_user_agent check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0
);

comment on table public.push_subscriptions is
  'V2 Phase 10: one Web Push subscription per device / browser. Owner-only; the partner, outsiders and anon see nothing.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- The endpoint identifies the device: it never moves to another row or
-- user. Delivery bookkeeping is the sender's (database owner), never the
-- client's.
create function private.guard_push_subscription()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.endpoint <> old.endpoint or new.user_id <> old.user_id) then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.last_success_at := null;
    new.last_failure_at := null;
    new.failure_count := 0;
  end if;
  return new;
end;
$$;

create trigger push_subscriptions_guard
  before insert or update on public.push_subscriptions
  for each row execute function private.guard_push_subscription();

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth, user_agent) on table public.push_subscriptions to authenticated;
grant update (endpoint, p256dh, auth, user_agent) on table public.push_subscriptions to authenticated;
create policy "push_subscriptions: owner only" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -------------------------------------------- notification deliveries ----

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  kind text not null
    constraint notification_deliveries_kind check (
      kind in ('planner', 'nudge', 'review_day', 'review_week', 'plan_week', 'test')),
  dedup_key text not null
    constraint notification_deliveries_dedup_key check (char_length(dedup_key) between 1 and 120),
  ref_id uuid,
  scheduled_for timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending'
    constraint notification_deliveries_status check (
      status in ('pending', 'sending', 'sent', 'failed', 'expired', 'skipped')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  error text constraint notification_deliveries_error check (char_length(error) <= 40),
  created_at timestamptz not null default now(),
  constraint notification_deliveries_once unique (user_id, dedup_key)
);

comment on table public.notification_deliveries is
  'V2 Phase 10: one row per logical push (unique user + dedup key) — exactly-once delivery. No payload. Owner reads own; only a rate-limited test can be requested by a client.';

create index notification_deliveries_due_idx on public.notification_deliveries (next_attempt_at)
  where status in ('pending', 'sending');
create index notification_deliveries_created_idx on public.notification_deliveries (created_at);

-- A client may only ask for a test notification: at most one a minute, and
-- the database writes every field.
create function private.guard_notification_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.kind <> 'test' then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.notification_deliveries d
             where d.user_id = new.user_id and d.kind = 'test'
               and d.created_at > now() - interval '1 minute') then
    raise exception 'LI_RATE_LIMITED' using errcode = 'P0001';
  end if;
  new.dedup_key := 'test:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS');
  new.ref_id := null;
  new.scheduled_for := now();
  new.expires_at := now() + interval '10 minutes';
  new.status := 'pending';
  new.attempts := 0;
  new.next_attempt_at := now();
  new.claimed_at := null;
  new.sent_at := null;
  new.error := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger notification_deliveries_guard
  before insert on public.notification_deliveries
  for each row execute function private.guard_notification_delivery();

alter table public.notification_deliveries enable row level security;
revoke all on table public.notification_deliveries from public, anon, authenticated;
grant select on table public.notification_deliveries to authenticated;
grant insert (kind) on table public.notification_deliveries to authenticated;
create policy "notification_deliveries: read own" on public.notification_deliveries
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notification_deliveries: request own test" on public.notification_deliveries
  for insert to authenticated
  with check (user_id = (select auth.uid()) and kind = 'test');

-- ----------------------------------------------------------- scheduler ----

-- Quiet hours exactly as the app decides them (src/lib/notifications.ts):
-- [start, end) in local time, start > end wraps midnight, start = end never.
create function private.push_quiet(p_local time, p_enabled boolean, p_start time, p_end time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_enabled, false) and p_start is not null and p_end is not null
         and p_start <> p_end
         and case when p_start < p_end then p_local >= p_start and p_local < p_end
                  else p_local >= p_start or p_local < p_end end;
$$;

-- Users with at least one enabled device, their local clock and preferences.
create function private.push_audience(p_now timestamptz, p_user uuid default null)
returns table (
  user_id uuid,
  tz text,
  local_now timestamp,
  today date,
  quiet boolean,
  planner boolean,
  nudges boolean,
  reviews boolean,
  plan_week boolean
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.timezone, p_now at time zone p.timezone, (p_now at time zone p.timezone)::date,
         private.push_quiet((p_now at time zone p.timezone)::time, s.quiet_hours_enabled,
                            s.quiet_hours_start, s.quiet_hours_end),
         s.push_planner, s.push_nudges, s.push_reviews, s.push_weekly_plan
  from public.profiles p
  join public.user_settings s on s.user_id = p.id
  where (p_user is null or p.id = p_user)
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id);
$$;

-- Everything due at p_now becomes one delivery per logical event. A reminder
-- due inside quiet hours is created when they end, if it is still before its
-- expiry and less than a day late. Idempotent: run it as often as you like.
create function private.push_enqueue(p_now timestamptz default now(), p_user uuid default null)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_rows integer;
begin
  -- Planner: 08:00 local of the reminder day; on the day of a timed event at
  -- most 2 h before it; never once the event has started (untimed: its day).
  insert into public.notification_deliveries (user_id, kind, dedup_key, ref_id, scheduled_for, expires_at)
  select a.user_id, 'planner',
         'planner:' || e.id || ':' || e.reminder_days_before || ':' || e.event_date,
         e.id, x.due, x.expires
  from private.push_audience(p_now, p_user) a
  join public.planner_events e on e.owner_id = a.user_id
  cross join lateral (
    select (case when e.reminder_days_before = 0 and e.event_time is not null
                 then least(e.event_date + time '08:00', e.event_date + e.event_time - interval '2 hours')
                 else (e.event_date - e.reminder_days_before::integer) + time '08:00'
            end) at time zone a.tz as due,
           (case when e.event_time is not null then e.event_date + e.event_time
                 else (e.event_date + 1)::timestamp
            end) at time zone a.tz as expires
  ) x
  where a.planner and not a.quiet
    and e.reminder_days_before is not null
    and e.event_date between a.today and a.today + 7
    and x.due <= p_now and x.due > p_now - interval '24 hours'
    and p_now < x.expires
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- DAR UM TOQUE: delivery of an existing nudge (Phase 6 limits made it);
  -- useless after the recipient's day of it.
  insert into public.notification_deliveries (user_id, kind, dedup_key, ref_id, scheduled_for, expires_at)
  select a.user_id, 'nudge', 'nudge:' || n.id, n.id, n.created_at,
         (n.recipient_date + 1)::timestamp at time zone a.tz
  from private.push_audience(p_now, p_user) a
  join public.nudges n on n.to_user = a.user_id
  where a.nudges and not a.quiet
    and n.created_at <= p_now and n.created_at > p_now - interval '6 hours'
    and p_now < (n.recipient_date + 1)::timestamp at time zone a.tz
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Review do dia: from 21:00, a day with tasks and no reflection yet.
  insert into public.notification_deliveries (user_id, kind, dedup_key, scheduled_for, expires_at)
  select a.user_id, 'review_day', 'review-day:' || a.today,
         (a.today + time '21:00') at time zone a.tz,
         (a.today + 1)::timestamp at time zone a.tz
  from private.push_audience(p_now, p_user) a
  where a.reviews and not a.quiet
    and a.local_now::time >= time '21:00'
    and exists (select 1 from public.daily_tasks t where t.owner_id = a.user_id and t.task_date = a.today)
    and not exists (select 1 from public.reviews r
                    where r.owner_id = a.user_id and r.kind = 'day' and r.period_start = a.today)
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Review semanal: Sunday from 19:00, a week with tasks and no reflection.
  insert into public.notification_deliveries (user_id, kind, dedup_key, scheduled_for, expires_at)
  select a.user_id, 'review_week', 'review-week:' || (a.today - 6),
         (a.today + time '19:00') at time zone a.tz,
         (a.today + 1)::timestamp at time zone a.tz
  from private.push_audience(p_now, p_user) a
  where a.reviews and not a.quiet
    and extract(isodow from a.today) = 7
    and a.local_now::time >= time '19:00'
    and exists (select 1 from public.daily_tasks t
                where t.owner_id = a.user_id and t.task_date between a.today - 6 and a.today)
    and not exists (select 1 from public.reviews r
                    where r.owner_id = a.user_id and r.kind = 'week' and r.period_start = a.today - 6)
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Planejamento semanal: Monday from 08:00, a week without any priority.
  insert into public.notification_deliveries (user_id, kind, dedup_key, scheduled_for, expires_at)
  select a.user_id, 'plan_week', 'plan-week:' || a.today,
         (a.today + time '08:00') at time zone a.tz,
         (a.today + 1)::timestamp at time zone a.tz
  from private.push_audience(p_now, p_user) a
  where a.plan_week and not a.quiet
    and extract(isodow from a.today) = 1
    and a.local_now::time >= time '08:00'
    and not exists (select 1 from public.weekly_priorities w
                    where w.owner_id = a.user_id and w.week_start = a.today)
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  return v_total;
end;
$$;

-- The sender takes a batch: due, not expired, not taken by another run
-- (SKIP LOCKED; a run that died releases its rows after 5 minutes). Returns
-- only what the message needs: no reflection, goal or vision ever.
create function private.push_claim(p_limit integer default 25, p_now timestamptz default now())
returns table (
  delivery_id uuid,
  kind text,
  hide_details boolean,
  data jsonb,
  subscriptions jsonb
)
language plpgsql
volatile
set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.notification_deliveries d
  set status = 'expired', error = null
  where d.status in ('pending', 'sending') and d.expires_at <= p_now;

  return query
  with c as (
    select d.id
    from public.notification_deliveries d
    where (d.status = 'pending' and d.next_attempt_at <= p_now)
       or (d.status = 'sending' and d.claimed_at < p_now - interval '5 minutes')
    order by d.next_attempt_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), u as (
    update public.notification_deliveries d
    set status = 'sending', claimed_at = p_now, attempts = d.attempts + 1
    from c
    where d.id = c.id
    returning d.id, d.user_id, d.kind, d.ref_id
  )
  select u.id,
         u.kind,
         coalesce(s.push_hide_details, false),
         case u.kind
           when 'planner' then (
             select jsonb_build_object(
                      'title', e.title,
                      'type', e.event_type,
                      'days', e.event_date - (p_now at time zone p.timezone)::date,
                      'time', to_char(e.event_time, 'HH24:MI'))
             from public.planner_events e
             where e.id = u.ref_id and e.owner_id = u.user_id)
           when 'nudge' then (
             select jsonb_build_object('from', fp.display_name, 'commitment', cm.title)
             from public.nudges n
             join public.profiles fp on fp.id = n.from_user
             left join public.commitments cm on cm.id = n.commitment_id
             where n.id = u.ref_id and n.to_user = u.user_id)
           else '{}'::jsonb
         end,
         coalesce((select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint,
                                                       'p256dh', ps.p256dh, 'auth', ps.auth)
                                    order by ps.created_at)
                   from public.push_subscriptions ps
                   where ps.user_id = u.user_id), '[]'::jsonb)
  from u
  join public.profiles p on p.id = u.user_id
  left join public.user_settings s on s.user_id = u.user_id;
end;
$$;

-- The outcome of one delivery: p_results = [{"sub": <id>, "status": <http>}]
-- (0 = network error). 2xx anywhere → sent. 404 / 410 → the subscription is
-- gone (deleted). 429 / 5xx / network → retried with backoff (2, 4, 8, 16
-- min), failed after 5 attempts. Nothing to send to → skipped (p_reason).
create function private.push_finish(
  p_delivery uuid,
  p_results jsonb,
  p_reason text default null,
  p_now timestamptz default now()
)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ok integer;
  v_transient integer;
  v_total integer;
  v_status text;
begin
  update public.push_subscriptions ps
  set last_success_at = p_now, failure_count = 0
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as r(sub uuid, status integer)
  where ps.id = r.sub and r.status between 200 and 299;

  delete from public.push_subscriptions ps
  using jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as r(sub uuid, status integer)
  where ps.id = r.sub and r.status in (404, 410);

  update public.push_subscriptions ps
  set last_failure_at = p_now, failure_count = ps.failure_count + 1
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as r(sub uuid, status integer)
  where ps.id = r.sub and not (r.status between 200 and 299) and r.status not in (404, 410);

  -- A device that keeps refusing (e.g. a key the service rejects) stops
  -- being tried.
  delete from public.push_subscriptions ps where ps.failure_count >= 10;

  select count(*) filter (where r.status between 200 and 299),
         count(*) filter (where r.status = 0 or r.status = 429 or r.status >= 500),
         count(*)
    into v_ok, v_transient, v_total
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as r(sub uuid, status integer);

  update public.notification_deliveries d
  set status = case
                 when v_ok > 0 then 'sent'
                 when v_total = 0 then 'skipped'
                 when v_transient > 0 and d.attempts < 5 then 'pending'
                 else 'failed'
               end,
      sent_at = case when v_ok > 0 then p_now else null end,
      next_attempt_at = case
                          when v_ok = 0 and v_total > 0 and v_transient > 0 and d.attempts < 5
                            then p_now + make_interval(mins => (2 ^ d.attempts)::integer)
                          else d.next_attempt_at
                        end,
      error = case
                when v_ok > 0 then null
                when v_total = 0 then left(coalesce(p_reason, 'no_device'), 40)
                when v_transient > 0 then 'transient'
                else 'rejected'
              end
  where d.id = p_delivery and d.status = 'sending'
  returning d.status into v_status;

  return v_status;
end;
$$;

-- Every minute (pg_cron): enqueue, keep 30 days of history, and wake the
-- sender only when something is waiting. The URL and the secret are per
-- environment (Vault); without them nothing is sent.
create function private.push_tick()
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  perform private.push_enqueue(now());

  delete from public.notification_deliveries d where d.created_at < now() - interval '30 days';

  if not exists (
    select 1 from public.notification_deliveries d
    where (d.status = 'pending' and d.next_attempt_at <= now())
       or (d.status = 'sending' and d.claimed_at < now() - interval '5 minutes')
  ) then
    return;
  end if;

  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'push_dispatch_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-li-dispatch', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.guard_push_subscription() from public, anon, authenticated;
revoke all on function private.guard_notification_delivery() from public, anon, authenticated;
revoke all on function private.push_quiet(time, boolean, time, time) from public, anon, authenticated;
revoke all on function private.push_audience(timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.push_enqueue(timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.push_claim(integer, timestamptz) from public, anon, authenticated;
revoke all on function private.push_finish(uuid, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function private.push_tick() from public, anon, authenticated;

select cron.schedule('locked-in-push-tick', '* * * * *', 'select private.push_tick()');
