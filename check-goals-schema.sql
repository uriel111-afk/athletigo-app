-- Run in Supabase SQL Editor.
-- Returns the live column lists for the three tables we'll touch
-- when wiring goals into the records chart. After you paste the
-- output back I'll build a precise migration with ADD COLUMN
-- IF NOT EXISTS for any gaps (target_date, achieved_at,
-- starting_value, etc.).

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('goals', 'goal_progress', 'personal_records')
ORDER BY table_name, ordinal_position;

-- ─────────────────────────────────────────────────────────────────
-- For reference — what the code expects each table to carry.
--
-- goal_progress (used today by TraineeProfile.jsx + Progress.jsx):
--   id, trainee_id, exercise_name (text), goal_name (text),
--   value (numeric), target_value (numeric), unit (text),
--   progress (numeric — percent 0..100), date (date),
--   created_at (timestamptz)
--
-- goals (the user's spec asked about this — may not exist yet;
-- if not, we'll either add columns to goal_progress or create
-- the table from scratch via migration):
--   id, trainee_id, exercise_id / exercise_name, exercise_type
--     (reps / time / weight / distance),
--   starting_value (numeric), target_value (numeric),
--   target_date (date, nullable),
--   status (text — 'active' | 'achieved' | 'cancelled'),
--   achieved_at (timestamptz, nullable),
--   created_at (timestamptz)
--
-- personal_records (used today, schema confirmed earlier):
--   id, trainee_id, coach_id, name, value (numeric), unit, date,
--   record_type, exercise_category, notes, video_url, rpe,
--   quality_rating, technique_acquired, technique_name,
--   is_personal_best, previous_value, improvement,
--   created_by_role, created_by_user_id, status, deleted_at,
--   created_at
-- ─────────────────────────────────────────────────────────────────
