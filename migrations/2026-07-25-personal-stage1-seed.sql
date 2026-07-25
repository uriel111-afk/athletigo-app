-- ═══════════════════════════════════════════════════════════════════
-- Personal tab rebuild — STAGE 1 SEED  (delete the old tree, seed the new)
-- ═══════════════════════════════════════════════════════════════════
-- RUN migrations/2026-07-25-personal-stage1.sql FIRST — this script writes the
-- columns it adds (task_kind, measure_mode, weekly_target, life_impact,
-- net_minutes, extra_data) and the focus_modes table.
--
-- The WHOLE script is one DO block = ONE statement = one implicit transaction.
-- The safety gate therefore protects everything: if any node in scope has even
-- one focus_task_logs (or focus_executions) row, it RAISES and NOTHING is
-- deleted or inserted.
--
-- What it does, in order:
--   1. locate the 'החיים שלי' arm; abort if missing
--   2. skip entirely if extra_data.stage1_seeded is already true (re-run safe)
--   3. count logs for every branch under the arm + all descendants → abort if >0
--   4. delete those branches (cascade takes their habits; the inspiration
--      container is node_type='task' under the arm, so it is NOT in scope)
--   5. seed 6 branches (goal on the branch: metric_target/unit/cycle_*),
--      22 habits, 68 bank items, 3 modes
--   6. mark the arm extra_data.stage1_seeded = true
--
-- Every habit is written frequency='daily' + tags ['לוח', 'w:<weekly_target>']
-- so the EXISTING matrix renders all 22 rows with correct weekly-N maths and
-- needs no changes. Bank items keep the existing 'בנק' tag and no frequency.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_user  uuid := '67b0093d-d4ca-4059-8572-26f020bef1eb';
  v_arm   uuid;
  v_logs  bigint := 0;
  v_execs bigint := 0;
  v_del   bigint;
  v_b     bigint;
  v_h     bigint;
  v_k     bigint;
  v_m     bigint;
  v_cyc_s date := '2026-07-25';
  v_cyc_e date := '2026-10-23';
  v_id    uuid;
begin
  -- ── 1. the personal arm ─────────────────────────────────────────
  select id into v_arm
    from public.focus_nodes
   where user_id = v_user and title = 'החיים שלי' and node_type <> 'task'
   order by created_at
   limit 1;
  if v_arm is null then
    raise exception 'ABORT: personal arm (החיים שלי) not found for user %', v_user;
  end if;

  -- ── 2. already seeded? ──────────────────────────────────────────
  if coalesce((select extra_data->>'stage1_seeded' from public.focus_nodes where id = v_arm), 'false') = 'true' then
    raise notice 'Stage 1 already seeded (extra_data.stage1_seeded = true) — nothing to do.';
    return;
  end if;

  -- ── 3. SAFETY GATE — zero history required ───────────────────────
  with recursive scope as (
    select n.id
      from public.focus_nodes n
     where n.user_id = v_user and n.parent_id = v_arm and n.node_type <> 'task'
    union all
    select c.id
      from public.focus_nodes c
      join scope s on c.parent_id = s.id
  )
  select count(*) into v_logs
    from public.focus_task_logs l
   where l.node_id in (select id from scope);

  if to_regclass('public.focus_executions') is not null then
    with recursive scope as (
      select n.id
        from public.focus_nodes n
       where n.user_id = v_user and n.parent_id = v_arm and n.node_type <> 'task'
      union all
      select c.id
        from public.focus_nodes c
        join scope s on c.parent_id = s.id
    )
    select count(*) into v_execs
      from public.focus_executions e
     where e.node_id in (select id from scope);
  end if;

  if v_logs > 0 or v_execs > 0 then
    raise exception
      'ABORT: history exists under the branches in scope (% focus_task_logs row(s), % focus_executions row(s)). Nothing deleted, nothing seeded.',
      v_logs, v_execs;
  end if;
  raise notice 'Safety gate passed: 0 focus_task_logs and 0 focus_executions rows in scope.';

  -- ── 4. delete the old tree (branches only; cascade takes children) ──
  with doomed as (
    delete from public.focus_nodes
     where user_id = v_user and parent_id = v_arm and node_type <> 'task'
     returning 1
  )
  select count(*) into v_del from doomed;
  raise notice 'Deleted % branch(es) under the arm (their habits went with the cascade).', v_del;

  -- ── 5a. six branches, goal fields on the branch node ─────────────
  insert into public.focus_nodes (
    user_id, parent_id, node_type, title, note,
    metric_target, metric_unit, metric_current, cycle_start, cycle_end, sort_order)
  select v_user, v_arm, 'branch', b.title, b.goal,
         b.target, b.unit, 0, v_cyc_s, v_cyc_e, b.ord
    from (values
      ('גוף',          '65 אימונים במחזור',              65, 'אימונים', 10),
      ('יצירה',        '36 סרטונים שפורסמו במחזור',      36, 'סרטונים', 20),
      ('יוזמה ומכירה', '65 שיחות עם לידים במחזור',       65, 'שיחות',   30),
      ('בית',          'שישה ימי סדר בשבוע',              6, 'ימים',    40),
      ('חברה ומשפחה',  'חמישה אנשים בקשר בכל שבוע',       5, 'אנשים',   50),
      ('נפש ולמידה',   '45 שעות תרגול מצטברות במחזור',   45, 'שעות',    60)
    ) as b(title, goal, target, unit, ord);
  get diagnostics v_b = row_count;

  -- ── 5b. 22 habits ────────────────────────────────────────────────
  insert into public.focus_nodes (
    user_id, parent_id, node_type, title, frequency, tags,
    task_kind, measure_mode, weekly_target, life_impact, net_minutes, sort_order)
  select v_user, br.id, 'task', h.title, 'daily',
         array['לוח', 'w:' || h.wtarget::text],
         'recurring', h.mode, h.wtarget, h.impact, h.minutes, h.ord
    from (values
      -- branch,          habit,                 mode,    target, impact, net_min, ord
      ('גוף',          'אימון כוח',            'count',  5, 4, 60, 10),
      ('גוף',          'אימון סיבולת',         'count',  2, 3, 30, 20),
      ('גוף',          'שינה שבע שעות',        'days',   5, 5,  0, 30),
      ('גוף',          'תזונה',                'days',   6, 4, 20, 40),
      ('יצירה',        'צילום תוכן',           'count',  3, 4, 45, 10),
      ('יצירה',        'עריכה ופרסום',         'count',  3, 4, 60, 20),
      ('יצירה',        'כתיבת תסריט',          'count',  2, 3, 30, 30),
      ('יצירה',        'בניית מוצר',           'count',  2, 4, 60, 40),
      ('יוזמה ומכירה', 'שיחות עם לידים',       'count',  5, 5, 15, 10),
      ('יוזמה ומכירה', 'פנייה יזומה',          'count',  2, 4, 15, 20),
      ('יוזמה ומכירה', 'סגירה',                'count',  1, 5, 20, 30),
      ('יוזמה ומכירה', 'בקשת הפניה',           'count',  1, 3, 10, 40),
      ('בית',          'סדר וניקיון',          'days',   6, 2, 20, 10),
      ('בית',          'קניות',                'count',  1, 2, 45, 20),
      ('בית',          'כביסה',                'count',  2, 2, 15, 30),
      ('בית',          'תחזוקה',               'count',  1, 2, 30, 40),
      ('חברה ומשפחה',  'קשר יזום',             'count',  5, 3, 15, 10),
      ('חברה ומשפחה',  'מפגש פנים אל פנים',    'count',  1, 4, 90, 20),
      ('נפש ולמידה',   'תפילה',                'days',   7, 4, 15, 10),
      ('נפש ולמידה',   'תרגול שפה',            'count',  5, 3, 30, 20),
      ('נפש ולמידה',   'תרגול מוזיקה',         'count',  5, 3, 30, 30),
      ('נפש ולמידה',   'זמן שקט',              'count',  3, 3, 30, 40)
    ) as h(branch, title, mode, wtarget, impact, minutes, ord)
    join public.focus_nodes br
      on br.user_id = v_user and br.parent_id = v_arm
     and br.node_type = 'branch' and br.title = h.branch;
  get diagnostics v_h = row_count;

  -- ── 5c. 68 bank items (children of their habit, 'בנק' tag) ───────
  insert into public.focus_nodes (user_id, parent_id, node_type, title, tags, sort_order)
  select v_user, hb.id, 'task', k.title, array['בנק'], k.ord
    from (values
      ('אימון כוח',         'אימון דחיפה',                        10),
      ('אימון כוח',         'אימון משיכה',                        20),
      ('אימון כוח',         'אימון רגליים',                       30),
      ('אימון כוח',         'אימון טבעות',                        40),
      ('אימון כוח',         'אימון גוף מלא קצר',                  50),
      ('אימון סיבולת',      'חבל קפיצה',                          10),
      ('אימון סיבולת',      'ריצה',                               20),
      ('אימון סיבולת',      'אינטרוולים קצרים',                   30),
      ('תזונה',             'הכנת אוכל למחר',                     10),
      ('תזונה',             'סגירת חלבון יומית',                  20),
      ('תזונה',             'ארוחה מסודרת בבית',                  30),
      ('צילום תוכן',        'הדגמת תרגיל',                        10),
      ('צילום תוכן',        'דיבור למצלמה',                       20),
      ('צילום תוכן',        'צילום מוצר',                         30),
      ('צילום תוכן',        'סרטון לפני ואחרי',                   40),
      ('עריכה ופרסום',      'עריכת סרטון',                        10),
      ('עריכה ופרסום',      'כתיבת כיתוב',                        20),
      ('עריכה ופרסום',      'פרסום באינסטגרם',                    30),
      ('עריכה ופרסום',      'פרסום בטיקטוק',                      40),
      ('כתיבת תסריט',       'פתיח מפתיע',                         10),
      ('כתיבת תסריט',       'רשימת נקודות',                       20),
      ('כתיבת תסריט',       'מבנה שלב אחר שלב',                   30),
      ('בניית מוצר',        'כתיבת פרק בקורס',                    10),
      ('בניית מוצר',        'הקלטת שיעור',                        20),
      ('בניית מוצר',        'בניית דף מכירה',                     30),
      ('בניית מוצר',        'תמחור הצעה חדשה',                    40),
      ('שיחות עם לידים',    'שיחה עם ליד חדש',                    10),
      ('שיחות עם לידים',    'מעקב אחרי ליד ישן',                  20),
      ('שיחות עם לידים',    'החזרת שיחה שלא נענתה',               30),
      ('שיחות עם לידים',    'שליחת הצעה',                         40),
      ('פנייה יזומה',       'פנייה לחנות ספורט',                  10),
      ('פנייה יזומה',       'שיחה עם מאמן להצטרפות לרשת',         20),
      ('פנייה יזומה',       'פנייה למרצה או מכון הכשרה',          30),
      ('פנייה יזומה',       'פנייה למקום לקבוצה חדשה',            40),
      ('סגירה',             'שיחת סגירה',                         10),
      ('סגירה',             'שליחת קישור תשלום',                  20),
      ('סגירה',             'קליטת מתאמן חדש',                    30),
      ('בקשת הפניה',        'בקשה ממתאמן מרוצה',                  10),
      ('בקשת הפניה',        'בקשה ממישהו שסיים תהליך',            20),
      ('סדר וניקיון',       'סידור הסלון',                        10),
      ('סדר וניקיון',       'מטבח וכלים',                         20),
      ('סדר וניקיון',       'שטיפת רצפה',                         30),
      ('סדר וניקיון',       'חדר שינה',                           40),
      ('סדר וניקיון',       'סידור המחסן',                        50),
      ('קניות',             'קנייה שבועית',                       10),
      ('קניות',             'השלמות',                             20),
      ('קניות',             'הזמנה אונליין',                      30),
      ('כביסה',             'הפעלת כביסה',                        10),
      ('כביסה',             'קיפול וסידור',                       20),
      ('תחזוקה',            'תיקון קטן',                          10),
      ('תחזוקה',            'טיפול בגינה',                        20),
      ('תחזוקה',            'החזרת ציוד למקום',                   30),
      ('קשר יזום',          'שיחה עם חבר',                        10),
      ('קשר יזום',          'שיחה עם בן משפחה',                   20),
      ('קשר יזום',          'הודעת יום הולדת',                    30),
      ('קשר יזום',          'הודעה למישהו שלא דיברתי איתו מזמן',  40),
      ('מפגש פנים אל פנים', 'קפה עם חבר',                         10),
      ('מפגש פנים אל פנים', 'ארוחה משפחתית',                      20),
      ('מפגש פנים אל פנים', 'הגעה לאירוע',                        30),
      ('תרגול שפה',         'שלושים דקות תרגול',                  10),
      ('תרגול שפה',         'שיחה',                               20),
      ('תרגול שפה',         'אוצר מילים',                         30),
      ('תרגול מוזיקה',      'שלושים דקות נגינה',                  10),
      ('תרגול מוזיקה',      'שיר חדש',                            20),
      ('תרגול מוזיקה',      'תרגיל טכניקה',                       30),
      ('זמן שקט',           'קריאה',                              10),
      ('זמן שקט',           'הליכה בלי טלפון',                    20),
      ('זמן שקט',           'כתיבה אישית',                        30)
    ) as k(habit, title, ord)
    join public.focus_nodes hb
      on hb.user_id = v_user and hb.node_type = 'task' and hb.title = k.habit
     and hb.parent_id in (
       select id from public.focus_nodes
        where user_id = v_user and parent_id = v_arm and node_type = 'branch');
  get diagnostics v_k = row_count;

  -- ── 5d. three modes ──────────────────────────────────────────────
  -- Ramp/main names resolve to TASK nodes inside this arm only, and never to an
  -- inspiration item, so 'תפילה' can only be the habit.
  insert into public.focus_modes (user_id, name, main_node_id, ramp_node_ids, sort_order, active)
  select v_user, m.name,
         (select n.id from public.focus_nodes n
           where n.user_id = v_user and n.node_type = 'task' and n.title = m.main
             and not (n.tags && array['השראה']) limit 1),
         (select coalesce(jsonb_agg(x.id order by x.ord), '[]'::jsonb)
            from (
              select r.ord,
                     (select n.id::text from public.focus_nodes n
                       where n.user_id = v_user and n.node_type = 'task' and n.title = r.title
                         and not (n.tags && array['השראה']) limit 1) as id
                from unnest(m.ramp) with ordinality as r(title, ord)
            ) x
           where x.id is not null),
         m.ord, true
    from (values
      ('מצב צילום',        array['סידור הסלון','תפילה','אימון גוף מלא קצר'], 'צילום תוכן',      10),
      ('מצב מכירה',        array['תפילה'],                                    'שיחות עם לידים',  20),
      ('מצב יצירה שקטה',   array['סידור הסלון'],                              'כתיבת תסריט',     30)
    ) as m(name, ramp, main, ord);
  get diagnostics v_m = row_count;

  -- ── 6. mark the arm so the legacy seeders stay out ───────────────
  update public.focus_nodes
     set extra_data = coalesce(extra_data, '{}'::jsonb)
                      || jsonb_build_object('stage1_seeded', true,
                                            'stage1_seeded_on', to_char(now(), 'YYYY-MM-DD'))
   where id = v_arm;

  raise notice 'Seeded: % branches, % habits, % bank items, % modes. Arm marked stage1_seeded.',
    v_b, v_h, v_k, v_m;
  if v_b <> 6 or v_h <> 22 or v_k <> 68 or v_m <> 3 then
    raise exception 'ABORT: expected 6/22/68/3 but inserted %/%/%/% — rolled back.', v_b, v_h, v_k, v_m;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY — run these after, and paste the output back
-- ═══════════════════════════════════════════════════════════════════

-- 1. the whole new tree, branch by branch
with arm as (
  select id from public.focus_nodes
   where user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
     and title = 'החיים שלי' and node_type <> 'task' limit 1
)
select coalesce(gp.title, p.title, '(arm)') as grandparent,
       p.title  as parent,
       n.node_type, n.title, n.frequency, n.tags,
       n.task_kind, n.measure_mode, n.weekly_target, n.life_impact, n.net_minutes
  from public.focus_nodes n
  left join public.focus_nodes p  on p.id  = n.parent_id
  left join public.focus_nodes gp on gp.id = p.parent_id
 where n.user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
   and (n.parent_id = (select id from arm)
     or p.parent_id = (select id from arm)
     or gp.parent_id = (select id from arm))
 order by p.sort_order nulls first, p.title, n.sort_order, n.title;

-- 2. counts + the goal row on each branch
select b.title, b.metric_target, b.metric_unit, b.cycle_start, b.cycle_end, b.note,
       (select count(*) from public.focus_nodes h where h.parent_id = b.id) as habits,
       (select count(*) from public.focus_nodes k
         where k.parent_id in (select id from public.focus_nodes h2 where h2.parent_id = b.id)) as bank_items
  from public.focus_nodes b
 where b.user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
   and b.node_type = 'branch'
   and b.parent_id = (select id from public.focus_nodes
                       where user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
                         and title = 'החיים שלי' and node_type <> 'task' limit 1)
 order by b.sort_order;

-- 3. modes with their resolved names
select m.name,
       (select title from public.focus_nodes n where n.id = m.main_node_id) as main_task,
       (select string_agg(n.title, ' → ' order by r.ord)
          from jsonb_array_elements_text(m.ramp_node_ids) with ordinality as r(id, ord)
          join public.focus_nodes n on n.id = r.id::uuid) as ramp,
       jsonb_array_length(m.ramp_node_ids) as ramp_len
  from public.focus_modes m
 where m.user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
 order by m.sort_order;

-- 4. the arm marker + that the inspiration list survived
select title, node_type, extra_data
  from public.focus_nodes
 where user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
   and (title = 'החיים שלי' or title = 'רשימת השראה');
