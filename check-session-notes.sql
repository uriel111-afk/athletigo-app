-- Run in Supabase SQL Editor; the migration alongside this file
-- is idempotent (`ADD COLUMN IF NOT EXISTS`) so it's safe to run
-- without first inspecting the output. This diagnostic exists so
-- you can confirm the column landed where you expected, and see
-- which note columns already live on the row.
--
-- Why three names show up
--   • notes               — the canonical public note. Visible to
--                           both coach and trainee.
--   • coach_notes         — legacy coach textarea written by
--                           SessionFormDialog. Some installs
--                           inherited this column; others didn't.
--   • coach_private_notes — the NEW field added by the migration.
--                           Coach-only by code-level field
--                           filtering on the trainee SELECT path.

SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'sessions'
  AND  column_name IN ('notes', 'coach_notes', 'coach_private_notes')
ORDER  BY column_name;
