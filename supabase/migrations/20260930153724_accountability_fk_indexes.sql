-- V2 Phase 6 · covering indexes for the new foreign keys (advisor 0001,
-- INFO). Ending a duo (set null / cascade) and deleting a user scan these.

create index checkins_duo_idx on public.checkins (duo_id);
create index nudges_duo_idx on public.nudges (duo_id);
create index commitment_sources_owner_idx on public.commitment_sources (owner_id);
create index commitment_sources_commitment_owner_idx on public.commitment_sources (commitment_id, owner_id);
drop index public.commitment_sources_task_idx;
create index commitment_sources_task_owner_idx on public.commitment_sources (daily_task_id, owner_id);
