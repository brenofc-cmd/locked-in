-- V2 Phase 6 · Duo Accountability 2.0 (docs/ACCOUNTABILITY.md, ADR-069…073).
--
-- COMMITMENT → ACTION → PROOF → PARTNER ACCOUNTABILITY.
--
-- commitments         the public promise (title, kind, status, proof kind and
--                     time). Read by its owner and by the CURRENT duo partner.
-- commitment_sources  owner-only: the private task a "task" commitment points
--                     at (never readable by the partner — ADR-070).
-- nudges              DAR UM TOQUE: no text; 1 per commitment every 2 h, at most
--                     3 per recipient-local day to the same partner.
-- checkins            LOCKED_IN / NEED_ACCOUNTABILITY / HARD_DAY for the local
--                     day; append-only history, the latest row is current.
--
-- Status is MATERIALISED (not derived on every read) so that a closed day can
-- never change: while the owner's day is open, triggers on the proof sources
-- (daily_tasks, focus_sessions) make the commitment follow the real source;
-- once the day is closed (Stage 9 boundary) the row is frozen, and an ACTIVE
-- commitment of a closed day is MISSED (derived, never stored — nothing can
-- flip it later). CANCELLED only while open. Kinds:
--   task      proven while its task is completed               (verified)
--   focus     proven once completed effective focus of the day reaches the
--             target (pauses never count)                      (verified)
--   standard  proven while the day meets the Daily Standard with the existing
--             rule completed·100 ≥ standard·planned; the standard is the one
--             in force when the commitment was made (snapshot) (verified)
--   simple    no verifiable proof: CUMPRI by its owner         (self_declared)
-- One new SECURITY DEFINER function (sync_accountability): only the database
-- may broadcast and write the feed (a proven commitment is a feed event the
-- partner can react to). Payloads carry ids / status only, never a title of a
-- private source.

-- ------------------------------------------------------- commitments ----

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The duo the promise was made to. Ending the duo clears it: the ex-partner
  -- loses access, a future partner never sees it; the owner keeps it.
  duo_id uuid references public.duos (id) on delete set null,
  commit_date date not null,
  title text not null
    constraint commitments_title_length check (char_length(btrim(title)) between 1 and 80),
  kind text not null
    constraint commitments_kind check (kind in ('task', 'focus', 'standard', 'simple')),
  focus_target_seconds integer
    constraint commitments_focus_target check (focus_target_seconds between 300 and 43200),
  standard_percent smallint
    constraint commitments_standard check (standard_percent between 1 and 100),
  status text not null default 'active'
    constraint commitments_status check (status in ('active', 'proven', 'cancelled')),
  resolution text
    constraint commitments_resolution check (resolution in ('verified', 'self_declared')),
  proof_kind text
    constraint commitments_proof_kind check (proof_kind in ('task', 'focus', 'standard', 'self')),
  proven_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commitments_id_owner_key unique (id, owner_id),
  constraint commitments_kind_fields check (
    (kind = 'focus') = (focus_target_seconds is not null)
    and (kind = 'standard') = (standard_percent is not null)
  ),
  constraint commitments_state check (
    (status = 'active' and resolution is null and proof_kind is null and proven_at is null and cancelled_at is null)
    or (status = 'proven' and resolution is not null and proof_kind is not null and proven_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and resolution is null and proof_kind is null and proven_at is null)
  ),
  constraint commitments_self_declared check (
    resolution is null
    or (resolution = 'self_declared' and proof_kind = 'self' and kind = 'simple')
    or (resolution = 'verified' and proof_kind = kind and kind <> 'simple')
  )
);

comment on table public.commitments is
  'Shared commitments (V2 Phase 6). Public fields only; the private proof source lives in commitment_sources.';

create index commitments_owner_date_idx on public.commitments (owner_id, commit_date);
create index commitments_duo_date_idx on public.commitments (duo_id, commit_date desc);

create table public.commitment_sources (
  commitment_id uuid primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  daily_task_id uuid not null,
  constraint commitment_sources_commitment_fkey foreign key (commitment_id, owner_id)
    references public.commitments (id, owner_id) on delete cascade,
  constraint commitment_sources_task_same_owner_fkey foreign key (daily_task_id, owner_id)
    references public.daily_tasks (id, owner_id) on delete cascade
);

comment on table public.commitment_sources is
  'Owner-only: the task behind a task commitment. Never readable by the partner.';

create index commitment_sources_task_idx on public.commitment_sources (daily_task_id);

create trigger commitments_set_updated_at
  before update on public.commitments
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------- proof ----

-- When the commitment is proven (null = not proven), from the real sources.
-- INVOKER: runs as the owner (or trusted database code); reads only the
-- owner's rows.
create function private.commitment_proof(
  p_id uuid, p_owner uuid, p_kind text, p_date date, p_target integer, p_standard smallint
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_at timestamptz;
  v_planned integer;
  v_needed integer;
begin
  if p_kind = 'task' then
    select t.completed_at into v_at
    from public.commitment_sources s
    join public.daily_tasks t on t.id = s.daily_task_id and t.owner_id = s.owner_id
    where s.commitment_id = p_id and s.owner_id = p_owner and t.status = 'completed';
  elsif p_kind = 'focus' then
    select min(c.ended_at) into v_at
    from (
      select s.ended_at,
             sum(s.actual_focus_seconds) over (order by s.ended_at, s.id) as cum
      from public.focus_sessions s
      where s.user_id = p_owner and s.status = 'completed' and s.local_date = p_date
    ) c
    where c.cum >= p_target;
  elsif p_kind = 'standard' then
    select count(*)::integer into v_planned
    from public.daily_tasks t where t.owner_id = p_owner and t.task_date = p_date;
    if v_planned = 0 then
      return null;
    end if;
    -- The existing rule, completed·100 ≥ standard·planned: the k-th completion
    -- with k = ceil(standard·planned / 100) is the one that meets it.
    v_needed := (p_standard * v_planned + 99) / 100;
    select c.completed_at into v_at
    from (
      select t.completed_at, row_number() over (order by t.completed_at, t.id) as n
      from public.daily_tasks t
      where t.owner_id = p_owner and t.task_date = p_date and t.status = 'completed'
    ) c
    where c.n = v_needed;
  end if;
  return v_at;
end;
$$;

revoke all on function private.commitment_proof(uuid, uuid, text, date, integer, smallint) from public, anon, authenticated;
grant execute on function private.commitment_proof(uuid, uuid, text, date, integer, smallint) to authenticated;

-- The lifecycle of a commitment. Clients only choose title / kind / target at
-- creation, and later CANCEL (open, active) or, for a simple commitment,
-- CUMPRI / undo (open). Everything else is set here; a closed day is frozen.
create function private.resolve_commitment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_api boolean := current_user in ('authenticated', 'anon');
  v_closed boolean;
  v_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.owner_id is null then
      raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
    end if;
    select m.duo_id into new.duo_id
    from public.duo_members m
    where m.user_id = new.owner_id
      and (select count(*) from public.duo_members x where x.duo_id = m.duo_id) = 2;
    if new.duo_id is null then
      raise exception 'LI_NO_PARTNER' using errcode = 'P0001';
    end if;
    new.commit_date := private.local_today(new.owner_id);
    new.title := btrim(new.title);
    new.standard_percent := case when new.kind = 'standard'
      then (select p.daily_standard_percent from public.profiles p where p.id = new.owner_id) end;
    if new.kind <> 'focus' then
      new.focus_target_seconds := null;
    end if;
    new.status := 'active';
    new.resolution := null;
    new.proof_kind := null;
    new.proven_at := null;
    new.cancelled_at := null;
    new.created_at := now();
    if (select count(*) from public.commitments c
        where c.owner_id = new.owner_id and c.commit_date = new.commit_date
          and c.status <> 'cancelled') >= 5 then
      raise exception 'LI_COMMITMENT_LIMIT' using errcode = 'P0001';
    end if;
    if new.kind in ('focus', 'standard') then
      v_at := private.commitment_proof(new.id, new.owner_id, new.kind, new.commit_date,
                                       new.focus_target_seconds, new.standard_percent);
      if v_at is not null then
        new.status := 'proven';
        new.resolution := 'verified';
        new.proof_kind := new.kind;
        new.proven_at := v_at;
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: identity and the promise itself never change.
  new.owner_id := old.owner_id;
  new.commit_date := old.commit_date;
  new.title := old.title;
  new.kind := old.kind;
  new.focus_target_seconds := old.focus_target_seconds;
  new.standard_percent := old.standard_percent;
  new.created_at := old.created_at;
  -- The duo only ever goes away (the duo ended: on delete set null).
  if new.duo_id is distinct from old.duo_id
     and not (new.duo_id is null and not exists (select 1 from public.duos d where d.id = old.duo_id)) then
    new.duo_id := old.duo_id;
  end if;

  v_closed := old.commit_date <= private.history_locked_through(old.owner_id);
  if v_closed then
    if v_api and new.status is distinct from old.status then
      raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
    end if;
    new.status := old.status;
    new.resolution := old.resolution;
    new.proof_kind := old.proof_kind;
    new.proven_at := old.proven_at;
    new.cancelled_at := old.cancelled_at;
    new.updated_at := old.updated_at;
    return new;
  end if;

  if old.status = 'cancelled' then
    if new.status is distinct from 'cancelled' then
      raise exception 'LI_COMMITMENT_CLOSED' using errcode = 'P0001';
    end if;
    new.cancelled_at := old.cancelled_at;
    new.resolution := null;
    new.proof_kind := null;
    new.proven_at := null;
    return new;
  end if;

  if new.status = 'cancelled' then
    if old.status <> 'active' then
      raise exception 'LI_COMMITMENT_CLOSED' using errcode = 'P0001';
    end if;
    new.cancelled_at := now();
    new.resolution := null;
    new.proof_kind := null;
    new.proven_at := null;
    return new;
  end if;

  if old.kind = 'simple' then
    -- No verifiable proof: the owner declares it (CUMPRI) or takes it back.
    if new.status = 'proven' then
      new.resolution := 'self_declared';
      new.proof_kind := 'self';
      new.proven_at := case when old.status = 'proven' then old.proven_at else now() end;
    else
      new.status := 'active';
      new.resolution := null;
      new.proof_kind := null;
      new.proven_at := null;
    end if;
    new.cancelled_at := null;
    return new;
  end if;

  -- Verified kinds: the status is never chosen by a client.
  if v_api and new.status is distinct from old.status then
    raise exception 'LI_PROOF_REQUIRED' using errcode = 'P0001';
  end if;
  v_at := private.commitment_proof(old.id, old.owner_id, old.kind, old.commit_date,
                                   old.focus_target_seconds, old.standard_percent);
  if v_at is null then
    new.status := 'active';
    new.resolution := null;
    new.proof_kind := null;
    new.proven_at := null;
  else
    new.status := 'proven';
    new.resolution := 'verified';
    new.proof_kind := old.kind;
    new.proven_at := v_at;
  end if;
  new.cancelled_at := null;
  return new;
end;
$$;

revoke all on function private.resolve_commitment() from public;

create trigger commitments_resolve
  before insert or update on public.commitments
  for each row execute function private.resolve_commitment();

-- The sources tell their commitments to re-resolve (a no-op on a closed day).
create function private.touch_task_commitments()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  v_date date := case when tg_op = 'DELETE' then old.task_date else new.task_date end;
  v_task uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  update public.commitments c
  set updated_at = now()
  where c.owner_id = v_owner and c.commit_date = v_date and c.status <> 'cancelled'
    and (c.kind = 'standard'
         or (c.kind = 'task' and exists (
               select 1 from public.commitment_sources s
               where s.commitment_id = c.id and s.daily_task_id = v_task)));
  return null;
end;
$$;

revoke all on function private.touch_task_commitments() from public;

create trigger daily_tasks_touch_commitments
  after insert or delete or update of status on public.daily_tasks
  for each row execute function private.touch_task_commitments();

create function private.touch_focus_commitments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' or (tg_op = 'UPDATE' and old.status = 'completed') then
    update public.commitments c
    set updated_at = now()
    where c.owner_id = new.user_id and c.commit_date = new.local_date
      and c.kind = 'focus' and c.status <> 'cancelled';
  end if;
  return null;
end;
$$;

revoke all on function private.touch_focus_commitments() from public;

create trigger focus_sessions_touch_commitments
  after insert or update of status on public.focus_sessions
  for each row execute function private.touch_focus_commitments();

-- Creating a commitment (with its private source for a task commitment) in
-- one call. INVOKER: RLS, grants and the lifecycle trigger all apply.
create function public.create_commitment(
  p_title text,
  p_kind text,
  p_daily_task_id uuid default null,
  p_focus_minutes integer default null
)
returns setof public.commitments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
  v_date date;
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  perform public.ensure_my_daily_tasks();
  if p_kind = 'task' and p_daily_task_id is null then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.commitments (title, kind, focus_target_seconds)
  values (p_title, p_kind, case when p_kind = 'focus' then p_focus_minutes * 60 end)
  returning id, commit_date into v_id, v_date;
  if p_kind = 'task' then
    if not exists (select 1 from public.daily_tasks t
                   where t.id = p_daily_task_id and t.owner_id = auth.uid() and t.task_date = v_date) then
      raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
    end if;
    insert into public.commitment_sources (commitment_id, owner_id, daily_task_id)
    values (v_id, auth.uid(), p_daily_task_id);
    update public.commitments c set updated_at = now() where c.id = v_id;
  end if;
  return query select c.* from public.commitments c where c.id = v_id;
end;
$$;

revoke all on function public.create_commitment(text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.create_commitment(text, text, uuid, integer) to authenticated;

-- Commitments of my duo (both members) from p_from, with the effective status
-- (an ACTIVE commitment of a closed day is MISSED). INVOKER: RLS decides.
create function public.duo_commitments(p_from date)
returns table (
  id uuid, owner_id uuid, commit_date date, title text, kind text,
  focus_target_seconds integer, standard_percent smallint,
  status text, resolution text, proof_kind text, proven_at timestamptz,
  cancelled_at timestamptz, created_at timestamptz, closed boolean
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.owner_id, c.commit_date, c.title, c.kind,
         c.focus_target_seconds, c.standard_percent,
         case when c.status = 'active' and c.commit_date <= private.history_locked_through(c.owner_id)
              then 'missed' else c.status end,
         c.resolution, c.proof_kind, c.proven_at, c.cancelled_at, c.created_at,
         c.commit_date <= private.history_locked_through(c.owner_id)
  from public.commitments c
  where c.commit_date >= p_from
    and (c.owner_id = (select auth.uid())
         or (c.duo_id is not null and c.duo_id = private.current_duo_id()))
  order by c.commit_date desc, c.created_at desc
  limit 200;
$$;

revoke all on function public.duo_commitments(date) from public, anon, authenticated;
grant execute on function public.duo_commitments(date) to authenticated;

-- ------------------------------------------------------------ nudges ----

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  duo_id uuid not null references public.duos (id) on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  commitment_id uuid not null references public.commitments (id) on delete cascade,
  recipient_date date not null,
  created_at timestamptz not null default now()
);

comment on table public.nudges is
  'DAR UM TOQUE (V2 Phase 6): no text; limits enforced by trigger. Read by sender and recipient in the current duo.';

create index nudges_commitment_idx on public.nudges (commitment_id, from_user, created_at desc);
create index nudges_pair_day_idx on public.nudges (from_user, to_user, recipient_date);
create index nudges_to_idx on public.nudges (to_user, recipient_date);

create function private.guard_nudge()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_c public.commitments;
begin
  new.from_user := auth.uid();
  if new.from_user is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select c.* into v_c from public.commitments c where c.id = new.commitment_id;
  if not found then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  new.to_user := v_c.owner_id;
  if new.to_user = new.from_user then
    raise exception 'LI_NUDGE_SELF' using errcode = 'P0001';
  end if;
  new.duo_id := private.current_duo_id();
  if new.duo_id is null or v_c.duo_id is distinct from new.duo_id then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_c.status <> 'active' or v_c.commit_date <= private.history_locked_through(v_c.owner_id) then
    raise exception 'LI_NUDGE_CLOSED' using errcode = 'P0001';
  end if;
  -- One sender → recipient pair at a time (double taps, two tabs).
  perform pg_advisory_xact_lock(hashtextextended(new.from_user::text || new.to_user::text, 6));
  if exists (select 1 from public.nudges n
             where n.commitment_id = new.commitment_id and n.from_user = new.from_user
               and n.created_at > now() - interval '2 hours') then
    raise exception 'LI_NUDGE_COOLDOWN' using errcode = 'P0001';
  end if;
  new.recipient_date := private.local_today(new.to_user);
  if (select count(*) from public.nudges n
      where n.from_user = new.from_user and n.to_user = new.to_user
        and n.recipient_date = new.recipient_date) >= 3 then
    raise exception 'LI_NUDGE_LIMIT' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function private.guard_nudge() from public;

create trigger nudges_guard
  before insert on public.nudges
  for each row execute function private.guard_nudge();

-- ---------------------------------------------------------- checkins ----

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  duo_id uuid references public.duos (id) on delete set null,
  local_date date not null,
  state text not null
    constraint checkins_state check (state in ('LOCKED_IN', 'NEED_ACCOUNTABILITY', 'HARD_DAY')),
  created_at timestamptz not null default now()
);

comment on table public.checkins is
  'Daily check-in (V2 Phase 6): append-only; the latest row of the local day is current.';

create index checkins_user_day_idx on public.checkins (user_id, local_date, created_at desc);

create function private.stamp_checkin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  if new.user_id is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select m.duo_id into new.duo_id from public.duo_members m where m.user_id = new.user_id;
  new.local_date := private.local_today(new.user_id);
  new.created_at := now();
  if (select count(*) from public.checkins c
      where c.user_id = new.user_id and c.local_date = new.local_date) >= 30 then
    raise exception 'LI_CHECKIN_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_checkin() from public;

create trigger checkins_stamp
  before insert on public.checkins
  for each row execute function private.stamp_checkin();

-- ------------------------------------------------- feed + broadcasts ----

alter table public.activity_events drop constraint activity_events_type;
alter table public.activity_events add constraint activity_events_type
  check (event_type in ('task_completed', 'focus_started', 'focus_completed',
                        'commitment_proven', 'commitment_self_declared'));
alter table public.activity_events drop constraint activity_events_target_type;
alter table public.activity_events add constraint activity_events_target_type
  check (target_type in ('daily_task', 'focus_session', 'commitment'));

-- SECURITY DEFINER (the one new function of this phase): it writes
-- activity_events and sends realtime messages, which clients cannot do. It
-- derives everything from the row being changed; payloads carry ids and the
-- public status only.
create function private.sync_accountability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.activity_events;
  v_type text;
begin
  if tg_table_name = 'commitments' then
    if new.duo_id is null then
      return null;
    end if;
    if tg_op = 'UPDATE' and new.status is not distinct from old.status
       and new.proven_at is not distinct from old.proven_at then
      return null; -- a touch that changed nothing
    end if;
    if new.status = 'proven' then
      v_type := case when new.resolution = 'self_declared'
                     then 'commitment_self_declared' else 'commitment_proven' end;
      delete from public.activity_events e
      where e.target_id = new.id and e.event_type <> v_type
        and e.event_type in ('commitment_proven', 'commitment_self_declared');
      insert into public.activity_events (
        duo_id, actor_id, event_type, target_type, target_id, title_snapshot, created_at
      )
      values (new.duo_id, new.owner_id, v_type, 'commitment', new.id, new.title, new.proven_at)
      on conflict (event_type, target_id) do update
        set created_at = excluded.created_at
      returning * into v_event;
      perform realtime.send(
        jsonb_build_object(
          'id', v_event.id, 'actor_id', v_event.actor_id, 'event_type', v_event.event_type,
          'target_id', v_event.target_id, 'title', v_event.title_snapshot,
          'created_at', v_event.created_at),
        'activity', 'duo:' || new.duo_id::text, true);
    elsif tg_op = 'UPDATE' and old.status = 'proven' then
      delete from public.activity_events e
      where e.target_id = new.id and e.event_type in ('commitment_proven', 'commitment_self_declared')
      returning * into v_event;
      if found then
        perform realtime.send(
          jsonb_build_object('id', v_event.id, 'actor_id', v_event.actor_id),
          'activity_removed', 'duo:' || new.duo_id::text, true);
      end if;
    end if;
    perform realtime.send(
      jsonb_build_object('id', new.id, 'actor_id', new.owner_id, 'status', new.status),
      'commitment_changed', 'duo:' || new.duo_id::text, true);
  elsif tg_table_name = 'nudges' then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'actor_id', new.from_user, 'to_user', new.to_user,
                         'commitment_id', new.commitment_id),
      'nudge_received', 'duo:' || new.duo_id::text, true);
  elsif tg_table_name = 'checkins' then
    if new.duo_id is not null then
      perform realtime.send(
        jsonb_build_object('actor_id', new.user_id, 'state', new.state),
        'checkin_changed', 'duo:' || new.duo_id::text, true);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function private.sync_accountability() from public;

create trigger commitments_sync
  after insert or update on public.commitments
  for each row execute function private.sync_accountability();
create trigger nudges_sync
  after insert on public.nudges
  for each row execute function private.sync_accountability();
create trigger checkins_sync
  after insert on public.checkins
  for each row execute function private.sync_accountability();

-- ------------------------------------------------------ RLS and grants ----

alter table public.commitments enable row level security;
alter table public.commitment_sources enable row level security;
alter table public.nudges enable row level security;
alter table public.checkins enable row level security;

revoke all on table public.commitments, public.commitment_sources, public.nudges, public.checkins
  from anon, authenticated;

grant select on table public.commitments to authenticated;
grant insert (title, kind, focus_target_seconds), update (status, updated_at)
  on table public.commitments to authenticated;
grant select on table public.commitment_sources to authenticated;
grant insert (commitment_id, owner_id, daily_task_id) on table public.commitment_sources to authenticated;
grant select on table public.nudges to authenticated;
grant insert (commitment_id) on table public.nudges to authenticated;
grant select on table public.checkins to authenticated;
grant insert (state) on table public.checkins to authenticated;

-- Commitments: the owner, and the CURRENT duo it was made to (ADR-071).
create policy "commitments: owner or current duo reads" on public.commitments
  for select to authenticated
  using (owner_id = (select auth.uid())
         or (duo_id is not null and duo_id = (select private.current_duo_id())));
create policy "commitments: owner creates" on public.commitments
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "commitments: owner updates" on public.commitments
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "commitment_sources: owner only" on public.commitment_sources
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "nudges: sender or recipient in the current duo" on public.nudges
  for select to authenticated
  using ((from_user = (select auth.uid()) or to_user = (select auth.uid()))
         and duo_id = (select private.current_duo_id()));
create policy "nudges: sender inserts" on public.nudges
  for insert to authenticated with check (from_user = (select auth.uid()));

create policy "checkins: owner or current duo reads" on public.checkins
  for select to authenticated
  using (user_id = (select auth.uid())
         or (duo_id is not null and duo_id = (select private.current_duo_id())));
create policy "checkins: owner inserts" on public.checkins
  for insert to authenticated with check (user_id = (select auth.uid()));
