// ═══════════════════════════════════════════════════════════════════
// Courses — one-time seed
// ═══════════════════════════════════════════════════════════════════
// seedCourses(coachId) populates the Content Commander with the coach's
// 11 skill courses. Each course is a content_drop (category='course');
// its chapters are content_clips. Idempotent — if the coach already has
// ANY course drop it does nothing, so it is safe on every mount and
// never touches the marketing (July) drops.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

// ── 42703 unknown-column tolerance ──────────────────────────────────
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
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase.from(table).insert(body).select().single();
    if (!error) return data;
    const col = missingColumn(error);
    if (!col || !(col in body)) throw error;
    delete body[col];
  }
  throw new Error(`[courses-seed] ${table} insert exhausted retries`);
}

async function insertMany(table, rows) {
  if (!rows.length) return [];
  let body = rows.map((r) => ({ ...r }));
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase.from(table).insert(body).select();
    if (!error) return data || [];
    const col = missingColumn(error);
    if (!col) throw error;
    body = body.map(({ [col]: _drop, ...rest }) => rest);
  }
  throw new Error(`[courses-seed] ${table} batch insert exhausted retries`);
}

// ── The 11 courses ──────────────────────────────────────────────────
// Each chapter is { title, chapter_notes }. Everything else (type,
// status, empty script/hook/etc) is filled uniformly at seed time.
const COURSES = [
  {
    title: 'עליות כוח', priority_order: 1, funnel: 'dm', product_link: 'דרים מאשין — 1,199₪',
    chapters: [
      { title: 'מבוא — מה זו עלייה לכוח ולמה כולם רוצים אותה', chapter_notes: 'מה התנועה, למה היא נחשבת לאבן דרך, מה ההבדל בין עלייה נקייה לקיפינג, מה הקורס הזה ייתן' },
      { title: 'הערכת רמה — איפה אתה עומד עכשיו', chapter_notes: 'טסט עליות מתח (כמה, באיזה טווח), טסט דיפסים, טסט תלייה, קריטריונים למעבר — המתאמן מצלם ושולח' },
      { title: 'יסודות משיכה — עליות מתח נכונות', chapter_notes: 'אחיזה נכונה, הפעלת כתפיים, טווח תנועה מלא, טעויות נפוצות (חצי טווח, קיפינג מוקדם), תרגול על דרים מאשין — 50% הפחתה, משימה: 5 עליות מתח נקיות בצילום' },
      { title: 'יסודות דחיפה — דיפסים ושכיבות סמיכה', chapter_notes: 'דיפסים על מקבילים, שכיבות סמיכה עם פרוטרקשן, חיזוק תחתית התנועה, תרגול על דרים מאשין, משימה: 8 דיפסים נקיים בצילום' },
      { title: 'הטרנזישן — הנקודה שמפרידה בין משיכה לדחיפה', chapter_notes: 'מה הטרנזישן, למה הוא הנקודה הקריטית, תרגול עם גומייה, תרגול על דרים מאשין עם 50% הפחתה, מיקום מרפקים, תזמון, משימה: 3 טרנזישנים בסיוע בצילום' },
      { title: 'כוח פיצוצי — משיכה מעל המוט', chapter_notes: 'High pull, chest to bar, explosive pull-ups, תרגול על דרים מאשין עם הפחתה הדרגתית, משימה: 3 משיכות גבוהות בצילום' },
      { title: 'עלייה לכוח בסיוע — דרים מאשין', chapter_notes: 'עלייה מלאה עם 50% הפחתה, הורדה הדרגתית — 40%, 30%, 20%, נקודות מפתח: תזמון, מיקום גוף, שליטה בירידה, משימה: 3 עליות רצופות ב-30% הפחתה' },
      { title: 'עלייה לכוח נקייה — בלי סיוע', chapter_notes: 'הניסיון הראשון, טעויות נפוצות, בטיחות, איך להתמודד עם כישלון, תרגול יומי מומלץ, משימה: עלייה לכוח אחת נקייה בצילום' },
      { title: 'וריאציות ושלב הבא', chapter_notes: 'עלייה איטית (slow muscle up), עלייה על טבעות, עליות רצופות, L-sit muscle up, לאן ממשיכים' },
      { title: 'תוכנית אימון שלמה — 12 שבועות', chapter_notes: 'שבועות 1-4: יסודות, שבועות 5-8: טרנזישן וכוח פיצוצי, שבועות 9-12: עלייה מלאה, תדירות, מנוחה, תזונה בסיסית' },
    ],
  },
  {
    title: 'עמידות ידיים', priority_order: 2, funnel: 'prod', product_link: 'פרלטים — 220₪',
    chapters: [
      { title: 'מבוא — למה עמידת ידיים היא מיומנות ולא תרגיל', chapter_notes: 'ההבדל בין כוח לאיזון, למה זה לוקח זמן, מה הקורס נותן, ציפיות ריאליסטיות' },
      { title: 'הערכת רמה — מה הגוף שלך מוכן אליו', chapter_notes: 'טסט כתפיים, טסט פרקי ידיים, טסט הליכה על ידיים כנגד קיר, קריטריונים' },
      { title: 'חיזוק פרקי ידיים וכתפיים', chapter_notes: 'חימום, חיזוק פרקי ידיים, פתיחת כתפיים, תרגילים על פרלטים, משימה' },
      { title: 'קיר — עמידה כנגד הקיר פנים ואחורה', chapter_notes: 'שתי גישות, יתרונות כל אחת, זמני החזקה, יישור גוף, טעויות נפוצות' },
      { title: 'יציאה מהקיר — איזון ראשוני', chapter_notes: 'רגל אחת יורדת, בעיטה עדינה, שליטה ביציאה, נפילה בטוחה, משימה' },
      { title: 'כניסה לעמידה — kick up', chapter_notes: 'טכניקות כניסה, רגל מובילה, תזמון, תרגול על פרלטים, משימה: 3 כניסות בצילום' },
      { title: 'שליטה ואיזון — freestanding', chapter_notes: 'מיקרו תיקונים, אצבעות מול כף יד, מבט, נשימה, זמני החזקה, משימה: 10 שניות' },
      { title: 'וריאציות — straddle, tuck, press', chapter_notes: 'עמידה רחבה, עמידה מקופלת, press to handstand, דרישות גמישות' },
      { title: 'תוכנית אימון — 8 שבועות', chapter_notes: 'שבועות 1-3: חיזוק ומול קיר, 4-6: יציאה ואיזון, 7-8: freestanding, תדירות יומית' },
    ],
  },
  {
    title: 'טבעות בסיסי', priority_order: 3, funnel: 'prod', product_link: 'טבעות — 249₪',
    chapters: [
      { title: 'מבוא — למה טבעות משנות את כל מה שידעת על אימון', chapter_notes: 'חוסר יציבות כיתרון, שרירי ליבה, שליטה, למה טבעות עדיפות על מוט' },
      { title: 'הערכת רמה', chapter_notes: 'טסט תלייה, טסט support hold, טסט דיפס על מקבילים רגילים' },
      { title: 'תלייה ואחיזה — dead hang ו-active hang', chapter_notes: 'אחיזה נכונה, כתפיים פעילות, זמנים, משימה' },
      { title: 'Support Hold — להחזיק למעלה', chapter_notes: 'turn out, מיקום מרפקים, זמני החזקה, חיזוק הדרגתי, משימה: 20 שניות' },
      { title: 'דיפסים על טבעות', chapter_notes: 'ההבדל ממקבילים, עומק, שליטה, טעויות, משימה: 5 דיפסים נקיים' },
      { title: 'עליות מתח על טבעות', chapter_notes: 'false grip, משיכה לחזה, שליטה בסיבוב, משימה: 5 עליות' },
      { title: 'L-sit על טבעות', chapter_notes: 'tuck L-sit, רגליים מושטות, זמני החזקה, חיזוק בטן, משימה' },
      { title: 'שילובים ומעברים', chapter_notes: 'muscle up על טבעות, dip to L-sit, תנועות מורכבות' },
      { title: 'תוכנית אימון — 8 שבועות', chapter_notes: 'שבועות 1-3: תלייה ו-support, 4-6: דיפסים ומשיכות, 7-8: שילובים' },
    ],
  },
  {
    title: 'יסודות הכושר', priority_order: 4, funnel: 'brand', product_link: '',
    chapters: [
      { title: 'מבוא — מה זה באמת להיות כשיר', chapter_notes: 'הגדרה מחודשת, כושר כמיומנות, ההבדל בין חדר כושר לשליטה בגוף' },
      { title: 'הערכת רמה כללית', chapter_notes: '7 תנועות בסיס: squat, push-up, pull-up, plank, lunge, hinge, carry' },
      { title: 'דפוס תנועה 1 — סקוואט', chapter_notes: 'טכניקה, טעויות, וריאציות, משימה' },
      { title: 'דפוס תנועה 2 — דחיפה', chapter_notes: 'שכיבות סמיכה, וריאציות, הדרגתיות' },
      { title: 'דפוס תנועה 3 — משיכה', chapter_notes: 'Australian pull-up עד עליית מתח מלאה' },
      { title: 'דפוס תנועה 4 — ליבה', chapter_notes: 'plank, hollow body, L-sit progression' },
      { title: 'דפוס תנועה 5 — מוביליטי', chapter_notes: 'גמישות פעילה, טווחי תנועה, רוטינה יומית' },
      { title: 'תוכנית אימון — 8 שבועות', chapter_notes: 'full body 3 פעמים בשבוע, הדרגתיות, מעקב' },
    ],
  },
  {
    title: 'כושר מקצועי', priority_order: 5, funnel: 'brand', product_link: '',
    chapters: [
      { title: 'מבוא — מיסודות למקצועיות', chapter_notes: 'דרישות קדם: סיום יסודות הכושר, מה משתנה' },
      { title: 'עליות מתח מתקדמות', chapter_notes: 'weighted, archer, typewriter, one arm progression' },
      { title: 'דיפסים מתקדמים', chapter_notes: 'weighted, ring dips, Korean dips' },
      { title: 'שכיבות סמיכה מתקדמות', chapter_notes: 'diamond, archer, planche push-up progression' },
      { title: 'רגליים — pistol squat ומעבר', chapter_notes: 'pistol, shrimp squat, jump squat' },
      { title: 'ליבה מתקדמת', chapter_notes: 'dragon flag, front lever tuck, back lever tuck' },
      { title: 'תכנות אימונים — periodization', chapter_notes: 'מחזוריות, עומסים, מנוחה, שבוע דילוד' },
      { title: 'תוכנית אימון — 12 שבועות', chapter_notes: '4 ימים בשבוע, push/pull split, progression' },
    ],
  },
  {
    title: 'כושר אולימפי', priority_order: 6, funnel: 'dm', product_link: 'דרים מאשין — 1,199₪',
    chapters: [
      { title: 'מבוא — רמה אולימפית בקליסטניקס', chapter_notes: 'מה זה אומר, דרישות, ציפיות, ציוד נדרש' },
      { title: 'Planche — מההתחלה', chapter_notes: 'lean, tuck planche, straddle, full, תרגול על דרים מאשין' },
      { title: 'Front Lever', chapter_notes: 'tuck, advanced tuck, straddle, full, תרגול על דרים מאשין' },
      { title: 'Back Lever', chapter_notes: 'german hang, skin the cat, tuck, full' },
      { title: 'Iron Cross — על טבעות', chapter_notes: 'חיזוק מיוחד, הפחתה הדרגתית על דרים מאשין, בטיחות' },
      { title: 'Victorian Cross ותנועות נדירות', chapter_notes: 'maltese, victorian, combinations' },
      { title: 'תכנות לרמה גבוהה', chapter_notes: 'volume, intensity, deload, injury prevention' },
      { title: 'תוכנית אימון — 16 שבועות', chapter_notes: '5-6 ימים, skill days + strength days' },
    ],
  },
  {
    title: 'קפיצה בחבל בסיסי', priority_order: 7, funnel: 'prod', product_link: 'ספיד רופ — 220₪',
    chapters: [
      { title: 'מבוא — קפיצה בחבל כמיומנות', chapter_notes: 'למה זה יותר ממה שחושבים, בחירת חבל, אורך נכון' },
      { title: 'אחיזה ותנוחה', chapter_notes: 'אחיזה, מרפקים, תנוחת גוף, מבט' },
      { title: 'קפיצה בסיסית — bounce step', chapter_notes: 'קצב, גובה קפיצה, נחיתה, טעויות' },
      { title: 'alternate step — ריצה במקום', chapter_notes: 'תזמון, קצב מהיר, שימוש באימוני קרדיו' },
      { title: 'דאבל באונס ושינויי קצב', chapter_notes: 'מתי להשתמש, מעבר בין סגנונות' },
      { title: 'אימוני זמן ומבנה', chapter_notes: 'EMOM, Tabata, 10 דקות רצוף, תוכניות' },
      { title: 'תוכנית אימון — 4 שבועות', chapter_notes: '5 ימים בשבוע, 10-15 דקות, progression' },
    ],
  },
  {
    title: 'פריסטייל בחבל', priority_order: 8, funnel: 'prod', product_link: 'פריסטייל רופ — 159₪',
    chapters: [
      { title: 'מבוא — מה זה פריסטייל', chapter_notes: 'ההבדל מקפיצה רגילה, הביטוי האישי, בחירת חבל פריסטייל' },
      { title: 'Side swing ו-crossover', chapter_notes: 'תנועות בסיס, תזמון, תרגול איטי' },
      { title: 'Criss-cross', chapter_notes: 'טכניקה, ידיים, תזמון כניסה ויציאה' },
      { title: 'Awesome Annie ו-EB', chapter_notes: 'טריקים קלאסיים, שילובים' },
      { title: 'Release tricks', chapter_notes: 'שחרור חבל, תפיסה, בטיחות' },
      { title: 'בניית combo אישי', chapter_notes: 'איך לחבר טריקים, מוזיקליות, ביטוי' },
      { title: 'תוכנית אימון — 6 שבועות', chapter_notes: 'טריק חדש כל שבוע, תרגול combo' },
    ],
  },
  {
    title: 'דאבלים', priority_order: 9, funnel: 'prod', product_link: 'ספיד רופ — 220₪',
    chapters: [
      { title: 'מבוא — למה דאבלים זה אבן דרך', chapter_notes: 'כוח, תזמון, קואורדינציה, דרישות קדם' },
      { title: 'Power jump — קפיצה גבוהה', chapter_notes: 'גובה נדרש, תרגול בלי חבל, טכניקה' },
      { title: 'פרק ידיים — מהירות סיבוב', chapter_notes: 'wrist speed, תרגול, penguin drill' },
      { title: 'דאבל ראשון — singles to doubles', chapter_notes: 'תזמון, 1-1-2, טעויות נפוצות, משימה' },
      { title: 'רצף דאבלים', chapter_notes: '2 רצוף, 5 רצוף, 10 רצוף, bounce vs rebound' },
      { title: 'תוכנית אימון — 6 שבועות', chapter_notes: '3 ימים דאבלים + 2 ימים singles, progression' },
    ],
  },
  {
    title: 'טבעות מתקדם', priority_order: 10, funnel: 'prod', product_link: 'טבעות — 249₪',
    chapters: [
      { title: 'מבוא — דרישות קדם ורמה נדרשת', chapter_notes: 'סיום טבעות בסיסי, מינימום: 10 דיפסים + 8 pull-ups על טבעות' },
      { title: 'Muscle up על טבעות', chapter_notes: 'false grip, transition, kipping vs strict, תרגול עם דרים מאשין' },
      { title: 'Iron Cross progression', chapter_notes: 'חיזוק, band assisted, דרים מאשין, זמני החזקה' },
      { title: 'Back lever ו-front lever על טבעות', chapter_notes: 'ההבדל ממוט, שליטה, progressions' },
      { title: 'Shoulder stand ו-inversions', chapter_notes: 'הפוך על טבעות, בטיחות, חיזוק' },
      { title: 'Routines ושילובים', chapter_notes: 'flows, combo תנועות, ביטוי אישי' },
      { title: 'תוכנית אימון — 12 שבועות', chapter_notes: '4 ימים, skill + strength, periodization' },
    ],
  },
  {
    title: 'סיבובי מקל', priority_order: 11, funnel: 'brand', product_link: 'מקל — 100₪',
    chapters: [
      { title: 'מבוא — מה זה סיבוב מקל וזה בשבילך', chapter_notes: 'מיומנות תנועתית, קואורדינציה, כיף, בחירת מקל' },
      { title: 'אחיזה בסיסית וסיבוב ישר', chapter_notes: 'grip, סיבוב ליד הגוף, ימין ושמאל' },
      { title: 'Figure 8', chapter_notes: 'מסלול, תזמון, שתי ידיים' },
      { title: 'סיבוב מאחורי הגב', chapter_notes: 'טכניקה, נקודת החלפה, תרגול איטי' },
      { title: 'העברות ושחרורים', chapter_notes: 'release, catch, toss, בטיחות' },
      { title: 'בניית flow אישי', chapter_notes: 'חיבור תנועות, מוזיקה, ביטוי' },
      { title: 'תוכנית אימון — 4 שבועות', chapter_notes: '10 דקות ביום, תנועה חדשה כל שבוע' },
    ],
  },
];

// Dedupe concurrent calls within a session.
let inFlight = null;

export async function seedCourses(coachId) {
  if (!coachId) return { seeded: false, reason: 'no-coach' };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // 1) Idempotency — bail if this coach already has any course drop.
    let existing = await supabase
      .from('content_drops').select('id').eq('coach_id', coachId).eq('category', 'course').limit(1);
    if (existing.error && missingColumn(existing.error) === 'coach_id') {
      existing = await supabase.from('content_drops').select('id').eq('category', 'course').limit(1);
    }
    if (existing.error) { console.error('[courses-seed] existence check failed', existing.error); return { seeded: false, reason: 'check-failed' }; }
    if (existing.data && existing.data.length) return { seeded: false, reason: 'already-seeded' };

    // 2) Insert each course drop + its chapters.
    let courses = 0, chapters = 0;
    for (const course of COURSES) {
      const drop = await insertRow('content_drops', {
        coach_id: coachId,
        title: course.title,
        funnel: course.funnel,
        product_link: course.product_link,
        priority_order: course.priority_order,
        category: 'course',
        status: 'draft',
      });
      courses += 1;
      const rows = course.chapters.map((ch, i) => ({
        coach_id: coachId,
        drop_id: drop.id,
        sort_order: i + 1,
        title: ch.title,
        chapter_notes: ch.chapter_notes,
        clip_type: 'value',
        status: 'idea',
        funnel: course.funnel,
        script: '',
        hook: '',
        loop_close: '',
        target_audience: '',
      }));
      const inserted = await insertMany('content_clips', rows);
      chapters += inserted.length;
    }

    console.log(`[courses-seed] seeded: ${courses} courses, ${chapters} chapters`);
    return { seeded: true, courses, chapters };
  })();

  try {
    return await inFlight;
  } catch (e) {
    console.error('[courses-seed] seed failed', e);
    inFlight = null; // allow a later retry after a transient failure
    return { seeded: false, reason: 'error', error: e };
  }
}
