-- 2026-07-09 — Wizard v2: prescription step
-- Persists the coordinator's recommended track (offer step).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS recommended_track text;
