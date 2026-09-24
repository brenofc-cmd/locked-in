-- Stage 3 · duo RPCs
--
-- Membership is never written directly by clients (no INSERT/UPDATE/DELETE
-- grants or policies). These SECURITY DEFINER functions are the only way in:
-- they act only for auth.uid(), run in one transaction and raise stable
-- error codes that the app maps to friendly messages:
--   LI_NOT_AUTHENTICATED, LI_ALREADY_IN_DUO, LI_INVALID_CODE, LI_DUO_FULL, LI_NOT_IN_DUO

-- Normalise user input: "lkd 8x29ab", "8X29AB", "LKD-8X29AB" -> "LKD-8X29AB".
create function public.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'LKD-' || regexp_replace(
    regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'),
    '^LKD', ''
  );
$$;

-- Random code from a CSPRNG (pgcrypto), rejection-sampled to avoid modulo bias.
create function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 symbols
  v_code text := '';
  v_byte int;
begin
  while char_length(v_code) < 6 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < 248 then -- 248 = 8 * 31
      v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
    end if;
  end loop;
  return 'LKD-' || v_code;
end;
$$;

-- The caller's duo id, bypassing RLS. Used by RLS policies so that the
-- duo_members policy does not recurse into itself.
create function private.current_duo_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.duo_id
  from public.duo_members m
  where m.user_id = (select auth.uid());
$$;

create function public.create_duo()
returns table (duo_id uuid, invite_code text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_duo uuid;
  v_code text;
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if exists (select 1 from public.duo_members m where m.user_id = v_uid) then
    raise exception 'LI_ALREADY_IN_DUO' using errcode = 'P0001';
  end if;

  -- Retry on the (astronomically unlikely) code collision.
  loop
    v_code := private.generate_invite_code();
    begin
      insert into public.duos (invite_code, created_by)
      values (v_code, v_uid)
      returning id into v_duo;
      exit;
    exception when unique_violation then
      -- collision on invite_code: try another
    end;
  end loop;

  begin
    insert into public.duo_members (duo_id, user_id, seat) values (v_duo, v_uid, 1);
  exception when unique_violation then
    -- Lost a race against another create/join for the same user.
    raise exception 'LI_ALREADY_IN_DUO' using errcode = 'P0001';
  end;

  return query select v_duo, v_code;
end;
$$;

create function public.join_duo(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_duo uuid;
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if exists (select 1 from public.duo_members m where m.user_id = v_uid) then
    raise exception 'LI_ALREADY_IN_DUO' using errcode = 'P0001';
  end if;

  -- Lock the duo row: concurrent joiners of the same duo queue here.
  select d.id into v_duo
  from public.duos d
  where d.invite_code = public.normalize_invite_code(p_code)
  for update;

  if v_duo is null then
    raise exception 'LI_INVALID_CODE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.duo_members m where m.duo_id = v_duo and m.seat = 2) then
    raise exception 'LI_DUO_FULL' using errcode = 'P0001';
  end if;

  begin
    insert into public.duo_members (duo_id, user_id, seat) values (v_duo, v_uid, 2);
  exception when unique_violation then
    -- Backstop for races the lock does not cover (e.g. same user, two duos).
    if exists (select 1 from public.duo_members m where m.user_id = v_uid) then
      raise exception 'LI_ALREADY_IN_DUO' using errcode = 'P0001';
    end if;
    raise exception 'LI_DUO_FULL' using errcode = 'P0001';
  end;

  return v_duo;
end;
$$;

-- V1 rule: if either member leaves, the duo ends for both (duo row deleted,
-- memberships cascade). Also how a creator cancels a duo nobody joined.
create function public.leave_duo()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_duo uuid;
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select m.duo_id into v_duo from public.duo_members m where m.user_id = v_uid;
  if v_duo is null then
    raise exception 'LI_NOT_IN_DUO' using errcode = 'P0001';
  end if;
  delete from public.duos d where d.id = v_duo;
end;
$$;

-- Execute rights: nothing for anon / public; RPCs for signed-in users only.
revoke all on function public.normalize_invite_code(text) from public, anon, authenticated;
revoke all on function private.generate_invite_code() from public, anon, authenticated;
revoke all on function private.current_duo_id() from public, anon, authenticated;
revoke all on function public.create_duo() from public, anon, authenticated;
revoke all on function public.join_duo(text) from public, anon, authenticated;
revoke all on function public.leave_duo() from public, anon, authenticated;

grant execute on function public.create_duo() to authenticated;
grant execute on function public.join_duo(text) to authenticated;
grant execute on function public.leave_duo() to authenticated;
-- Needed by RLS policies evaluated as `authenticated`. Lives in the
-- non-exposed `private` schema, so it is not callable through the Data API.
grant usage on schema private to authenticated;
grant execute on function private.current_duo_id() to authenticated;
