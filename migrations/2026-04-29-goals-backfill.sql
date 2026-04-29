-- Backfill goals.exercise_name from the closest available proxy on
-- each row. Runs AFTER 2026-04-29-goals-extension.sql has added the
-- column; idempotent — only writes rows where exercise_name is NULL.
--
-- Why this is needed
--   The new goal↔records integration matches a goal to a personal_
--   records.name via goals.exercise_name. Rows created before today
--   either pre-date the column entirely or were saved through
--   base44.create()'s column-retry path (which silently dropped the
--   field until the migration ran). All of them now hold NULL → the
--   chart can't link them to any exercise → projection lines and
--   milestone flags don't render.
--
-- Source of truth (in order of preference)
--   1. title           — the visible name in GoalFormDialog. For
--                        legacy rows this often matches the records
--                        exercise name verbatim ("עליות מתח", etc.).
--   2. goal_name       — older form field, preserved for safety
--                        even though the canonical column is title.
--   3. category        — last resort; some onboarding-driven rows
--                        only filled this. Better to surface SOMETHING
--                        than leave the goal invisible.
--
-- After running this, log into the app and check the records chart:
-- legacy active goals should now draw their projection line; achieved
-- ones should drop a 🏁 flag at completed_at.

-- 1. Primary path: copy from title.
UPDATE public.goals
SET    exercise_name = NULLIF(TRIM(title), '')
WHERE  exercise_name IS NULL
  AND  title IS NOT NULL
  AND  TRIM(title) <> '';

-- 2. Fallback: goal_name (older schema).
UPDATE public.goals
SET    exercise_name = NULLIF(TRIM(goal_name), '')
WHERE  exercise_name IS NULL
  AND  goal_name IS NOT NULL
  AND  TRIM(goal_name) <> '';

-- 3. Last-resort fallback: category. Comment-out if you'd rather
-- leave categorical goals (e.g. "ירידה במשקל") off the chart.
UPDATE public.goals
SET    exercise_name = NULLIF(TRIM(category), '')
WHERE  exercise_name IS NULL
  AND  category IS NOT NULL
  AND  TRIM(category) <> '';

-- 4. Verification (read-only). Uncomment to inspect the result:
-- SELECT id, status, title, goal_name, category, exercise_name, target_value
-- FROM   public.goals
-- ORDER  BY created_at DESC
-- LIMIT  50;

-- 5. Coverage report. Uncomment to see how many rows are still NULL:
-- SELECT COUNT(*) FILTER (WHERE exercise_name IS NULL)        AS still_null,
--        COUNT(*) FILTER (WHERE exercise_name IS NOT NULL)    AS backfilled,
--        COUNT(*)                                              AS total
-- FROM   public.goals;
