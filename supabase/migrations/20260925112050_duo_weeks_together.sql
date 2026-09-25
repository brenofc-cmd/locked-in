-- Stage 7 · head-to-head counts only full weeks together
--
-- A completed week has a partner side only if it started on or after the day
-- the duo became complete (the second member's joined_at, in MY local
-- calendar). Earlier weeks — before the duo, or the week it formed mid-week —
-- return partner_* = null, so they are never a head-to-head result and the
-- partner's pre-duo history is not exposed. The current week always shows
-- both sides (it is live and never a result). Same signature as before.

create or replace function public.duo_weeks(p_weeks integer default 8)
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
  v_since date;
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
    select (max(m.joined_at) at time zone p.timezone)::date into v_since
    from public.duo_members m
    join public.profiles p on p.id = v_me
    where m.duo_id = private.current_duo_id()
    group by p.timezone;
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
    select v_week0 - 7 * i as ws,
           v_partner is not null and (i = 0 or v_week0 - 7 * i >= v_since) as together
    from pg_catalog.generate_series(0, v_weeks) as i
  )
  select w.ws,
         w.ws = v_week0,
         a.n_planned, a.n_completed, a.n_focus, a.n_perfect,
         case when w.together then b.n_planned end,
         case when w.together then b.n_completed end,
         case when w.together then b.n_focus end,
         case when w.together then b.n_perfect end
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

revoke all on function public.duo_weeks(integer) from public, anon, authenticated;
grant execute on function public.duo_weeks(integer) to authenticated;
