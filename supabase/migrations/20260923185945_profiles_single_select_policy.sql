-- Stage 3 · one permissive SELECT policy on profiles (advisor 0006).
-- Same rule as before: your own profile, or your duo partner's.

drop policy "profiles: read own" on public.profiles;
drop policy "profiles: read duo partner" on public.profiles;

create policy "profiles: read own or duo partner"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.duo_members m
      where m.duo_id = (select private.current_duo_id())
    )
  );
