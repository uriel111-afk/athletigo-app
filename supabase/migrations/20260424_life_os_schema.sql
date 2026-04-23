-- ═══════════════════════════════════════════════════════════════════
-- Life OS — Complete Schema Migration
-- ═══════════════════════════════════════════════════════════════════
-- Run this script in Supabase SQL Editor.
-- Safe to re-run — all statements are idempotent.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- LAYER 1: FINANCIAL
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurring_id UUID,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(user_id, category);

CREATE TABLE IF NOT EXISTS income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL NOT NULL,
  source TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT false,
  product TEXT,
  client_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_income_user_date ON income(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_income_product ON income(user_id, product);

CREATE TABLE IF NOT EXISTS recurring_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  category TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  due_day INTEGER,
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_user_active ON recurring_payments(user_id, is_active);

CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_amount DECIMAL NOT NULL,
  monthly_amount DECIMAL NOT NULL,
  total_payments INTEGER NOT NULL,
  payments_made INTEGER DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_installments_user ON installments(user_id);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  category TEXT,
  expiry_date DATE,
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_user_cat ON documents(user_id, category);

-- ─────────────────────────────────────────────────────────────────
-- LAYER 2: STRATEGY ENGINE
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS life_os_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  difficulty TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  due_date DATE,
  cycle TEXT,
  is_challenge BOOLEAN DEFAULT false,
  xp_reward INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  source TEXT DEFAULT 'ai_generated',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lifeos_tasks_user_status ON life_os_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_lifeos_tasks_challenge ON life_os_tasks(user_id, is_challenge, status);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  category TEXT,
  details JSONB,
  impact_score INTEGER,
  enjoyment_score INTEGER,
  revenue_generated DECIMAL DEFAULT 0,
  time_spent_minutes INTEGER,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_user_logged ON activity_log(user_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS business_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER DEFAULT 1,
  annual_target DECIMAL DEFAULT 10000000,
  current_monthly_revenue DECIMAL DEFAULT 0,
  required_monthly_revenue DECIMAL DEFAULT 833333,
  revenue_streams JSONB DEFAULT '[]'::jsonb,
  key_actions JSONB DEFAULT '[]'::jsonb,
  opportunities JSONB DEFAULT '[]'::jsonb,
  risks JSONB DEFAULT '[]'::jsonb,
  milestones JSONB DEFAULT '[]'::jsonb,
  ai_insights TEXT,
  last_ai_update TIMESTAMPTZ,
  period_start DATE,
  period_end DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_plan_user_status ON business_plan(user_id, status);

CREATE TABLE IF NOT EXISTS funnel_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  stage TEXT NOT NULL,
  contact_count INTEGER DEFAULT 0,
  conversion_rate DECIMAL,
  actions_needed TEXT[],
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_funnel_user_product ON funnel_tracking(user_id, product);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  summary TEXT,
  wins TEXT[],
  challenges TEXT[],
  insights TEXT[],
  next_actions TEXT[],
  revenue_this_period DECIMAL,
  ai_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_user_cycle ON reviews(user_id, cycle, period_start DESC);

CREATE TABLE IF NOT EXISTS mentor_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  action_label TEXT,
  action_data JSONB,
  is_read BOOLEAN DEFAULT false,
  is_acted_on BOOLEAN DEFAULT false,
  priority TEXT DEFAULT 'medium',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mentor_user_unread ON mentor_messages(user_id, is_read, priority);

-- ─────────────────────────────────────────────────────────────────
-- RLS — Row Level Security (user sees only their own rows)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE expenses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE income                ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_os_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_plan         ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_tracking       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_messages       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'expenses','income','recurring_payments','installments','documents',
    'life_os_tasks','activity_log','business_plan','funnel_tracking',
    'reviews','mentor_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete_own', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id)',
      t || '_select_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)',
      t || '_insert_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_update_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() = user_id)',
      t || '_delete_own', t);
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────
-- SEED: Mentor messages (only if none exist yet for the coach)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  coach_id UUID := '67b0093d-d4ca-4059-8572-26f020bef1eb';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mentor_messages WHERE user_id = coach_id) THEN
    INSERT INTO mentor_messages (user_id, message_type, content, action_label, priority) VALUES
      (coach_id, 'insight', 'אורי, יש לך 90 יחידות של Dream Machine במלאי ב-1,199₪ כל אחת. זה 107,910₪ שיושבים על המדף. אם תמכור 10 בחודש, זה כבר 12,000₪ — יותר מכפול ממה שאתה מרוויח היום. המפתח: קמפיין ממוקד באינסטגרם + 3 סרטוני הדגמה.', 'תכנן קמפיין Dream Machine', 'high'),
      (coach_id, 'challenge', 'אתגר השבוע: צור ופרסם תוכן כל יום במשך 7 ימים רצופים. לא חשוב מה — סטורי, רílow, פוסט. העקביות היא שתשנה את המשחק. 7/7 = 100 XP.', 'אני מקבל את האתגר', 'high'),
      (coach_id, 'motivation', 'רוב האנשים שמגיעים ל-10 מיליון לא עשו את זה דרך רעיון גאוני אחד. הם עשו את זה דרך עקביות מטורפת בדבר אחד. המוצרים שלך מצוינים. הבעיה היחידה היא שלא מספיק אנשים יודעים שהם קיימים. תתפוס את המצלמה.', 'תן לי רעיון לסרטון', 'medium'),
      (coach_id, 'insight', 'בוא נדבר ברמה הכי כנה: אתה מרוויח 4,000-5,000₪ בחודש. היעד הוא 833,333₪ בחודש. זה פער של ×170. אי אפשר לסגור את הפער הזה רק עם מוצרים פיזיים. אתה חייב להשיק קורסים דיגיטליים — זה המכפיל היחיד שיכול לקחת אותך לשם. קורס אחד ב-500₪ × 1,000 תלמידים = 500,000₪. זה ריאלי.', 'תעזור לי להשיק קורס', 'critical'),
      (coach_id, 'pattern', 'שמתי לב שבימים שאתה מפרסם תוכן, יש עלייה של 40% בפניות. ובימים שלא — שקט מוחלט. המסקנה פשוטה: תוכן = כסף. אין תוכן = אין כסף. אני מציע שנבנה מערכת שמבטיחה שלפחות פוסט אחד יוצא כל יום, גם ביום עמוס.', 'בנה לי מערכת תוכן יומית', 'medium'),
      (coach_id, 'opportunity', 'הזדמנות שלא ניצלת: יש לך 11 קורסים מתוכננים ואף אחד לא השיק. אם תשיק רק את הקורס הראשון — Basic Jump Rope — בחודש הקרוב, גם אם רק 20 אנשים ירשמו ב-300₪, זה 6,000₪ הכנסה פסיבית. וזה רק ההתחלה.', 'תעזור לי לבנות את הקורס', 'high'),
      (coach_id, 'motivation', 'אורי, אני רוצה שתזכור משהו: אתה בונה דבר אמיתי. לא אפליקציה, לא טרנד — מותג אמיתי שמלמד אנשים לשלוט בגוף שלהם. זה דבר שהעולם צריך. ברגעים הקשים, תזכור למה התחלת. ותמשיך. אני כאן ביחד איתך.', '', 'low'),
      (coach_id, 'insight', 'נתון חשוב: אתה מוציא כסף כל חודש על מנויים, אינטרנט, טלפון ועוד הוצאות קבועות. לפני שתתמקד רק בהכנסות, תיכנס למסך הוצאות קבועות ותמלא את כל ההוצאות הקבועות שלך. צריך לדעת בדיוק מה היציאה החודשית שלך לפני שמתכננים כניסה.', 'למלא הוצאות קבועות', 'high');
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────
-- SEED: Business plan (only if none exists yet)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  coach_id UUID := '67b0093d-d4ca-4059-8572-26f020bef1eb';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM business_plan WHERE user_id = coach_id) THEN
    INSERT INTO business_plan (
      user_id, annual_target, current_monthly_revenue, required_monthly_revenue,
      revenue_streams, opportunities, risks, milestones, status
    ) VALUES (
      coach_id, 10000000, 0, 833333,
      '[
        {"name":"Dream Machine","price":1199,"inventory":90,"monthly_sales":0,"potential":"10 יחידות/חודש = 11,990₪"},
        {"name":"Speed Rope","price":220,"inventory":10,"monthly_sales":0,"potential":"20/חודש = 4,400₪ (צריך להזמין מלאי!)"},
        {"name":"Freestyle Rope","price":159,"inventory":30,"monthly_sales":0,"potential":"15/חודש = 2,385₪"},
        {"name":"Gymnastic Rings","price":249,"inventory":18,"monthly_sales":0,"potential":"8/חודש = 1,992₪"},
        {"name":"Resistance Bands","price":200,"inventory":20,"monthly_sales":0,"potential":"10/חודש = 2,000₪"},
        {"name":"Parallettes","price":220,"inventory":20,"monthly_sales":0,"potential":"8/חודש = 1,760₪"},
        {"name":"אימון אישי","price":200,"inventory":null,"monthly_sales":0,"potential":"20 אימונים/חודש = 4,000₪"},
        {"name":"קורסים דיגיטליים","price":300,"inventory":null,"monthly_sales":0,"potential":"100 תלמידים/חודש = 30,000₪ — המכפיל הגדול"}
      ]'::jsonb,
      '[
        {"title":"השקת קורס Basic Jump Rope","impact":"high","effort":"medium","potential_revenue":6000,"description":"20 תלמידים × 300₪ = 6,000₪ הכנסה פסיבית"},
        {"title":"קמפיין אינסטגרם ממומן","impact":"high","effort":"low","potential_revenue":5000,"description":"100₪/יום × 30 יום = 3,000₪ השקעה → צפי 5,000₪ מכירות"},
        {"title":"חבילות מתנה לחגים","impact":"medium","effort":"low","potential_revenue":8000,"description":"Dream Machine + Rope במחיר חבילה"},
        {"title":"שיתוף פעולה עם חדרי כושר","impact":"high","effort":"high","potential_revenue":15000,"description":"הפצה פיזית ב-5 חדרי כושר"}
      ]'::jsonb,
      '[
        {"title":"מלאי נמוך — Speed Rope","severity":"high","mitigation":"להזמין מלאי חדש"},
        {"title":"תוכן לא עקבי","severity":"critical","mitigation":"מערכת תוכן יומית + תזכורות"},
        {"title":"אין מערכת לידים","severity":"high","mitigation":"לבנות טופס + מעקב אוטומטי"},
        {"title":"תלות באדם אחד","severity":"medium","mitigation":"אוטומציה + הכשרת מאמנים"}
      ]'::jsonb,
      '[
        {"target":10000,"label":"10K ₪/חודש","status":"in_progress","description":"שלב ראשון — הוכחת קונספט"},
        {"target":50000,"label":"50K ₪/חודש","status":"pending","description":"מוצרים + אימונים + קורס ראשון"},
        {"target":100000,"label":"100K ₪/חודש","status":"pending","description":"3 קורסים + מכירות מוצרים יציבות"},
        {"target":250000,"label":"250K ₪/חודש","status":"pending","description":"צוות + שיווק ממומן + קהילה"},
        {"target":500000,"label":"500K ₪/חודש","status":"pending","description":"הכשרת מאמנים + B2B"},
        {"target":833333,"label":"833K ₪/חודש (= 10M/שנה)","status":"pending","description":"מותג גלובלי + הכנסה פסיבית דומיננטית"}
      ]'::jsonb,
      'active'
    );
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────
-- SEED: Initial challenge tasks (only if none exist yet)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  coach_id UUID := '67b0093d-d4ca-4059-8572-26f020bef1eb';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM life_os_tasks WHERE user_id = coach_id AND is_challenge = true) THEN
    INSERT INTO life_os_tasks (user_id, title, category, difficulty, is_challenge, xp_reward, source) VALUES
      (coach_id, 'צור 3 סטוריז היום ושתף אותם',                                    'content',   'easy',    true, 10,  'seed'),
      (coach_id, 'תתקשר ל-5 אנשים שהתעניינו במוצר ולא קנו',                        'sales',     'hard',    true, 50,  'seed'),
      (coach_id, 'צלם סרטון של 60 שניות עם Dream Machine ופרסם היום',              'content',   'medium',  true, 30,  'seed'),
      (coach_id, 'שלח הצעת שיתוף פעולה לחדר כושר',                                'business',  'extreme', true, 100, 'seed'),
      (coach_id, 'תענה לכל ההודעות שלא ענית עליהן ב-24 שעות האחרונות',             'community', 'easy',    true, 15,  'seed'),
      (coach_id, 'תכתוב פוסט אישי על למה התחלת את AthletiGo',                     'content',   'hard',    true, 50,  'seed'),
      (coach_id, 'תמחיר חבילה חדשה ותפרסם אותה היום',                             'sales',     'medium',  true, 30,  'seed'),
      (coach_id, 'תייצר לפחות מכירה אחת היום, לא משנה מה',                         'sales',     'extreme', true, 100, 'seed');
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Done. Verify with:
--   SELECT COUNT(*) FROM mentor_messages WHERE user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb';
--   SELECT COUNT(*) FROM life_os_tasks   WHERE user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb';
--   SELECT COUNT(*) FROM business_plan   WHERE user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb';
-- ═══════════════════════════════════════════════════════════════════
