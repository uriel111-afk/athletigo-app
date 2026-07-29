-- ═══════════════════════════════════════════════════════════════════
-- focus_placements — placement becomes a real row, not two columns
-- ═══════════════════════════════════════════════════════════════════
-- Placement moves OUT of focus_nodes.task_date / focus_nodes.task_time.
-- Both columns stay in the database untouched; nothing writes them any more.
--
-- Done marks and execution counts do NOT move:
--   focus_task_logs   — still the one day mark per (node_id, log_date)
--   focus_executions  — still the history the week maths counts
--
-- There is deliberately NO unique constraint on (node_id, date): the same
-- node may be placed several times on the same day.
-- Safe to run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists focus_placements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references focus_nodes(id) on delete cascade,
  date date not null,
  start_time time not null,
  duration_minutes smallint not null default 30,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_focus_placements_user_date
  on focus_placements (user_id, date);

create index if not exists idx_focus_placements_node
  on focus_placements (node_id);

alter table focus_placements enable row level security;

create policy focus_placements_select on focus_placements
  for select using (user_id = auth.uid());
create policy focus_placements_insert on focus_placements
  for insert with check (user_id = auth.uid());
create policy focus_placements_update on focus_placements
  for update using (user_id = auth.uid());
create policy focus_placements_delete on focus_placements
  for delete using (user_id = auth.uid());

insert into focus_placements (user_id, node_id, date, start_time, duration_minutes)
select n.user_id, n.id, n.task_date, n.task_time,
       coalesce(nullif(n.net_minutes, 0), 30)
from focus_nodes n
where n.task_date is not null and n.task_time is not null;
