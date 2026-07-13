-- ═══════════════════════════════════════════════════════════════════
-- Privacy hardening #2 — RLS on leads + lead_interactions
-- ═══════════════════════════════════════════════════════════════════
-- These two tables hold the most sensitive CRM data (name, phone, email,
-- birth_date, injuries/medical_history, conversation summaries, sales &
-- payment fields) yet had NO row-level security defined anywhere in
-- source. This closes that gap.
--
-- OWNERSHIP MODEL (verified against the live app code — every read and
-- write goes through leads.user_id):
--   • listLeads(userId)  → .eq('user_id', userId)
--   • addLead(userId)    → inserts user_id = userId
--   • all dashboards/engines filter .eq('user_id', <auth user's id>)
--   • Dashboard + SessionFormDialog Lead.create explicitly set user_id
--   • coordinators run with userId = their OWN auth id, so their leads
--     are owned by them → they see only leads they entered.
-- So `auth.uid() = user_id` is the faithful, non-breaking policy:
--   coach/admin  → the leads they created/own
--   coordinator  → only the leads they entered
-- (There is no separately-populated "assigned coach" column in the live
--  schema; if you later want coordinator leads to roll up to a coach,
--  that needs a new coach_id column + an extra policy — a product
--  decision, intentionally NOT done here.)
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── PRE-FLIGHT (run first, review, then run the rest) ──────────────
-- Rows with a NULL owner would become invisible to everyone once RLS is
-- on. Expect 0. If > 0, backfill user_id on those rows before enabling.
--   select count(*) as orphan_leads from public.leads where user_id is null;

-- ─────────────────────────────────────────────────────────────────
-- 1) leads
-- ─────────────────────────────────────────────────────────────────
alter table public.leads enable row level security;

drop policy if exists leads_owner_all on public.leads;
create policy leads_owner_all on public.leads
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 2) lead_interactions
-- ─────────────────────────────────────────────────────────────────
-- This table was never created by any migration in source (only used
-- from lifeos-api.js). CREATE IF NOT EXISTS guarantees it exists with
-- RLS regardless of whether it was hand-made in the console. If it
-- already exists this is a no-op and won't alter existing columns.
create table if not exists public.lead_interactions (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  type       text,
  summary    text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_interactions_lead
  on public.lead_interactions (lead_id, created_at desc);

alter table public.lead_interactions enable row level security;

-- Scope every interaction to whoever owns its parent lead. Covers SELECT
-- (listInteractions) and INSERT (addInteraction, which sends only
-- lead_id/type/summary — ownership is proven via the join).
drop policy if exists lead_interactions_via_lead on public.lead_interactions;
create policy lead_interactions_via_lead on public.lead_interactions
  for all
  to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_interactions.lead_id
        and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_interactions.lead_id
        and l.user_id = auth.uid()
    )
  );
