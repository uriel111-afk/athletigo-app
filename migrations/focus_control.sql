-- ═══════════════════════════════════════════════════════════════════
-- Focus Control Tower — per-node economics
-- Adds budget / cost / revenue columns to focus_nodes (branch economics).
-- Additive only; no RLS change (existing focus_nodes policy still applies).
-- Safe to run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════
alter table public.focus_nodes
  add column if not exists budget         numeric,
  add column if not exists cost_actual    numeric default 0,
  add column if not exists revenue_actual numeric default 0;
