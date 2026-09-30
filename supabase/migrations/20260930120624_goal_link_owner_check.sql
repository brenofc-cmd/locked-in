-- V2 Phase 5 · the "active goal" check names the action's owner
--
-- private.goal_is_active(p_goal) relied on RLS to hide other users' goals.
-- A trigger's cached plan built while trusted code ran (materialize_tasks,
-- SECURITY DEFINER) could later run for an API role without the RLS
-- qualification, so another user's active goal read as "active" and only the
-- composite foreign key (23503) refused the link. Still safe, but not
-- deterministic. The check now compares the owner itself: a goal that is not
-- the action owner's own active goal is refused with LI_GOAL_INACTIVE, the
-- same answer as for a goal that does not exist (no existence leak).

drop function private.goal_is_active(uuid);

create function private.goal_is_active(p_goal uuid, p_owner uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.goals g
    where g.id = p_goal and g.owner_id = p_owner and g.status = 'active'
  );
$$;

revoke all on function private.goal_is_active(uuid, uuid) from public, anon, authenticated;
grant execute on function private.goal_is_active(uuid, uuid) to authenticated;

create or replace function private.guard_task_goal()
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
     and not private.goal_is_active(new.goal_id, new.owner_id) then
    raise exception 'LI_GOAL_INACTIVE' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.daily_task_id is distinct from old.daily_task_id then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select t.task_date into v_date from public.daily_tasks t where t.id = v_task and t.owner_id = v_owner;
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

create or replace function private.guard_routine_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.goal_id is distinct from old.goal_id)
     and not private.goal_is_active(new.goal_id, new.owner_id) then
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

create or replace function private.guard_focus_goal()
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
  if new.goal_id is not null and not private.goal_is_active(new.goal_id, new.user_id) then
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
