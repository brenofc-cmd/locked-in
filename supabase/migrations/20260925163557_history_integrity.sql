-- Stage 9 · closed history is immutable (database-enforced)
--
-- A local day that has ended is closed: its competitive data (daily_tasks,
-- focus sessions of that day) can no longer be changed by a client. The
-- current day stays fully editable.
--
-- History boundary ("locked through"), per user:
--   locked_through = greatest(profiles.history_locked_through, local date - 1)
--   today          = locked_through + 1
-- profiles.history_locked_through is written only by the database: when the
-- timezone changes it keeps the boundary reached under the OLD timezone, so
-- the boundary only moves forward and a timezone change can never reopen a
-- closed day (moving west keeps "today" where it was until the new local
-- date catches up).
--
-- Who may still write a closed day: only trusted database code. Routine
-- catch-up (private.materialize_tasks) runs as SECURITY DEFINER, so its
-- inserts are made by the function owner, not by the API roles; the guards
-- below apply to the API roles (anon, authenticated) — including through
-- INVOKER RPCs — and are not controllable by the caller in any way.
-- Catch-up can only create occurrences from routine templates, and the
-- templates can no longer be manipulated to manufacture or suppress past
-- occurrences (guard on routine_items).

-- ------------------------------------------------------ the boundary ------

alter table public.profiles add column history_locked_through date;

comment on column public.profiles.history_locked_through is
  'Monotonic floor of the closed-history boundary, kept across timezone changes. Database-owned.';

-- Last closed local date of a user (null only for a missing profile).
create function private.history_locked_through(p_user uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest(p.history_locked_through, (now() at time zone p.timezone)::date - 1)
  from public.profiles p
  where p.id = p_user;
$$;

-- A user's "today": never earlier than the day after the boundary.
create or replace function private.local_today(p_user uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest((now() at time zone p.timezone)::date, p.history_locked_through + 1)
  from public.profiles p
  where p.id = p_user;
$$;

create or replace function public.my_today()
returns date
language sql
stable
set search_path = ''
as $$
  select private.local_today((select auth.uid()));
$$;

-- Timezone change: remember the boundary reached under the old timezone.
create function private.keep_history_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is distinct from old.timezone then
    new.history_locked_through := greatest(
      old.history_locked_through,
      (now() at time zone old.timezone)::date - 1
    );
  else
    new.history_locked_through := old.history_locked_through;
  end if;
  return new;
end;
$$;

create trigger profiles_keep_history_boundary
  before update on public.profiles
  for each row execute function private.keep_history_boundary();

-- ------------------------------------------------------- daily_tasks ------

-- API roles: no insert / update / delete on a closed day; future days only
-- as pending (nobody completes or skips tomorrow in advance).
create function private.guard_task_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := case when tg_op = 'INSERT' then new.owner_id else old.owner_id end;
  v_lock date;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_lock := private.history_locked_through(v_owner);
  if v_lock is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.task_date <= v_lock then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.task_date <= v_lock then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  if new.task_date > v_lock + 1 and new.status <> 'pending' then
    raise exception 'LI_FUTURE_TASK' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger daily_tasks_guard_history
  before insert or update or delete on public.daily_tasks
  for each row execute function private.guard_task_history();

-- ----------------------------------------------------- routine_items ------

-- API roles cannot shape past occurrences through the template:
--   · no start date in the past (would create closed-day tasks);
--   · materialized_through is database-owned;
--   · no change while occurrences are still due to be materialised (a
--     template edited before catch-up would rewrite the missed days — every
--     RPC materialises first);
--   · an archive date cannot move into closed days, and a routine archived
--     before yesterday cannot be reopened (the gap would be backfilled).
create function private.guard_routine_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date;
  v_due date;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  v_today := private.local_today(case when tg_op = 'INSERT' then new.owner_id else old.owner_id end);
  if v_today is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.start_date < v_today then
      raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
    end if;
    new.materialized_through := null;
    return new;
  end if;

  if new.materialized_through is distinct from old.materialized_through
     or new.start_date is distinct from old.start_date then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  v_due := least(v_today, coalesce(old.end_date, v_today));
  if v_due >= old.start_date
     and (old.materialized_through is null or old.materialized_through < v_due) then
    raise exception 'LI_ROUTINE_STALE' using errcode = 'P0001';
  end if;
  if new.end_date is distinct from old.end_date
     and ((old.end_date is not null and old.end_date < v_today - 1)
          or (new.end_date is not null and new.end_date < v_today - 1)) then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger routine_items_guard_history
  before insert or update on public.routine_items
  for each row execute function private.guard_routine_history();

revoke update (materialized_through) on table public.routine_items from authenticated;

-- Catch-up is trusted database code: SECURITY DEFINER so it can fill missed
-- (closed) days. Only for the caller or the caller's duo partner.
create or replace function private.materialize_tasks(p_user uuid)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  if p_user is null
     or (p_user is distinct from auth.uid()
         and not exists (
           select 1 from public.duo_members m
           where m.user_id = p_user and m.duo_id = private.current_duo_id()
         )) then
    return null;
  end if;
  v_today := private.local_today(p_user);
  if v_today is null then
    return null;
  end if;

  insert into public.daily_tasks (
    owner_id, routine_item_id, task_date, title, category, scheduled_time,
    sort_order, visible_to_partner, notes, reminder
  )
  select r.owner_id, r.id, d.day::date, r.title, r.category, r.scheduled_time,
         r.sort_order, r.visible_to_partner, r.notes, r.reminder
  from public.routine_items r
  cross join lateral pg_catalog.generate_series(
    greatest(r.start_date, coalesce(r.materialized_through + 1, r.start_date))::timestamp,
    least(v_today, coalesce(r.end_date, v_today))::timestamp,
    interval '1 day'
  ) as d(day)
  where r.owner_id = p_user
    and extract(isodow from d.day)::smallint = any (r.days_of_week)
  on conflict (routine_item_id, task_date) do nothing;

  update public.routine_items r
  set materialized_through = least(v_today, coalesce(r.end_date, v_today))
  where r.owner_id = p_user
    and least(v_today, coalesce(r.end_date, v_today)) >= r.start_date - 1
    and (r.materialized_through is null
         or r.materialized_through < least(v_today, coalesce(r.end_date, v_today)));

  return v_today;
end;
$$;

-- Reorder now materialises first (the routine guard refuses stale edits).
create or replace function public.reorder_routine_items(p_ids uuid[])
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_today := public.ensure_my_daily_tasks();

  update public.routine_items r
  set sort_order = x.ord * 10
  from unnest(p_ids) with ordinality as x(id, ord)
  where r.id = x.id and r.owner_id = auth.uid() and r.sort_order <> x.ord * 10;

  update public.daily_tasks t
  set sort_order = r.sort_order
  from public.routine_items r
  where t.routine_item_id = r.id
    and t.task_date = v_today
    and r.owner_id = auth.uid()
    and r.id = any (p_ids)
    and t.sort_order <> r.sort_order;
end;
$$;

-- "Today" everywhere comes from private.local_today (boundary aware).
create or replace function public.partner_today()
returns table (task_date date, done integer, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.day,
         count(t.id) filter (where t.status = 'completed')::integer,
         count(t.id)::integer
  from public.duo_members m
  cross join lateral (select private.local_today(m.user_id) as day) d
  left join public.daily_tasks t on t.owner_id = m.user_id and t.task_date = d.day
  where m.duo_id = private.current_duo_id()
    and m.user_id <> (select auth.uid())
  group by d.day;
$$;

create or replace function private.streaks(p_user uuid)
returns table (
  today date,
  standard integer,
  streak_before_today integer,
  longest_closed integer,
  today_planned integer,
  today_completed integer,
  first_task_date date
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date;
  v_standard integer;
  v_run integer := 0;
  v_best integer := 0;
  r record;
begin
  select private.local_today(p.id), p.daily_standard_percent
  into v_today, v_standard
  from public.profiles p
  where p.id = p_user;
  if v_today is null then
    return;
  end if;

  for r in
    select dt.task_date,
           count(*)::integer as n_planned,
           (count(*) filter (where dt.status = 'completed'))::integer as n_completed
    from public.daily_tasks dt
    where dt.owner_id = p_user
      and dt.task_date < v_today
    group by dt.task_date
    order by dt.task_date
  loop
    if private.standard_met(r.n_planned, r.n_completed, v_standard) then
      v_run := v_run + 1;
      v_best := greatest(v_best, v_run);
    else
      v_run := 0;
    end if;
  end loop;

  return query
  select v_today,
         v_standard,
         v_run,
         v_best,
         (select count(*)::integer from public.daily_tasks dt
          where dt.owner_id = p_user and dt.task_date = v_today),
         (select (count(*) filter (where dt.status = 'completed'))::integer
          from public.daily_tasks dt
          where dt.owner_id = p_user and dt.task_date = v_today),
         (select min(dt.task_date) from public.daily_tasks dt where dt.owner_id = p_user);
end;
$$;

-- ---------------------------------------------------- focus_sessions ------

-- The local day a session belongs to is fixed when it starts (a later
-- timezone change never moves it between days).
alter table public.focus_sessions add column local_date date;

alter table public.focus_sessions disable trigger user;
update public.focus_sessions s
set local_date = (s.started_at at time zone p.timezone)::date
from public.profiles p
where p.id = s.user_id;
alter table public.focus_sessions enable trigger user;

alter table public.focus_sessions alter column local_date set not null;
create index focus_sessions_user_day_idx on public.focus_sessions (user_id, local_date);

comment on column public.focus_sessions.local_date is
  'Owner''s local date when the session started (database-owned).';

-- Lifecycle, plus: local_date set at start and never changed; a paused
-- session whose day is closed cannot be resumed (it would add focus to a
-- closed day) — reconcile_my_focus() completes it instead.
create or replace function private.focus_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_task_visible boolean;
  v_at timestamptz;
  v_elapsed integer;
begin
  if tg_op = 'INSERT' then
    new.title := btrim(new.title);
    new.status := 'active';
    new.started_at := v_now;
    new.local_date := private.local_today(new.user_id);
    new.paused_at := null;
    new.accumulated_pause_seconds := 0;
    new.ended_at := null;
    new.actual_focus_seconds := null;
    new.reflection := null;
    select m.duo_id into new.duo_id from public.duo_members m where m.user_id = new.user_id;
    if new.daily_task_id is not null then
      select t.visible_to_partner into v_task_visible
      from public.daily_tasks t
      where t.id = new.daily_task_id and t.owner_id = new.user_id;
      new.visible_to_partner := new.visible_to_partner and coalesce(v_task_visible, true);
    end if;
    return new;
  end if;

  new.local_date := old.local_date;
  new.reflection := nullif(btrim(new.reflection), '');

  if old.status = 'completed' then
    if new.status <> 'completed' then
      raise exception 'LI_FOCUS_FINISHED' using errcode = 'P0001';
    end if;
    return new; -- only the reflection (or a cascade) may change
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'paused' then            -- active -> paused
    new.paused_at := v_now;
  elsif new.status = 'active' then         -- paused -> active
    if old.local_date <= private.history_locked_through(old.user_id) then
      raise exception 'LI_FOCUS_FINISHED' using errcode = 'P0001';
    end if;
    new.accumulated_pause_seconds := old.accumulated_pause_seconds
      + greatest(0, round(extract(epoch from v_now - old.paused_at)))::integer;
    new.paused_at := null;
  else                                     -- active / paused -> completed
    v_at := coalesce(old.paused_at, v_now);
    v_elapsed := greatest(0, floor(extract(epoch from v_at - old.started_at))::integer
                             - old.accumulated_pause_seconds);
    if v_elapsed >= old.planned_seconds then
      new.actual_focus_seconds := old.planned_seconds;
      new.ended_at := old.started_at
        + make_interval(secs => old.accumulated_pause_seconds + old.planned_seconds);
    else
      new.actual_focus_seconds := v_elapsed;
      new.ended_at := v_now;
    end if;
    new.paused_at := null;
  end if;
  return new;
end;
$$;

-- Also closes a paused session left on a closed day (its focus stays what it
-- was when paused).
create or replace function public.reconcile_my_focus()
returns void
language sql
volatile
set search_path = ''
as $$
  update public.focus_sessions s
  set status = 'completed'
  where s.user_id = (select auth.uid())
    and (
      (s.status = 'active'
       and now() >= s.started_at
                    + make_interval(secs => s.accumulated_pause_seconds + s.planned_seconds))
      or (s.status = 'paused'
          and s.local_date <= private.history_locked_through((select auth.uid())))
    );
$$;

-- Focus per day by the stored local date.
create or replace function private.day_stats(p_user uuid, p_from date, p_to date)
returns table (
  day date,
  planned integer,
  completed integer,
  focus_seconds integer,
  focus_sessions integer
)
language sql
stable
set search_path = ''
as $$
  with t as (
    select dt.task_date,
           count(*)::integer as planned,
           count(*) filter (where dt.status = 'completed')::integer as completed
    from public.daily_tasks dt
    where dt.owner_id = p_user
      and dt.task_date between p_from and p_to
    group by dt.task_date
  ), f as (
    select s.local_date as day,
           sum(private.focus_seconds(s.status, s.started_at, s.paused_at,
                                     s.accumulated_pause_seconds, s.planned_seconds,
                                     s.actual_focus_seconds))::integer as secs,
           count(*)::integer as n
    from public.focus_sessions s
    where s.user_id = p_user
      and s.local_date between p_from and p_to
    group by s.local_date
  )
  select g.day::date,
         coalesce(t.planned, 0),
         coalesce(t.completed, 0),
         coalesce(f.secs, 0),
         coalesce(f.n, 0)
  from pg_catalog.generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(day)
  left join t on t.task_date = g.day::date
  left join f on f.day = g.day::date
  order by 1;
$$;

-- ----------------------------------------------------------- challenges ---

-- A standard-days challenge is judged with each member's Daily Standard as it
-- was when the challenge was created, so a later Settings change can never
-- flip a result. Database-owned (no client grant).
alter table public.challenges
  add column creator_standard integer,
  add column partner_standard integer;

update public.challenges c
set creator_standard = (select p.daily_standard_percent from public.profiles p where p.id = c.created_by),
    partner_standard = (
      select p.daily_standard_percent
      from public.duo_members m
      join public.profiles p on p.id = m.user_id
      where m.duo_id = c.duo_id and m.user_id <> c.created_by
    );
update public.challenges c
set partner_standard = c.creator_standard
where c.partner_standard is null;

alter table public.challenges
  alter column creator_standard set not null,
  alter column partner_standard set not null;

comment on column public.challenges.creator_standard is 'Author''s Daily Standard when created (standard_days).';
comment on column public.challenges.partner_standard is 'Other member''s Daily Standard when created (standard_days).';

create or replace function private.normalize_challenge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  if tg_op = 'INSERT' then
    select p.daily_standard_percent into new.creator_standard
    from public.profiles p where p.id = new.created_by;
    select p.daily_standard_percent into new.partner_standard
    from public.duo_members m
    join public.profiles p on p.id = m.user_id
    where m.duo_id = new.duo_id and m.user_id <> new.created_by;
  else
    new.creator_standard := old.creator_standard;
    new.partner_standard := old.partner_standard;
  end if;
  return new;
end;
$$;

drop function private.challenge_value(uuid, text, date, date);

create function private.challenge_value(
  p_user uuid, p_type text, p_from date, p_to date, p_standard integer
)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := private.local_today(p_user);
  v_to date := least(p_to, v_today);
begin
  if v_today is null or v_to < p_from then
    return 0;
  end if;
  if p_type = 'standard_days' then
    return (
      select count(*)::integer
      from (
        select dt.task_date,
               count(*)::integer as n_planned,
               (count(*) filter (where dt.status = 'completed'))::integer as n_completed
        from public.daily_tasks dt
        where dt.owner_id = p_user and dt.task_date between p_from and v_to
        group by dt.task_date
      ) d
      where private.standard_met(d.n_planned, d.n_completed, p_standard)
    );
  end if;
  return (
    select coalesce(sum(s.actual_focus_seconds), 0)::integer
    from public.focus_sessions s
    where s.user_id = p_user
      and s.status = 'completed'
      and s.local_date between p_from and v_to
  );
end;
$$;

create or replace function public.duo_challenges()
returns table (
  id uuid,
  title text,
  challenge_type text,
  target_value integer,
  start_date date,
  end_date date,
  created_by uuid,
  created_at timestamptz,
  me_value integer,
  partner_value integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_duo uuid;
  v_partner uuid;
begin
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_duo := private.current_duo_id();
  if v_duo is null then
    return;
  end if;
  select m.user_id into v_partner
  from public.duo_members m
  where m.duo_id = v_duo and m.user_id <> v_me;

  perform private.materialize_tasks(v_me);
  if v_partner is not null then
    perform private.materialize_tasks(v_partner);
  end if;

  return query
  select c.id, c.title, c.challenge_type, c.target_value, c.start_date, c.end_date,
         c.created_by, c.created_at,
         private.challenge_value(v_me, c.challenge_type, c.start_date, c.end_date,
           case when c.created_by = v_me then c.creator_standard else c.partner_standard end),
         case when v_partner is null then null
              else private.challenge_value(v_partner, c.challenge_type, c.start_date, c.end_date,
                case when c.created_by = v_partner then c.creator_standard else c.partner_standard end)
         end
  from public.challenges c
  where c.duo_id = v_duo
  order by c.start_date desc, c.created_at desc;
end;
$$;

-- ---------------------------------------------------------------- grants --

revoke all on function private.history_locked_through(uuid) from public, anon, authenticated;
revoke all on function private.keep_history_boundary() from public, anon, authenticated;
revoke all on function private.guard_task_history() from public, anon, authenticated;
revoke all on function private.guard_routine_history() from public, anon, authenticated;
revoke all on function private.challenge_value(uuid, text, date, date, integer) from public, anon, authenticated;
-- Called from INVOKER triggers / policies running as the signed-in user.
grant execute on function private.history_locked_through(uuid) to authenticated;
-- materialize_tasks is DEFINER now: keep EXECUTE for authenticated only
-- (INVOKER owner functions call it); it acts only for the caller or partner.
revoke all on function private.materialize_tasks(uuid) from public, anon;
grant execute on function private.materialize_tasks(uuid) to authenticated;

-- Future objects in public: nothing for anon / PUBLIC unless granted
-- explicitly by the migration that creates them.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
