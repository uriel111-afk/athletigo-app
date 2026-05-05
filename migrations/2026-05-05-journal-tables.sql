-- Training journal — מחברת אימונים — three tables for free-form
-- workout entries (workouts → sections → exercises). The trainee
-- (or coach acting on their behalf) creates entries with custom
-- titles, dates, ratings, sections with names + notes, and per-
-- exercise free-text parameters. Lives next to plans/sessions
-- without coupling to either — entries don't reference a plan or
-- a session row.
--
-- RLS: owner can do anything to their own rows; coaches can read
-- (and edit, since the relationship test is via the workout's
-- user_id) any trainee's journal.

CREATE TABLE IF NOT EXISTS public.journal_workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  overall_rating NUMERIC(3,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_id UUID REFERENCES public.journal_workouts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal_exercises (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID REFERENCES public.journal_sections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parameters TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_workouts_user_date_idx
  ON public.journal_workouts (user_id, date DESC);
CREATE INDEX IF NOT EXISTS journal_sections_workout_idx
  ON public.journal_sections (workout_id, sort_order);
CREATE INDEX IF NOT EXISTS journal_exercises_section_idx
  ON public.journal_exercises (section_id, sort_order);

ALTER TABLE public.journal_workouts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_workouts_owner_all"   ON public.journal_workouts;
DROP POLICY IF EXISTS "journal_workouts_coach_read"  ON public.journal_workouts;
DROP POLICY IF EXISTS "journal_sections_via_workout" ON public.journal_sections;
DROP POLICY IF EXISTS "journal_exercises_via_section" ON public.journal_exercises;

CREATE POLICY "journal_workouts_owner_all"
  ON public.journal_workouts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal_workouts_coach_read"
  ON public.journal_workouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.role = 'coach' OR u.role = 'admin' OR u.is_coach = true)
    )
  );

CREATE POLICY "journal_sections_via_workout"
  ON public.journal_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_workouts w
      WHERE w.id = workout_id
        AND (
          w.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND (u.role = 'coach' OR u.role = 'admin' OR u.is_coach = true)
          )
        )
    )
  );

CREATE POLICY "journal_exercises_via_section"
  ON public.journal_exercises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_sections s
      JOIN public.journal_workouts w ON w.id = s.workout_id
      WHERE s.id = section_id
        AND (
          w.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND (u.role = 'coach' OR u.role = 'admin' OR u.is_coach = true)
          )
        )
    )
  );
