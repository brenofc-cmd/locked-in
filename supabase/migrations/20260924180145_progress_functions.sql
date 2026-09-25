-- Stage 7 · progress, streak, weekly competition and habit analytics
--
-- Progress is a READ of daily_tasks (task performance) and focus_sessions
-- (focus performance). Nothing is cached in stats tables: two users' history
-- is small and derived numbers can never disagree with their source.
--
--   completion  = completed / planned (pending and skipped stay in planned)
--   0 planned   = neutral day: completion null, never 0 % or 100 %
--   standard met: completed * 100 >= daily_standard_percent * planned (exact)
--   perfect day : planned > 0 and completed = planned
--   streak      : consecutive standard-met days; neutral days neither count
--                 nor break; today counts once met and never breaks it early
--   week        : Monday–Sunday of the local task_date calendar
--   focus       : a session belongs to the local day it started on
--
-- Owner functions are SECURITY INVOKER (RLS applies). The two partner
-- functions are SECURITY DEFINER, derive the partner from auth.uid() -> duo
-- membership (no user id parameter) and return aggregates only.

-- ------------------------------------------------------------ helpers -----

-- A user's local calendar date (profiles.timezone).
create function private.local_today(p_user uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone p.timezone)::date
  from public.profiles p
  where p.id = p_user;
$$;

-- Routine occurrences up to the user's today (the Stage 4 materialisation,
-- now per user so the partner's days exist before they are compared).
-- Idempotent. As INVOKER for a signed-in caller, RLS limits it to their own
-- rows; the DEFINER duo functions call it for both members.
create function private.materialize_tasks(p_user uuid)
returns date
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_today date := private.local_today(p_user);
begin
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

-- Same behaviour as Stage 4, now through the shared helper.
create or replace function public.ensure_my_daily_tasks()
returns date
language plpgsql
volatile
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  return private.materialize_tasks((select auth.uid()));
end;
$$;

-- Effective focus seconds of one session (completed: stored; active: capped
-- at planned; paused: up to paused_at). Correct even before an expired
-- session is reconciled.
create function private.focus_seconds(
  p_status text,
  p_started timestamptz,
  p_paused timestamptz,
  p_accumulated integer,
  p_planned integer,
  p_actual integer
)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'completed' then coalesce(p_actual, 0)
    else least(
      p_planned,
      greatest(0, floor(extract(epoch from (coalesce(p_paused, now()) - p_started)))::integer - p_accumulated)
    )
  end;
$$;

-- One row per local day in [p_from, p_to]: planned / completed tasks and
-- focus (by the day a session started). Days without tasks have planned 0.
create function private.day_stats(p_user uuid, p_from date, p_to date)
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
    select (s.started_at at time zone p.timezone)::date as day,
           sum(private.focus_seconds(s.status, s.started_at, s.paused_at,
                                     s.accumulated_pause_seconds, s.planned_seconds,
                                     s.actual_focus_seconds))::integer as secs,
           count(*)::integer as n
    from public.focus_sessions s
    join public.profiles p on p.id = s.user_id
    where s.user_id = p_user
      and s.started_at >= (p_from - 2)::timestamp at time zone 'UTC'
      and s.started_at < (p_to + 2)::timestamp at time zone 'UTC'
    group by 1
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

-- Whether a day met the standard (exact ratio, never the rounded %).
create function private.standard_met(p_planned integer, p_completed integer, p_standard integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_planned > 0 and p_completed * 100 >= p_standard * p_planned;
$$;

-- Streak inputs for one user. Closed days (before today) are final; days with
-- no tasks never appear, so they neither count nor break; days before the
-- first task do not exist. The caller adds today once it meets the standard.
create function private.streaks(p_user uuid)
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
  select (now() at time zone p.timezone)::date, p.daily_standard_percent
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

-- --------------------------------------------------------- owner (INVOKER) --

-- My streak, standard and today's counts. Materialises my routine first, so
-- this is right even when Progress is the first screen opened today.
create function public.my_progress_summary()
returns table (
  today date,
  standard integer,
  streak_before_today integer,
  current_streak integer,
  longest_streak integer,
  today_planned integer,
  today_completed integer,
  first_task_date date
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  perform private.materialize_tasks(v_uid);
  return query
  select s.today,
         s.standard,
         s.streak_before_today,
         s.streak_before_today
           + (private.standard_met(s.today_planned, s.today_completed, s.standard))::integer,
         greatest(s.longest_closed,
                  s.streak_before_today
                    + (private.standard_met(s.today_planned, s.today_completed, s.standard))::integer),
         s.today_planned,
         s.today_completed,
         s.first_task_date
  from private.streaks(v_uid) s;
end;
$$;

-- My daily series (charts, calendar, range totals, focus). At most 400 days;
-- never beyond my today (future tasks are not part of any score).
create function public.my_daily_progress(p_from date, p_to date)
returns table (
  day date,
  planned integer,
  completed integer,
  focus_seconds integer,
  focus_sessions integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_to date;
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_to := least(p_to, private.local_today(v_uid));
  if p_from is null or v_to is null or v_to - p_from > 400 then
    raise exception 'LI_INVALID_RANGE' using errcode = '22023';
  end if;
  return query select * from private.day_stats(v_uid, p_from, v_to);
end;
$$;

-- Habit consistency: recurring tasks only (one-offs are not habits), closed
-- days only (today is still open), skipped = not completed. Title: the
-- routine's current name, or its latest snapshot once archived.
create function public.my_habits(p_from date, p_to date)
returns table (
  routine_item_id uuid,
  title text,
  planned integer,
  completed integer
)
language sql
stable
set search_path = ''
as $$
  select t.routine_item_id,
         case
           when r.end_date is null or r.end_date >= private.local_today(t.owner_id) then r.title
           else (array_agg(t.title order by t.task_date desc))[1]
         end,
         count(*)::integer,
         (count(*) filter (where t.status = 'completed'))::integer
  from public.daily_tasks t
  join public.routine_items r on r.id = t.routine_item_id
  where t.owner_id = (select auth.uid())
    and t.task_date between p_from and least(p_to, private.local_today((select auth.uid())) - 1)
  group by t.routine_item_id, t.owner_id, r.title, r.end_date;
$$;

-- -------------------------------------------------------- duo (DEFINER) ----

-- Current week (Monday -> today, future days excluded) plus p_weeks completed
-- weeks, newest first, for me and my partner: counts, focus, perfect days.
-- Weeks are the Monday–Sunday task_date calendar, starting from MY today;
-- each member's days are their own local task_dates (never converted), and
-- each is counted only up to their own today. Private tasks are in the
-- counts; no title, time, note or category ever leaves this function.
-- partner_* are null without a partner.
create function public.duo_weeks(p_weeks integer default 8)
returns table (
  week_start date,
  is_current boolean,
  me_planned integer,
  me_completed integer,
  me_focus_seconds integer,
  me_perfect_days integer,
  partner_planned integer,
  partner_completed integer,
  partner_focus_seconds integer,
  partner_perfect_days integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_partner uuid;
  v_me_today date;
  v_partner_today date;
  v_week0 date;
  v_from date;
  v_weeks integer := least(greatest(coalesce(p_weeks, 8), 0), 26);
begin
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select m.user_id into v_partner
  from public.duo_members m
  where m.duo_id = private.current_duo_id()
    and m.user_id <> v_me;

  v_me_today := private.materialize_tasks(v_me);
  if v_partner is not null then
    v_partner_today := private.materialize_tasks(v_partner);
  end if;
  v_week0 := v_me_today - (extract(isodow from v_me_today)::integer - 1);
  v_from := v_week0 - 7 * v_weeks;

  return query
  with mine as (
    select * from private.day_stats(v_me, v_from, v_me_today)
  ), theirs as (
    select * from private.day_stats(v_partner, v_from, coalesce(v_partner_today, v_from - 1))
    where v_partner is not null
  ), weeks as (
    select v_week0 - 7 * i as ws
    from pg_catalog.generate_series(0, v_weeks) as i
  )
  select w.ws,
         w.ws = v_week0,
         a.n_planned, a.n_completed, a.n_focus, a.n_perfect,
         case when v_partner is null then null else b.n_planned end,
         case when v_partner is null then null else b.n_completed end,
         case when v_partner is null then null else b.n_focus end,
         case when v_partner is null then null else b.n_perfect end
  from weeks w
  cross join lateral (
    select coalesce(sum(x.planned), 0)::integer as n_planned,
           coalesce(sum(x.completed), 0)::integer as n_completed,
           coalesce(sum(x.focus_seconds), 0)::integer as n_focus,
           (count(*) filter (where x.planned > 0 and x.completed = x.planned))::integer as n_perfect
    from mine x
    where x.day between w.ws and w.ws + 6
  ) a
  cross join lateral (
    select coalesce(sum(y.planned), 0)::integer as n_planned,
           coalesce(sum(y.completed), 0)::integer as n_completed,
           coalesce(sum(y.focus_seconds), 0)::integer as n_focus,
           (count(*) filter (where y.planned > 0 and y.completed = y.planned))::integer as n_perfect
    from theirs y
    where y.day between w.ws and w.ws + 6
  ) b
  order by w.ws desc;
end;
$$;

-- My partner's streak (aggregate only). Nothing for outsiders or without a
-- partner. The partner's today counts come from partner_today().
create function public.partner_progress_summary()
returns table (
  streak_before_today integer,
  current_streak integer,
  standard integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_partner uuid;
begin
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select m.user_id into v_partner
  from public.duo_members m
  where m.duo_id = private.current_duo_id()
    and m.user_id <> v_me;
  if v_partner is null then
    return;
  end if;
  perform private.materialize_tasks(v_partner);
  return query
  select s.streak_before_today,
         s.streak_before_today
           + (private.standard_met(s.today_planned, s.today_completed, s.standard))::integer,
         s.standard
  from private.streaks(v_partner) s;
end;
$$;

-- ------------------------------------------------------------- grants -----

revoke all on function private.local_today(uuid) from public, anon, authenticated;
revoke all on function private.materialize_tasks(uuid) from public, anon, authenticated;
revoke all on function private.focus_seconds(text, timestamptz, timestamptz, integer, integer, integer) from public, anon, authenticated;
revoke all on function private.day_stats(uuid, date, date) from public, anon, authenticated;
revoke all on function private.standard_met(integer, integer, integer) from public, anon, authenticated;
revoke all on function private.streaks(uuid) from public, anon, authenticated;
revoke all on function public.my_progress_summary() from public, anon, authenticated;
revoke all on function public.my_daily_progress(date, date) from public, anon, authenticated;
revoke all on function public.my_habits(date, date) from public, anon, authenticated;
revoke all on function public.duo_weeks(integer) from public, anon, authenticated;
revoke all on function public.partner_progress_summary() from public, anon, authenticated;

-- The owner (INVOKER) functions run these helpers as the caller, so RLS
-- still limits them to rows the caller may read / write. The private schema
-- is not exposed through the API.
grant execute on function private.local_today(uuid) to authenticated;
grant execute on function private.materialize_tasks(uuid) to authenticated;
grant execute on function private.focus_seconds(text, timestamptz, timestamptz, integer, integer, integer) to authenticated;
grant execute on function private.day_stats(uuid, date, date) to authenticated;
grant execute on function private.standard_met(integer, integer, integer) to authenticated;
grant execute on function private.streaks(uuid) to authenticated;

grant execute on function public.my_progress_summary() to authenticated;
grant execute on function public.my_daily_progress(date, date) to authenticated;
grant execute on function public.my_habits(date, date) to authenticated;
grant execute on function public.duo_weeks(integer) to authenticated;
grant execute on function public.partner_progress_summary() to authenticated;
