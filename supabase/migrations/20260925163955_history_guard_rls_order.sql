-- Stage 9 · history guards defer to RLS for rows that are not the caller's
--
-- BEFORE triggers run before RLS WITH CHECK. A spoofed insert (someone
-- else's owner_id) must fail as an RLS violation (42501), not with the other
-- user's history state: the guards now skip rows the caller does not own and
-- leave the refusal to the policies. Updates / deletes are already limited to
-- the caller's rows by the USING clauses before any trigger fires.

create or replace function private.guard_task_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := case when tg_op = 'INSERT' then new.owner_id else old.owner_id end;
  v_lock date;
begin
  if current_user not in ('authenticated', 'anon')
     or v_owner is distinct from (select auth.uid()) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_lock := private.history_locked_through(v_owner);
  if v_lock is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.task_date <= v_lock then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.task_date <= v_lock then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  if new.task_date > v_lock + 1 and new.status <> 'pending' then
    raise exception 'LI_FUTURE_TASK' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.guard_routine_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := case when tg_op = 'INSERT' then new.owner_id else old.owner_id end;
  v_today date;
  v_due date;
begin
  if current_user not in ('authenticated', 'anon')
     or v_owner is distinct from (select auth.uid()) then
    return new;
  end if;
  v_today := private.local_today(v_owner);
  if v_today is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.start_date < v_today then
      raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
    end if;
    new.materialized_through := null;
    return new;
  end if;

  if new.materialized_through is distinct from old.materialized_through
     or new.start_date is distinct from old.start_date then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  v_due := least(v_today, coalesce(old.end_date, v_today));
  if v_due >= old.start_date
     and (old.materialized_through is null or old.materialized_through < v_due) then
    raise exception 'LI_ROUTINE_STALE' using errcode = 'P0001';
  end if;
  if new.end_date is distinct from old.end_date
     and ((old.end_date is not null and old.end_date < v_today - 1)
          or (new.end_date is not null and new.end_date < v_today - 1)) then
    raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
