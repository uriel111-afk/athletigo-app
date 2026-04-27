-- ═══════════════════════════════════════════════════════════════════
-- Onboarding completion summary + timestamp
-- ═══════════════════════════════════════════════════════════════════
-- When a trainee finishes the questionnaire, Onboarding.handleComplete
-- generates a Hebrew narrative summary (lib/onboardingSummary.js) and
-- persists it alongside the completion timestamp. Same string the
-- coach sees in the TraineeOnboardingAlert popup; we keep it on the
-- row so the IntroTab card in TraineeProfile can render it any time
-- the coach revisits the profile.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_summary       TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at  TIMESTAMPTZ;
