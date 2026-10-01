-- V2 Phase 7 · the first duel day of a duo is fixed when the duo forms
-- (docs/DUEL.md → Timezone, ADR-079).
--
-- duo_duels started at the day the duo became complete computed from each
-- member's CURRENT timezone (private.duo_together_since). A later timezone
-- move shifted that date, so a FINAL duel could disappear from the list (or
-- a pre-duo day appear). The date is now stamped once on the duo:
--
--   duos.duel_since = the later of the two members' local dates at the
--                     moment the duo became complete (second joined_at).
--
-- Written only by the database (clients have no write grant on duos): the
-- trigger runs on duo_members, which clients cannot write either (join_duo
-- inserts). It is recomputed only if joined_at itself changes (fixtures),
-- never on a timezone change. A setting, not a score: no duel is stored.

alter table public.duos add column duel_since date;

create function private.stamp_duel_since()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.duos d
  set duel_since = s.since
  from (
    select max((j.at_join at time zone p.timezone)::date) as since
    from (select max(m.joined_at) as at_join, count(*) as members
          from public.duo_members m where m.duo_id = new.duo_id) j
    join public.duo_members m on m.duo_id = new.duo_id
    join public.profiles p on p.id = m.user_id
    where j.members = 2
  ) s
  where d.id = new.duo_id and s.since is not null;
  return null;
end;
$$;

create trigger duo_members_stamp_duel_since
  after insert or update of joined_at on public.duo_members
  for each row execute function private.stamp_duel_since();

-- Existing complete duos: their formation date in the members' calendars now.
update public.duos d
set duel_since = s.since
from (
  select m.duo_id, max((j.at_join at time zone p.timezone)::date) as since
  from public.duo_members m
  join public.profiles p on p.id = m.user_id
  join (select duo_id, max(joined_at) as at_join from public.duo_members
        group by duo_id having count(*) = 2) j on j.duo_id = m.duo_id
  group by m.duo_id
) s
where d.id = s.duo_id;

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
  v_since date;
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
  select d.duel_since into v_since from public.duos d where d.id = private.current_duo_id();
  if v_since is null then
    return;
  end if;

  v_me_today := private.materialize_tasks(v_me);
  v_partner_today := private.materialize_tasks(v_partner);
  v_from := greatest(v_me_today - (v_days - 1), v_since);
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

revoke all on function private.stamp_duel_since() from public, anon, authenticated;
revoke all on function public.duo_duels(integer) from public, anon, authenticated;
grant execute on function public.duo_duels(integer) to authenticated;
