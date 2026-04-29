-- Run in Supabase SQL Editor.
-- Returns the live column list of public.users so we can compare
-- against what the onboarding flow actually writes (see the field
-- list at the bottom of this file) and build a precise migration
-- with ALTER TABLE ... ADD COLUMN IF NOT EXISTS for the gaps.

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- ─────────────────────────────────────────────────────────────────
-- For reference — the onboarding flow (src/pages/Onboarding.jsx)
-- writes the following fields to users via safeUpdate(buildPayload(...)).
-- The migration we'll build after you paste the SELECT output will
-- ADD COLUMN for any of these that are missing.
--
-- Step 1 (saveStep1, line 445):
--   full_name, phone, email, birth_date, address, referral_source,
--   emergency_contact_name, emergency_contact_phone, emergency_contact_relation
--
-- Step 2 (saveStep2, line 465):
--   height_cm, weight_kg, body_type, goal_body_type
--
-- Step 3 (saveStep3, line 500):
--   training_goals (array → JSONB), goals_description
--
-- Step 4 (saveStep4, line 521):
--   fitness_background, fitness_experience, preferred_frequency,
--   current_challenges (array → JSONB), challenges_description,
--   training_preferences (array → JSONB), preferences_description,
--   additional_notes
--
-- Step 5 (saveStep5PreHealth, line 554):
--   pre_health_note
--
-- Step 6 (completeOnboarding, line 578):
--   onboarding_summary, onboarding_completed_at (timestamptz),
--   client_status (text: 'onboarding' | 'casual' | 'active' |
--                  'suspended' | 'former')
-- ─────────────────────────────────────────────────────────────────
