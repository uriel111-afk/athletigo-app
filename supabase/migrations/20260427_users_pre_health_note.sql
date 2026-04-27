-- ═══════════════════════════════════════════════════════════════════
-- Pre-health soft-handoff note
-- ═══════════════════════════════════════════════════════════════════
-- Free-text answer captured on the new "לפני שמתחילים" screen that
-- bridges the onboarding questionnaire and the formal health
-- declaration. Trainees describe in their own words any pain,
-- injury or limitation we should know about ("כאבי גב תחתון",
-- "פציעת ברך ישנה", or "הכל תקין"). Surfaces in TraineeProfile's
-- "היכרות" tab.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pre_health_note TEXT;
