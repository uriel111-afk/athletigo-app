-- ═══════════════════════════════════════════════════════════════════
-- Personal tab rebuild — STAGE 1
-- ═══════════════════════════════════════════════════════════════════
-- Additive and idempotent only: no DROP, no data rewrite, no column
-- removed, no existing default changed. Safe to run twice.
--
-- Decided against (already covered by the live schema):
--   due_date    — exists on focus_nodes since migrations/focus_map.sql
--   is_courage  — use the existing is_fear_task boolean
--   focus_goals — use metric_target / metric_current / metric_unit /
--                 cycle_start / cycle_end on the BRANCH node
--
-- New per-execution logging lives in focus_executions. focus_task_logs is
-- NOT touched: it stays the one-row-per-day done/skipped record (it is
-- UNIQUE (node_id, log_date), so it structurally cannot hold two
-- executions of one habit on one day — that is what the new table is for).
--
-- Run once in the Supabase SQL Editor. Project ref rrxcycidsojncpqlagsf.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. focus_nodes — 9 new columns ───────────────────────────────
alter table public.focus_nodes
  add column if not exists task_kind        text     default 'recurring',  -- 'recurring' | 'oneoff'
  add column if not exists measure_mode     text     default 'count',      -- 'count' (executions/week) | 'days' (distinct days)
  add column if not exists weekly_target    smallint default 1,
  add column if not exists life_impact      smallint default 3,            -- 1..5
  add column if not exists net_minutes      smallint default 30,           -- net work time, no travel
  add column if not exists defer_count      smallint default 0,
  add column if not exists first_step       text,                          -- the 10-minute opening move
  add column if not exists success_criteria text,
  add column if not exists extra_data       jsonb    default '{}'::jsonb;

-- Domain guards for the two enum-ish columns, in the same guarded style as
-- migrations/2026-07-23-personal-habit-tracker.sql. NULL passes a CHECK, and
-- ADD COLUMN ... DEFAULT backfills every existing row, so this cannot fail
-- on current data.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'focus_nodes_task_kind_chk') then
    alter table public.focus_nodes
      add constraint focus_nodes_task_kind_chk check (task_kind in ('recurring', 'oneoff'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'focus_nodes_measure_mode_chk') then
    alter table public.focus_nodes
      add constraint focus_nodes_measure_mode_chk check (measure_mode in ('count', 'days'));
  end if;
end $$;

-- ─── 2. focus_executions ──────────────────────────────────────────
-- One row per ACTUAL execution. Several rows per (node_id, day) are legal
-- and expected — that is the whole point, so there is deliberately NO
-- unique constraint on (node_id, day).
create table if not exists public.focus_executions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  node_id        uuid not null,
  bank_item_id   uuid,
  day            date not null,
  started_at     timestamptz,
  ended_at       timestamptz,
  minutes        smallint,
  what_happened  text,
  satisfaction   smallint,                    -- 1..5
  improve_next   text,
  skipped_reason text,
  custom         jsonb default '{}'::jsonb,   -- answers to focus_custom_fields
  created_at     timestamptz default now()
);

create index if not exists focus_executions_user_day_idx on public.focus_executions(user_id, day);
create index if not exists focus_executions_node_day_idx on public.focus_executions(node_id, day);

-- ─── 3. focus_modes ───────────────────────────────────────────────
create table if not exists public.focus_modes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  name          text not null,
  main_node_id  uuid,
  ramp_node_ids jsonb    default '[]'::jsonb,  -- ordered list of node ids
  sort_order    smallint default 0,
  active        boolean  default true
);

create index if not exists focus_modes_user_idx on public.focus_modes(user_id);

-- ─── 4. focus_day_state ───────────────────────────────────────────
create table if not exists public.focus_day_state (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  day            date not null,
  capacity       text     default 'full',      -- 'full' | 'busy' | 'broken'
  active_mode_id uuid,
  moves_done     smallint default 0,
  unique (user_id, day)
);

-- ─── 5. focus_custom_fields ───────────────────────────────────────
create table if not exists public.focus_custom_fields (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  label      text not null,
  field_type text     default 'text',           -- text | number | scale | date | select
  options    jsonb    default '[]'::jsonb,      -- for field_type 'select'
  sort_order smallint default 0
);

create index if not exists focus_custom_fields_user_idx on public.focus_custom_fields(user_id);

-- ─── 6. focus_capture ─────────────────────────────────────────────
create table if not exists public.focus_capture (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  line       text not null,
  sorted     boolean default false,
  created_at timestamptz default now()
);

create index if not exists focus_capture_user_unsorted_idx
  on public.focus_capture(user_id, created_at desc) where sorted = false;

-- ─── 7. RLS — owner only, on every new table ──────────────────────
-- One FOR ALL policy per table (USING + WITH CHECK on auth.uid() = user_id),
-- created only when absent so a re-run is a no-op. RLS is row-scoped, so the
-- new focus_nodes columns are already governed by that table's existing policy.
alter table public.focus_executions    enable row level security;
alter table public.focus_modes         enable row level security;
alter table public.focus_day_state     enable row level security;
alter table public.focus_custom_fields enable row level security;
alter table public.focus_capture       enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'focus_executions', 'focus_modes', 'focus_day_state',
    'focus_custom_fields', 'focus_capture'
  ]) loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = t || '_owner'
    ) then
      execute format(
        'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t || '_owner', t);
    end if;
  end loop;
end $$;

-- ─── 8. Verify (optional, read-only) ──────────────────────────────
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='focus_nodes'
--    and column_name in ('task_kind','measure_mode','weekly_target','life_impact',
--      'net_minutes','defer_count','first_step','success_criteria','extra_data')
--  order by column_name;
-- select tablename, policyname, cmd from pg_policies
--  where schemaname='public' and tablename like 'focus_%' order by tablename;
