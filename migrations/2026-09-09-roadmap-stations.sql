-- Roadmap stations — an ordered ladder of thresholds on ONE
-- exercise for ONE trainee. The last station by sort_order IS the
-- goal; there is no separate goals row involved anywhere here.
--
-- exercise_name is the same free-text key personal_records.name and
-- goals.exercise_name already use. There is no id link on the
-- records side, so matching is by NORMALIZED name — trim, lowercase,
-- collapse whitespace — the same rule normalizeExerciseName applies
-- in JS. ag_norm_exercise_name() below is that rule in SQL, so the
-- two can never drift.
--
-- WRITES ARE COACH-ONLY. A trainee never writes a station: not the
-- threshold, not the clear. The clear is stamped server-side by the
-- triggers at the bottom, which run SECURITY DEFINER and therefore
-- bypass RLS — a trainee's own personal_records insert stamps their
-- station without the trainee holding any write grant on this table.
--
-- Review before running in the Supabase SQL editor.

-- ── The shared normalizer ────────────────────────────────────────
-- Mirrors src/lib (normalizeExerciseName): (name || '').trim()
--   .toLowerCase().replace(/\s+/g, ' ')
CREATE OR REPLACE FUNCTION public.ag_norm_exercise_name(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(txt, '')), '\s+', ' ', 'g'));
$$;

-- ── The table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roadmap_stations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id      uuid REFERENCES auth.users(id),
  exercise_name text NOT NULL,
  label         text NOT NULL,
  threshold     numeric NOT NULL,
  unit          text,
  sort_order    integer NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'planned',
  reached_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.roadmap_stations.exercise_name IS
  'Free-text key matching personal_records.name, compared through
   ag_norm_exercise_name() / normalizeExerciseName in JS.';
COMMENT ON COLUMN public.roadmap_stations.status IS
  'planned | reached. Set server-side by the trigger pair below;
   never written by a trainee.';
COMMENT ON COLUMN public.roadmap_stations.coach_id IS
  'The author. REQUIRED in practice: the coach_manage_stations
   policy keys on it, so a NULL leaves the row unwritable.';

CREATE INDEX IF NOT EXISTS idx_roadmap_trainee_exercise
  ON public.roadmap_stations (trainee_id, exercise_name, sort_order);

-- The lookup the trigger makes, on the normalized key.
CREATE INDEX IF NOT EXISTS idx_roadmap_trainee_norm_name
  ON public.roadmap_stations
     (trainee_id, public.ag_norm_exercise_name(exercise_name));

-- ── RLS: coach writes, trainee reads ─────────────────────────────
ALTER TABLE public.roadmap_stations ENABLE ROW LEVEL SECURITY;

-- Mirrors add_personal_records_v2.sql, the table this one measures
-- against.
DROP POLICY IF EXISTS "coach_manage_stations" ON public.roadmap_stations;
CREATE POLICY "coach_manage_stations" ON public.roadmap_stations
  FOR ALL USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

DROP POLICY IF EXISTS "trainee_view_own_stations" ON public.roadmap_stations;
CREATE POLICY "trainee_view_own_stations" ON public.roadmap_stations
  FOR SELECT USING (auth.uid() = trainee_id);

-- Deliberately NO trainee write policy. See the header.

-- ── The clear, stamped server-side ───────────────────────────────
-- A new or edited personal record clears every planned station of
-- that trainee+exercise whose threshold it reaches. SECURITY
-- DEFINER so it runs as the function owner and is not blocked by
-- the coach-only policy above.
CREATE OR REPLACE FUNCTION public.ag_clear_roadmap_stations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A soft-deleted record clears nothing.
  IF NEW.status IS NOT DISTINCT FROM 'deleted' THEN
    RETURN NEW;
  END IF;
  IF NEW.value IS NULL OR NEW.trainee_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.roadmap_stations s
     SET status     = 'reached',
         reached_at = COALESCE(NEW.date::timestamptz, now())
   WHERE s.trainee_id = NEW.trainee_id
     AND s.status = 'planned'
     AND s.reached_at IS NULL
     AND s.threshold <= NEW.value
     AND public.ag_norm_exercise_name(s.exercise_name)
       = public.ag_norm_exercise_name(NEW.name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_roadmap_stations ON public.personal_records;
CREATE TRIGGER trg_clear_roadmap_stations
  AFTER INSERT OR UPDATE OF value, status ON public.personal_records
  FOR EACH ROW EXECUTE FUNCTION public.ag_clear_roadmap_stations();

-- The other direction: a station the coach adds BELOW the trainee's
-- existing PB is already cleared the moment it is created, and no
-- records write is coming to notice that. Stamp it on the way in.
CREATE OR REPLACE FUNCTION public.ag_stamp_station_if_already_cleared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pb numeric;
BEGIN
  IF NEW.status IS DISTINCT FROM 'planned' OR NEW.reached_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT max(r.value) INTO pb
    FROM public.personal_records r
   WHERE r.trainee_id = NEW.trainee_id
     AND (r.status IS NULL OR r.status <> 'deleted')
     AND public.ag_norm_exercise_name(r.name)
       = public.ag_norm_exercise_name(NEW.exercise_name);

  IF pb IS NOT NULL AND pb >= NEW.threshold THEN
    NEW.status     := 'reached';
    NEW.reached_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_station_if_already_cleared
  ON public.roadmap_stations;
CREATE TRIGGER trg_stamp_station_if_already_cleared
  BEFORE INSERT OR UPDATE OF threshold, exercise_name
  ON public.roadmap_stations
  FOR EACH ROW EXECUTE FUNCTION public.ag_stamp_station_if_already_cleared();
