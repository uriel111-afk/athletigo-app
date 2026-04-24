-- ═══════════════════════════════════════════════════════════════════
-- Life OS — Phase 5 migration (online coaching + workshops + AI seed)
-- ═══════════════════════════════════════════════════════════════════
-- Safe to re-run — every INSERT is guarded.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  coach_id UUID := '67b0093d-d4ca-4059-8572-26f020bef1eb';
BEGIN

  -- ─── Funnel rows: online coaching + workshops ─────────────────
  INSERT INTO funnel_tracking (user_id, product, stage, contact_count)
  SELECT coach_id, p, s, 0
  FROM (VALUES
    ('ליווי אונליין','awareness'),
    ('ליווי אונליין','interest'),
    ('ליווי אונליין','purchase'),
    ('סדנאות','awareness'),
    ('סדנאות','interest'),
    ('סדנאות','purchase')
  ) AS v(p, s)
  WHERE NOT EXISTS (
    SELECT 1 FROM funnel_tracking
    WHERE user_id = coach_id AND product = v.p AND stage = v.s
  );

  -- ─── Business plan: add coaching + workshops streams ──────────
  UPDATE business_plan
  SET revenue_streams = revenue_streams || '[
    {"name":"ליווי אונליין","price":500,"inventory":null,"monthly_sales":0,"potential":"30 לקוחות × 500₪ = 15,000₪/חודש"},
    {"name":"סדנאות","price":200,"inventory":null,"monthly_sales":0,"potential":"4 סדנאות × 20 משתתפים × 200₪ = 16,000₪/חודש"}
  ]'::jsonb
  WHERE user_id = coach_id
    AND NOT (revenue_streams::text LIKE '%ליווי אונליין%');

  -- ─── Mentor messages: new insights on coaching/workshops ──────
  IF NOT EXISTS (
    SELECT 1 FROM mentor_messages
    WHERE user_id = coach_id AND content LIKE '%ליווי אונליין = הכנסה חוזרת%'
  ) THEN
    INSERT INTO mentor_messages (user_id, message_type, content, action_label, priority) VALUES
      (coach_id, 'opportunity',
       'אוריאל, ליווי אונליין = הכנסה חוזרת חודשית. לקוח שנכנס לתהליך ליווי משלם כל חודש, בלי שתצטרך להיות פיזית איתו. 30 לקוחות × 500₪ = 15,000₪. תצור חבילה ותתחיל לשווק.',
       'צור חבילת ליווי', 'critical'),
      (coach_id, 'opportunity',
       'סדנה = הכנסה + חשיפה + לידים. 20 אנשים באים, מתנסים, 5 מהם קונים מוצר, 2 נרשמים לליווי. תתכנן סדנת עמידות ידיים חודשית קבועה.',
       'תכנן סדנה', 'high'),
      (coach_id, 'insight',
       'המשפך המושלם של AthletiGo: תוכן באינסטגרם → פנייה → סדנה → ליווי אונליין → קורס דיגיטלי → מוצרים. כל שלב מזין את הבא. תבנה את כל החוליות.',
       'תראה לי את המשפך', 'high');
  END IF;

  -- ─── New challenge tasks ──────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM life_os_tasks
    WHERE user_id = coach_id AND title = 'תכנן סדנת עמידות ידיים'
  ) THEN
    INSERT INTO life_os_tasks (user_id, title, description, category, priority, difficulty, status, is_challenge, xp_reward, source) VALUES
      (coach_id, 'תכנן סדנת עמידות ידיים', 'מקום, שעה, מחיר, פוסט פרסום — הכל היום', 'business', 'high',     'hard',    'pending', true, 50, 'ai_generated'),
      (coach_id, 'צור 3 חבילות ליווי אונליין', 'בסיסי / מתקדם / פרימיום — מחירים ותיאור', 'business', 'critical','medium',  'pending', true, 40, 'ai_generated'),
      (coach_id, 'צלם 3 דקות מאימון ליווי', 'הפוך לרילס שמראה איך נראה תהליך ליווי',      'content',  'high',    'medium',  'pending', true, 30, 'ai_generated');
  END IF;

END $$;
