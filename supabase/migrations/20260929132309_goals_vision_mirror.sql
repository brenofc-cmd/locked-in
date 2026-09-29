-- V2 Phase 3 · goals, vision and the accountability mirror (ADR-058, docs/GOALS.md).
--
-- Direction, not daily execution. Everything here is PRIVATE to its owner:
-- no partner policy, no sharing column, no broadcast, no DEFINER function.
-- Ownership of links is enforced by composite foreign keys, so a goal can only
-- point at the owner's own vision and a milestone only lives in the owner's
-- own goal (IDOR is impossible by construction, as for daily_tasks → routine).

-- ------------------------------------------------------------ vision ----
create table public.vision_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  title text not null
    constraint vision_items_title_length check (char_length(btrim(title)) between 1 and 120),
  description text
    constraint vision_items_description_length check (description is null or char_length(description) <= 1000),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vision_items_id_owner_key unique (id, owner_id)
);

comment on table public.vision_items is
  'Life directions (V2 Phase 3). Owner-only; no checkbox, no percentage, never shared (ADR-058).';

create index vision_items_owner_idx on public.vision_items (owner_id, is_archived, sort_order);

-- ------------------------------------------------------------- goals ----
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  vision_id uuid,
  title text not null
    constraint goals_title_length check (char_length(btrim(title)) between 1 and 120),
  description text
    constraint goals_description_length check (description is null or char_length(description) <= 1000),
  goal_type text not null
    constraint goals_type check (goal_type in ('long_term', '90_day', 'monthly')),
  target_date date
    constraint goals_target_date_range check (target_date is null or target_date between date '2000-01-01' and date '2100-12-31'),
  status text not null default 'active'
    constraint goals_status check (status in ('active', 'achieved', 'archived')),
  achieved_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_id_owner_key unique (id, owner_id),
  -- The vision must be the owner's; deleting it only clears the link.
  constraint goals_vision_same_owner_fkey foreign key (vision_id, owner_id)
    references public.vision_items (id, owner_id) on delete set null (vision_id)
);

comment on table public.goals is
  'Goals: long_term / 90_day / monthly; active / achieved / archived (V2 Phase 3). Owner-only; no manual percentage (ADR-058).';

create index goals_owner_idx on public.goals (owner_id, status, goal_type);
create index goals_vision_idx on public.goals (vision_id, owner_id);

-- achieved_at belongs to the database: set when a goal becomes achieved,
-- cleared when it becomes active again, kept when an achieved goal is archived.
create function private.stamp_goal_achieved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'achieved' then
    if tg_op = 'INSERT' or old.status is distinct from 'achieved' then
      new.achieved_at := now();
    else
      new.achieved_at := old.achieved_at;
    end if;
  elsif new.status = 'active' then
    new.achieved_at := null;
  elsif tg_op = 'UPDATE' then
    new.achieved_at := old.achieved_at;
  else
    new.achieved_at := null;
  end if;
  return new;
end;
$$;

create trigger goals_stamp_achieved
  before insert or update on public.goals
  for each row execute function private.stamp_goal_achieved();

-- -------------------------------------------------------- milestones ----
create table public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  title text not null
    constraint goal_milestones_title_length check (char_length(btrim(title)) between 1 and 120),
  is_completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A milestone lives only in one of its owner's goals.
  constraint goal_milestones_goal_same_owner_fkey foreign key (goal_id, owner_id)
    references public.goals (id, owner_id) on delete cascade
);

comment on table public.goal_milestones is
  'Simple checkpoints of a goal (V2 Phase 3). Owner-only; not a daily task list.';

create index goal_milestones_goal_idx on public.goal_milestones (goal_id, owner_id, sort_order);

-- ------------------------------------------------------------ mirror ----
create table public.accountability_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  text text not null
    constraint accountability_items_text_length check (char_length(btrim(text)) between 1 and 300),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.accountability_items is
  'The accountability mirror: truths the owner needs to face (V2 Phase 3). Owner-only, never shared.';

create index accountability_items_owner_idx on public.accountability_items (owner_id, is_active, sort_order);

-- ----------------------------------------------------------- updated_at ----
create trigger vision_items_set_updated_at before update on public.vision_items
  for each row execute function private.set_updated_at();
create trigger goals_set_updated_at before update on public.goals
  for each row execute function private.set_updated_at();
create trigger goal_milestones_set_updated_at before update on public.goal_milestones
  for each row execute function private.set_updated_at();
create trigger accountability_items_set_updated_at before update on public.accountability_items
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------ RLS and grants ----
-- owner_id is never granted: it defaults to auth.uid() and cannot be
-- spoofed or moved. Every policy is "owner only"; the partner, an outsider
-- and anon get nothing.
alter table public.vision_items enable row level security;
alter table public.goals enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.accountability_items enable row level security;

revoke all on table public.vision_items, public.goals, public.goal_milestones,
  public.accountability_items from anon, authenticated;

grant select, delete on table public.vision_items, public.goals, public.goal_milestones,
  public.accountability_items to authenticated;
grant insert (title, description, sort_order, is_archived),
      update (title, description, sort_order, is_archived)
  on table public.vision_items to authenticated;
grant insert (vision_id, title, description, goal_type, target_date, status, sort_order),
      update (vision_id, title, description, goal_type, target_date, status, sort_order)
  on table public.goals to authenticated;
grant insert (goal_id, title, is_completed, sort_order),
      update (title, is_completed, sort_order)
  on table public.goal_milestones to authenticated;
grant insert (text, is_active, sort_order),
      update (text, is_active, sort_order)
  on table public.accountability_items to authenticated;

create policy "vision_items: owner only" on public.vision_items for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "goals: owner only" on public.goals for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "goal_milestones: owner only" on public.goal_milestones for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "accountability_items: owner only" on public.accountability_items for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on function private.stamp_goal_achieved() from public, anon, authenticated;
