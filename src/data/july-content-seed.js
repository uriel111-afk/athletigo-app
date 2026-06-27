// ═══════════════════════════════════════════════════════════════════
// July content strategy — one-time seed
// ═══════════════════════════════════════════════════════════════════
// seedJulyContent(coachId) populates the Content Commander with the
// coach's July plan: 8 drops and 31 clips. It is idempotent — if the
// coach already has ANY drop it does nothing, so it is safe to call on
// every Content Commander mount.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

// ── 42703 unknown-column tolerance (so one stale field name can't
//    block the whole seed) ──────────────────────────────────────────
function missingColumn(error) {
  const msg = error?.message || '';
  if (error?.code !== '42703' && !/does not exist|in the schema cache/i.test(msg)) return null;
  const m = msg.match(/column\s+"?([\w.]+)"?\s+of\s+relation/i)
         || msg.match(/column\s+"?([\w.]+)"?\s+does not exist/i)
         || msg.match(/['"`]([\w.]+)['"`]\s+column/i);
  return m?.[1]?.split('.').pop() || null;
}

// Insert one row, dropping any column the table doesn't know about and
// retrying. Returns the inserted row.
async function insertRow(table, row) {
  let body = { ...row };
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase.from(table).insert(body).select().single();
    if (!error) return data;
    const col = missingColumn(error);
    if (!col || !(col in body)) throw error;
    delete body[col];
  }
  throw new Error(`[seed] ${table} insert exhausted retries`);
}

// Insert many rows in one call, dropping unknown columns from the whole
// batch and retrying.
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
  throw new Error(`[seed] ${table} batch insert exhausted retries`);
}

// ── The July plan ───────────────────────────────────────────────────
// Each clip's sort_order is its index within the drop.
const DROPS = [
  {
    title: 'מי זה אתלטיגו', publish_date: '2026-07-01', funnel: 'brand',
    clips: [
      { title: 'ספורט זה שפה — ורוב האנשים לא לומדים אותה', clip_type: 'value', status: 'script_ready',
        hook: 'אתה יכול להתאמן עשר שנים ועדיין לא לדעת לדבר עם הגוף שלך.',
        script: 'אתה יכול להתאמן עשר שנים ועדיין לא לדעת לדבר עם הגוף שלך.\nרוב האנשים מתאמנים כדי להזיע. אני מלמד אנשים לדבר עם הגוף.\nספורט זה שפה. תנועה זה מילים. שליטה זה שטף.\nואם אתה לא יודע את המילים — אתה לא יכול לבנות משפט.',
        loop_close: 'ובקליפ הבא אני אראה לכם מה קורה כשלומדים', target_audience: 'כללי' },
      { title: 'מה ההבדל בין כוח לשליטה', clip_type: 'value', status: 'script_ready',
        hook: 'יש אנשים שמרימים 100 קילו ולא יכולים לעשות עמידת ידיים. למה?',
        script: 'יש אנשים שמרימים 100 קילו ולא יכולים לעשות עמידת ידיים.\nלא בגלל שהם חלשים. בגלל שהם חזקים רק בכיוון אחד.\nכוח זה כמה אתה יכול לדחוף. שליטה זה כמה אתה יכול לכוון.\nאתה יכול להיות חזק בלי שליטה — אבל אתה לא יכול להיות אתלט בלי שליטה.',
        loop_close: 'ויש מכשיר אחד שמלמד את ההבדל הזה', target_audience: 'כללי' },
      { title: 'למה אני לא מלמד אנשים להתאושש מפציעות', clip_type: 'inspire', status: 'script_ready',
        hook: 'כולם שואלים אותי איך לחזור מפציעה. אני שואל אותם — למה נפצעת?',
        script: 'כולם שואלים אותי איך לחזור מפציעה.\nאני שואל אותם — למה נפצעת?\nאני לא מלמד אנשים להתאושש מפציעות.\nאני מלמד אנשים להתאמן ככה שהם לא ייפצעו מלכתחילה.\nזה ההבדל בין להתמודד עם בעיה לבין למנוע אותה.',
        loop_close: 'ואם תרצו לראות איך אימון נכון נראה מהיום הראשון — תשארו', target_audience: 'כללי' },
      { title: 'למה בניתי את הדרים מאשין', clip_type: 'value', status: 'script_ready',
        hook: 'לקח לי שנתיים לבנות את המכשיר הזה. ואני כמעט ויתרתי.',
        script: 'לקח לי שנתיים לבנות את המכשיר הזה. ואני כמעט ויתרתי.\nכשהתחלתי לאמן, השתמשתי בציוד רגיל.\nאבל כל פעם שרציתי ללמד תנועה אמיתית — חסר משהו.\nהמשקולות לא נתנו שליטה. המכשירים לא נתנו חופש.\nאז התחלתי לבנות משהו שעובד אחרת.',
        loop_close: 'רוצים לראות מה יצא מזה? דרופ הבא.', target_audience: 'כללי' },
    ],
  },
  {
    title: 'דרים מאשין — מקרוב', publish_date: '2026-07-04', funnel: 'dm',
    clips: [
      { title: 'חדר כושר שלם. נכנס לתיק גב.', clip_type: 'product', status: 'script_ready',
        hook: 'חמש צורות אימון. מכשיר אחד. מחזיק מעל 120 קילו.',
        script: 'חדר כושר שלם. נכנס לתיק גב.\nחמש צורות אימון שונות ממכשיר אחד — אימון מופחת משקל, אימון עם משקולות חיצוניות, אימון בכבלים, אימון על טבעות, ואימון עם עומס עודף.\nמחזיק מעל מאה ועשרים קילו.\nשורד שנים של שימוש.\nוכל מה שאתה צריך זה מוט ועשר דקות להרכבה.\nאני לא צריך להגיד לך שזה טוב. תסתכל מה יש בפנים ותחליט לבד.',
        loop_close: 'אבל מה קורה כשמישהו עולה עליו בפעם הראשונה?', target_audience: 'כללי' },
      { title: 'מתאמן שלא מצליח עליית מתח — מצליח מיד', clip_type: 'proof', status: 'script_ready',
        hook: 'תעלה אותו על הדרים מאשין. ברוב המקרים — מיד.',
        script: 'אם אתה מאמן ויש לך מתאמן שלא מצליח לעשות עליית מתח — תעלה אותו על הדרים מאשין ותראה מה קורה.\nברוב המקרים הוא יצליח מיד.\nלא אחרי חודש. לא אחרי תוכנית. מיד.\nכי המערכת מורידה חמישים אחוז ממשקל הגוף ונותנת לו להרגיש תנועה שהוא אף פעם לא הרגיש קודם.\nוהרגע שהגוף מכיר את התנועה — אתה כמאמן יכול לעבוד עם זה.\nבלי זה אתה מסביר. עם זה אתה מלמד.',
        loop_close: 'ועכשיו תראו מה קורה עם תנועות שבאמת קשות', target_audience: 'מאמנים' },
      { title: 'הרגע שמתאמנים אומרים וואו', clip_type: 'proof', status: 'script_ready',
        hook: 'יש רגע שחוזר על עצמו עם כל מתאמן שעולה בפעם הראשונה.',
        script: 'אתה מתאמן כבר שנה שנתיים ועלייה לכוח עדיין מרגישה רחוקה.\nאני אגיד לך מה קורה כשבנאדם כזה עולה על הדרים מאשין בפעם הראשונה.\nהוא עושה את התנועה — ואומר וואו.\nלא כי זה קל. כי פתאום הוא מרגיש איך התנועה אמורה להיראות.\nהגוף שלו מכיר משהו חדש.\nומהרגע הזה הדרך מתקצרת בחודשים.\nלא בגלל קסם — בגלל שהגוף לא יכול לשכוח תנועה שהוא כבר הרגיש.',
        loop_close: 'עכשיו שאתם מבינים — בואו נראה איך מתאמנים על זה בבית', target_audience: 'מתאמנים תקועים' },
      { title: '3 תנועות ביתיות על הדרים מאשין', clip_type: 'product', status: 'script_ready',
        hook: 'שלוש תנועות. מכשיר אחד. אימון שלם בעשר דקות.',
        script: 'שלוש תנועות. מכשיר אחד. אימון שלם בעשר דקות.\nתנועה ראשונה: דחיפה מבוקרת.\nתנועה שנייה: משיכה עם שליטה.\nתנועה שלישית: תנועה דינמית.\nלא צריך חדר כושר. לא צריך חמישה מכשירים.\nמכשיר אחד. כל הגוף. שליטה מלאה.',
        loop_close: 'ואם אתם מאמנים — הקליפ הבא בשבילכם', target_audience: 'כללי' },
      { title: 'למאמנים: בלי זה אתה מסביר. עם זה אתה מלמד.', clip_type: 'proof', status: 'script_ready',
        hook: 'אם אתה מאמן ואין לך דרים מאשין — אתה מגביל את המתאמנים שלך.',
        script: 'אם אתה מאמן ואין לך דרים מאשין — אתה מגביל את המתאמנים שלך.\nכי יש תנועות שאתה לא יכול ללמד בלי לתת למתאמן להרגיש אותן קודם.\nעלייה לכוח. פלאנצ׳. פרונט לבר.\nאתה יכול להסביר את זה שעות — אבל עד שהגוף לא מרגיש את התנועה, שום דבר לא נדלק.\nהדרים מאשין מוריד חמישים אחוז מהמשקל ונותן למתאמן שלך להרגיש את מה שהוא עוד לא מסוגל לעשות לבד.\nזה לא עזר אימון. זה כלי הוראה.',
        loop_close: 'קישור בביו. ועכשיו — בואו נדבר על מה שבאמת הופך מתאמן.', target_audience: 'מאמנים' },
    ],
  },
  {
    title: 'השיטה — ליווי אישי', publish_date: '2026-07-08', funnel: 'coach',
    clips: [
      { title: '5 דברים שאני בודק במתאמן חדש לפני שאני כותב תוכנית', clip_type: 'value', status: 'idea',
        hook: 'רוב המאמנים כותבים תוכנית אימון ביום הראשון. אני לא.', script: '',
        loop_close: 'ואחרי שבדקתי — מה קורה? הקליפ הבא.', target_audience: 'מאמנים + מתאמנים' },
      { title: 'איך אני בונה תוכנית אימון אישית — BTS', clip_type: 'bts', status: 'idea',
        hook: 'הנה בדיוק מה שאני עושה כשמתאמן חדש נכנס.', script: '',
        loop_close: 'ואחרי חודש — מה התוצאות? הקליפ הבא.', target_audience: 'כללי' },
      { title: 'מתאמן — חודש ראשון: לפני ואחרי', clip_type: 'proof', status: 'idea',
        hook: 'הוא הגיע בלי עליית מתח אחת. אחרי חודש —', script: '',
        loop_close: 'רוצים לשמוע ממנו ישירות?', target_audience: 'מתאמנים' },
      { title: 'מה מקבלים בליווי אישי — הכל על השולחן', clip_type: 'product', status: 'idea',
        hook: 'אני לא הולך להגיד לכם שזה ישנה לכם את החיים. אני אראה לכם מה כלול.', script: '',
        loop_close: 'נשאר מקום אחד. קישור בביו.', target_audience: 'כללי' },
    ],
  },
  {
    title: 'תנועה = חיים', publish_date: '2026-07-12', funnel: 'brand',
    clips: [
      { title: 'למה קפיצה בחבל זו המיומנות הכי מוערכת בחסר', clip_type: 'value', status: 'idea',
        hook: 'זה לא קרדיו. זו מיומנות. ורוב האנשים לא מבינים את ההבדל.', script: '',
        loop_close: 'ויש עוד כלי אחד שאנשים מזלזלים בו — הקליפ הבא', target_audience: 'כללי' },
      { title: 'הטעות שמתאמנים עושים כשהם מתאמנים לבד', clip_type: 'value', status: 'idea',
        hook: 'אתה לא צריך מאמן כדי להתאמן. אתה צריך מאמן כדי לא לטעות.', script: '',
        loop_close: 'והנה הכלי שמפצה על מה שאין מאמן לידך', target_audience: 'מתאמנים' },
      { title: 'תרגיל בוקר של 5 דקות שמשנה את היום', clip_type: 'value', status: 'idea',
        hook: 'כל בוקר, לפני הכל, 5 דקות. בלי ציוד. בלי תירוצים.', script: '',
        loop_close: 'ואם אתם רוצים ללמוד תנועות שדורשות ציוד — דרופ הבא', target_audience: 'מתחילים' },
      { title: 'מאחורי הקלעים — יום אימון שלי', clip_type: 'bts', status: 'idea',
        hook: '', script: '', loop_close: '', target_audience: 'כללי' },
    ],
  },
  {
    title: 'הארגז — כלים למיומנות', publish_date: '2026-07-16', funnel: 'prod',
    clips: [
      { title: 'טבעות: התרגיל שמגלה את החולשה שלך', clip_type: 'value', status: 'idea',
        hook: 'תרגיל אחד. 10 שניות. ותדע בדיוק מה חלש אצלך.', script: '',
        loop_close: 'ויש כלי שבונה בדיוק את מה שהטבעות חשפו — הקליפ הבא', target_audience: 'מתאמנים' },
      { title: 'פרלטים: 3 תרגילים שבונים כתפיים של ברזל', clip_type: 'value', status: 'idea',
        hook: 'שלושה תרגילים. שתי ידיות. כתפיים שלא תאמינו שיש לכם.', script: '',
        loop_close: 'ואם אתם רוצים לאמן את כל הגוף — יש עוד כלי שעובד אחרת', target_audience: 'מתאמנים' },
      { title: 'גומיות: הכלי הכי זול שנותן הכי הרבה', clip_type: 'value', status: 'idea',
        hook: 'ב-200 שקל אתה מקבל כלי שנכנס לכיס ומחליף 5 מכשירים.', script: '',
        loop_close: 'ועכשיו — מה קורה כששמים את כל הכלים ביחד?', target_audience: 'כללי' },
      { title: 'הדבר שמאמנים טובים יודעים ורוב המתאמנים לא', clip_type: 'value', status: 'script_ready',
        hook: 'אתה לא יכול ללמוד תנועה שהגוף שלך אף פעם לא הרגיש.',
        script: 'אתה לא יכול ללמוד תנועה שהגוף שלך אף פעם לא הרגיש.\nזה כמו לנסות להסביר למישהו טעם של אוכל שהוא לא טעם.\nהדרים מאשין מוריד ממך חמישים אחוז מהמשקל ונותן לגוף שלך להרגיש תנועות שהוא עוד לא מסוגל לעשות לבד.\nברגע שהגוף מכיר — הכל משתנה.',
        loop_close: 'זה כמו טעם של אוכל שלא טעמת. קישור בביו.', target_audience: 'מאמנים + מתאמנים' },
    ],
  },
  {
    title: 'ביחד — קבוצות 2027', publish_date: '2026-07-20', funnel: 'group',
    clips: [
      { title: 'למה אימון קבוצתי עובד — ולמה רוב הקבוצות לא', clip_type: 'value', status: 'idea',
        hook: 'בקבוצה רגילה אתה מספר. בקבוצה שלנו אתה שם.', script: '',
        loop_close: 'רוצים לראות איך זה נראה מבפנים?', target_audience: 'כללי' },
      { title: 'רגע מתוך אימון קבוצתי — האנרגיה שלא מקבלים לבד', clip_type: 'proof', status: 'idea',
        hook: '', script: '', loop_close: 'פותחים רישום. הקליפ הבא — כל הפרטים.', target_audience: 'כללי' },
      { title: 'קבוצות אתלטיגו 2027 — הרישום נפתח', clip_type: 'product', status: 'idea',
        hook: 'תאריך. מחיר. מספר מקומות. הנה הכל.', script: '',
        loop_close: 'קישור בביו. מי שרוצה — עכשיו.', target_audience: 'כללי' },
    ],
  },
  {
    title: 'הוכחות — תוצאות אמיתיות', publish_date: '2026-07-24', funnel: 'coach',
    clips: [
      { title: '3 חודשי ליווי — התוצאות מדברות', clip_type: 'proof', status: 'idea',
        hook: 'הוא הגיע ככה. אחרי 3 חודשים — ככה.', script: '',
        loop_close: 'ומי שחושב שזה רק למתקדמים — הקליפ הבא', target_audience: 'מתאמנים' },
      { title: 'מתחילים — מה קורה בחודש הראשון של ליווי', clip_type: 'value', status: 'idea',
        hook: 'לא צריך להיות ספורטאי. צריך להתחיל.', script: '',
        loop_close: 'ומי שכבר מתקדם — יש רמה אחרת. הקליפ הבא.', target_audience: 'מתחילים' },
      { title: '3 טעויות שאני רואה כל יום — ואיך לתקן', clip_type: 'value', status: 'idea',
        hook: 'אני רואה את זה בכל אימון. שלוש טעויות שאף אחד לא מתקן.', script: '',
        loop_close: 'ומי שרוצה שאני אתקן לו אישית — נשאר מקום אחרון. קישור בביו.', target_audience: 'מתאמנים' },
      { title: 'המכשיר שמחליף חדר כושר שלם — סגירת חודש', clip_type: 'product', status: 'script_ready',
        hook: 'חודש שלם של תוכן. עכשיו תחליטו לבד.',
        script: 'חודש שלם של תוכן. עכשיו תחליטו לבד.\nהנה מה שראיתם:\nמכשיר אחד. חמש צורות אימון.\nמתאמנים שעלו עליו בפעם הראשונה ואמרו וואו.\nמאמנים שהבינו שזה כלי הוראה.\nאני לא צריך להגיד לכם עוד כלום.\nקישור בביו. אני כאן.',
        loop_close: '', target_audience: 'כללי' },
    ],
  },
  {
    title: 'מה הלאה — מומנטום', publish_date: '2026-07-28', funnel: 'brand',
    clips: [
      { title: 'מה למדתי מ-10 שנים של אימון גופני', clip_type: 'value', status: 'idea',
        hook: '10 שנים. אלפי שעות. ויש דבר אחד שהייתי משנה.', script: '',
        loop_close: 'ואם אתם בהתחלה — הקליפ הבא בשבילכם', target_audience: 'כללי' },
      { title: 'לכל מי שרק מתחיל — תקשיבו', clip_type: 'inspire', status: 'idea',
        hook: 'אתם לא צריכים להיות מוכנים. אתם צריכים להתחיל.', script: '',
        loop_close: 'ובקליפ הבא — מה מחכה באוגוסט', target_audience: 'מתחילים' },
      { title: 'סיכום חודש + מה מחכה באוגוסט', clip_type: 'bts', status: 'idea',
        hook: 'חודש אחד, 31 קליפים, והרבה דברים שהשתנו.', script: '',
        loop_close: 'תישארו. הכי טוב עוד לפניכם.', target_audience: 'כללי' },
    ],
  },
];

// Dedupe concurrent calls within a session (React can mount twice).
let inFlight = null;

export async function seedJulyContent(coachId) {
  if (!coachId) return { seeded: false, reason: 'no-coach' };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // 1) Idempotency — bail if this coach already has any drops. RLS
    //    already scopes rows to the coach; the explicit coach_id filter
    //    is a belt-and-suspenders guard.
    let existing = await supabase.from('content_drops').select('id').eq('coach_id', coachId).limit(1);
    if (existing.error && missingColumn(existing.error) === 'coach_id') {
      existing = await supabase.from('content_drops').select('id').limit(1);
    }
    if (existing.error) { console.error('[seed] existence check failed', existing.error); return { seeded: false, reason: 'check-failed' }; }
    if (existing.data && existing.data.length) return { seeded: false, reason: 'already-seeded' };

    // 2) Insert drops + their clips.
    let drops = 0, clips = 0;
    for (const d of DROPS) {
      const drop = await insertRow('content_drops', {
        coach_id: coachId,
        title: d.title,
        publish_date: d.publish_date,
        funnel: d.funnel,
        status: 'draft',
      });
      drops += 1;
      const rows = d.clips.map((c, i) => ({
        coach_id: coachId,
        drop_id: drop.id,
        sort_order: i,
        title: c.title,
        hook: c.hook,
        script: c.script,
        loop_close: c.loop_close,
        clip_type: c.clip_type,
        target_audience: c.target_audience,
        status: c.status,
      }));
      const inserted = await insertMany('content_clips', rows);
      clips += inserted.length;
    }

    console.log(`[seed] July content seeded: ${drops} drops, ${clips} clips`);
    return { seeded: true, drops, clips };
  })();

  try {
    return await inFlight;
  } catch (e) {
    console.error('[seed] July content seed failed', e);
    inFlight = null; // allow a later retry after a transient failure
    return { seeded: false, reason: 'error', error: e };
  }
}
