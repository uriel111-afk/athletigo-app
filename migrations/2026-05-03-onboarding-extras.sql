-- Optional columns for the redesigned onboarding (PART 1 of the
-- onboarding overhaul brief). The existing onboarding flow does NOT
-- write to these yet; apply this migration only when you're ready
-- to ship the redesigned flow that collects them.
--
-- Existing columns in production (do NOT touch):
--   client_status TEXT DEFAULT 'casual'   -- onboarding/casual/active/suspended/former
--   onboarding_completed BOOLEAN
--   onboarding_completed_at TIMESTAMPTZ
--   onboarding_summary TEXT
--   health_declaration_signed_at TIMESTAMPTZ
--   gender TEXT, birth_date DATE, phone TEXT
--   height_cm INTEGER, weight_kg NUMERIC
--   training_goals TEXT[], fitness_level TEXT
--   training_preferences TEXT, current_challenges TEXT
--   referral_source TEXT, fitness_background TEXT, preferred_frequency TEXT
--
-- New columns from the spec:
--   body_fat_percent  — slider 5–40 in step 3 ("נתוני גוף")
--   weekly_days       — multi-select chips in step 6 ("ימי אימון מועדפים")

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS body_fat_percent NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS weekly_days TEXT[];

COMMENT ON COLUMN public.users.body_fat_percent IS
  'Trainee-reported approximate body fat % (5..40 from onboarding slider). NULL when unknown.';
COMMENT ON COLUMN public.users.weekly_days IS
  'Preferred training days, e.g. {sun,mon,wed,fri}. Empty array if not collected.';
