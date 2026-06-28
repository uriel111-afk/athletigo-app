// ═══════════════════════════════════════════════════════════════════
// Sales scripts — defaults + one-time seed
// ═══════════════════════════════════════════════════════════════════
// DEFAULT_SCRIPTS is the single source of truth: the seed inserts them
// into the sales_scripts table, and the useSalesScripts hook falls back
// to them while the table is empty/loading. Idempotent — if the coach
// already has ANY script, seeding is skipped.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

export const DEFAULT_SCRIPTS = [
  // ── Step tips ──
  { section: 'step1_tip', key: 'first_impression', sort_order: 0,
    content: '🔑 הרושם הראשוני\nחייך. הצג את עצמך בשם.\n׳היי, אני אוריאל מאתלטיגו. ספר לי קצת על עצמך — מה הביא אותך אלינו?׳\nתקשיב. אל תמכור כלום בשלב הזה.' },
  { section: 'step2_tip', key: 'deep_listening', sort_order: 0,
    content: '👂 שאלות שפותחות אנשים\n׳מה הדבר שהכי מתסכל אותך באימונים — או בזה שאתה לא מתאמן?׳\n׳אם הייתי נותן לך שרביט — מה היית רוצה שהגוף שלך ידע לעשות?׳\n׳מה ניסית בעבר ולמה הפסקת?׳\n\nאל תציע פתרון עדיין. תן לו לדבר.' },
  { section: 'step3_tip', key: 'matching', sort_order: 0,
    content: '💡 הצגת ההתאמה\nקרא את הטקסט בכרטיס — הוא כתוב בדיוק בשביל המצב הזה.\nאחרי שהצגת, שאל:\n׳איך זה נשמע לך? יש שאלות?׳\nאם הוא מתלהב — עבור להצעת מחיר.\nאם הוא מהסס — שלח לו תוכן רלוונטי ותחזור אליו מחר.\nאף ליד לא הולך ריק. תמיד יש מוצר שמתאים.' },
  { section: 'step4_tip', key: 'pricing', sort_order: 0,
    content: '💡 סדר הצגת המחיר\n1. קודם הערך: ׳הנה מה כלול...׳\n2. אחר כך הסיפור: ׳אנשים שהתחילו ככה הגיעו ל...׳\n3. רק אז המחיר.\n4. אם מהסס: ׳אני נותן 50₪ הנחה למי שמתחיל היום.׳\n\nאם לא סוגר ליווי — תמיד תציע את מוצר הפריצה ב-49₪.\nאף שיחה לא נגמרת בלי הצעה.' },
  { section: 'step5_tip', key: 'general', sort_order: 0,
    content: '🛡️ כללי זהב להתנגדויות\n\n1. אל תתגונן. תקשיב ותשאל ׳למה?׳\n2. כל התנגדות מסתירה התנגדות אמיתית. ׳יקר לי׳ = ׳אני לא בטוח שזה שווה.׳ ׳צריך לחשוב׳ = ׳אני מפחד להתחייב.׳\n3. תמיד תרד בסולם. לא סוגר ליווי? תציע 3 חודשים. לא 3 חודשים? מוצר פריצה. 49₪ = אף אחד לא הולך ריק.\n4. אם אמר לא — שלח תוכן ועשה פולואפ. הקשר לא נגמר.' },
  { section: 'step6_tip', key: 'summary', sort_order: 0,
    content: '📝 כתוב כאילו אתה מספר לעצמך בעוד שבוע.\n׳דיברתי עם X, בן Y, אף פעם לא התאמן, מפחד להתחיל. הצעתי מוצר פריצה, שלחתי לו קליפ Z, אמר שיחשוב. פולואפ ביום ראשון.׳' },

  // ── Pitches ──
  { section: 'pitch_breakthrough', key: 'main', sort_order: 0,
    content: 'אתלטיגו מלמד מיומנות גופנית — לא סתם להזיע, אלא ללמוד לשלוט בגוף.\n\nאנחנו מתחילים עם תוכנית של 7 ימים — בסלון, בלי ציוד, בלי ניסיון קודם.\nכל יום סרטון קצר עם תרגיל אחד פשוט. אתה מצלם את עצמך ושולח — ואני נותן לך פידבק אישי.\n\nהמטרה? שתרגיש שאתה יכול. כי ברגע שהגוף מכיר תנועה — אתה רוצה עוד.\nואפשר לעשות את זה ביחד עם בן/בת זוג, ילדים, חברים. זו חוויה משותפת.\n\nפעילות גופנית זה תהליכי — עצם זה שהתמונה מתבהרת, הערך עולה, והמוטיבציה מקבלת גירוי שעשוי להניע אותך לפעולה.\nגם אם תעשה את הפעילות וגם אם לא — הצפייה בלבד נותנת בהירות על כל התהליך.\n\nואם התקשרת — זה אומר שעכשיו זה הזמן. אנשים שרוצים להזיז את הגוף ולהינות מזה צריכים להבין מה הם עושים.' },
  { section: 'pitch_breakthrough', key: 'recommended', sort_order: 1,
    content: 'מומלץ: 7 ימים של תנועה ראשונה — 49₪\nחבילה משפחתית — 79₪ לשניים' },
  { section: 'pitch_3month', key: 'main', sort_order: 0,
    content: 'יש לך את הבסיס — עכשיו צריך לבנות שגרה שמחזיקה.\n\nאנחנו בונים לך תוכנית אימון אישית, עם מפגשים אונליין, מעקב שבועי, ומשימות לצילום.\nהמטרה היא עצמאות — שתדע להתאמן לבד נכון. אבל כל עוד אתה רוצה להתקדם חזק יותר — אני כאן.\n\nאחרי 3 חודשים הגוף שלך כבר מתורגל ומתמיד. ואז מרחיבים.' },
  { section: 'pitch_3month', key: 'recommended', sort_order: 1,
    content: 'מומלץ: תוכנית 3 חודשים — 300₪/חודש' },
  { section: 'pitch_advanced', key: 'main', sort_order: 0,
    content: 'אתה מתאמן — עכשיו צריך ללמוד תנועות שהגוף שלך עוד לא מכיר.\nעלייה לכוח. פלאנצ׳. פרונט לבר. עמידת ידיים.\n\nהדרים מאשין מוריד 50% מהמשקל ונותן לגוף שלך להרגיש תנועות שהוא עוד לא מסוגל לעשות לבד.\nברגע שהגוף מכיר — הדרך מתקצרת בחודשים.' },
  { section: 'pitch_advanced', key: 'recommended', sort_order: 1,
    content: 'מומלץ: דרים מאשין (1,199₪) + קורס עליות כוח' },

  // ── Objections — breakthrough ──
  { section: 'objections_breakthrough', key: 'too_expensive', sort_order: 1,
    content: '׳49 שקל זה יקר לי׳\n→ ׳אני מבין. אבל תחשוב על זה — זה פחות מארוחה בחוץ, ואתה מקבל 7 ימים של תוכן שנותן לך בהירות מלאה על איך להתחיל. גם אם לא תעשה שום תרגיל — הצפייה לבדה תשנה לך את ההבנה. ואם כן תעשה — יש לך אותי שם.׳' },
  { section: 'objections_breakthrough', key: 'not_sure_for_me', sort_order: 2,
    content: '׳אני לא בטוח שזה בשבילי׳\n→ ׳בדיוק בשביל זה בנינו את זה. 7 ימים, בסלון, בלי ציוד, בלי מבוכה. אם אחרי שבוע אתה מרגיש שזה לא בשבילך — לפחות יש לך תמונה ברורה. אבל רוב האנשים שעושים את הצעד הראשון מגלים שהם יכולים הרבה יותר ממה שחשבו.׳' },
  { section: 'objections_breakthrough', key: 'need_to_think', sort_order: 3,
    content: '׳אני צריך לחשוב על זה׳\n→ ׳לגמרי. אני שולח לך עכשיו קליפ קצר שנותן לך טעימה מהשיטה. תצפה כשנוח לך ותגיד לי מה חשבת.׳\n→ שלח תוכן רלוונטי, עשה פולואפ מחר.' },
  { section: 'objections_breakthrough', key: 'no_time', sort_order: 4,
    content: '׳אין לי זמן׳\n→ ׳כל סרטון הוא 5 דקות. אם יש לך 5 דקות לגלול באינסטגרם — יש לך 5 דקות לזה. וזה בסלון שלך, בזמן שלך, בלי לנסוע לשום מקום.׳' },
  { section: 'objections_breakthrough', key: 'ill_do_it_myself', sort_order: 5,
    content: '׳אני אסתדר לבד, יש הכל ביוטיוב׳\n→ ׳נכון, יש המון תוכן חינמי. ההבדל? ביוטיוב אתה צופה ומנסה לחקות. כאן אתה מצלם, שולח, ומקבל פידבק אישי ממני. זה ההבדל בין לראות לבין ללמוד.׳' },
  { section: 'objections_breakthrough', key: 'spouse_family', sort_order: 6,
    content: '׳אני צריך להתייעץ עם בן/בת הזוג׳\n→ ׳מעולה. בעצם אפשר לעשות את זה ביחד — יש חבילה משפחתית ב-79₪ לשניים. ככה זו חוויה משותפת, לא עוד דבר שמישהו עושה לבד.׳' },

  // ── Objections — 3 month ──
  { section: 'objections_3month', key: 'too_expensive', sort_order: 1,
    content: '׳יקר לי׳\n→ ׳אני מבין. בוא נסתכל ככה — חבילה של X מפגשים יוצאת Y₪ למפגש. זה פחות מאימון בחדר כושר עם מאמן. ואתה מקבל תוכנית שנבנית בדיוק בשבילך, עם מעקב שבועי.׳\n→ אם עדיין יקר: ׳יש לנו גם אופציה של 49₪ — 7 ימים שנותנים לך לטעום את השיטה בלי התחייבות. ואם אחרי זה תרצה להמשיך — ה-49₪ יקוזזו מהחבילה.׳' },
  { section: 'objections_3month', key: 'not_sure_works', sort_order: 2,
    content: '׳אני לא בטוח שזה עובד׳\n→ ׳אני אשלח לך סרטון קצר של מתאמן שהתחיל בדיוק מהמקום שלך. תראה בעצמך. ואם אחרי שצפית אתה עדיין לא בטוח — תנסה את 7 ימים של תנועה ראשונה ותרגיש על הגוף שלך.׳' },
  { section: 'objections_3month', key: 'bad_experience', sort_order: 3,
    content: '׳ניסיתי מאמנים בעבר ולא עבד׳\n→ ׳אני שומע את זה הרבה. ההבדל בשיטה שלנו — אנחנו לא מלמדים אותך להתאמן. אנחנו מלמדים אותך מיומנות. זה כמו ללמוד שפה — לא רק לחזור על מילים. אני נותן לך משימות לצילום ופידבק אישי, ככה שכל שבוע אתה רואה בדיוק איפה התקדמת.׳' },
  { section: 'objections_3month', key: 'need_to_think', sort_order: 4,
    content: '׳אני צריך לחשוב׳\n→ ׳לגמרי. מה הדבר שהכי חשוב לך לבדוק לפני שאתה מחליט?׳\n→ ככה אתה מגלה את ההתנגדות האמיתית ויכול לענות עליה.' },

  // ── Objections — advanced ──
  { section: 'objections_advanced', key: 'have_equipment', sort_order: 1,
    content: '׳יש לי כבר ציוד בבית׳\n→ ׳מעולה. השאלה היא — אתה מתקדם? הדרים מאשין לא מחליף ציוד. הוא מלמד את הגוף תנועות שאתה לא מגיע אליהן לבד. אתה יכול להיות חזק — ועדיין לא לדעת איך מרגישה עלייה לכוח. המכשיר נותן לגוף להרגיש את זה, וברגע שהוא מכיר — הכל משתנה.׳' },
  { section: 'objections_advanced', key: 'too_expensive_dm', sort_order: 2,
    content: '׳1,199₪ זה הרבה כסף׳\n→ ׳מסכים, זה לא קנייה של כל יום. אבל תחשוב — כמה עולה מנוי חודשי בחדר כושר? 200-300₪. בחצי שנה שילמת את המכשיר. והוא נשאר אצלך שנים, עובד בכל מקום, ונכנס לתיק.׳\n→ אם עדיין מהסס: ׳בוא נתחיל מקורס עליות כוח ב-299₪. תלמד את התנועות, ואם תרגיש שהמכשיר יעזור — תמיד אפשר.׳' },
  { section: 'objections_advanced', key: 'can_learn_youtube', sort_order: 3,
    content: '׳אני אלמד לבד מיוטיוב׳\n→ ׳ביוטיוב אתה רואה את התנועה המוגמרת. אתה לא מרגיש אותה. אתה לא יודע אם אתה עושה נכון. ואין מי שיגיד לך. כאן אתה מצלם, שולח, ומקבל פידבק. זה ההבדל בין לראות לבין ללמוד.׳' },

  // ── Core authority messages ──
  { section: 'core_messages', key: 'authority_1', sort_order: 1, content: 'המטרה היא עצמאות ספורטיבית' },
  { section: 'core_messages', key: 'authority_2', sort_order: 2, content: 'עם ליווי, התהליך חזק ומשמעותי יותר' },
  { section: 'core_messages', key: 'authority_3', sort_order: 3, content: 'אנחנו לא מלמדים להתאושש — מלמדים לא להיפצע מלכתחילה' },
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
  throw new Error('[sales-scripts-seed] batch insert exhausted retries');
}

let inFlight = null;

export async function seedSalesScripts(coachId) {
  if (!coachId) return { seeded: false, reason: 'no-coach' };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let existing = await supabase.from('sales_scripts').select('id').eq('coach_id', coachId).limit(1);
    if (existing.error && missingColumn(existing.error) === 'coach_id') {
      existing = await supabase.from('sales_scripts').select('id').limit(1);
    }
    if (existing.error) { console.error('[sales-scripts-seed] check failed', existing.error); return { seeded: false, reason: 'check-failed' }; }
    if (existing.data && existing.data.length) return { seeded: false, reason: 'already-seeded' };

    const rows = DEFAULT_SCRIPTS.map((s) => ({ ...s, coach_id: coachId }));
    const inserted = await insertMany('sales_scripts', rows);
    console.log(`[sales-scripts-seed] seeded ${inserted.length} scripts`);
    return { seeded: true, count: inserted.length };
  })();

  try {
    return await inFlight;
  } catch (e) {
    console.error('[sales-scripts-seed] seed failed', e);
    inFlight = null;
    return { seeded: false, reason: 'error', error: e };
  }
}
