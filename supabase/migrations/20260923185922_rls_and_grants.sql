-- Stage 3 · RLS and grants
--
-- Principle: grants say WHICH operations a role may attempt, policies say
-- WHICH ROWS. anon gets nothing. authenticated gets SELECT on the three
-- tables and UPDATE on three profile columns. Writes to duos / duo_members
-- happen only through the RPCs in 20260923185918_duo_functions.sql.

alter table public.profiles enable row level security;
alter table public.duos enable row level security;
alter table public.duo_members enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.duos from anon, authenticated;
revoke all on table public.duo_members from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, timezone) on table public.profiles to authenticated;
grant select on table public.duos to authenticated;
grant select on table public.duo_members to authenticated;

-- profiles -----------------------------------------------------------------

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: read duo partner"
  on public.profiles for select to authenticated
  using (
    id in (
      select m.user_id from public.duo_members m
      where m.duo_id = (select private.current_duo_id())
    )
  );

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- duos ---------------------------------------------------------------------

create policy "duos: read own duo"
  on public.duos for select to authenticated
  using (id = (select private.current_duo_id()));

-- duo_members --------------------------------------------------------------

create policy "duo_members: read own duo"
  on public.duo_members for select to authenticated
  using (duo_id = (select private.current_duo_id()));
