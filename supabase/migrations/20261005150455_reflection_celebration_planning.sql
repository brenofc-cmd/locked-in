-- V2 Phase 9 · Celebrations + Reviews 2.0 + Non-Negotiables + Weekly Planning
-- (docs/CELEBRATIONS.md, docs/WEEKLY_PLANNING.md, ADR-086…091).
--
-- Every new row is OWNER-ONLY (the partner, outsiders and anon read and write
-- nothing). No new SECURITY DEFINER function: the guards are INVOKER triggers
-- that run as the caller (RLS still applies) and the read function is
-- INVOKER. No broadcast, no channel.
--
--   celebrations              milestone unlocks (validated against the real
--                             numbers, immutable, with the value at unlock)
--                             + Perfect Day / month receipts + seen_at, so a
--                             celebration shows once across devices. A
--                             historical event, not an analytics cache.
--   daily_task_non_negotiables / routine_non_negotiables
--                             private side tables (the Phase 5 pattern): a
--                             shareable task row never carries the flag.
--   weekly_priorities         PRIORIDADES DA SEMANA: up to 3 per Monday–Sunday
--                             week, self-declared (never proof).
--   reviews                   the three optional reflections of a day / week.
--   my_review_facts(from, to) objective facts of a period from the existing
--                             sources (no new formula, no interpretation).

-- ------------------------------------------------------- shared numbers ----

-- my_records() keeps its contract; its body moves to private.records(user)
-- so the milestone baseline below uses the very same numbers.
create function private.records(p_user uuid)
returns table (
  best_focus_day_seconds integer,
  best_focus_day date,
  best_focus_week_seconds integer,
  best_focus_week date,
  best_perfect_month_days integer,
  best_perfect_month date,
  total_focus_seconds integer,
  total_perfect_days integer
)
language sql
stable
set search_path = ''
as $$
  with s as (
    select f.local_date as day,
           private.focus_seconds(f.status, f.started_at, f.paused_at, f.accumulated_pause_seconds,
                                 f.planned_seconds, f.actual_focus_seconds) as secs
    from public.focus_sessions f
    where f.user_id = p_user
      and not (f.status = 'active'
               and now() < f.started_at + make_interval(secs => f.accumulated_pause_seconds + f.planned_seconds))
  ), fd as (
    select s.day, sum(s.secs)::integer as secs from s group by s.day
  ), fw as (
    select date_trunc('week', s.day::timestamp)::date as week, sum(s.secs)::integer as secs
    from s
    where date_trunc('week', s.day::timestamp)::date + 6 <= private.history_locked_through(p_user)
    group by 1
  ), d as (
    select t.task_date as day
    from public.daily_tasks t
    where t.owner_id = p_user
      and t.task_date <= private.history_locked_through(p_user)
    group by t.task_date
    having count(*) > 0 and count(*) = count(*) filter (where t.status = 'completed')
  ), pm as (
    select date_trunc('month', d.day::timestamp)::date as month, count(*)::integer as n
    from d
    group by 1
  )
  select (select fd.secs from fd where fd.secs > 0 order by fd.secs desc, fd.day limit 1),
         (select fd.day from fd where fd.secs > 0 order by fd.secs desc, fd.day limit 1),
         (select fw.secs from fw where fw.secs > 0 order by fw.secs desc, fw.week limit 1),
         (select fw.week from fw where fw.secs > 0 order by fw.secs desc, fw.week limit 1),
         (select pm.n from pm order by pm.n desc, pm.month limit 1),
         (select pm.month from pm order by pm.n desc, pm.month limit 1),
         coalesce((select sum(fd.secs) from fd), 0)::integer,
         (select count(*) from d)::integer;
$$;

create or replace function public.my_records()
returns table (
  best_focus_day_seconds integer,
  best_focus_day date,
  best_focus_week_seconds integer,
  best_focus_week date,
  best_perfect_month_days integer,
  best_perfect_month date,
  total_focus_seconds integer,
  total_perfect_days integer
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  -- Routine occurrences of unopened days exist before they are judged.
  perform private.materialize_tasks(v_me);
  return query select * from private.records(v_me);
end;
$$;

-- The value of a milestone kind for a user: the longest streak (closed days
-- + today once it meets the standard, exactly my_progress_summary), whole
-- settled focus seconds, Perfect Days of closed days.
create function private.milestone_value(p_user uuid, p_kind text)
returns integer
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'streak' then (
      select greatest(s.longest_closed,
                      s.streak_before_today
                        + (private.standard_met(s.today_planned, s.today_completed, s.standard))::integer)
      from private.streaks(p_user) s)
    when 'focus' then (select r.total_focus_seconds from private.records(p_user) r)
    when 'perfect' then (select r.total_perfect_days from private.records(p_user) r)
  end;
$$;

-- The nine milestones (docs/MONTHLY_COMPETITION.md): code → kind, threshold
-- in the value's unit (focus in seconds).
create function private.milestone_threshold(p_code text)
returns table (kind text, threshold integer)
language sql
immutable
set search_path = ''
as $$
  select m.kind, m.threshold
  from (values
    ('streak_7', 'streak', 7), ('streak_30', 'streak', 30), ('streak_100', 'streak', 100),
    ('focus_10', 'focus', 36000), ('focus_50', 'focus', 180000), ('focus_100', 'focus', 360000),
    ('perfect_5', 'perfect', 5), ('perfect_10', 'perfect', 10), ('perfect_30', 'perfect', 30)
  ) as m(code, kind, threshold)
  where m.code = p_code;
$$;

-- --------------------------------------------------------- celebrations ----

create table public.celebrations (
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  kind text not null
    constraint celebrations_kind check (kind in ('milestone', 'perfect_day', 'monthly')),
  key text not null
    constraint celebrations_key_length check (char_length(key) between 1 and 20),
  achieved_at timestamptz not null default now(),
  -- milestone: the real value when it was reached (streak days, focus
  -- seconds, Perfect Days); receipts: null.
  source_value integer,
  -- true = recorded when Phase 9 shipped (already reached): never celebrated.
  baseline boolean not null default false,
  seen_at timestamptz,
  primary key (owner_id, kind, key)
);

comment on table public.celebrations is
  'V2 Phase 9: milestone unlocks (historical events, immutable) and Perfect Day / month celebration receipts. Owner-only.';

create function private.guard_celebration()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_kind text;
  v_threshold integer;
  v_value integer;
  v_today date;
  v_day date;
begin
  if tg_op = 'UPDATE' then
    -- Only "seen" can change, once, stamped by the database.
    if new.owner_id is distinct from old.owner_id or new.kind is distinct from old.kind
       or new.key is distinct from old.key or new.achieved_at is distinct from old.achieved_at
       or new.source_value is distinct from old.source_value or new.baseline is distinct from old.baseline then
      raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
    end if;
    new.seen_at := coalesce(old.seen_at, now());
    return new;
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new; -- trusted path: the baseline written by the database
  end if;
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  new.owner_id := v_me;
  new.achieved_at := now();
  new.baseline := false;
  new.seen_at := null;
  new.source_value := null;
  v_today := private.local_today(v_me);

  if new.kind = 'milestone' then
    select m.kind, m.threshold into v_kind, v_threshold from private.milestone_threshold(new.key) m;
    if v_kind is null then
      raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
    end if;
    v_value := private.milestone_value(v_me, v_kind);
    if coalesce(v_value, 0) < v_threshold then
      raise exception 'LI_MILESTONE_NOT_REACHED' using errcode = 'P0001';
    end if;
    new.source_value := v_value;
  elsif new.kind = 'perfect_day' then
    -- Only today, and only while today is a Perfect Day (the existing
    -- definition: planned > 0 and every task completed).
    v_day := case when new.key ~ '^\d{4}-\d{2}-\d{2}$' then new.key::date end;
    if v_day is distinct from v_today or not exists (
         select 1 from public.daily_tasks t
         where t.owner_id = v_me and t.task_date = v_today
         having count(*) > 0 and count(*) = count(*) filter (where t.status = 'completed')) then
      raise exception 'LI_NOT_PERFECT' using errcode = 'P0001';
    end if;
  else
    -- A month receipt: only a month that has ended for the caller.
    v_day := case when new.key ~ '^\d{4}-\d{2}-01$' then new.key::date end;
    if v_day is null or v_day >= date_trunc('month', v_today::timestamp)::date then
      raise exception 'LI_MONTH_OPEN' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger celebrations_guard
  before insert or update on public.celebrations
  for each row execute function private.guard_celebration();

-- Baseline: every milestone a user has already reached is recorded as seen,
-- so shipping Phase 9 never replays old achievements. Runs as the database
-- (this migration and the DEV fixture), callable by no API role.
create function private.baseline_milestones(p_user uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  with v as (
    select k.kind, private.milestone_value(p_user, k.kind) as value
    from (values ('streak'), ('focus'), ('perfect')) as k(kind)
  ), m as (
    select c.code, t.kind, t.threshold
    from (values ('streak_7'), ('streak_30'), ('streak_100'), ('focus_10'), ('focus_50'),
                 ('focus_100'), ('perfect_5'), ('perfect_10'), ('perfect_30')) as c(code),
         lateral private.milestone_threshold(c.code) t
  ), ins as (
    insert into public.celebrations (owner_id, kind, key, source_value, baseline, seen_at)
    select p_user, 'milestone', m.code, v.value, true, now()
    from m join v on v.kind = m.kind
    where coalesce(v.value, 0) >= m.threshold
    on conflict (owner_id, kind, key) do nothing
    returning 1
  )
  select count(*)::integer into v_n from ins;
  return v_n;
end;
$$;

select private.baseline_milestones(p.id) from public.profiles p;

alter table public.celebrations enable row level security;
revoke all on table public.celebrations from public, anon, authenticated;
grant select on table public.celebrations to authenticated;
grant insert (kind, key) on table public.celebrations to authenticated;
grant update (seen_at) on table public.celebrations to authenticated;
create policy "celebrations: owner reads" on public.celebrations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "celebrations: owner records" on public.celebrations
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "celebrations: owner marks seen" on public.celebrations
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------- non-negotiables ----

create table public.daily_task_non_negotiables (
  daily_task_id uuid primary key,
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint daily_task_non_negotiables_task_same_owner_fkey foreign key (daily_task_id, owner_id)
    references public.daily_tasks (id, owner_id) on delete cascade
);

comment on table public.daily_task_non_negotiables is
  'V2 Phase 9: a daily task marked NÃO NEGOCIÁVEL. Owner-only side table (the task row may be read by the partner).';

create table public.routine_non_negotiables (
  routine_item_id uuid primary key,
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint routine_non_negotiables_routine_same_owner_fkey foreign key (routine_item_id, owner_id)
    references public.routine_items (id, owner_id) on delete cascade
);

comment on table public.routine_non_negotiables is
  'V2 Phase 9: a routine marked NÃO NEGOCIÁVEL; snapshotted on each occurrence it generates. Owner-only.';

-- A closed day's flag is part of the record: never set or removed by an API
-- role. Deleting the task itself (today) cascades.
create function private.guard_task_non_negotiable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_task uuid := case when tg_op = 'DELETE' then old.daily_task_id else new.daily_task_id end;
  v_owner uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  v_date date;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select t.task_date into v_date from public.daily_tasks t where t.id = v_task and t.owner_id = v_owner;
  if v_date is null then
    if tg_op = 'DELETE' then
      return old; -- the task is being deleted (cascade)
    end if;
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_date <= private.history_locked_through(v_owner) then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger daily_task_non_negotiables_guard
  before insert or delete on public.daily_task_non_negotiables
  for each row execute function private.guard_task_non_negotiable();

-- Before a routine's flag changes, its missed occurrences are materialised
-- with the OLD flag (like every routine edit), so history never moves.
create function private.guard_routine_non_negotiable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    perform private.materialize_tasks(case when tg_op = 'DELETE' then old.owner_id else new.owner_id end);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger routine_non_negotiables_guard
  before insert or delete on public.routine_non_negotiables
  for each row execute function private.guard_routine_non_negotiable();

-- The template's flag also applies to TODAY's occurrence (as every other
-- template edit does); past occurrences keep theirs.
create function private.sync_routine_non_negotiable_today()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_routine uuid := case when tg_op = 'DELETE' then old.routine_item_id else new.routine_item_id end;
  v_owner uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  v_task uuid;
begin
  select t.id into v_task
  from public.daily_tasks t
  where t.routine_item_id = v_routine and t.owner_id = v_owner
    and t.task_date = private.local_today(v_owner);
  if v_task is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    delete from public.daily_task_non_negotiables n where n.daily_task_id = v_task;
  else
    insert into public.daily_task_non_negotiables (daily_task_id, owner_id)
    values (v_task, v_owner)
    on conflict (daily_task_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger routine_non_negotiables_sync_today
  after insert or delete on public.routine_non_negotiables
  for each row execute function private.sync_routine_non_negotiable_today();

-- Snapshot: an occurrence generated from a flagged routine is flagged AT
-- THAT MOMENT (catch-up and routine RPCs alike).
create function private.seed_task_non_negotiable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.daily_task_non_negotiables (daily_task_id, owner_id)
  select new.id, new.owner_id
  from public.routine_non_negotiables r
  where r.routine_item_id = new.routine_item_id and r.owner_id = new.owner_id
  on conflict (daily_task_id) do nothing;
  return null;
end;
$$;

create trigger daily_tasks_seed_non_negotiable
  after insert on public.daily_tasks
  for each row when (new.routine_item_id is not null)
  execute function private.seed_task_non_negotiable();

alter table public.daily_task_non_negotiables enable row level security;
alter table public.routine_non_negotiables enable row level security;
revoke all on table public.daily_task_non_negotiables, public.routine_non_negotiables from public, anon, authenticated;
grant select, delete on table public.daily_task_non_negotiables, public.routine_non_negotiables to authenticated;
-- owner_id is insertable only because the snapshot triggers name the action's
-- owner (a catch-up can run in the partner's request); the policy and the
-- composite foreign keys still pin it to the caller's own rows.
grant insert (daily_task_id, owner_id) on table public.daily_task_non_negotiables to authenticated;
grant insert (routine_item_id, owner_id) on table public.routine_non_negotiables to authenticated;
create policy "daily_task_non_negotiables: owner only" on public.daily_task_non_negotiables
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "routine_non_negotiables: owner only" on public.routine_non_negotiables
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------- weekly priorities ----

create table public.weekly_priorities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  week_start date not null
    constraint weekly_priorities_monday check (extract(isodow from week_start) = 1),
  position smallint not null
    constraint weekly_priorities_position check (position between 1 and 3),
  title text not null
    constraint weekly_priorities_title_length check (char_length(btrim(title)) between 1 and 120),
  status text not null default 'open'
    constraint weekly_priorities_status check (status in ('open', 'done')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_priorities_one_per_position unique (owner_id, week_start, position),
  constraint weekly_priorities_done_stamp check ((status = 'done') = (done_at is not null))
);

comment on table public.weekly_priorities is
  'V2 Phase 9: PRIORIDADES DA SEMANA — at most 3 self-declared results per Monday–Sunday week. Owner-only; never proof.';

-- The current and the next week can be planned; a closed week is frozen.
create function private.guard_weekly_priority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  v_week date := case when tg_op = 'DELETE' then old.week_start else new.week_start end;
  v_current date;
begin
  if tg_op <> 'DELETE' then
    new.title := btrim(new.title);
    new.updated_at := now();
    if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
      new.done_at := now();
    elsif new.status = 'open' then
      new.done_at := null;
    else
      new.done_at := old.done_at;
    end if;
  end if;
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and (new.week_start <> old.week_start or new.position <> old.position
                            or new.owner_id <> old.owner_id) then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  v_current := date_trunc('week', private.local_today(v_owner)::timestamp)::date;
  if v_week < v_current then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  if v_week > v_current + 7 then
    raise exception 'LI_WEEK_TOO_FAR' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger weekly_priorities_guard
  before insert or update or delete on public.weekly_priorities
  for each row execute function private.guard_weekly_priority();

alter table public.weekly_priorities enable row level security;
revoke all on table public.weekly_priorities from public, anon, authenticated;
grant select, delete on table public.weekly_priorities to authenticated;
grant insert (week_start, position, title, status) on table public.weekly_priorities to authenticated;
grant update (title, status) on table public.weekly_priorities to authenticated;
create policy "weekly_priorities: owner only" on public.weekly_priorities
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ------------------------------------------------------------ reviews ----

create table public.reviews (
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  kind text not null
    constraint reviews_kind check (kind in ('day', 'week')),
  period_start date not null,
  worked text constraint reviews_worked_length check (char_length(worked) <= 500),
  hindered text constraint reviews_hindered_length check (char_length(hindered) <= 500),
  change_next text constraint reviews_change_next_length check (char_length(change_next) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind, period_start),
  constraint reviews_week_monday check (kind <> 'week' or extract(isodow from period_start) = 1)
);

comment on table public.reviews is
  'V2 Phase 9: the optional reflections of a Day / Weekly Review. Owner-only; personal, never competitive.';

-- Reflections are personal (like a focus reflection): editable later, but
-- never for a day / week that has not started.
create function private.guard_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date;
begin
  new.worked := nullif(btrim(new.worked), '');
  new.hindered := nullif(btrim(new.hindered), '');
  new.change_next := nullif(btrim(new.change_next), '');
  new.updated_at := now();
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.kind <> old.kind or new.period_start <> old.period_start
                            or new.owner_id <> old.owner_id) then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  v_today := private.local_today(new.owner_id);
  if new.period_start > v_today then
    raise exception 'LI_FUTURE_TASK' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger reviews_guard
  before insert or update on public.reviews
  for each row execute function private.guard_review();

alter table public.reviews enable row level security;
revoke all on table public.reviews from public, anon, authenticated;
grant select on table public.reviews to authenticated;
grant insert (kind, period_start, worked, hindered, change_next) on table public.reviews to authenticated;
grant update (worked, hindered, change_next) on table public.reviews to authenticated;
create policy "reviews: owner only" on public.reviews
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- -------------------------------------------------------- review facts ----

-- The objective facts of a period (at most 31 days, never past today) from
-- the existing sources: private.day_stats (completion, focus), the Perfect
-- Day definition, the Daily Standard IN FORCE on each day (the rule of
-- private.standard_on: an open day the current value, a closed day its
-- version — so a closed week's facts never move) and the non-negotiables.
create function public.my_review_facts(p_from date, p_to date)
returns table (
  days_with_tasks integer,
  planned integer,
  completed integer,
  focus_seconds integer,
  perfect_days integer,
  standard_days integer,
  non_negotiable_planned integer,
  non_negotiable_completed integer
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_today date;
  v_to date;
begin
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_today := private.materialize_tasks(v_me);
  v_to := least(p_to, v_today);
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 30 then
    raise exception 'LI_INVALID_RANGE' using errcode = '22023';
  end if;

  return query
  with d as (
    select s.day, s.planned, s.completed, s.focus_seconds,
           case when s.day >= v_today then p.daily_standard_percent::integer
                else coalesce((select h.standard_percent::integer
                               from public.daily_standard_history h
                               where h.user_id = v_me and h.effective_from <= s.day
                               order by h.effective_from desc limit 1),
                              p.daily_standard_percent::integer) end as standard
    from private.day_stats(v_me, p_from, v_to) s
    cross join public.profiles p
    where p.id = v_me
  ), n as (
    select count(*)::integer as planned,
           (count(*) filter (where t.status = 'completed'))::integer as completed
    from public.daily_task_non_negotiables x
    join public.daily_tasks t on t.id = x.daily_task_id and t.owner_id = x.owner_id
    where x.owner_id = v_me and t.task_date between p_from and v_to
  )
  select (count(*) filter (where d.planned > 0))::integer,
         coalesce(sum(d.planned), 0)::integer,
         coalesce(sum(d.completed), 0)::integer,
         coalesce(sum(d.focus_seconds), 0)::integer,
         (count(*) filter (where d.planned > 0 and d.completed = d.planned))::integer,
         (count(*) filter (where private.standard_met(d.planned, d.completed, d.standard)))::integer,
         (select n.planned from n),
         (select n.completed from n)
  from d;
end;
$$;

-- ------------------------------------------------------------- grants ----

revoke all on function private.records(uuid) from public, anon, authenticated;
revoke all on function private.milestone_value(uuid, text) from public, anon, authenticated;
revoke all on function private.milestone_threshold(text) from public, anon, authenticated;
revoke all on function private.guard_celebration() from public, anon, authenticated;
revoke all on function private.baseline_milestones(uuid) from public, anon, authenticated;
revoke all on function private.guard_task_non_negotiable() from public, anon, authenticated;
revoke all on function private.guard_routine_non_negotiable() from public, anon, authenticated;
revoke all on function private.sync_routine_non_negotiable_today() from public, anon, authenticated;
revoke all on function private.seed_task_non_negotiable() from public, anon, authenticated;
revoke all on function private.guard_weekly_priority() from public, anon, authenticated;
revoke all on function private.guard_review() from public, anon, authenticated;
-- Called from INVOKER code running as the signed-in user (my_records, the
-- celebration guard); the private schema is not exposed by the API.
grant execute on function private.records(uuid) to authenticated;
grant execute on function private.milestone_value(uuid, text) to authenticated;
grant execute on function private.milestone_threshold(text) to authenticated;
revoke all on function public.my_records() from public, anon, authenticated;
grant execute on function public.my_records() to authenticated;
revoke all on function public.my_review_facts(date, date) from public, anon, authenticated;
grant execute on function public.my_review_facts(date, date) to authenticated;
