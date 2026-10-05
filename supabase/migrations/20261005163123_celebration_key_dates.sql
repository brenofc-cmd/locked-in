-- V2 Phase 9 fix: a celebration key shaped like a date but not a real date
-- ("2026-13-01", "2026-02-30") raised 22008 from the cast instead of the
-- documented LI_NOT_PERFECT / LI_MONTH_OPEN. Same guard, safe parsing only.
create or replace function private.guard_celebration()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_kind text;
  v_threshold integer;
  v_value integer;
  v_today date;
  v_day date;
begin
  if tg_op = 'UPDATE' then
    -- Only "seen" can change, once, stamped by the database.
    if new.owner_id is distinct from old.owner_id or new.kind is distinct from old.kind
       or new.key is distinct from old.key or new.achieved_at is distinct from old.achieved_at
       or new.source_value is distinct from old.source_value or new.baseline is distinct from old.baseline then
      raise exception 'LI_HISTORY_LOCKED' using errcode = 'P0001';
    end if;
    new.seen_at := coalesce(old.seen_at, now());
    return new;
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new; -- trusted path: the baseline written by the database
  end if;
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  new.owner_id := v_me;
  new.achieved_at := now();
  new.baseline := false;
  new.seen_at := null;
  new.source_value := null;
  v_today := private.local_today(v_me);

  if new.kind in ('perfect_day', 'monthly') and new.key ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      v_day := new.key::date;
    exception when others then
      v_day := null; -- shaped like a date, not a real one
    end;
  end if;

  if new.kind = 'milestone' then
    select m.kind, m.threshold into v_kind, v_threshold from private.milestone_threshold(new.key) m;
    if v_kind is null then
      raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
    end if;
    v_value := private.milestone_value(v_me, v_kind);
    if coalesce(v_value, 0) < v_threshold then
      raise exception 'LI_MILESTONE_NOT_REACHED' using errcode = 'P0001';
    end if;
    new.source_value := v_value;
  elsif new.kind = 'perfect_day' then
    -- Only today, and only while today is a Perfect Day (the existing
    -- definition: planned > 0 and every task completed).
    if v_day is distinct from v_today or not exists (
         select 1 from public.daily_tasks t
         where t.owner_id = v_me and t.task_date = v_today
         having count(*) > 0 and count(*) = count(*) filter (where t.status = 'completed')) then
      raise exception 'LI_NOT_PERFECT' using errcode = 'P0001';
    end if;
  else
    -- A month receipt: only a month that has ended for the caller.
    if v_day is null or extract(day from v_day) <> 1
       or v_day >= date_trunc('month', v_today::timestamp)::date then
      raise exception 'LI_MONTH_OPEN' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_celebration() from public, anon, authenticated;
