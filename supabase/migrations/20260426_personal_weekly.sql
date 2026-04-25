-- Personal app: weekly board schema additions
--
-- 1. due_date on life_os_tasks → lets the weekly board show a task on a
--    specific day instead of "all open".
-- 2. transferred_from on life_os_tasks → when a task is moved from one
--    day to another, we keep a breadcrumb so the UI can show the
--    "הועבר מיום X" badge.
-- 3. assigned_days on personal_household_tasks → which weekdays this
--    chore appears on (0 = Sun … 6 = Sat). Empty array = derived from
--    frequency.
-- 4. personal_weekly_plan → free-form planned items (training session,
--    custom task, meal plan, chore) that the user adds while planning
--    the upcoming week from WeekPlanner.

ALTER TABLE life_os_tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE life_os_tasks ADD COLUMN IF NOT EXISTS transferred_from DATE;
CREATE INDEX IF NOT EXISTS idx_life_os_tasks_user_due
  ON life_os_tasks(user_id, due_date);

ALTER TABLE personal_household_tasks
  ADD COLUMN IF NOT EXISTS assigned_days INTEGER[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS personal_weekly_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  item_type TEXT NOT NULL,        -- training | task | meal | chore | other
  item_id UUID,                   -- optional FK into the source table
  title TEXT,
  time_slot TEXT,                 -- "07:00" / "morning" / etc.
  completed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_start, day_of_week, item_type, title)
);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_user_week
  ON personal_weekly_plan(user_id, week_start);

ALTER TABLE personal_weekly_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_personal_weekly_plan" ON personal_weekly_plan;
CREATE POLICY "select_personal_weekly_plan"
  ON personal_weekly_plan FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_personal_weekly_plan" ON personal_weekly_plan;
CREATE POLICY "insert_personal_weekly_plan"
  ON personal_weekly_plan FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_personal_weekly_plan" ON personal_weekly_plan;
CREATE POLICY "update_personal_weekly_plan"
  ON personal_weekly_plan FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_personal_weekly_plan" ON personal_weekly_plan;
CREATE POLICY "delete_personal_weekly_plan"
  ON personal_weekly_plan FOR DELETE USING (auth.uid() = user_id);

-- Seed: assign sensible default days to existing household tasks for
-- the coach. Uses pattern matches on the chore name + frequency. Any
-- task that doesn't match keeps assigned_days='{}' and the API derives
-- the day from `frequency` + `last_done`.
UPDATE personal_household_tasks
   SET assigned_days = '{0,1,2,3,4,5,6}'
 WHERE frequency = 'daily'
   AND user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
   AND (assigned_days IS NULL OR assigned_days = '{}');

UPDATE personal_household_tasks
   SET assigned_days = '{0,3}'
 WHERE frequency = 'every_3_days'
   AND user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
   AND (assigned_days IS NULL OR assigned_days = '{}');

UPDATE personal_household_tasks
   SET assigned_days = '{1}'
 WHERE name LIKE '%קניות%'
   AND user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb';

UPDATE personal_household_tasks
   SET assigned_days = '{0,3}'
 WHERE (name LIKE '%הכנת אוכל%' OR name LIKE '%בישול%')
   AND user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb';

UPDATE personal_household_tasks
   SET assigned_days = '{5}'
 WHERE (name LIKE '%יסודי%' OR name LIKE '%גדול%')
   AND user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb';
