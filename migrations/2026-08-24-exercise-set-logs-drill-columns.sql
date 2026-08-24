-- ============================================================
-- exercise_set_logs — the "2026-06" per-drill columns.
--
-- WHY THIS FILE EXISTS
--   src/lib/plannedSets.js (loadActualsForExercise /
--   loadActualsByDrillForExercise / saveSetActual) and
--   src/hooks/usePreviousSetData.js already read and write
--   drill_index, rpe_actual, rest_seconds_actual and tempo_actual,
--   and saveSetActual upserts on the FOUR-column conflict target
--   (execution_id, exercise_id, drill_index, set_number).
--   Those columns were applied by hand on Supabase and never had a
--   migration file in the repo. This file reconstructs them.
--
-- STATE ON THE LIVE DB (probed 2026-08-24 through PostgREST with the
-- anon key — a select of a missing column returns 42703, an existing
-- one returns a row set):
--   drill_index          EXISTS
--   rpe_actual           EXISTS
--   rest_seconds_actual  EXISTS
--   tempo_actual         EXISTS
--   (also present: completed, difficulty_rating, notes)
--
-- So on the live database this file is a NO-OP. It exists so a fresh
-- environment reaches the same shape. Column TYPES could not be read
-- back (the PostgREST OpenAPI endpoint requires the service_role key,
-- which is not available here) — they are reconstructed from the
-- values the app writes. If a fresh DB ever diverges from live, the
-- types below are the place to look.
--
-- Idempotent: every statement is guarded, re-running changes nothing.
-- Purely additive: no data is written, updated or deleted.
-- ============================================================

-- 1. The four columns.
--
-- drill_index — which inner exercise inside a multi-element method
-- (superset / combo / circuit / tabata) this row belongs to. 0 for
-- single-exercise methods; saveSetActual defaults it to 0. NOT NULL
-- is deliberate: the unique index below only dedupes correctly when
-- drill_index is never NULL (NULLs are distinct in a unique index,
-- so a NULL would let duplicate (execution, exercise, set) rows in
-- and break the upsert path).
ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS drill_index INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS rpe_actual NUMERIC(4,1);

ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS rest_seconds_actual INTEGER;

ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS tempo_actual TEXT;

COMMENT ON COLUMN public.exercise_set_logs.drill_index IS
  'Inner-exercise index for multi-element methods (superset / combo / circuit / tabata). 0 for single-exercise methods.';
COMMENT ON COLUMN public.exercise_set_logs.rpe_actual IS
  'Self-reported RPE for this set (scale of 10). NULL when not captured.';
COMMENT ON COLUMN public.exercise_set_logs.rest_seconds_actual IS
  'Measured rest before this set, in seconds. NULL for set 1 and for gaps the app could not measure.';
COMMENT ON COLUMN public.exercise_set_logs.tempo_actual IS
  'Tempo actually executed, free text (same shape as the planned tempo field).';

-- 2. Retire the pre-drill_index unique index, but ONLY if it is still
--    the old three-column one. A three-column unique index on
--    (execution_id, exercise_id, set_number) makes multi-element
--    methods collide: drill 0 set 1 and drill 1 set 1 are different
--    rows. If the manual migration already rebuilt this index with
--    drill_index in it, the guard leaves it alone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'exercise_set_logs'
      AND indexname  = 'exercise_set_logs_unique'
      AND indexdef NOT LIKE '%drill_index%'
  ) THEN
    EXECUTE 'DROP INDEX public.exercise_set_logs_unique';
  END IF;
END $$;

-- 3. The four-column unique index saveSetActual's onConflict targets.
--    Created only when no unique index already covers those four
--    columns, whatever it happens to be named — so this never ends up
--    duplicating an index the manual migration already made.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'exercise_set_logs'
      AND indexdef LIKE '%UNIQUE%'
      AND indexdef LIKE '%execution_id%'
      AND indexdef LIKE '%exercise_id%'
      AND indexdef LIKE '%drill_index%'
      AND indexdef LIKE '%set_number%'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX exercise_set_logs_drill_unique
               ON public.exercise_set_logs
               (execution_id, exercise_id, drill_index, set_number)';
  END IF;
END $$;
