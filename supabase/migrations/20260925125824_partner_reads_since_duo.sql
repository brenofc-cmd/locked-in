-- Stage 8 · a partner reads shared tasks only from the day the duo formed
--
-- The Stage 4 policy let a duo partner read every shared daily_tasks row of
-- the other member, whatever its date — so a new partner could read, through
-- the API, a history that belongs before them. Now the partner branch starts
-- at the date the duo became complete (the second member's joined_at, in the
-- owner's calendar, like task_date itself). The owner still reads everything;
-- aggregates keep coming from the DEFINER functions (duo_weeks already hides
-- pre-duo weeks).

create function private.duo_together_since(p_owner uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (max(m.joined_at) at time zone p.timezone)::date
  from public.duo_members m
  join public.profiles p on p.id = p_owner
  where m.duo_id = private.current_duo_id()
  group by p.timezone;
$$;

revoke all on function private.duo_together_since(uuid) from public, anon, authenticated;
grant execute on function private.duo_together_since(uuid) to authenticated;

drop policy "daily_tasks: read own or shared by duo partner" on public.daily_tasks;

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
      and task_date >= private.duo_together_since(owner_id)
    )
  );
