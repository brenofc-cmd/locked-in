-- V2 Phase 8 · Monthly Champion + Personal Records + Milestones
-- (docs/MONTHLY_COMPETITION.md, ADR-080…085).
--
-- Nothing is stored: no monthly result, record or milestone table (ADR-037).
--
-- duo_duel_months(p_months): the SAME per-day numbers as duo_duels, for
-- whole calendar months — the current month of my local today and up to
-- p_months - 1 months before it (1..12), never before duos.duel_since. The
-- client decides each day with the existing Daily Duel rules
-- (src/lib/duel.ts decideDuel) and the month with src/lib/monthly.ts: one
-- implementation of the duel rules, no second competition. Built on the
-- Phase 7 helpers (private.duel_side, private.standard_on) and the Phase 7
-- closing: a day is FINAL when it is closed for both members
-- (history_locked_through) and nothing of it is running, so a FINAL day —
-- and a month whose days are all FINAL — cannot move. Dates, integers and
-- booleans only; the partner is derived from auth.uid() → current duo.
-- One new SECURITY DEFINER function (the partner's private tasks count in
-- the numbers, exactly like duo_duels / duo_weeks).
--
-- my_records(): the caller's personal records and milestone totals, one
-- row, SECURITY INVOKER (RLS + owner filter: only the caller's own rows):
--   best focus day     settled effective focus by local_date (a session
--                      still running is not settled yet); pauses never count
--   best focus week    the same, per Monday–Sunday week, closed weeks only
--   best perfect month Perfect Days (planned > 0 and completed = planned)
--                      per calendar month, closed days only
--   totals             settled focus seconds and Perfect Days (closed days)
-- Ties keep the FIRST date / period. The longest streak is the existing one
-- (my_progress_summary, ADR-038 unchanged).

create function public.duo_duel_months(p_months integer default 6)
returns table (
  duel_date date,
  is_final boolean,
  me_planned integer,
  me_completed integer,
  me_standard integer,
  me_focus_seconds integer,
  me_focus_running boolean,
  partner_planned integer,
  partner_completed integer,
  partner_standard integer,
  partner_focus_seconds integer,
  partner_focus_running boolean
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
  v_since date;
  v_from date;
  v_months integer := least(greatest(coalesce(p_months, 6), 1), 12);
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
  select d.duel_since into v_since from public.duos d where d.id = private.current_duo_id();
  if v_since is null then
    return;
  end if;

  v_me_today := private.materialize_tasks(v_me);
  v_partner_today := private.materialize_tasks(v_partner);
  v_from := greatest(
    (date_trunc('month', v_me_today::timestamp) - make_interval(months => v_months - 1))::date,
    v_since);
  if v_from > v_me_today then
    return;
  end if;

  return query
  select a.day,
         a.day <= private.history_locked_through(v_me)
           and a.day <= private.history_locked_through(v_partner)
           and not a.focus_running
           and not coalesce(b.focus_running, false),
         a.planned, a.completed, private.standard_on(v_me, a.day),
         a.focus_seconds, a.focus_running,
         coalesce(b.planned, 0), coalesce(b.completed, 0), private.standard_on(v_partner, a.day),
         coalesce(b.focus_seconds, 0), coalesce(b.focus_running, false)
  from private.duel_side(v_me, v_from, v_me_today) a
  left join private.duel_side(v_partner, v_from, least(v_me_today, v_partner_today)) b
    on b.day = a.day
  order by a.day desc;
end;
$$;

create function public.my_records()
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
  v_locked date;
begin
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  -- Routine occurrences of unopened days exist before they are judged.
  perform private.materialize_tasks(v_me);
  v_locked := private.history_locked_through(v_me);

  return query
  with s as (
    select f.local_date as day,
           private.focus_seconds(f.status, f.started_at, f.paused_at, f.accumulated_pause_seconds,
                                 f.planned_seconds, f.actual_focus_seconds) as secs
    from public.focus_sessions f
    where f.user_id = v_me
      and not (f.status = 'active'
               and now() < f.started_at + make_interval(secs => f.accumulated_pause_seconds + f.planned_seconds))
  ), fd as (
    select s.day, sum(s.secs)::integer as secs from s group by s.day
  ), fw as (
    select date_trunc('week', s.day::timestamp)::date as week, sum(s.secs)::integer as secs
    from s
    where date_trunc('week', s.day::timestamp)::date + 6 <= v_locked
    group by 1
  ), d as (
    select t.task_date as day
    from public.daily_tasks t
    where t.owner_id = v_me
      and t.task_date <= v_locked
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
end;
$$;

revoke all on function public.duo_duel_months(integer) from public, anon, authenticated;
grant execute on function public.duo_duel_months(integer) to authenticated;
revoke all on function public.my_records() from public, anon, authenticated;
grant execute on function public.my_records() to authenticated;
