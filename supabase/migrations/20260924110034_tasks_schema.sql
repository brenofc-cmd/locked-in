-- Stage 4 · routine_items and daily_tasks
--
-- routine_items = recurring template ("Gym happens MON/WED/FRI").
-- daily_tasks   = one materialised occurrence ("Gym was planned for 2026-09-24"),
--                 or a one-off task when routine_item_id is null. Each row is a
--                 snapshot: title, category, time, order and visibility are
--                 copied, so editing a routine never rewrites the past.
-- Weekdays use ISO numbering everywhere: 1 = Monday … 7 = Sunday.
-- Status is stored on the task itself (no separate check-ins table):
--   pending | completed | skipped. "Missed" is derived: task_date < today and pending.

create table public.routine_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null
    constraint routine_items_title_length check (char_length(btrim(title)) between 1 and 80),
  category text not null default 'custom'
    constraint routine_items_category check (category in ('morning', 'work_study', 'body', 'night', 'custom')),
  days_of_week smallint[] not null
    constraint routine_items_days check (
      cardinality(days_of_week) between 1 and 7
      and days_of_week <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
      and array_position(days_of_week, null) is null
    ),
  scheduled_time time,
  sort_order integer not null default 0,
  visible_to_partner boolean not null default true,
  notes text not null default ''
    constraint routine_items_notes_length check (char_length(notes) <= 200),
  reminder boolean not null default false,
  -- First and last local dates (owner's timezone) this routine may produce a task.
  -- end_date = start_date - 1 means archived before it ever ran.
  start_date date not null,
  end_date date,
  -- Last local date already materialised into daily_tasks (null = nothing yet).
  materialized_through date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_items_dates check (end_date is null or end_date >= start_date - 1),
  -- Target of the composite FK from daily_tasks (same owner guarantee).
  constraint routine_items_id_owner_key unique (id, owner_id)
);

comment on table public.routine_items is 'Recurring routine template. Never hard-deleted once it has history; archived with end_date.';
comment on column public.routine_items.days_of_week is 'ISO weekdays, 1 = Monday … 7 = Sunday. Sorted and de-duplicated by trigger.';

create table public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  routine_item_id uuid,
  task_date date not null,
  title text not null
    constraint daily_tasks_title_length check (char_length(btrim(title)) between 1 and 80),
  category text not null default 'custom'
    constraint daily_tasks_category check (category in ('morning', 'work_study', 'body', 'night', 'custom')),
  scheduled_time time,
  sort_order integer not null default 100000,
  visible_to_partner boolean not null default true,
  notes text not null default ''
    constraint daily_tasks_notes_length check (char_length(notes) <= 200),
  reminder boolean not null default false,
  status text not null default 'pending'
    constraint daily_tasks_status check (status in ('pending', 'completed', 'skipped')),
  skip_reason text
    constraint daily_tasks_skip_reason_length check (char_length(skip_reason) <= 24),
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No impossible rows: timestamps always match the status.
  constraint daily_tasks_status_timestamps check (
    (status = 'pending' and completed_at is null and skipped_at is null and skip_reason is null)
    or (status = 'completed' and completed_at is not null and skipped_at is null and skip_reason is null)
    or (status = 'skipped' and skipped_at is not null and completed_at is null)
  ),
  -- A routine produces at most one occurrence per date. NULLs are distinct,
  -- so one-off tasks are unaffected.
  constraint daily_tasks_routine_date_key unique (routine_item_id, task_date),
  -- An occurrence belongs to the same owner as its routine. NO ACTION: a
  -- routine with history cannot be hard-deleted (archive it instead).
  constraint daily_tasks_routine_same_owner_fkey
    foreign key (routine_item_id, owner_id) references public.routine_items (id, owner_id)
);

comment on table public.daily_tasks is 'A task on a given local date: routine occurrence (snapshot) or one-off (routine_item_id null).';

create index routine_items_owner_idx on public.routine_items (owner_id, sort_order);
create index daily_tasks_owner_date_idx on public.daily_tasks (owner_id, task_date);
-- daily_tasks_routine_date_key already indexes (routine_item_id, task_date).

-- updated_at, maintained by the database.
create trigger routine_items_set_updated_at
  before update on public.routine_items
  for each row execute function private.set_updated_at();
create trigger daily_tasks_set_updated_at
  before update on public.daily_tasks
  for each row execute function private.set_updated_at();

-- Normalise input: trimmed title, sorted de-duplicated weekdays.
create function private.normalize_routine_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.notes := btrim(coalesce(new.notes, ''));
  new.days_of_week := (
    select array_agg(distinct d order by d) from unnest(new.days_of_week) as d
  );
  return new;
end;
$$;

create trigger routine_items_normalize
  before insert or update on public.routine_items
  for each row execute function private.normalize_routine_item();

-- Status timestamps are owned by the database: clients send only the status
-- (and a skip reason). completed_at / skipped_at are set here.
create function private.normalize_daily_task()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.notes := btrim(coalesce(new.notes, ''));
  new.skip_reason := nullif(btrim(new.skip_reason), '');
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'completed' then
      new.completed_at := now();
      new.skipped_at := null;
      new.skip_reason := null;
    elsif new.status = 'skipped' then
      new.skipped_at := now();
      new.completed_at := null;
    else
      new.completed_at := null;
      new.skipped_at := null;
      new.skip_reason := null;
    end if;
  elsif new.status <> 'skipped' then
    new.skip_reason := null;
  end if;
  return new;
end;
$$;

create trigger daily_tasks_normalize
  before insert or update on public.daily_tasks
  for each row execute function private.normalize_daily_task();

revoke all on function private.normalize_routine_item() from public;
revoke all on function private.normalize_daily_task() from public;
