-- Adds the explicit boolean column the auto-open gate now also
-- consults. Redundant with users.health_declaration_signed_at
-- (set by 2026-04-30-health-declaration-flag.sql) on purpose —
-- two independent signals keep the form from re-prompting if
-- one column write fails or is absent on a legacy row.
--
-- Backfill: any row with signed_at populated is signed.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS health_declaration_signed BOOLEAN DEFAULT false;

UPDATE public.users
   SET health_declaration_signed = true
 WHERE health_declaration_signed_at IS NOT NULL
   AND (health_declaration_signed IS NULL OR health_declaration_signed = false);

COMMENT ON COLUMN public.users.health_declaration_signed IS
  'Boolean mirror of health_declaration_signed_at. Both are written together by HealthDeclarationForm.onSigned; either being truthy suppresses the auto-open form on TraineeHome.';
