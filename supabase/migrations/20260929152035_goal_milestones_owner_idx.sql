-- V2 Phase 3 · cover goal_milestones.owner_id → profiles (cascade on account deletion; advisor 0001).
create index goal_milestones_owner_idx on public.goal_milestones (owner_id);
