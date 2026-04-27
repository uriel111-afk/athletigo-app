-- ═══════════════════════════════════════════════════════════════════
-- Free-text expansion on the onboarding goals screen
-- ═══════════════════════════════════════════════════════════════════
-- After the trainee picks one or more chips on screen 1 of the
-- questionnaire, an optional textarea appears where they can
-- describe the goals in their own words ("רוצה Muscle Up תוך
-- חצי שנה, לחזק כתפיים בגלל פציעה ישנה..."). The text lands in
-- this column and surfaces in TraineeProfile's יעדים tab below
-- the chip list.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS goals_description TEXT;
