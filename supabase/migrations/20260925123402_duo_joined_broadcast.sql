-- Stage 8 · the waiting creator learns at once that the partner joined
--
-- join_duo() is unchanged except for one 'duo_joined' broadcast on the duo
-- channel after the seat is taken (payload: actor_id only). The creator's
-- app re-renders the session; nothing else is sent.
create or replace function public.join_duo(p_code text)
returns uuid
language plpgsql
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

  perform realtime.send(
    jsonb_build_object('actor_id', v_uid),
    'duo_joined',
    'duo:' || v_duo::text,
    true
  );
  return v_duo;
end;
$$;
