// ── Lead-intake tree — default schema (data, not code) ──────────────
// The whole recursive question tree lives here as plain data so the
// engine (LeadIntakeTree) never hard-codes a question. Phase ב (the
// admin editor) will persist an edited copy in the DB and feed it to the
// same engine; until then this bundled default is the source of truth.
//
// Node shape:
//   { id, group, q, kind?, multi?, save?, saveText?, freeText?, placeholder?,
//     options?: [ { key, label, value?, rapport?, save?, children?: [Node] } ] }
// - kind defaults to 'chips'. Special kinds: 'contact' | 'summary' |
//   'offer' | 'objection' | 'closing' (rendered by dedicated blocks).
// - freeText defaults to true for 'chips' nodes (the free-text law) — a
//   node-scoped expanding textarea beside the chips.
// - save = existing lead column the selected chip's value maps to; a
//   chip's own `value` overrides its key for saving. Unmapped answers +
//   every free-text note go to extra_details, labelled by the question.
// - options[].children = the sub-tree revealed ONLY when that chip is
//   picked (recursive, unlimited depth).

export const SCHEMA_VERSION = 1;

export const GROUPS = [
  { key: 'opening',  label: 'פתיחה' },
  { key: 'intro',    label: 'היכרות' },
  { key: 'diagnose', label: 'אבחון' },
  { key: 'match',    label: 'התאמה' },
  { key: 'sale',     label: 'מכירה' },
];

// Reusable deep injury branch, per body part → mechanism → surgery →
// medical clearance (the spec's 4-level example).
const surgeryClearance = {
  id: 'inj_surgery_when', q: 'מתי הניתוח?', save: null,
  options: [
    { key: 'lt6m',  label: 'פחות מחצי שנה', children: [clearanceNode('fresh')] },
    { key: 'lt2y',  label: 'עד שנתיים',     children: [clearanceNode('mid')] },
    { key: 'gt2y',  label: 'מעל שנתיים',    children: [clearanceNode('old')] },
  ],
};
function clearanceNode() {
  return {
    id: 'inj_clearance', q: 'אישור רופא לפעילות?',
    options: [
      { key: 'yes',   label: 'כן', rapport: 'surgery_cleared' },
      { key: 'no',    label: 'לא', rapport: 'needs_clearance' },
      { key: 'check', label: 'צריך לבדוק', rapport: 'needs_clearance' },
    ],
  };
}
const shoulderBranch = {
  id: 'inj_shoulder_type', q: 'מה בכתף?', placeholder: 'פרט/י מה קרה בכתף...',
  options: [
    { key: 'sprain',   label: 'נקע' },
    { key: 'tear',     label: 'קרע' },
    { key: 'dislocs',  label: 'פריקות חוזרות', rapport: 'injury_active' },
    { key: 'chronic',  label: 'כאב כרוני', rapport: 'chronic_pain',
      children: [{ id: 'inj_shoulder_trigger', q: 'מה מעורר את הכאב?', placeholder: 'תנועה / עומס / שעה ביום...' }] },
    { key: 'post_op',  label: 'אחרי ניתוח', children: [surgeryClearance] },
  ],
};
const backBranch = {
  id: 'inj_back_type', q: 'מה בגב התחתון?', placeholder: 'פרט/י...',
  options: [
    { key: 'disc',     label: 'פריצת דיסק', rapport: 'chronic_pain' },
    { key: 'sitting',  label: 'מישיבה ממושכת' },
    { key: 'postpart', label: 'אחרי לידה' },
    { key: 'post_op',  label: 'אחרי ניתוח', children: [surgeryClearance] },
    { key: 'other',    label: 'אחר' },
  ],
};
const genericJoint = (id, label) => ({
  id: `inj_${id}_type`, q: `מה ב${label}?`, placeholder: 'פרט/י...',
  options: [
    { key: 'sprain',  label: 'נקע/מתיחה' },
    { key: 'tear',    label: 'קרע' },
    { key: 'chronic', label: 'כאב כרוני', rapport: 'chronic_pain' },
    { key: 'post_op', label: 'אחרי ניתוח', children: [surgeryClearance] },
  ],
});

// ── The default tree ────────────────────────────────────────────────
export const DEFAULT_INTAKE_TREE = [
  // ═════ פתיחה ═════
  { id: 'contact', group: 'opening', kind: 'contact', q: 'מי מתקשר?' },

  {
    id: 'source', group: 'opening', q: 'איך הגיע אלינו?', save: 'source',
    placeholder: 'פרטים על ההגעה...',
    options: [
      { key: 'direct',   label: 'שיחה ישירה', value: 'שיחה נכנסת' },
      { key: 'referral', label: 'הפניה', value: 'הפניה', rapport: 'referral',
        children: [{ id: 'referral_from', q: 'ממי ההפניה?', placeholder: 'שם הממליץ/ה' }] },
      { key: 'ad',       label: 'פרסום', value: 'פרסום' },
      { key: 'saw',      label: 'ראה בפעילות', value: 'ראה בפעילות', rapport: 'saw_activity' },
    ],
  },

  {
    id: 'for_whom', group: 'opening', q: 'בשביל מי?', save: 'for_whom',
    options: [
      { key: 'self', label: 'עצמו/ה', value: 'self', children: [
        { id: 'self_age',  q: 'גיל', kind: 'text', placeholder: 'גיל' },
        { id: 'self_area', q: 'אזור מגורים', kind: 'text', placeholder: 'עיר/אזור' },
      ] },
      { key: 'child', label: 'ילד/ה', value: 'child', rapport: 'for_child', children: [
        { id: 'child_age', q: 'גיל הילד/ה', kind: 'text', placeholder: 'גיל' },
        { id: 'child_decider', q: 'מי ההורה שמחליט?', placeholder: 'שם/תפקיד',
          options: [{ key: 'mom', label: 'אמא' }, { key: 'dad', label: 'אבא' }, { key: 'both', label: 'שניהם' }] },
      ] },
      { key: 'group', label: 'קבוצה', value: 'group', rapport: 'for_group', children: [
        { id: 'group_size', q: 'כמה משתתפים?', kind: 'text', save: 'group_size', placeholder: 'מספר' },
        { id: 'group_where', q: 'איפה?', kind: 'text', save: 'group_location', placeholder: 'מיקום' },
        { id: 'group_mix', q: 'הרכב', options: [
          { key: 'boys',  label: 'בנים' }, { key: 'girls', label: 'בנות' },
          { key: 'mixed', label: 'מעורב' },
        ], children: null, placeholder: 'גילאים ופירוט' },
        { id: 'group_know', q: 'מכירים זה את זה?', options: [
          { key: 'yes', label: 'כן' }, { key: 'no', label: 'לא' }, { key: 'some', label: 'חלקית' },
        ] },
      ] },
      { key: 'school', label: 'בית ספר / ארגון', value: 'org', for_org: true, children: [
        {
          id: 'org_type', q: 'איזה ארגון?',
          options: [
            // ── בית ספר ──
            { key: 'school', label: 'בית ספר', rapport: 'for_school', children: [
              { id: 'school_level', q: 'שלב', options: [
                { key: 'elementary', label: 'יסודי' }, { key: 'secondary', label: 'על-יסודי' } ] },
              { id: 'school_classes', q: 'כמה כיתות?', kind: 'text', placeholder: 'מספר כיתות' },
              { id: 'school_ages', q: 'גילאים', kind: 'text', placeholder: 'טווח גילאים' },
              { id: 'school_frame', q: 'מסגרת', save: 'service_type',
                options: [
                  { key: 'sport_lessons', label: 'שיעורי ספורט', value: 'group' },
                  { key: 'afternoon',     label: 'צהרון', value: 'group' },
                  { key: 'club',          label: 'חוג', value: 'group' },
                  { key: 'day_of_fun',    label: 'יום שיא', value: 'workshop', rapport: 'day_of_fun', children: [
                    { id: 'dof_date',    q: 'תאריך יום השיא', kind: 'text', save: 'target_date', placeholder: 'תאריך' },
                    { id: 'dof_parallel', q: 'כמה כיתות במקביל?', kind: 'text', placeholder: 'מספר' },
                    { id: 'dof_venue',   q: 'איפה?', options: [
                      { key: 'gym',  label: 'אולם' }, { key: 'yard', label: 'חצר' } ] },
                    { id: 'dof_topic',   q: 'נושא מבוקש', kind: 'text', save: 'workshop_topic', placeholder: 'נושא' },
                  ] },
                ] },
              { id: 'school_budget', q: 'מי מאשר תקציב?', options: [
                { key: 'principal', label: 'מנהל/ת' }, { key: 'coord', label: 'רכז/ת' }, { key: 'muni', label: 'רשות' } ] },
              { id: 'school_insurance', q: 'נדרש אישור ביטוח / משרד החינוך?', options: [
                { key: 'yes', label: 'כן' }, { key: 'no', label: 'לא' }, { key: 'check', label: 'לבדוק' } ] },
            ] },
            // ── חברה ──
            { key: 'company', label: 'חברה', rapport: 'for_company', children: [
              { id: 'company_size', q: 'כמה עובדים?', kind: 'text', save: 'group_size', placeholder: 'מספר' },
              { id: 'company_where', q: 'איפה?', save: 'training_location',
                options: [{ key: 'office', label: 'במשרד', value: 'אצל הלקוח' }, { key: 'ext', label: 'מיקום חיצוני', value: 'אצל הלקוח' }] },
              { id: 'company_frame', q: 'מסגרת', options: [
                { key: 'welfare', label: 'רווחה' }, { key: 'event', label: 'אירוע' }, { key: 'active_break', label: 'הפסקה פעילה' } ] },
              { id: 'company_payer', q: 'מי מממן?', save: 'payer',
                options: [{ key: 'company', label: 'החברה', value: 'הארגון' }, { key: 'emp', label: 'העובדים', value: 'המשתתפים' }, { key: 'mixed', label: 'משולב', value: 'הארגון' }] },
              { id: 'company_contact', q: 'איש קשר בהנהלה', kind: 'text', placeholder: 'שם/תפקיד' },
            ] },
            // ── קיבוץ / יישוב / מתנ"ס / עמותה ──
            { key: 'community', label: 'קיבוץ / יישוב / מתנ"ס / עמותה', children: [
              { id: 'comm_audience', q: 'קהל', options: [
                { key: 'kids', label: 'ילדים' }, { key: 'adults', label: 'מבוגרים' },
                { key: 'seniors', label: 'גיל שלישי', value: 'seniors' }, { key: 'mixed', label: 'מעורב' } ] },
              { id: 'comm_size', q: 'כמה?', kind: 'text', save: 'group_size', placeholder: 'מספר' },
              { id: 'comm_where', q: 'איפה?', kind: 'text', save: 'group_location', placeholder: 'מיקום' },
              { id: 'comm_decider', q: 'מי מחליט ומשלם?', kind: 'text', placeholder: 'תפקיד' },
            ] },
          ],
        },
        { id: 'org_caller_role', q: 'תפקיד המתקשר', kind: 'text', save: 'contact_role', placeholder: 'תפקיד' },
        { id: 'org_authority', q: 'מחליט או ממליץ?', options: [
          { key: 'decider', label: 'מחליט/ה' }, { key: 'recommender', label: 'ממליץ/ה' } ] },
      ] },
    ],
  },

  // ═════ היכרות ═════
  {
    id: 'why_now', group: 'intro', q: 'למה עכשיו? (הטריגר)', placeholder: 'מה הניע את הפנייה עכשיו?',
    options: [
      { key: 'pain', label: 'כאב', rapport: 'pain_trigger', children: [
        { id: 'pain_where', q: 'איפה כואב וכמה זמן?', kind: 'text', placeholder: 'איבר + משך' } ] },
      { key: 'event', label: 'אירוע מתקרב', rapport: 'event_trigger', children: [
        { id: 'event_what', q: 'איזה אירוע?', options: [
          { key: 'wedding', label: 'חתונה' }, { key: 'army', label: 'גיוס' },
          { key: 'comp', label: 'תחרות' }, { key: 'summer', label: 'קיץ' } ],
          placeholder: 'ומתי?' } ] },
      { key: 'reco', label: 'המלצה', children: [
        { id: 'reco_from', q: 'ממי?', kind: 'text', placeholder: 'שם' } ] },
      { key: 'decision', label: 'החלטה אישית', children: [
        { id: 'decision_why', q: 'מה הניע את ההחלטה?', kind: 'text', placeholder: 'חופשי' } ] },
    ],
  },

  {
    id: 'sport_relationship', group: 'intro', q: 'יחסים עם ספורט — אוהב/ת?',
    placeholder: 'במילים שלהם...',
    options: [
      { key: 'loves', label: 'מאוד', rapport: 'loves_sport', children: [
        { id: 'loves_what', q: 'מה בדיוק אוהב/ת?', multi: true, options: [
          { key: 'after', label: 'התחושה אחרי' }, { key: 'compete', label: 'תחרות' },
          { key: 'social', label: 'החברה' }, { key: 'strong', label: 'גוף חזק' },
          { key: 'calm', label: 'שקט בראש' } ] } ] },
      { key: 'needs', label: 'פחות, אבל צריך/ה', rapport: 'needs_but', children: [
        { id: 'needs_barrier', q: 'מה מרתיע?', options: [
          { key: 'boring', label: 'משעמם', rapport: 'boring_gym' },
          { key: 'hard', label: 'קשה' },
          { key: 'notime', label: 'אין זמן', rapport: 'no_time' },
          { key: 'bad', label: 'חוויות רעות', rapport: 'bad_experience' } ] } ] },
      { key: 'hates', label: 'שונא/ת', rapport: 'hates_sport', children: [
        { id: 'hates_story', q: 'ספרו לי', kind: 'text', placeholder: 'חופשי' } ] },
    ],
  },

  {
    id: 'last_active', group: 'intro', q: 'מתי בפעם האחרונה שהתאמנת?',
    placeholder: 'מה השתנה מאז?',
    options: [
      { key: 'week',   label: 'השבוע' },
      { key: 'months', label: 'חודשים', children: [{ id: 'months_how', q: 'כמה חודשים?', kind: 'text', placeholder: 'מספר' }] },
      { key: 'years',  label: 'שנים', rapport: 'years_ago', children: [{ id: 'years_how', q: 'כמה שנים?', kind: 'text', placeholder: 'מספר' }] },
      { key: 'army',   label: 'לפני הצבא', rapport: 'before_army', children: [{ id: 'army_changed', q: 'מה השתנה מאז?', kind: 'text', placeholder: 'חופשי' }] },
    ],
  },

  {
    id: 'sport_history', group: 'intro', q: 'איזה ספורט ובאיזו מסגרת?',
    placeholder: 'מה נשאר? מה חסר משם?',
    multi: true,
    options: [
      { key: 'soccer', label: 'כדורגל' }, { key: 'gym', label: 'חדר כושר' },
      { key: 'run', label: 'ריצה' }, { key: 'martial', label: 'לחימה' },
      { key: 'dance', label: 'ריקוד' }, { key: 'other', label: 'אחר' },
    ],
  },

  {
    id: 'tried_before', group: 'intro', q: 'ניסו משהו קודם?',
    placeholder: 'מה היה חסר שם? (מפתח להצעה)',
    options: [
      { key: 'crossfit', label: 'חדר כושר / קרוספיט' },
      { key: 'studio',   label: 'סטודיו' },
      { key: 'trainer',  label: 'מאמן אישי' },
      { key: 'group',    label: 'קבוצתי' },
    ],
    // The "why it ended" reason is asked once regardless of what they tried.
    children: [{
      id: 'tried_why_end', q: 'למה נגמר?',
      options: [
        { key: 'boredom', label: 'שעמום', rapport: 'quit_boredom' },
        { key: 'price',   label: 'מחיר', rapport: 'quit_price' },
        { key: 'injury',  label: 'פציעה', rapport: 'quit_injury' },
        { key: 'no_care', label: 'חוסר יחס', rapport: 'quit_no_care' },
        { key: 'break',   label: 'הפסקה' },
      ],
    }],
  },

  {
    id: 'real_pain', group: 'intro', q: '💎 הכאב האמיתי — למה באמת התקשר/ה?',
    gold: true, kind: 'text', save: null,
    placeholder: 'מה הדבר האמיתי מתחת לפני השטח? (מוצג בראש כרטיס הליד)',
  },

  // ═════ אבחון ═════
  { id: 'fit_past', group: 'diagnose', q: 'רמת כושר בעבר', placeholder: 'במילים שלהם...',
    options: [{ key: 'low', label: 'נמוכה' }, { key: 'mid', label: 'בינונית' }, { key: 'high', label: 'גבוהה' }] },
  { id: 'fit_now', group: 'diagnose', q: 'רמת כושר היום', save: 'background_level', placeholder: 'במילים שלהם...',
    options: [
      { key: 'never',  label: 'לא התאמן שנים', value: 'לא התאמן שנים', rapport: 'never_trained' },
      { key: 'some',   label: 'מתאמן פה ושם', value: 'מתאמן פה ושם' },
      { key: 'reg',    label: 'מתאמן קבוע', value: 'מתאמן קבוע' },
      { key: 'comp',   label: 'רקע תחרותי', value: 'רקע תחרותי-מקצועי', rapport: 'competitive' },
    ] },
  { id: 'fit_future', group: 'diagnose', q: 'תמונה עתידית — איך רוצים להרגיש?', kind: 'text', save: 'fitness_goal',
    placeholder: 'במילים שלהם...' },

  {
    id: 'injuries', group: 'diagnose', q: 'פציעות שצריך להתחשב בהן?', save: 'injury_level',
    options: [
      { key: 'none',   label: 'אין', value: 'אין' },
      { key: 'past',   label: 'פציעות עבר שהחלימו', value: 'פציעות עבר שהחלימו' },
      { key: 'active', label: 'כאב/מגבלה פעילים', value: 'כאב או מגבלה פעילים', rapport: 'injury_active', children: [
        { id: 'inj_where', q: 'איפה?', save: 'injuries', multi: true,
          options: [
            { key: 'shoulder', label: 'כתף',       children: [shoulderBranch] },
            { key: 'back',     label: 'גב תחתון',  children: [backBranch] },
            { key: 'knee',     label: 'ברך',        children: [genericJoint('knee', 'ברך')] },
            { key: 'neck',     label: 'צוואר',      children: [genericJoint('neck', 'צוואר')] },
            { key: 'ankle',    label: 'קרסול',      children: [genericJoint('ankle', 'קרסול')] },
          ] },
      ] },
    ],
  },

  {
    id: 'goals', group: 'diagnose', q: 'מה הכי חשוב בתהליך? (עד 2)', save: 'activity_goals', multi: true,
    options: [
      { key: 'bonding', label: 'גיבוש' }, { key: 'fitness', label: 'כושר' },
      { key: 'health', label: 'בריאות' }, { key: 'challenge', label: 'אתגר' },
      { key: 'habit', label: 'הרגל' }, { key: 'confidence', label: 'ביטחון' },
      { key: 'skill', label: 'מיומנות' }, { key: 'education', label: 'ערך חינוכי' },
    ],
  },

  // ═════ התאמה ═════
  {
    id: 'service_type', group: 'match', q: 'איזה פורמט הכי מתאים?', save: 'service_type',
    options: [
      { key: 'personal',   label: 'אימון אישי' },
      { key: 'group',      label: 'קבוצה' },
      { key: 'online',     label: 'ליווי אונליין' },
      { key: 'workshop',   label: 'סדנה' },
      { key: 'movement65', label: 'תנועה בכיף 65+' },
      { key: 'other',      label: 'אחר' },
    ],
  },
  {
    id: 'location', group: 'match', q: 'איפה נוח?', save: 'training_location',
    options: [
      { key: 'studio', label: 'הסטודיו שלנו', value: 'הסטודיו שלנו' },
      { key: 'client', label: 'אצלם', value: 'אצל הלקוח', children: [
        { id: 'home_equip', q: 'ציוד במקום?', kind: 'text', placeholder: 'מה יש' } ] },
      { key: 'online', label: 'אונליין', value: 'אונליין' },
    ],
  },
  { id: 'frequency', group: 'match', q: 'תדירות + ימים ושעות', kind: 'text', save: 'frequency_per_week',
    placeholder: 'למשל: פעמיים בשבוע, ערבים' },
  { id: 'start_when', group: 'match', q: 'מתי מתחילים?', save: 'start_date_pref',
    options: [{ key: 'asap', label: 'בהקדם', value: 'asap' }, { key: 'next_month', label: 'חודש הבא', value: 'next_month' }] },
  { id: 'budget', group: 'match', q: 'תקציב או מסגרת מחיר בראש?', kind: 'text', save: 'proposed_price',
    placeholder: '₪ (לא חובה)' },

  // ═════ מכירה ═════
  { id: 'summary',   group: 'sale', kind: 'summary',   q: 'סיכום להקראה' },
  { id: 'offer',     group: 'sale', kind: 'offer',     q: 'ההצעה' },
  { id: 'objection', group: 'sale', kind: 'objection', q: 'תגובה והתנגדויות' },
  { id: 'closing',   group: 'sale', kind: 'closing',   q: 'סגירה' },
];
