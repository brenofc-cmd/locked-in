-- V2 Phase 5 · linking a task that is not the caller's own answers
-- LI_NOT_FOUND (it was refused as LI_HISTORY_LOCKED, which is misleading).
-- Same checks, same order; only the error of a missing / foreign task changes.

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
  if v_date is null then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_date <= private.history_locked_through(v_owner) then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
