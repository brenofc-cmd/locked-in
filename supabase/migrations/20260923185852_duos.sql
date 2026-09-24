-- Stage 3 · duos and duo_members
--
-- Hard rules enforced by the schema itself (not by the UI):
--   * a duo has at most 2 members  -> seat in (1, 2) + unique (duo_id, seat)
--   * a user belongs to at most 1 duo -> unique (user_id)
-- Both are plain unique constraints, so concurrent joins cannot bypass them:
-- whichever insert commits second gets a unique violation.

create table public.duos (
  id uuid primary key default gen_random_uuid(),
  name text constraint duos_name_length check (char_length(name) <= 60),
  -- LKD- + 6 chars from a 31-symbol alphabet without 0/O/1/I/L (~887M codes).
  invite_code text not null
    constraint duos_invite_code_key unique
    constraint duos_invite_code_format
    check (invite_code ~ '^LKD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.duos is 'An accountability pair. Created and joined only through RPCs.';

create table public.duo_members (
  duo_id uuid not null references public.duos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seat smallint not null constraint duo_members_seat_range check (seat in (1, 2)),
  joined_at timestamptz not null default now(),
  primary key (duo_id, user_id),
  constraint duo_members_one_duo_per_user unique (user_id),
  constraint duo_members_two_seats unique (duo_id, seat)
);

comment on table public.duo_members is 'Membership. seat 1 = creator, seat 2 = partner. Max 2 per duo, 1 duo per user.';
comment on column public.duo_members.seat is 'Enforces the 2-member limit through unique (duo_id, seat).';

-- duo_members_one_duo_per_user already indexes user_id (used by every RLS check).
create index duos_created_by_idx on public.duos (created_by);
