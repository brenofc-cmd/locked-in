-- Stage 4 · task functions
--
-- All SECURITY INVOKER: they run as the calling user, so RLS and column grants
-- apply exactly as for direct API calls. Identity is always auth.uid(); no
-- function takes an owner id. Error codes: LI_NOT_AUTHENTICATED, LI_NOT_FOUND.

-- The caller's local date, from profiles.timezone. The single definition of
-- "today" used by materialisation, Quick Add (column default) and the app.
create function public.my_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone p.timezone)::date
  from public.profiles p
  where p.id = (select auth.uid());
$$;

-- One-off tasks default to the owner's today.
alter table public.daily_tasks alter column task_date set default public.my_today();

-- Materialise every routine occurrence due up to the caller's today.
-- Catch-up: starts the day after materialized_through (or at start_date), so
-- days the app was not opened are filled in. Idempotent and concurrency-safe:
-- the unique (routine_item_id, task_date) constraint + ON CONFLICT DO NOTHING
-- is the final guarantee. Returns the caller's local date.
create function public.ensure_my_daily_tasks()
returns date
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_today := public.my_today();

  insert into public.daily_tasks (
    owner_id, routine_item_id, task_date, title, category, scheduled_time,
    sort_order, visible_to_partner, notes, reminder
  )
  select r.owner_id, r.id, d.day::date, r.title, r.category, r.scheduled_time,
         r.sort_order, r.visible_to_partner, r.notes, r.reminder
  from public.routine_items r
  cross join lateral pg_catalog.generate_series(
    greatest(r.start_date, coalesce(r.materialized_through + 1, r.start_date))::timestamp,
    least(v_today, coalesce(r.end_date, v_today))::timestamp,
    interval '1 day'
  ) as d(day)
  where r.owner_id = v_uid
    and extract(isodow from d.day)::smallint = any (r.days_of_week)
  on conflict (routine_item_id, task_date) do nothing;

  update public.routine_items r
  set materialized_through = least(v_today, coalesce(r.end_date, v_today))
  where r.owner_id = v_uid
    and least(v_today, coalesce(r.end_date, v_today)) >= r.start_date - 1
    and (r.materialized_through is null
         or r.materialized_through < least(v_today, coalesce(r.end_date, v_today)));

  return v_today;
end;
$$;

-- New routine item starting today (owner's timezone), appended to the end of
-- the routine, with today's occurrence materialised if today is a scheduled day.
create function public.create_routine_item(
  p_title text,
  p_days smallint[],
  p_category text default 'custom',
  p_time time default null,
  p_visible boolean default true,
  p_notes text default '',
  p_reminder boolean default false
)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  -- Bring existing routines up to date first, so this call never changes history.
  perform public.ensure_my_daily_tasks();

  insert into public.routine_items (
    owner_id, title, days_of_week, category, scheduled_time, visible_to_partner,
    notes, reminder, start_date, sort_order
  )
  values (
    v_uid, p_title, p_days, p_category, p_time, p_visible, coalesce(p_notes, ''),
    p_reminder, public.my_today(),
    (select coalesce(max(r.sort_order), 0) + 10 from public.routine_items r where r.owner_id = v_uid)
  )
  returning id into v_id;

  perform public.ensure_my_daily_tasks();
  return v_id;
end;
$$;

-- "Today and future days": update the template and today's occurrence.
-- Past occurrences are never touched. Today's occurrence:
--   exists, pending, today no longer scheduled  -> removed
--   exists otherwise                            -> snapshot updated, status kept
--   missing, today now scheduled and active     -> created
create function public.update_routine_item(
  p_id uuid,
  p_title text,
  p_days smallint[],
  p_category text,
  p_time time,
  p_visible boolean,
  p_notes text,
  p_reminder boolean
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_today date;
  v_item public.routine_items;
  v_task public.daily_tasks;
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  -- Materialise any missed days with the OLD values before changing the template.
  v_today := public.ensure_my_daily_tasks();

  update public.routine_items r
  set title = p_title, days_of_week = p_days, category = p_category,
      scheduled_time = p_time, visible_to_partner = p_visible,
      notes = coalesce(p_notes, ''), reminder = p_reminder
  where r.id = p_id and r.owner_id = auth.uid()
  returning r.* into v_item;
  if not found then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;

  select t.* into v_task
  from public.daily_tasks t
  where t.routine_item_id = p_id and t.task_date = v_today;

  if found then
    if v_task.status = 'pending'
       and not (extract(isodow from v_today)::smallint = any (v_item.days_of_week)) then
      delete from public.daily_tasks t where t.id = v_task.id;
    else
      update public.daily_tasks t
      set title = v_item.title, category = v_item.category,
          scheduled_time = v_item.scheduled_time,
          visible_to_partner = v_item.visible_to_partner,
          notes = v_item.notes, reminder = v_item.reminder
      where t.id = v_task.id;
    end if;
  elsif extract(isodow from v_today)::smallint = any (v_item.days_of_week)
        and v_item.start_date <= v_today
        and (v_item.end_date is null or v_item.end_date >= v_today) then
    insert into public.daily_tasks (
      owner_id, routine_item_id, task_date, title, category, scheduled_time,
      sort_order, visible_to_partner, notes, reminder
    )
    values (
      v_item.owner_id, v_item.id, v_today, v_item.title, v_item.category,
      v_item.scheduled_time, v_item.sort_order, v_item.visible_to_partner,
      v_item.notes, v_item.reminder
    )
    on conflict (routine_item_id, task_date) do nothing;
  end if;
end;
$$;

-- "Delete" in the UI: the routine stops producing tasks from today on.
-- Today's occurrence is removed if still pending; completed / skipped
-- occurrences and all history stay.
create function public.archive_routine_item(p_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_today := public.ensure_my_daily_tasks();

  update public.routine_items r
  set end_date = greatest(v_today - 1, r.start_date - 1)
  where r.id = p_id and r.owner_id = auth.uid() and (r.end_date is null or r.end_date >= v_today);
  if not found then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from public.daily_tasks t
  where t.routine_item_id = p_id and t.task_date >= v_today and t.status = 'pending';
end;
$$;

-- Persist a new routine order (sort_order = 10, 20, 30 …). Today's
-- occurrences follow; past ones keep the order they had.
create function public.reorder_routine_items(p_ids uuid[])
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_today := public.my_today();

  update public.routine_items r
  set sort_order = x.ord * 10
  from unnest(p_ids) with ordinality as x(id, ord)
  where r.id = x.id and r.owner_id = auth.uid() and r.sort_order <> x.ord * 10;

  update public.daily_tasks t
  set sort_order = r.sort_order
  from public.routine_items r
  where t.routine_item_id = r.id
    and t.task_date = v_today
    and r.owner_id = auth.uid()
    and r.id = any (p_ids)
    and t.sort_order <> r.sort_order;
end;
$$;

revoke all on function public.my_today() from public, anon, authenticated;
revoke all on function public.ensure_my_daily_tasks() from public, anon, authenticated;
revoke all on function public.create_routine_item(text, smallint[], text, time, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.update_routine_item(uuid, text, smallint[], text, time, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.archive_routine_item(uuid) from public, anon, authenticated;
revoke all on function public.reorder_routine_items(uuid[]) from public, anon, authenticated;

grant execute on function public.my_today() to authenticated;
grant execute on function public.ensure_my_daily_tasks() to authenticated;
grant execute on function public.create_routine_item(text, smallint[], text, time, boolean, text, boolean) to authenticated;
grant execute on function public.update_routine_item(uuid, text, smallint[], text, time, boolean, text, boolean) to authenticated;
grant execute on function public.archive_routine_item(uuid) to authenticated;
grant execute on function public.reorder_routine_items(uuid[]) to authenticated;
