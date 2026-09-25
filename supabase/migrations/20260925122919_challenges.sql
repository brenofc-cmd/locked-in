-- Stage 8 · duo challenges (two types, derived progress)
--
-- A challenge stores only what cannot be derived: duo, author, title, type,
-- target and period. Progress is read from daily_tasks / focus_sessions by
-- duo_challenges() — never stored. Status (upcoming / active / completed)
-- and the winner are derived from the dates and the two progress values.
--
--   standard_days : days in the period meeting that member's Daily Standard
--                   (exact ratio, neutral days never count; today counts once
--                   met, as in the streak)
--   focus_seconds : actual_focus_seconds of completed sessions that started
--                   in the period (local start date, as in Stage 7)
--
-- Both members can create. A challenge can be deleted only before it starts
-- (by either member); after that it is part of the record. No edits.
-- Challenges belong to the duo: ending the duo deletes them.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  duo_id uuid not null default private.current_duo_id()
    references public.duos (id) on delete cascade,
  created_by uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  title text not null
    constraint challenges_title_length check (char_length(title) between 1 and 40),
  challenge_type text not null
    constraint challenges_type check (challenge_type in ('standard_days', 'focus_seconds')),
  target_value integer not null
    constraint challenges_target_positive check (target_value > 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenges_period check (end_date >= start_date and end_date - start_date <= 365),
  -- A standard-days goal cannot exceed the days in the period; focus at most
  -- 24 h per day of the period.
  constraint challenges_target_reachable check (
    (challenge_type = 'standard_days' and target_value <= end_date - start_date + 1)
    or (challenge_type = 'focus_seconds' and target_value <= (end_date - start_date + 1) * 86400)
  )
);

create index challenges_duo_idx on public.challenges (duo_id, start_date desc);
create index challenges_created_by_idx on public.challenges (created_by);

create function private.normalize_challenge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  return new;
end;
$$;

create trigger challenges_normalize
  before insert or update on public.challenges
  for each row execute function private.normalize_challenge();

create trigger challenges_set_updated_at
  before update on public.challenges
  for each row execute function private.set_updated_at();

-- Is my duo complete (two members)? Challenges need a partner.
create function private.duo_is_complete()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) = 2 from public.duo_members m
  where m.duo_id = private.current_duo_id();
$$;

alter table public.challenges enable row level security;
revoke all on table public.challenges from anon, authenticated;
grant select, delete on table public.challenges to authenticated;
grant insert (title, challenge_type, target_value, start_date, end_date)
  on table public.challenges to authenticated;

create policy "challenges: read own duo"
  on public.challenges for select to authenticated
  using (duo_id = (select private.current_duo_id()));

-- Starts today or later (no challenge over past days), in my complete duo.
create policy "challenges: members create"
  on public.challenges for insert to authenticated
  with check (
    duo_id = (select private.current_duo_id())
    and created_by = (select auth.uid())
    and start_date >= private.local_today((select auth.uid()))
    and (select private.duo_is_complete())
  );

create policy "challenges: delete before start"
  on public.challenges for delete to authenticated
  using (
    duo_id = (select private.current_duo_id())
    and start_date > private.local_today((select auth.uid()))
  );

-- New / deleted challenge: the other member's Challenges screen refetches.
create function private.sync_challenge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.challenges;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  perform realtime.send(
    jsonb_build_object('actor_id', (select auth.uid()), 'challenge_id', v_row.id),
    'challenges_changed',
    'duo:' || v_row.duo_id::text,
    true
  );
  return null;
end;
$$;

create trigger challenges_broadcast
  after insert or delete on public.challenges
  for each row execute function private.sync_challenge();

-- My duo's challenges with both members' progress (integers only). DEFINER:
-- the partner's private tasks and sessions count in their aggregate, never
-- listed. Nothing without a duo; the partner side is null while waiting.
create function public.duo_challenges()
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
         private.challenge_value(v_me, c.challenge_type, c.start_date, c.end_date),
         case when v_partner is null then null
              else private.challenge_value(v_partner, c.challenge_type, c.start_date, c.end_date) end
  from public.challenges c
  where c.duo_id = v_duo
  order by c.start_date desc, c.created_at desc;
end;
$$;

-- One member's progress in a period, up to their own today.
create function private.challenge_value(p_user uuid, p_type text, p_from date, p_to date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := private.local_today(p_user);
  v_to date := least(p_to, v_today);
  v_standard integer;
begin
  if v_today is null or v_to < p_from then
    return 0;
  end if;
  if p_type = 'standard_days' then
    select p.daily_standard_percent into v_standard from public.profiles p where p.id = p_user;
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
      where private.standard_met(d.n_planned, d.n_completed, v_standard)
    );
  end if;
  return (
    select coalesce(sum(s.actual_focus_seconds), 0)::integer
    from public.focus_sessions s
    join public.profiles p on p.id = s.user_id
    where s.user_id = p_user
      and s.status = 'completed'
      and (s.started_at at time zone p.timezone)::date between p_from and v_to
  );
end;
$$;

revoke all on function private.normalize_challenge() from public, anon, authenticated;
revoke all on function private.sync_challenge() from public, anon, authenticated;
revoke all on function private.duo_is_complete() from public, anon, authenticated;
grant execute on function private.duo_is_complete() to authenticated;
revoke all on function private.challenge_value(uuid, text, date, date) from public, anon, authenticated;
revoke all on function public.duo_challenges() from public, anon, authenticated;
grant execute on function public.duo_challenges() to authenticated;
