-- Adds coach_private_notes to public.sessions. Idempotent — safe
-- to re-run; `ADD COLUMN IF NOT EXISTS` no-ops on columns that
-- already exist. Run in Supabase SQL Editor.
--
-- Why this is a separate column from `notes` and `coach_notes`
--   • notes               — public, written by either side. Trainees
--                           see it on their session cards.
--   • coach_notes         — legacy field written by SessionFormDialog.
--                           Some installs have it, some don't.
--   • coach_private_notes — coach-only audit/strategy notes. The
--                           trainee never reads this column; the
--                           code path on the trainee side
--                           explicitly excludes it from SELECTs.
--
-- Belt and suspenders
--   The frontend filters this field out of trainee-facing queries
--   (see SESSION_FIELDS_TRAINEE in src/lib/sessionHelpers.js).
--   For an extra layer, add an RLS policy that hides the column
--   from non-coach readers — left as a follow-up since the
--   existing sessions RLS is already scoped to coach + assigned
--   trainee, and adding column-level RLS is non-trivial without
--   inspecting the current policy set.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS coach_private_notes TEXT;

COMMENT ON COLUMN public.sessions.coach_private_notes IS
  'Private notes visible only to the coach. Trainees never see this field.';
