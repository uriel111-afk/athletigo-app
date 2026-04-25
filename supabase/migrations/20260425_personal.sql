-- ═══════════════════════════════════════════════════════════════════
-- Personal app — Wave 3
-- ═══════════════════════════════════════════════════════════════════
-- 14 tables for the coach's personal life dashboard. Every table is
-- scoped per user_id with RLS. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Daily check-in (one row per day) ─────────────────────────────
CREATE TABLE IF NOT EXISTS personal_checkin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  sleep_start TIME,
  sleep_end TIME,
  sleep_hours DECIMAL,
  trained BOOLEAN DEFAULT false,
  training_type TEXT,
  training_notes TEXT,
  nutrition_score INTEGER CHECK (nutrition_score BETWEEN 1 AND 5),
  meals_eaten INTEGER DEFAULT 0,
  cooked BOOLEAN DEFAULT false,
  learned BOOLEAN DEFAULT false,
  learned_topic TEXT,
  learn_duration_minutes INTEGER,
  meditated BOOLEAN DEFAULT false,
  meditate_duration_minutes INTEGER,
  content_created BOOLEAN DEFAULT false,
  contacted_someone BOOLEAN DEFAULT false,
  contacted_who TEXT,
  house_cleaned BOOLEAN DEFAULT false,
  house_organized BOOLEAN DEFAULT false,
  journal_entry TEXT,
  daily_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ─── Habits ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personal_habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '✅',
  category TEXT DEFAULT 'general',
  frequency TEXT DEFAULT 'daily',
  target_value TEXT,
  target_minutes INTEGER,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  streak_current INTEGER DEFAULT 0,
  streak_best INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_habit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id UUID REFERENCES personal_habits(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN DEFAULT false,
  value TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(habit_id, date)
);

-- ─── Contacts + interactions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS personal_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'friend',
  phone TEXT,
  birthday DATE,
  contact_frequency TEXT DEFAULT 'monthly',
  last_contact_date DATE,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES personal_contacts(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT DEFAULT 'call',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Goals + learning ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personal_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  target_date DATE,
  progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  subtasks JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_learning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  topic TEXT NOT NULL,
  category TEXT,
  duration_minutes INTEGER,
  key_insight TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'book',
  author TEXT,
  status TEXT DEFAULT 'want',
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  key_takeaway TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Personal training log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personal_training_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  training_type TEXT NOT NULL,
  exercises JSONB DEFAULT '[]'::jsonb,
  duration_minutes INTEGER,
  intensity INTEGER CHECK (intensity BETWEEN 1 AND 10),
  notes TEXT,
  video_url TEXT,
  personal_records JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Meals + meal plan + shopping ─────────────────────────────────
CREATE TABLE IF NOT EXISTS personal_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type TEXT NOT NULL,
  description TEXT,
  cooked_at_home BOOLEAN DEFAULT false,
  photo_url TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_meal_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_type TEXT NOT NULL,
  planned_meal TEXT NOT NULL,
  ingredients JSONB DEFAULT '[]'::jsonb,
  prep_day BOOLEAN DEFAULT false,
  portions INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_shopping_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  quantity TEXT,
  is_bought BOOLEAN DEFAULT false,
  from_meal_plan BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Household ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personal_household_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🏠',
  frequency TEXT NOT NULL DEFAULT 'daily',
  duration_minutes INTEGER DEFAULT 15,
  last_done DATE,
  next_due DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_household_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES personal_household_tasks(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN DEFAULT true,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS for all personal_* tables ────────────────────────────────
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'personal_checkin','personal_habits','personal_habit_log','personal_contacts',
    'personal_interactions','personal_goals','personal_learning_log','personal_library',
    'personal_training_log','personal_meals','personal_meal_plan','personal_shopping_list',
    'personal_household_tasks','personal_household_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete_own', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id)', t || '_select_own', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)', t || '_insert_own', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t || '_update_own', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() = user_id)', t || '_delete_own', t);
  END LOOP;
END $$;

-- ─── Seed: habits ─────────────────────────────────────────────────
DO $$
DECLARE
  coach_id UUID := '67b0093d-d4ca-4059-8572-26f020bef1eb';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM personal_habits WHERE user_id = coach_id) THEN
    INSERT INTO personal_habits (user_id, name, icon, category, frequency, target_value, target_minutes, sort_order) VALUES
      (coach_id, 'שינה 7+ שעות',         '🌙', 'health',   'daily',  '7 שעות',    NULL, 1),
      (coach_id, 'אימון',                 '🏋️', 'health',   'daily',  '1 אימון',   60,   2),
      (coach_id, 'תזונה נקייה',           '🥗', 'health',   'daily',  '3 ארוחות',  NULL, 3),
      (coach_id, 'למידה (AI/טכנולוגיה)',  '🧠', 'growth',   'daily',  '30 דקות',   30,   4),
      (coach_id, 'מדיטציה / רוגע',        '🧘', 'wellness', 'daily',  '10 דקות',   10,   5),
      (coach_id, 'יצירת תוכן',            '📸', 'business', 'daily',  '1 פוסט',    NULL, 6),
      (coach_id, 'קשר עם אדם חשוב',       '💬', 'social',   'weekly', '3 אנשים',   NULL, 7),
      (coach_id, 'סידור הבית',            '🏠', 'home',     'daily',  '15 דקות',   15,   8),
      (coach_id, 'ניקיון',                '🧹', 'home',     'daily',  '10 דקות',   10,   9);
  END IF;
END $$;

-- ─── Seed: household tasks ────────────────────────────────────────
DO $$
DECLARE
  coach_id UUID := '67b0093d-d4ca-4059-8572-26f020bef1eb';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM personal_household_tasks WHERE user_id = coach_id) THEN
    INSERT INTO personal_household_tasks (user_id, name, icon, frequency, duration_minutes) VALUES
      (coach_id, 'שטיפת כלים',           '🍽️', 'daily',         15),
      (coach_id, 'סידור הבית',           '🏠', 'daily',         15),
      (coach_id, 'ניקיון כללי',          '🧹', 'daily',         10),
      (coach_id, 'כביסה',                '👕', 'every_3_days',  30),
      (coach_id, 'קניות מכולת',          '🛒', 'weekly',        45),
      (coach_id, 'הכנת אוכל (meal prep)','🍳', 'twice_weekly',  60),
      (coach_id, 'ניקיון יסודי',         '✨', 'weekly',        45);
  END IF;
END $$;

-- ─── Seed: goals ──────────────────────────────────────────────────
DO $$
DECLARE
  coach_id UUID := '67b0093d-d4ca-4059-8572-26f020bef1eb';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM personal_goals WHERE user_id = coach_id) THEN
    INSERT INTO personal_goals (user_id, title, category, progress, subtasks, status) VALUES
      (coach_id, 'Muscle-Up מושלם', 'fitness', 0,
       '[{"title":"Pull-ups × 10","done":false},{"title":"Dips × 10","done":false},{"title":"Negative muscle-up × 5","done":false},{"title":"Kipping muscle-up","done":false},{"title":"Strict muscle-up","done":false}]'::jsonb,
       'active'),
      (coach_id, 'Handstand חופשי 30 שניות', 'fitness', 0,
       '[{"title":"Wall handstand 60s","done":false},{"title":"Chest-to-wall 30s","done":false},{"title":"Free kick-up 5s","done":false},{"title":"Free hold 15s","done":false},{"title":"Free hold 30s","done":false}]'::jsonb,
       'active'),
      (coach_id, 'Double Unders × 50 רצוף', 'fitness', 0,
       '[{"title":"Singles × 100 רצוף","done":false},{"title":"Double × 5","done":false},{"title":"Double × 10","done":false},{"title":"Double × 25","done":false},{"title":"Double × 50","done":false}]'::jsonb,
       'active'),
      (coach_id, 'שליטה ב-AI ואוטומציה', 'learning', 0,
       '[{"title":"Claude API basics","done":false},{"title":"n8n workflows מתקדמים","done":false},{"title":"Supabase Edge Functions","done":false},{"title":"Telegram Bot מתקדם","done":false}]'::jsonb,
       'active'),
      (coach_id, 'שגרת תזונה יציבה', 'health', 0,
       '[{"title":"תפריט שבועי קבוע","done":false},{"title":"הכנת אוכל 2 פעמים בשבוע","done":false},{"title":"3 ארוחות ביום ב-5/7 ימים","done":false},{"title":"חודש שלם של עקביות","done":false}]'::jsonb,
       'active');
  END IF;
END $$;
