-- Stage 4 · RLS and grants for routine_items and daily_tasks
--
-- Owner: full control of own rows (no hard delete of routine items).
-- Partner (same duo): SELECT only, and only rows with visible_to_partner.
-- Outsider / anon: nothing.
-- Grants list the columns a client may write; ids, owner-derived fields and
-- status timestamps are database-owned.

alter table public.routine_items enable row level security;
alter table public.daily_tasks enable row level security;

revoke all on table public.routine_items from anon, authenticated;
revoke all on table public.daily_tasks from anon, authenticated;

grant select on table public.routine_items to authenticated;
grant insert (owner_id, title, category, days_of_week, scheduled_time, sort_order,
              visible_to_partner, notes, reminder, start_date)
  on table public.routine_items to authenticated;
grant update (title, category, days_of_week, scheduled_time, sort_order,
              visible_to_partner, notes, reminder, end_date, materialized_through)
  on table public.routine_items to authenticated;

grant select, delete on table public.daily_tasks to authenticated;
grant insert (owner_id, routine_item_id, task_date, title, category, scheduled_time,
              sort_order, visible_to_partner, notes, reminder, status, skip_reason)
  on table public.daily_tasks to authenticated;
grant update (title, category, scheduled_time, sort_order, visible_to_partner,
              notes, reminder, status, skip_reason)
  on table public.daily_tasks to authenticated;

-- routine_items -------------------------------------------------------------

create policy "routine_items: read own or shared by duo partner"
  on public.routine_items for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      visible_to_partner
      and owner_id in (
        select m.user_id from public.duo_members m
        where m.duo_id = (select private.current_duo_id())
      )
    )
  );

create policy "routine_items: insert own"
  on public.routine_items for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "routine_items: update own"
  on public.routine_items for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- daily_tasks ---------------------------------------------------------------

create policy "daily_tasks: read own or shared by duo partner"
  on public.daily_tasks for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      visible_to_partner
      and owner_id in (
        select m.user_id from public.duo_members m
        where m.duo_id = (select private.current_duo_id())
      )
    )
  );

create policy "daily_tasks: insert own"
  on public.daily_tasks for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "daily_tasks: update own"
  on public.daily_tasks for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "daily_tasks: delete own"
  on public.daily_tasks for delete to authenticated
  using (owner_id = (select auth.uid()));
