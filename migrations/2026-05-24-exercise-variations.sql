-- Exercise Variations Library — stage 1/3
-- Per-exercise progression variations (e.g. push-ups: incline → knee → standard → diamond)
-- Managed exclusively by the AthletiGo admin. Read access for all authenticated users so
-- coaches can later pick variations inside training methods (drop sets, pyramids, etc.).

CREATE TABLE IF NOT EXISTS exercise_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  intensity_level INTEGER NOT NULL CHECK (intensity_level BETWEEN 1 AND 10),
  media_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_variations_exercise
  ON exercise_variations(exercise_id, intensity_level DESC);

ALTER TABLE exercise_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone authenticated can read" ON exercise_variations;
CREATE POLICY "anyone authenticated can read" ON exercise_variations
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "only AthletiGo admin can modify" ON exercise_variations;
CREATE POLICY "only AthletiGo admin can modify" ON exercise_variations
  FOR ALL USING (auth.uid() = '67b0093d-d4ca-4059-8572-26f020bef1eb')
  WITH CHECK (auth.uid() = '67b0093d-d4ca-4059-8572-26f020bef1eb');
