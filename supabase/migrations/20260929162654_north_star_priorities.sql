-- V2 Phase 4 · North Star (featured vision / goal / mirror item) and the
-- daily Top 3 (docs/NORTH_STAR.md, ADR-060 / ADR-061).
--
-- Backward compatible: two nullable / defaulted columns per concern, no
-- rewrite of existing rows, no new SECURITY DEFINER function.
--
-- Featured: at most ONE featured item per owner and table (partial unique
-- index). Featuring an item un-features the previous one in the same
-- statement (trigger, INVOKER, owner's rows only). Archiving a vision,
-- leaving the active status of a goal or deactivating a mirror item drops
-- its featured flag; a featured item is always active (check constraint).
--
-- Top 3: daily_tasks.priority_rank 1..3, unique per owner and date, so a day
-- has at most three priorities with distinct ranks. The title and status
-- stay on the task (no second list). The existing closed-history guard
-- applies to the column like to any other, and RLS is unchanged: a private
-- task stays private whatever its rank.

-- ------------------------------------------------------------ featured ----

alter table public.vision_items add column is_featured boolean not null default false;
alter table public.goals add column is_featured boolean not null default false;
alter table public.accountability_items add column is_featured boolean not null default false;

alter table public.vision_items
  add constraint vision_items_featured_active check (not (is_featured and is_archived));
alter table public.goals
  add constraint goals_featured_active check (not is_featured or status = 'active');
alter table public.accountability_items
  add constraint accountability_items_featured_active check (not is_featured or is_active);

create unique index vision_items_one_featured on public.vision_items (owner_id) where is_featured;
create unique index goals_one_featured on public.goals (owner_id) where is_featured;
create unique index accountability_items_one_featured on public.accountability_items (owner_id) where is_featured;

comment on column public.vision_items.is_featured is 'North Star: at most one per owner (vision_items_one_featured); never archived.';
comment on column public.goals.is_featured is 'North Star: at most one per owner (goals_one_featured); only while active.';
comment on column public.accountability_items.is_featured is 'North Star: at most one per owner (accountability_items_one_featured); only while active.';

-- Leaving the active state drops the flag; featuring one item un-features
-- the owner's previous one (same table). INVOKER: runs with the caller's
-- rights and RLS, and only touches rows of new.owner_id.
create function private.keep_one_featured()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'vision_items' then
    if new.is_archived and not old.is_archived then new.is_featured := false; end if;
  elsif tg_table_name = 'goals' then
    if new.status <> 'active' and old.status = 'active' then new.is_featured := false; end if;
  elsif tg_table_name = 'accountability_items' then
    if not new.is_active and old.is_active then new.is_featured := false; end if;
  end if;
  if new.is_featured and not old.is_featured then
    execute format(
      'update public.%I set is_featured = false where owner_id = $1 and id <> $2 and is_featured',
      tg_table_name
    ) using new.owner_id, new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_one_featured() from public;

create trigger vision_items_keep_one_featured
  before update on public.vision_items
  for each row execute function private.keep_one_featured();
create trigger goals_keep_one_featured
  before update on public.goals
  for each row execute function private.keep_one_featured();
create trigger accountability_items_keep_one_featured
  before update on public.accountability_items
  for each row execute function private.keep_one_featured();

grant update (is_featured) on table public.vision_items to authenticated;
grant update (is_featured) on table public.goals to authenticated;
grant update (is_featured) on table public.accountability_items to authenticated;

-- --------------------------------------------------------------- Top 3 ----

alter table public.daily_tasks
  add column priority_rank smallint
    constraint daily_tasks_priority_rank check (priority_rank between 1 and 3);

create unique index daily_tasks_priority_key
  on public.daily_tasks (owner_id, task_date, priority_rank)
  where priority_rank is not null;

comment on column public.daily_tasks.priority_rank is 'Top 3 of the day: 1..3, unique per owner and date; null = not a priority.';

grant update (priority_rank) on table public.daily_tasks to authenticated;

-- Replaces MY Top 3 of MY today with p_ids in order (0 to 3 distinct ids of
-- my own tasks dated today). INVOKER: RLS, grants and the history guard all
-- apply; clearing first keeps the unique ranks valid inside the statement
-- sequence.
create function public.set_my_priorities(p_ids uuid[])
returns setof public.daily_tasks
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_today date;
  v_n integer := coalesce(cardinality(p_ids), 0);
begin
  if v_me is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if v_n > 3 then
    raise exception 'LI_TOO_MANY_PRIORITIES' using errcode = '22023';
  end if;
  if v_n > 0 and (
    array_position(p_ids, null) is not null
    or (select count(distinct x) from unnest(p_ids) as x) <> v_n
  ) then
    raise exception 'LI_INVALID_PRIORITIES' using errcode = '22023';
  end if;
  v_today := public.my_today();
  if (select count(*) from public.daily_tasks t
      where t.id = any (coalesce(p_ids, array[]::uuid[]))
        and t.owner_id = v_me and t.task_date = v_today) <> v_n then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.daily_tasks t
     set priority_rank = null
   where t.owner_id = v_me and t.task_date = v_today and t.priority_rank is not null;
  if v_n > 0 then
    update public.daily_tasks t
       set priority_rank = array_position(p_ids, t.id)
     where t.id = any (p_ids) and t.owner_id = v_me and t.task_date = v_today;
  end if;

  return query
    select t.* from public.daily_tasks t
     where t.owner_id = v_me and t.task_date = v_today and t.priority_rank is not null
     order by t.priority_rank;
end;
$$;

revoke all on function public.set_my_priorities(uuid[]) from public, anon, authenticated;
grant execute on function public.set_my_priorities(uuid[]) to authenticated;
