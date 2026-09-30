-- V2 Phase 5 · Goals → Actions → Proof (docs/GOAL_PROOF.md, ADR-064…068).
--
-- Backward compatible: two new owner-only tables, nullable / database-owned
-- columns, one RPC replaced by a superset (a new trailing argument with a
-- default, so the current client keeps calling it unchanged), two INVOKER
-- read functions. No new SECURITY DEFINER function, no view, no stats table.
--
-- Where the link lives (ADR-064):
--   · daily_tasks and routine_items rows are readable by the duo partner
--     when shared, and RLS cannot hide a column, so a goal_id there would
--     reach the partner. Their goal link lives in owner-only side tables
--     (daily_task_goals, routine_item_goals), one goal per action.
--   · focus_sessions is already owner-only (the partner reads only the
--     partner_current_focus() projection), so the link is a column there.
-- Ownership is structural: composite foreign keys (action, owner) and
-- (goal, owner) make a link to another user's action or goal impossible.
--
-- Proof (ADR-065) is derived, never stored: a completed daily task linked to
-- the goal (1 action), a completed focus session linked to it (its effective
-- seconds — pauses never count), a completed milestone (1 milestone). A
-- routine is not proof: its link only seeds the goal of the occurrences it
-- generates (snapshot at materialisation), which are the proof.

-- --------------------------------------------------- daily_task_goals ----

create table public.daily_task_goals (
  daily_task_id uuid primary key,
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  created_at timestamptz not null default now(),
  constraint daily_task_goals_task_same_owner_fkey foreign key (daily_task_id, owner_id)
    references public.daily_tasks (id, owner_id) on delete cascade,
  -- Deleting a goal removes its links (the task and its history stay).
  constraint daily_task_goals_goal_same_owner_fkey foreign key (goal_id, owner_id)
    references public.goals (id, owner_id) on delete cascade
);

comment on table public.daily_task_goals is
  'Goal of a daily task (V2 Phase 5). Owner-only side table so the partner never sees a goal link.';

create index daily_task_goals_goal_idx on public.daily_task_goals (goal_id, owner_id);

-- ------------------------------------------------- routine_item_goals ----

create table public.routine_item_goals (
  routine_item_id uuid primary key,
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  created_at timestamptz not null default now(),
  constraint routine_item_goals_routine_same_owner_fkey foreign key (routine_item_id, owner_id)
    references public.routine_items (id, owner_id) on delete cascade,
  constraint routine_item_goals_goal_same_owner_fkey foreign key (goal_id, owner_id)
    references public.goals (id, owner_id) on delete cascade
);

comment on table public.routine_item_goals is
  'Goal a routine feeds (V2 Phase 5). Copied to each occurrence when it is generated; never proof itself.';

create index routine_item_goals_goal_idx on public.routine_item_goals (goal_id, owner_id);

-- ------------------------------------------------------ focus_sessions ----

alter table public.focus_sessions add column goal_id uuid;
alter table public.focus_sessions
  add constraint focus_sessions_goal_same_owner_fkey foreign key (goal_id, user_id)
    references public.goals (id, owner_id) on delete set null (goal_id);

comment on column public.focus_sessions.goal_id is
  'Goal worked on (V2 Phase 5). Owner-only; never in partner_current_focus() or a broadcast.';

create index focus_sessions_goal_idx on public.focus_sessions (goal_id, local_date)
  where goal_id is not null;

-- ----------------------------------------------------- goal_milestones ----

-- When a milestone was completed, stamped by the database: the instant and
-- the owner's local date at that moment (a later timezone change never moves
-- the proof between days). Existing completed milestones take updated_at.
alter table public.goal_milestones
  add column completed_at timestamptz,
  add column completed_on date;

update public.goal_milestones m
set completed_at = m.updated_at,
    completed_on = (m.updated_at at time zone p.timezone)::date
from public.profiles p
where p.id = m.owner_id and m.is_completed;

alter table public.goal_milestones
  add constraint goal_milestones_completed_stamp check (
    (is_completed and completed_at is not null and completed_on is not null)
    or (not is_completed and completed_at is null and completed_on is null)
  );

comment on column public.goal_milestones.completed_on is
  'Owner''s local date when the milestone was completed (database-owned; proof day).';

create index goal_milestones_completed_idx on public.goal_milestones (goal_id, completed_on)
  where is_completed;

create function private.stamp_milestone_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_completed then
    new.completed_at := null;
    new.completed_on := null;
  elsif tg_op = 'INSERT' or not old.is_completed then
    new.completed_at := now();
    new.completed_on := private.local_today(new.owner_id);
  else
    new.completed_at := old.completed_at;
    new.completed_on := old.completed_on;
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_milestone_completion() from public;

create trigger goal_milestones_stamp_completion
  before insert or update on public.goal_milestones
  for each row execute function private.stamp_milestone_completion();

-- ------------------------------------------------------------- guards ----

-- A new link (or a changed one) may only point at an ACTIVE goal: archived and
-- achieved goals keep their history but take no new action (ADR-066).
create function private.goal_is_active(p_goal uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.goals g where g.id = p_goal and g.status = 'active');
$$;

revoke all on function private.goal_is_active(uuid) from public, anon, authenticated;
grant execute on function private.goal_is_active(uuid) to authenticated;

-- daily_task_goals: the goal of a closed day's task is part of the record
-- and can never be set, changed or removed by the API roles (Stage 9). The
-- cascades of deleting a goal or a task are allowed (the parent is gone).
create function private.guard_task_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_task uuid := case when tg_op = 'DELETE' then old.daily_task_id else new.daily_task_id end;
  v_owner uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  v_date date;
begin
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.goal_id is distinct from old.goal_id)
     and not private.goal_is_active(new.goal_id) then
    raise exception 'LI_GOAL_INACTIVE' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.daily_task_id is distinct from old.daily_task_id then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select t.task_date into v_date from public.daily_tasks t where t.id = v_task;
  if tg_op = 'DELETE' and (
       v_date is null
       or not exists (select 1 from public.goals g where g.id = old.goal_id)) then
    return old;
  end if;
  if v_date is null or v_date <= private.history_locked_through(v_owner) then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_task_goal() from public;

create trigger daily_task_goals_guard
  before insert or update or delete on public.daily_task_goals
  for each row execute function private.guard_task_goal();

-- routine_item_goals: before the template's goal changes, catch up the
-- missed occurrences with the OLD goal (like every routine RPC does), so a
-- new goal never rewrites past days. Only active goals can be linked.
create function private.guard_routine_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.goal_id is distinct from old.goal_id)
     and not private.goal_is_active(new.goal_id) then
    raise exception 'LI_GOAL_INACTIVE' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.routine_item_id is distinct from old.routine_item_id then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  if current_user in ('authenticated', 'anon') then
    perform private.materialize_tasks(case when tg_op = 'DELETE' then old.owner_id else new.owner_id end);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_routine_goal() from public;

create trigger routine_item_goals_guard
  before insert or update or delete on public.routine_item_goals
  for each row execute function private.guard_routine_goal();

-- The template's new goal also applies to TODAY's occurrence (as every other
-- template edit does, update_routine_item); past occurrences keep theirs.
create function private.sync_routine_goal_today()
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
  delete from public.daily_task_goals l where l.daily_task_id = v_task;
  if tg_op <> 'DELETE' then
    insert into public.daily_task_goals (daily_task_id, owner_id, goal_id)
    values (v_task, v_owner, new.goal_id);
  end if;
  return null;
end;
$$;

revoke all on function private.sync_routine_goal_today() from public;

create trigger routine_item_goals_sync_today
  after insert or update or delete on public.routine_item_goals
  for each row execute function private.sync_routine_goal_today();

-- Snapshot: an occurrence generated from a routine gets the routine's goal
-- AT THAT MOMENT (only while the goal is active). Changing the routine later
-- never touches existing occurrences. Runs for the trusted catch-up
-- (materialize_tasks) and for the INVOKER routine RPCs alike.
create function private.seed_task_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.daily_task_goals (daily_task_id, owner_id, goal_id)
  select new.id, new.owner_id, rg.goal_id
  from public.routine_item_goals rg
  join public.goals g on g.id = rg.goal_id and g.status = 'active'
  where rg.routine_item_id = new.routine_item_id and rg.owner_id = new.owner_id
  on conflict (daily_task_id) do nothing;
  return null;
end;
$$;

revoke all on function private.seed_task_goal() from public;

create trigger daily_tasks_seed_goal
  after insert on public.daily_tasks
  for each row when (new.routine_item_id is not null)
  execute function private.seed_task_goal();

-- focus_sessions.goal_id: chosen at start or changed while the session runs
-- or is paused (ADR-067); fixed once completed — the final goal is the
-- proof. Never on a closed day. Deleting the goal clears it (cascade).
create function private.guard_focus_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.goal_id is not distinct from old.goal_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.goal_id is null
     and not exists (select 1 from public.goals g where g.id = old.goal_id) then
    return new; -- the goal was deleted
  end if;
  if new.goal_id is not null and not private.goal_is_active(new.goal_id) then
    raise exception 'LI_GOAL_INACTIVE' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'completed' then
      raise exception 'LI_FOCUS_FINISHED' using errcode = 'P0001';
    end if;
    if current_user in ('authenticated', 'anon')
       and old.local_date <= private.history_locked_through(old.user_id) then
      raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_focus_goal() from public;

create trigger focus_sessions_guard_goal
  before insert or update on public.focus_sessions
  for each row execute function private.guard_focus_goal();

-- ------------------------------------------------------ RLS and grants ----

alter table public.daily_task_goals enable row level security;
alter table public.routine_item_goals enable row level security;

revoke all on table public.daily_task_goals, public.routine_item_goals from anon, authenticated;
grant select, delete on table public.daily_task_goals, public.routine_item_goals to authenticated;
-- owner_id is insertable only because the snapshot triggers must name the
-- action's owner (a catch-up can run in the partner's request); the policy
-- below and the composite foreign keys still pin it to the caller's own rows.
grant insert (daily_task_id, owner_id, goal_id), update (goal_id)
  on table public.daily_task_goals to authenticated;
grant insert (routine_item_id, owner_id, goal_id), update (goal_id)
  on table public.routine_item_goals to authenticated;

-- Owner only: no partner condition, no sharing, no broadcast (ADR-068).
create policy "daily_task_goals: owner only" on public.daily_task_goals for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "routine_item_goals: owner only" on public.routine_item_goals for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

grant insert (goal_id), update (goal_id) on table public.focus_sessions to authenticated;

-- --------------------------------------------------------- focus start ----

-- Same function with one more optional argument: the current client (four
-- named arguments) keeps working during the rollout. INVOKER: the goal is
-- checked by the foreign key (same owner) and guard_focus_goal (active).
drop function public.start_focus_session(text, integer, uuid, boolean);

create function public.start_focus_session(
  p_title text,
  p_planned_seconds integer,
  p_daily_task_id uuid default null,
  p_visible boolean default true,
  p_goal_id uuid default null
)
returns setof public.focus_sessions
language plpgsql
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  perform public.reconcile_my_focus();
  begin
    return query
      insert into public.focus_sessions (user_id, title, planned_seconds, daily_task_id, visible_to_partner, goal_id)
      values (auth.uid(), p_title, p_planned_seconds, p_daily_task_id, coalesce(p_visible, true), p_goal_id)
      returning *;
  exception when unique_violation then
    -- focus_sessions_one_unfinished: another tab / device / double tap won.
    raise exception 'LI_FOCUS_RUNNING' using errcode = 'P0001';
  end;
end;
$$;

revoke all on function public.start_focus_session(text, integer, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.start_focus_session(text, integer, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------- proof reads ----

-- Per-goal proof over [p_from, p_to] (local dates), all of my goals with any
-- proof in one call (no per-goal queries). INVOKER: RLS limits every table to
-- the caller's rows; the owner filters keep the partner's shared tasks out.
create function public.my_goal_proof_summaries(p_from date, p_to date)
returns table (goal_id uuid, actions integer, focus_seconds integer, milestones integer)
language sql
stable
set search_path = ''
as $$
  with t as (
    select l.goal_id, count(*)::integer as n
    from public.daily_task_goals l
    join public.daily_tasks d on d.id = l.daily_task_id
    where l.owner_id = (select auth.uid()) and d.status = 'completed'
      and d.task_date between p_from and p_to
    group by l.goal_id
  ), f as (
    select s.goal_id, sum(s.actual_focus_seconds)::integer as secs
    from public.focus_sessions s
    where s.user_id = (select auth.uid()) and s.goal_id is not null and s.status = 'completed'
      and s.local_date between p_from and p_to
    group by s.goal_id
  ), m as (
    select g.goal_id, count(*)::integer as n
    from public.goal_milestones g
    where g.owner_id = (select auth.uid()) and g.is_completed
      and g.completed_on between p_from and p_to
    group by g.goal_id
  )
  select goal_id, coalesce(t.n, 0), coalesce(f.secs, 0), coalesce(m.n, 0)
  from t full join f using (goal_id) full join m using (goal_id);
$$;

-- One goal's proof, newest first, a page at a time (1..50 rows).
create function public.my_goal_proofs(p_goal_id uuid, p_limit integer default 20, p_offset integer default 0)
returns table (kind text, id uuid, title text, proof_date date, occurred_at timestamptz, focus_seconds integer)
language sql
stable
set search_path = ''
as $$
  select * from (
    select 'task'::text, d.id, d.title, d.task_date, d.completed_at, null::integer
    from public.daily_task_goals l
    join public.daily_tasks d on d.id = l.daily_task_id
    where l.goal_id = p_goal_id and l.owner_id = (select auth.uid()) and d.status = 'completed'
    union all
    select 'focus', s.id, s.title, s.local_date, s.ended_at, s.actual_focus_seconds
    from public.focus_sessions s
    where s.goal_id = p_goal_id and s.user_id = (select auth.uid()) and s.status = 'completed'
    union all
    select 'milestone', m.id, m.title, m.completed_on, m.completed_at, null::integer
    from public.goal_milestones m
    where m.goal_id = p_goal_id and m.owner_id = (select auth.uid()) and m.is_completed
  ) p (kind, id, title, proof_date, occurred_at, focus_seconds)
  order by p.proof_date desc, p.occurred_at desc, p.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.my_goal_proof_summaries(date, date) from public, anon, authenticated;
revoke all on function public.my_goal_proofs(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.my_goal_proof_summaries(date, date) to authenticated;
grant execute on function public.my_goal_proofs(uuid, integer, integer) to authenticated;
