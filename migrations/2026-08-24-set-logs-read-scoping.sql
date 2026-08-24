-- ============================================================
-- exercise_set_logs — scope coach reads to the owning coach.
--
-- BEFORE (migrations/2026-05-03-exercise-set-logs.sql)
--   POLICY coach_read FOR SELECT USING (
--     EXISTS (SELECT 1 FROM users u
--             WHERE u.id = auth.uid()
--               AND u.role IN ('coach','admin')))
--   -- i.e. ANY user whose role is coach could read the per-set logs
--   -- of EVERY trainee in the system. The check never looked at who
--   -- the log actually belongs to.
--
-- AFTER
--   One SELECT policy that walks execution -> trainee -> coach and
--   admits exactly three readers:
--     (a) the trainee whose execution this is,
--     (b) the coach that trainee is actually assigned to
--         (users.coach_id — the same link AddTraineeDialog writes and
--         BaselineFormDialog filters on), and
--     (c) a user whose role is 'admin'.
--   Role alone is never sufficient for (b): a coach must be THE coach
--   on the trainee's row.
--
-- NOT TOUCHED
--   Policy `trainee_own` (FOR ALL) stays exactly as it was, so the
--   trainee's own read + write path through saveSetActual is
--   unchanged. No other table's policies are touched. No data is
--   read, written or deleted.
--
-- Idempotent: DROP ... IF EXISTS before CREATE, safe to re-run.
-- ============================================================

ALTER TABLE public.exercise_set_logs ENABLE ROW LEVEL SECURITY;

-- The over-broad policy, and this file's own policy so a re-run
-- replaces rather than fails.
DROP POLICY IF EXISTS coach_read           ON public.exercise_set_logs;
DROP POLICY IF EXISTS set_logs_read_scoped ON public.exercise_set_logs;

CREATE POLICY set_logs_read_scoped ON public.exercise_set_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_executions we
      JOIN public.users t ON t.id = we.trainee_id
      WHERE we.id = exercise_set_logs.execution_id
        AND (
          -- (a) the trainee reading their own log
          t.id = auth.uid()
          -- (b) the coach this trainee is assigned to
          OR t.coach_id = auth.uid()
          -- (c) an admin
          OR EXISTS (
               SELECT 1 FROM public.users a
               WHERE a.id = auth.uid()
                 AND a.role = 'admin'
             )
        )
    )
  );

COMMENT ON POLICY set_logs_read_scoped ON public.exercise_set_logs IS
  'Read scope: the trainee who owns the execution, that trainee''s assigned coach (users.coach_id), or an admin. Replaces coach_read, which admitted any user with role=coach.';
