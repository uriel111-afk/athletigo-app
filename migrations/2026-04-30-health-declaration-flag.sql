-- Fast boolean check on users table so TraineeHome doesn't need
-- to join/query health_declarations every mount.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS health_declaration_signed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.health_declaration_signed_at IS
  'Set after trainee signs health declaration. Avoids re-querying health_declarations table.';

-- Also ensure onboarding_completed boolean exists alongside _at
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.users.onboarding_completed IS
  'Belt-and-suspenders: true when onboarding flow completes. Checked alongside onboarding_completed_at.';
