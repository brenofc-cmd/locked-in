-- Stage 8 · ending a duo tells the partner; templates cannot double-apply
--
-- leave_duo(): still one atomic statement (the duo row is deleted; members,
-- feed, reactions and challenges cascade), now preceded by a 'duo_ended'
-- broadcast on the duo channel so the partner's app leaves the duo at once.
-- Personal data (tasks, routine, focus, progress) is untouched. A later duo
-- starts empty: nothing of the old duo remains to be read.
create or replace function public.leave_duo()
returns void
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
  select m.duo_id into v_duo from public.duo_members m where m.user_id = v_uid;
  if v_duo is null then
    raise exception 'LI_NOT_IN_DUO' using errcode = 'P0001';
  end if;
  perform realtime.send(
    jsonb_build_object('actor_id', v_uid),
    'duo_ended',
    'duo:' || v_duo::text,
    true
  );
  delete from public.duos d where d.id = v_duo;
end;
$$;

-- Add routine items (a template, onboarding's first routine) in one call.
-- Items whose title matches an active routine item are skipped, and calls
-- of the same user are serialised: a double click adds everything once.
create function public.add_routine_items(
  p_titles text[],
  p_categories text[],
  p_visible boolean default true
)
returns uuid[]
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer := coalesce(array_length(p_titles, 1), 0);
  v_ids uuid[] := '{}';
  v_title text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if v_n = 0 or v_n > 20 or v_n <> coalesce(array_length(p_categories, 1), 0) then
    raise exception 'LI_INVALID_INPUT' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('add_routine_items:' || v_uid::text, 0)
  );
  for i in 1 .. v_n loop
    v_title := pg_catalog.btrim(p_titles[i]);
    if exists (
      select 1 from public.routine_items r
      where r.owner_id = v_uid
        and pg_catalog.lower(r.title) = pg_catalog.lower(v_title)
        and (r.end_date is null or r.end_date >= public.my_today())
    ) then
      continue;
    end if;
    v_id := public.create_routine_item(
      p_title => v_title,
      p_days => array[1, 2, 3, 4, 5, 6, 7]::smallint[],
      p_category => p_categories[i],
      p_visible => p_visible
    );
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end;
$$;

revoke all on function public.add_routine_items(text[], text[], boolean) from public, anon, authenticated;
grant execute on function public.add_routine_items(text[], text[], boolean) to authenticated;
