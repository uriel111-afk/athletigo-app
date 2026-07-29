-- ═══════════════════════════════════════════════════════════════════
-- focus_weeks — the week bar's free text, one row per user per week
-- ═══════════════════════════════════════════════════════════════════
-- Backs the collapsed week bar at the top of the אישי tab:
--   focus       → "מיקוד"  (the line shown collapsed)
--   reward      → "פרס"    (revealed on expand)
--   affirmation → "משפט"   (revealed on expand)
--
-- week_start is the SUNDAY of the week, as an ISO date. The unique
-- constraint on (user_id, week_start) makes the write an upsert target,
-- so editing the same week twice never inserts a second row.
--
-- The week PERCENTAGE is not stored here — it is derived from
-- focus_executions / focus_task_logs by week-math.js and stays derived.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists focus_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  focus text,
  reward text,
  affirmation text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table focus_weeks enable row level security;

create policy focus_weeks_select on focus_weeks
  for select using (user_id = auth.uid());
create policy focus_weeks_insert on focus_weeks
  for insert with check (user_id = auth.uid());
create policy focus_weeks_update on focus_weeks
  for update using (user_id = auth.uid());
create policy focus_weeks_delete on focus_weeks
  for delete using (user_id = auth.uid());
