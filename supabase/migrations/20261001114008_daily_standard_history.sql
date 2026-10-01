-- V2 Phase 7 · Daily Standard history (docs/DUEL.md, ADR-076, ADR-078).
--
-- A FINAL duel must keep the Consistency it had when its day closed. The
-- Daily Standard was a single value per profile (ADR-038), so this records
-- its effective versions and the duel reads the version of each day:
--
--   daily_standard_history  (user_id, effective_from) → standard_percent
--     -infinity            baseline: the standard known when this migration
--                          ran (or at signup). Days before the history
--                          existed use it — the pre-Phase-7 limitation.
--     local today          every change of daily_standard_percent upserts
--                          the row of the owner's local today: a change while
--                          the day is open affects that open day only; the
--                          last value of a day is the one that stays.
--
-- private.standard_on(user, day): an open day (>= the owner's local today)
-- uses the current profile value (live); a closed day uses the newest
-- version with effective_from <= day. Closed days can never change: rows are
-- written only for the local today, which is always after the Stage 9
-- boundary (it never moves back, also on a timezone change).
--
-- Nothing is a score: the table holds a setting. The formula stays the
-- existing one (standardMet / private.standard_met). The streak keeps using
-- the current standard (ADR-038, unchanged in this phase).
--
-- One new SECURITY DEFINER trigger function (private.record_daily_standard):
-- clients have no write grant on the history, so only the database records
-- it, deriving user and day from the profile row. Callable by nobody.

create table public.daily_standard_history (
  user_id uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null,
  standard_percent smallint not null
    constraint daily_standard_history_range check (standard_percent between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, effective_from)
);

alter table public.daily_standard_history enable row level security;
revoke all on table public.daily_standard_history from public, anon, authenticated;
grant select on table public.daily_standard_history to authenticated;
create policy "daily_standard_history: owner reads" on public.daily_standard_history
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Baseline for every existing profile (the standard known now).
insert into public.daily_standard_history (user_id, effective_from, standard_percent)
select p.id, '-infinity'::date, p.daily_standard_percent
from public.profiles p;

create function private.record_daily_standard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.daily_standard_history (user_id, effective_from, standard_percent)
    values (new.id, '-infinity'::date, new.daily_standard_percent)
    on conflict (user_id, effective_from) do nothing;
  elsif new.daily_standard_percent is distinct from old.daily_standard_percent then
    insert into public.daily_standard_history (user_id, effective_from, standard_percent)
    values (new.id, private.local_today(new.id), new.daily_standard_percent)
    on conflict (user_id, effective_from)
    do update set standard_percent = excluded.standard_percent, updated_at = now();
  end if;
  return null;
end;
$$;

create trigger profiles_record_daily_standard
  after insert or update of daily_standard_percent on public.profiles
  for each row execute function private.record_daily_standard();

-- The Daily Standard that applies to one of a user's local days.
create function private.standard_on(p_user uuid, p_day date)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_day >= private.local_today(p_user) then p.daily_standard_percent::integer
    else coalesce(
      (select h.standard_percent::integer
       from public.daily_standard_history h
       where h.user_id = p_user and h.effective_from <= p_day
       order by h.effective_from desc
       limit 1),
      p.daily_standard_percent::integer)
  end
  from public.profiles p
  where p.id = p_user;
$$;

-- duo_duels: the standard of each day (same signature and columns).
create or replace function public.duo_duels(p_days integer default 8)
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

revoke all on function private.record_daily_standard() from public, anon, authenticated;
revoke all on function private.standard_on(uuid, date) from public, anon, authenticated;
revoke all on function public.duo_duels(integer) from public, anon, authenticated;
grant execute on function public.duo_duels(integer) to authenticated;
