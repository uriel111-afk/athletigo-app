-- ═══════════════════════════════════════════════════════════════════
-- Backfill: existing trainees → client_status = 'active'
-- ═══════════════════════════════════════════════════════════════════
-- The 20260427_casual_trainee_onboarding.sql migration added
-- users.client_status with DEFAULT 'casual'. That default is correct
-- for newly created users (the AddTraineeDialog "casual" flow), but
-- it also tagged every PRE-EXISTING trainee as casual — and casual
-- trainees get the minimal-permissions seed, hide the package
-- deduction logic, and so on.
--
-- This migration flips every existing trainee back to 'active' so
-- the live data matches reality. Brand-new trainees that come in
-- via the casual flow will explicitly write 'casual' so the gate
-- still works for them.
--
-- Safe to re-run: idempotent — it's a no-op once trainees are active.
-- ═══════════════════════════════════════════════════════════════════

UPDATE users
SET client_status = 'active'
WHERE role = 'trainee'
  AND (client_status IS NULL OR client_status = 'casual');
