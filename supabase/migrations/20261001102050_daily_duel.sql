-- V2 Phase 7 · Daily Duel (docs/DUEL.md, ADR-074…077).
--
-- The duel of a day is DERIVED, never stored (ADR-037): the same sources as
-- Progress — daily_tasks and focus_sessions — read for both members of the
-- current duo. No duel / score / winner table. The categories are decided in
-- the client from these integers (src/lib/duel.ts, unit-tested):
--   execution    completed / planned (skipped stays in planned)
--   focus        effective focus of the day (private.focus_seconds, by the
--                local day a session started), compared in whole minutes
--   consistency  the existing Daily Standard of each member (MET / NOT_MET /
--                NEUTRAL with exactly progress.ts standardMet, the same rule
--                as private.standard_met); the current standard is returned
--
-- FINAL = the day is closed for both members (Stage 9 boundary,
-- private.history_locked_through) and no focus session of that day is still
-- running. Every input of a final day is frozen in the database (closed-day
-- guards, routine catch-up only materialises, focus days fixed at start), so
-- a final duel cannot move. Routines are materialised for both members first,
-- like duo_weeks.
--
-- Each side is that member's OWN local day D (their timezone). Days start on
-- the day the duo became complete in BOTH members' calendars; before that, or
-- without a complete current duo, nothing is returned. Ending the duo leaves
-- nothing to read (nothing is stored).
--
-- Focus is returned "settled" (every session of the day except one still
-- running) plus a running flag: the client adds the running session from the
-- clock it already has (my session / partner_current_focus), so the live
-- number ticks without a request.
--
-- No duo, or still waiting for the partner: no rows. The partner's side stops
-- at their own today (a day they have not reached yet is empty).
--
-- One new SECURITY DEFINER function (the partner's private tasks count in
-- the numbers, exactly like duo_weeks). Integers, booleans and dates only.

-- One member's side per local day in [p_from, p_to]. Runs only inside
-- duo_duels (EXECUTE revoked from every API role).
create function private.duel_side(p_user uuid, p_from date, p_to date)
returns table (
  day date,
  planned integer,
  completed integer,
  focus_seconds integer,
  focus_running boolean
)
language sql
stable
set search_path = ''
as $$
  with t as (
    select dt.task_date,
           count(*)::integer as planned,
           (count(*) filter (where dt.status = 'completed'))::integer as completed
    from public.daily_tasks dt
    where dt.owner_id = p_user
      and dt.task_date between p_from and p_to
    group by dt.task_date
  ), s as (
    select f.local_date,
           f.status = 'active'
             and now() < f.started_at + make_interval(secs => f.accumulated_pause_seconds + f.planned_seconds)
             as running,
           private.focus_seconds(f.status, f.started_at, f.paused_at, f.accumulated_pause_seconds,
                                 f.planned_seconds, f.actual_focus_seconds) as secs
    from public.focus_sessions f
    where f.user_id = p_user
      and f.local_date between p_from and p_to
  ), fx as (
    select s.local_date,
           coalesce(sum(s.secs) filter (where not s.running), 0)::integer as settled,
           bool_or(s.running) as running
    from s
    group by s.local_date
  )
  select g.day::date,
         coalesce(t.planned, 0),
         coalesce(t.completed, 0),
         coalesce(fx.settled, 0),
         coalesce(fx.running, false)
  from pg_catalog.generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(day)
  left join t on t.task_date = g.day::date
  left join fx on fx.local_date = g.day::date
  order by 1;
$$;

-- The duels of my current duo: my local today and up to p_days - 1 days
-- before it (1..31), never before the duo became complete. Newest first.
create function public.duo_duels(p_days integer default 8)
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
  v_from date;
  v_me_standard integer;
  v_partner_standard integer;
  v_days integer := least(greatest(coalesce(p_days, 8), 1), 31);
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

  select p.daily_standard_percent into v_me_standard from public.profiles p where p.id = v_me;
  select p.daily_standard_percent into v_partner_standard from public.profiles p where p.id = v_partner;
  v_me_today := private.materialize_tasks(v_me);
  v_partner_today := private.materialize_tasks(v_partner);
  v_from := greatest(v_me_today - (v_days - 1),
                     private.duo_together_since(v_me),
                     private.duo_together_since(v_partner));
  if v_from > v_me_today then
    return;
  end if;

  return query
  select a.day,
         a.day <= private.history_locked_through(v_me)
           and a.day <= private.history_locked_through(v_partner)
           and not a.focus_running
           and not coalesce(b.focus_running, false),
         a.planned, a.completed, v_me_standard,
         a.focus_seconds, a.focus_running,
         coalesce(b.planned, 0), coalesce(b.completed, 0), v_partner_standard,
         coalesce(b.focus_seconds, 0), coalesce(b.focus_running, false)
  from private.duel_side(v_me, v_from, v_me_today) a
  left join private.duel_side(v_partner, v_from, least(v_me_today, v_partner_today)) b
    on b.day = a.day
  order by a.day desc;
end;
$$;

revoke all on function private.duel_side(uuid, date, date) from public, anon, authenticated;
revoke all on function public.duo_duels(integer) from public, anon, authenticated;
grant execute on function public.duo_duels(integer) to authenticated;
