// ═══════════════════════════════════════════════════════════════════
// Breakthrough product — "7 ימים של תנועה ראשונה" — one-time seed
// ═══════════════════════════════════════════════════════════════════
// Creates the purchasable course drop + 7 day-lesson clips (each with
// comprehension_questions). Idempotent — skips if a drop with this
// exact title already exists.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

const TITLE = '7 ימים של תנועה ראשונה';

const DROP = {
  title: TITLE,
  category: 'course',
  funnel: 'brand',
  is_purchasable: true,
  price: 49,
  family_price: 79,
  priority_order: 0,
  status: 'ready',
  description: '7 ימים. בסלון. בלי ציוד. הצעד הראשון שלך לגוף שמבין תנועה.',
  completion_message:
    'סיימת. 7 ימים. הצעד הראשון מאחוריך.\nעכשיו אתה יודע שאתה יכול.\nרוצה להמשיך? יש תוכנית של 3 חודשים שבנויה בדיוק בשביל מי שעשה את מה שעשית.',
  completion_cta_text: 'ספר לי עוד',
  completion_cta_url: 'https://wa.me/972XXXXXXXXX',
};

const CLIPS = [
  {
    title: 'יום 1 — נשימה', sort_order: 1, clip_type: 'value', target_audience: 'מתחילים',
    script: 'לפני שמזיזים את הגוף — לומדים להקשיב לו.\n\nהיום נלמד נשימה סרעפתית. זו הנשימה שמפעילה את הגוף בצורה הנכונה — ושתלווה אותך לכל אורך התוכנית.\n\nשכב על הגב. שים יד אחת על החזה ויד אחת על הבטן.\nשאף דרך האף ל-4 שניות — היד על הבטן עולה, היד על החזה לא זזה.\nהוצא דרך הפה ל-6 שניות — הבטן יורדת.\n\nעכשיו — 10 נשימות ככה.\n\nמהיום, כל פעם שאתה צופה בסרטון — נשום ככה. זה לא תרגיל. זו שכבת הבסיס.\n\nהגוף שלך הוא מערכת שלמה. לא יד ורגל — תנועה. הכל מחובר דרך שרשראות של מפרקים, שרירים ורקמות. נשימה נכונה היא מה שמדליק את כל המערכת.',
    comprehension_questions: [
      { q: 'הרגשת הבדל בין נשימה רגילה לנשימה סרעפתית?', type: 'feeling' },
      { q: 'איזה חלק בגוף הרגשת הכי הרבה תוך כדי הנשימה?', type: 'feeling' },
      { q: 'אתה מוכן ליום הבא?', type: 'ready' },
    ],
  },
  {
    title: 'יום 2 — עמידה ותנועה', sort_order: 2, clip_type: 'value', target_audience: 'מתחילים',
    script: 'היום נלמד את תנוחת הבסיס שממנה הכל מתחיל — העמידה האנטומית.\n\nעמוד ישר. רגליים ברוחב אגן. כפות רגליים קדימה. ברכיים רכות — לא נעולות. אגן ניטרלי. כתפיים למטה ולאחור. ראש ישר, מבט קדימה.\n\nזו נקודת האפס שלך. כל תנועה מתחילה מכאן וחוזרת לכאן.\n\nעכשיו — נעבור מפרק מפרק:\nצוואר — סיבובים איטיים לשני הצדדים.\nכתפיים — סיבובים קדימה ואחורה.\nמרפקים — כיפוף ויישור.\nפרקי ידיים — סיבובים.\nעמוד שדרה — סיבוב עדין, הטיה לצדדים.\nאגן — עיגולים.\nברכיים — כיפוף קל עם ידיים על הברכיים.\nקרסוליים — סיבובים.\n\nתזכורת — נשום סרעפתי לכל אורך התרגול.\n\nאתה בונה עכשיו מילון תנועתי. כל מפרק שלמדת לזוז — זו מילה חדשה. ככל שיש לך יותר מילים — אתה יכול לבנות יותר משפטים.',
    comprehension_questions: [
      { q: 'איזה מפרק הרגשת הכי מוגבל או קשיח?', type: 'feeling' },
      { q: 'הרגשת שינוי בעמידה שלך אחרי תרגול המפרקים?', type: 'feeling' },
      { q: 'אתה מוכן ליום הבא?', type: 'ready' },
    ],
  },
  {
    title: 'יום 3 — לזוז', sort_order: 3, clip_type: 'value', target_audience: 'מתחילים',
    script: 'היום הגוף שלך מתחיל לזוז באמת.\n\nנעבור בין 4 מצבים:\n\n1. תנועה בעמידה — צעדים למקום, הרמת ברכיים, סיבובי גוף.\n2. תנועה על הרצפה — לשבת, להתגלגל, לקום. בלי למהר.\n3. להתלות — מצא משקוף או מוט. פשוט להיתלות. 10 שניות. תרגיש את הכתפיים נמתחות.\n4. להישען על קיר — שים ידיים על הקיר ודחוף. תרגיש את הגוף כמערכת אחת.\n\nעכשיו — חזור לעמידה. עמידה אנטומית. נשימה.\n\nשים לב מה קרה — עברת בין ארבעה מצבים שונים. עמידה, רצפה, תלייה, דחיפה. הגוף שלך זז בכל המרחב.\n\nזה תנועה. לא תרגיל ספציפי — חופש.',
    comprehension_questions: [
      { q: 'איזה מצב היה הכי קשה לך? עמידה, רצפה, תלייה או דחיפה?', type: 'feeling' },
      { q: 'הרגשת חופש בתנועה או שהגוף מרגיש תקוע?', type: 'feeling' },
      { q: 'אתה מוכן ליום הבא?', type: 'ready' },
    ],
  },
  {
    title: 'יום 4 — סקוואט', sort_order: 4, clip_type: 'value', target_audience: 'מתחילים',
    script: 'סקוואט זה לא תרגיל רגליים. זה דפוס תנועתי שאתה צריך בחיים — לשבת, לקום, להרים דברים מהרצפה.\n\nעמידה אנטומית. רגליים ברוחב כתפיים.\nשאף — ותתחיל לרדת. כאילו אתה יושב על כיסא שלא קיים.\nהברכיים יוצאות לכיוון האצבעות. הגב ישר. העקבות על הרצפה.\nרד כמה שאתה יכול בשליטה — אל תכריח עומק.\nהוצא אוויר — ועלה.\n\n5 סקוואטים. לאט. בשליטה.\n\nהטעות הנפוצה: למהר. אין מהירות כאן — יש שליטה. אם אתה לא שולט בירידה — אתה לא באמת עושה סקוואט. אתה נופל ועולה.',
    comprehension_questions: [
      { q: 'הרגשת יציבות בירידה או שהגוף רצה ליפול קדימה?', type: 'feeling' },
      { q: 'הצלחת לשמור על עקבות על הרצפה?', type: 'feeling' },
      { q: 'אתה מוכן ליום הבא?', type: 'ready' },
    ],
  },
  {
    title: 'יום 5 — דחיפה', sort_order: 5, clip_type: 'value', target_audience: 'מתחילים',
    script: 'דחיפה זו מיומנות, לא שכיבת סמיכה.\n\nמתחילים מהקיר.\nעמוד מרחק זרוע מהקיר. ידיים ברוחב כתפיים.\nשאף — ורד לכיוון הקיר. 3 שניות ירידה.\nהוצא — ודחוף חזרה. שנייה אחת.\n\n5 חזרות.\n\nמיקוד: חגורת הכתפיים. תרגיש את הכתפיים יורדות למטה ולאחור, לא עולות לאוזניים.\n\nעכשיו — צעד אחורה. המרחק מהקיר גדל — הזווית משתנה — העומס עולה.\n\n5 חזרות נוספות.\n\nואם מרגיש טוב — עוד צעד אחורה. שים לב: ככל שהגובה יורד, תשים לב לאגן. הוא נוטה ליפול — תחזיק אותו ניטרלי.\n\nאתה לא מנסה להגיע לרצפה. אתה מנסה לשלוט בכל גובה שאתה נמצא בו.',
    comprehension_questions: [
      { q: 'הרגשת את ההבדל בעומס בין מרחק קרוב לרחוק מהקיר?', type: 'feeling' },
      { q: 'הצלחת לשמור על האגן ניטרלי?', type: 'feeling' },
      { q: 'אתה מוכן ליום הבא?', type: 'ready' },
    ],
  },
  {
    title: 'יום 6 — שיווי משקל', sort_order: 6, clip_type: 'value', target_audience: 'מתחילים',
    script: 'שיווי משקל זה לא כישרון. זה תרגול.\n\nתרגיל 1 — קפיצה במקום.\nפשוט קפוץ. 10 קפיצות קטנות. תנחות רך על כפות הרגליים. תרגיש את הגוף מארגן את עצמו.\n\nתרגיל 2 — עמידה על רגל אחת.\nעמוד על רגל ימין. 20 שניות. עכשיו שמאל. 20 שניות.\nעכשיו שוב — עם עיניים עצומות. תרגיש כמה הגוף עובד קשה יותר.\n\nתרגיל 3 — קפיצה בהחלפת רגליים.\nקפוץ מרגל ימין לשמאל. קצב איטי. נחיתה רכה. שליטה.\n\nהגוף שלך לומד עכשיו לארגן את עצמו במרחב — באוויר ובנחיתה. זו מיומנות שכל דבר אחר נבנה עליה.',
    comprehension_questions: [
      { q: 'איזה צד יותר יציב — ימין או שמאל?', type: 'feeling' },
      { q: 'הרגשת הבדל עם עיניים עצומות?', type: 'feeling' },
      { q: 'אתה מוכן ליום האחרון?', type: 'ready' },
    ],
  },
  {
    title: 'יום 7 — הכל ביחד', sort_order: 7, clip_type: 'value', target_audience: 'מתחילים',
    script: 'היום אתה מחבר הכל.\n\nזרימה אחת. 3 סבבים.\n\n1. עמידה אנטומית — 5 נשימות סרעפתיות.\n2. סדרת תנועות מפרקים — צוואר, כתפיים, מרפקים, פרקי ידיים, עמוד שדרה, אגן, ברכיים, קרסוליים.\n3. קפיצות במקום — 10 קפיצות.\n4. 5 סקוואטים — לאט, בשליטה.\n5. 5 דחיפות מול קיר — בגובה שנוח לך, 3 שניות ירידה.\n6. עמידה על רגל אחת — 15 שניות כל צד.\n7. חזרה לעמידה אנטומית — 3 נשימות סגירה.\n\nזה האימון. זו הזרימה. 7 ימים — ועכשיו אתה יודע.\n\nתצלם את הזרימה מההתחלה עד הסוף ותשלח לי. אני אתן לך פידבק אישי על הכל.',
    comprehension_questions: [
      { q: 'הרגשת הבדל מיום 1?', type: 'feeling' },
      { q: 'מה היה הכי מפתיע בשבוע הזה?', type: 'feeling' },
      { q: 'מה הדבר הבא שהיית רוצה ללמוד?', type: 'open' },
    ],
  },
];

// 42703 unknown-column tolerance.
function missingColumn(error) {
  const msg = error?.message || '';
  if (error?.code !== '42703' && !/does not exist|in the schema cache/i.test(msg)) return null;
  const m = msg.match(/column\s+"?([\w.]+)"?\s+of\s+relation/i)
         || msg.match(/column\s+"?([\w.]+)"?\s+does not exist/i)
         || msg.match(/['"`]([\w.]+)['"`]\s+column/i);
  return m?.[1]?.split('.').pop() || null;
}
async function insertRow(table, row) {
  let body = { ...row };
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabase.from(table).insert(body).select().single();
    if (!error) return data;
    const col = missingColumn(error);
    if (!col || !(col in body)) throw error;
    delete body[col];
  }
  throw new Error(`[breakthrough-seed] ${table} insert exhausted retries`);
}

let inFlight = null;

export async function seedBreakthroughCourse(coachId) {
  if (!coachId) return { seeded: false, reason: 'no-coach' };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let existing = await supabase.from('content_drops').select('id').eq('title', TITLE).limit(1);
    if (existing.error) { console.error('[breakthrough-seed] check failed', existing.error); return { seeded: false, reason: 'check-failed' }; }
    if (existing.data && existing.data.length) return { seeded: false, reason: 'already-seeded' };

    const drop = await insertRow('content_drops', { ...DROP, coach_id: coachId });
    let clips = 0;
    // Insert one-by-one so each clip's comprehension_questions JSONB +
    // any unsupported column is handled by the per-row retry.
    for (const c of CLIPS) {
      await insertRow('content_clips', {
        ...c, coach_id: coachId, drop_id: drop.id, status: 'published',
      });
      clips += 1;
    }
    console.log(`[breakthrough-seed] seeded course + ${clips} days`);
    return { seeded: true, dropId: drop.id, clips };
  })();

  try {
    return await inFlight;
  } catch (e) {
    console.error('[breakthrough-seed] seed failed', e);
    inFlight = null;
    return { seeded: false, reason: 'error', error: e };
  }
}
