-- 2026-07-09 — Wave 1.1: intake wizard refinement columns
--
-- Adds past-framework context (step 6) and call-energy read (step 9).
-- Purely additive (ADD COLUMN IF NOT EXISTS) — safe to re-run, no data loss.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS past_framework      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS past_framework_gap  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS call_energy         text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS energy_drop_note    text;
