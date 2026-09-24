-- Stage 6 · focus_sessions
--
-- A focus session is persisted state; the browser only displays a clock
-- derived from these timestamps (never saved per second):
--   active seconds = (coalesce(paused_at, now) - started_at) - accumulated_pause_seconds
--   remaining      = planned_seconds - active seconds (never below 0)
-- Status: active | paused | completed. There is no "cancelled": ending early
-- is a valid, completed session. Every timestamp is set by the database
-- (now()), never by the device. Clients send only the status they want and,
-- at the end, a reflection; the trigger below owns the lifecycle maths.

-- Target of the composite FK below (a session can only link its owner's task).
alter table public.daily_tasks
  add constraint daily_tasks_id_owner_key unique (id, owner_id);

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Duo at start time (feed / realtime); kept null outside a duo.
  duo_id uuid references public.duos (id) on delete set null,
  daily_task_id uuid,
  title text not null
    constraint focus_sessions_title_length check (char_length(btrim(title)) between 1 and 80),
  planned_seconds integer not null
    constraint focus_sessions_planned check (planned_seconds between 1 and 43200),
  status text not null default 'active'
    constraint focus_sessions_status check (status in ('active', 'paused', 'completed')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  accumulated_pause_seconds integer not null default 0
    constraint focus_sessions_pause_nonneg check (accumulated_pause_seconds >= 0),
  ended_at timestamptz,
  actual_focus_seconds integer
    constraint focus_sessions_actual_range check (actual_focus_seconds between 0 and planned_seconds),
  reflection text
    constraint focus_sessions_reflection_length check (char_length(reflection) <= 1000),
  visible_to_partner boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No impossible rows.
  constraint focus_sessions_state check (
    (status = 'active' and paused_at is null and ended_at is null and actual_focus_seconds is null)
    or (status = 'paused' and paused_at is not null and ended_at is null and actual_focus_seconds is null)
    or (status = 'completed' and paused_at is null and ended_at is not null and actual_focus_seconds is not null)
  ),
  -- Same-owner task link. Deleting the task keeps the session (link cleared).
  constraint focus_sessions_task_same_owner_fkey
    foreign key (daily_task_id, user_id) references public.daily_tasks (id, owner_id)
    on delete set null (daily_task_id)
);

comment on table public.focus_sessions is 'Persistent focus sessions. Lifecycle enforced by trigger; partner reads only through partner_current_focus().';

-- At most one unfinished (active or paused) session per user, whatever the
-- number of tabs, devices or concurrent requests.
create unique index focus_sessions_one_unfinished
  on public.focus_sessions (user_id) where status in ('active', 'paused');
create index focus_sessions_user_started_idx on public.focus_sessions (user_id, started_at desc);
create index focus_sessions_duo_idx on public.focus_sessions (duo_id);
create index focus_sessions_task_idx on public.focus_sessions (daily_task_id);

create trigger focus_sessions_set_updated_at
  before update on public.focus_sessions
  for each row execute function private.set_updated_at();

-- Lifecycle. INSERT: always a fresh active session started now, duo taken
-- from membership, a private task makes the session private. UPDATE: only
-- the legal transitions, with every derived value computed here.
create function private.focus_lifecycle()
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
    new.accumulated_pause_seconds := old.accumulated_pause_seconds
      + greatest(0, round(extract(epoch from v_now - old.paused_at)))::integer;
    new.paused_at := null;
  else                                     -- active / paused -> completed
    v_at := coalesce(old.paused_at, v_now);
    v_elapsed := greatest(0, floor(extract(epoch from v_at - old.started_at))::integer
                             - old.accumulated_pause_seconds);
    if v_elapsed >= old.planned_seconds then
      -- The planned time ran out (possibly while the app was closed):
      -- count exactly the plan, ended when the plan ended.
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

revoke all on function private.focus_lifecycle() from public;

create trigger focus_sessions_lifecycle
  before insert or update on public.focus_sessions
  for each row execute function private.focus_lifecycle();

-- RLS: owner only. The partner never reads rows directly (reflection is
-- private and RLS cannot hide columns); see public.partner_current_focus().
alter table public.focus_sessions enable row level security;
revoke all on table public.focus_sessions from anon, authenticated;
grant select on table public.focus_sessions to authenticated;
grant insert (user_id, title, planned_seconds, daily_task_id, visible_to_partner)
  on table public.focus_sessions to authenticated;
grant update (status, reflection) on table public.focus_sessions to authenticated;

create policy "focus_sessions: read own"
  on public.focus_sessions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "focus_sessions: insert own"
  on public.focus_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "focus_sessions: update own"
  on public.focus_sessions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
