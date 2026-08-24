-- ============================================================
-- Verification for migrations/2026-08-24-set-logs-read-scoping.sql
--
-- Run in the Supabase SQL editor AFTER applying that migration.
-- Read-only: every check runs inside BEGIN ... ROLLBACK, and the
-- only thing it writes is a transaction-local JWT claim.
--
-- How it works: the SQL editor runs as `postgres`, which bypasses
-- RLS. `SET LOCAL ROLE authenticated` drops to the role the app
-- actually uses, and set_config('request.jwt.claims', ...) is what
-- auth.uid() reads. That pair reproduces a real client session.
-- ============================================================

-- ── STEP 0 — show the current policies (run this BEFORE the
--            migration too, to capture the "before" state) ──
SELECT policyname, cmd, permissive, roles, qual AS using_expression
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'exercise_set_logs'
ORDER  BY policyname;

-- ── STEP 1 — pick the three actors, then paste their ids below ──
-- a trainee that actually has set logs, plus the coach they belong to
SELECT DISTINCT
       we.trainee_id            AS trainee_uuid,
       t.full_name              AS trainee_name,
       t.coach_id               AS owning_coach_uuid,
       count(*) OVER (PARTITION BY we.trainee_id) AS log_rows
FROM   public.exercise_set_logs l
JOIN   public.workout_executions we ON we.id = l.execution_id
JOIN   public.users t               ON t.id  = we.trainee_id
LIMIT  10;

-- some OTHER coach — one that is not the coach above
SELECT id AS other_coach_uuid, full_name, role, coach_id
FROM   public.users
WHERE  role = 'coach' OR is_coach IS TRUE
ORDER  BY created_at
LIMIT  10;


-- ── CHECK 1 — the trainee reads their own logs.  EXPECT: > 0 ──
BEGIN;
  SELECT set_config('request.jwt.claims',
                    '{"sub":"<TRAINEE_UUID>","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  SELECT 'check 1 — trainee reads own' AS "check", count(*) AS visible_rows
  FROM   public.exercise_set_logs;
ROLLBACK;


-- ── CHECK 2 — the assigned coach reads that trainee.  EXPECT: > 0,
--              and the same number as check 1 for that trainee ──
BEGIN;
  SELECT set_config('request.jwt.claims',
                    '{"sub":"<OWNING_COACH_UUID>","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  SELECT 'check 2 — owning coach reads their trainee' AS "check",
         count(*) AS visible_rows
  FROM   public.exercise_set_logs l
  JOIN   public.workout_executions we ON we.id = l.execution_id
  WHERE  we.trainee_id = '<TRAINEE_UUID>';
ROLLBACK;


-- ── CHECK 3 — a DIFFERENT coach tries the same trainee.
--              EXPECT: 0.  Anything above 0 means the fix did not
--              take, or that coach is also this trainee's coach ──
BEGIN;
  SELECT set_config('request.jwt.claims',
                    '{"sub":"<OTHER_COACH_UUID>","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  SELECT 'check 3 — foreign coach reads someone else''s trainee' AS "check",
         count(*) AS visible_rows
  FROM   public.exercise_set_logs l
  JOIN   public.workout_executions we ON we.id = l.execution_id
  WHERE  we.trainee_id = '<TRAINEE_UUID>';
ROLLBACK;


-- ── NOTE ─────────────────────────────────────────────────────
-- If a check errors with "permission denied for table
-- exercise_set_logs", that is a missing GRANT on the `authenticated`
-- role, not an RLS result — the checks above only mean something
-- when the role can reach the table at all.
