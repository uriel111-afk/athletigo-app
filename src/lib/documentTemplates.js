// ============================================================
// AthletiGo — Document templates registry
//
// Each template defines:
//   - structured fields the coach fills BEFORE the body text
//   - bodyTemplate with {{key}} placeholders interpolated from
//     the field values + a few well-known vars (trainee_name,
//     signed_date)
//
// Add a new template: add a key to DOCUMENT_TEMPLATES. The picker
// + flow dialog + viewer all key off the document_type column,
// so as long as the type starts with 'agreement_' the existing
// flow handles it.
// ============================================================

export const DOCUMENT_TEMPLATES = {

  health_declaration: {
    key: 'health_declaration',
    title: 'הצהרת בריאות',
    icon: '❤️',
    useCustomForm: true, // handled by HealthDeclarationForm in DocumentSigningTab
  },

  agreement_personal: {
    key: 'agreement_personal',
    title: 'הסכם שיתוף פעולה — אימון אישי',
    icon: '📝',

    fields: [
      {
        key: 'service_type',
        label: 'סוג שירות',
        type: 'select',
        options: [
          { value: 'personal', label: 'אימון אישי' },
          { value: 'duo',      label: 'אימון זוגי' },
          { value: 'group',    label: 'אימון קבוצתי' },
          { value: 'online',   label: 'אימון אונליין' },
        ],
        required: true,
      },
      {
        key: 'package_desc',
        label: 'מספר מפגשים / סוג חבילה',
        type: 'text',
        required: true,
        placeholder: 'למשל: חבילת 10 מפגשים',
      },
      { key: 'price',         label: 'מחיר שסוכם (₪)',        type: 'number',   required: true },
      { key: 'valid_until',   label: 'תוקף החבילה עד',        type: 'date',     required: true },
      { key: 'location',      label: 'מיקום האימונים',        type: 'text',     required: true },
      { key: 'notes',         label: 'הערות נוספות',          type: 'textarea', required: false },
      // Note: photo_consent is intentionally NOT a coach field — the trainee
      // marks it themselves at sign time. The {{photo_consent_label}}
      // placeholder in bodyTemplate gets filled then.
      { key: 'early_exit_price', label: 'מחיר מפגש במקרה סיום מוקדם (₪)', type: 'number', required: true, default: 350 },
    ],

    bodyTemplate: `הסכם שיתוף פעולה והצהרת מתאמן — AthletiGo

ברוך/ה הבא/ה ל-AthletiGo.
המטרה שלנו היא ללוות אותך בתהליך מקצועי, בטוח ומדורג — לפיתוח יכולות פיזיות, חיזוק הגוף והשגת תוצאות לאורך זמן.
ההסכם נועד לייצר תיאום ציפיות ברור, לשמור עליך כמתאמן/ת, ולאפשר סביבת אימון בטוחה, איכותית ומקצועית.

──────────────────────────────
פרטי ההתקשרות
──────────────────────────────

שם המתאמן: {{trainee_name}}
סוג שירות: {{service_type_label}}
חבילה: {{package_desc}}
מחיר שסוכם: {{price}} ₪
תוקף החבילה עד: {{valid_until}}
מיקום האימונים: {{location}}
הערות: {{notes}}

✓ אני מאשר/ת כי המחיר, היקף השירות ותנאי החבילה הוסכמו על ידי.

──────────────────────────────
חלקי כמאמן
──────────────────────────────
✓ ללוות אותך בתהליך אישי ומותאם לרמה שלך
✓ לבנות עבורך תהליך אימון מדורג, מבוקר וזהיר
✓ לאתגר את היכולות שלך תוך שמירה על בטיחות
✓ לעודד, להכווין ולתמוך לאורך הדרך

──────────────────────────────
חלקי כמתאמן/ת
──────────────────────────────
✓ לפעול מתוך אחריות ומחויבות לתהליך
✓ להגיע בזמן לאימונים
✓ להקשיב לגוף ולדווח על כל כאב או מגבלה

──────────────────────────────
מבנה האימון והתנהלות
──────────────────────────────
✓ משך אימון: כ-60 דקות
✓ איחור לאימון הינו על חשבון זמן האימון
✓ המאמן יעשה השתדלות להתחשב — בהתאם ליכולתו בלבד
✓ ייתכנו שינויים בלו״ז האימונים בתיאום מראש ככל הניתן
✓ אי הגעה או אי זמינות מצד המתאמן אינה מחייבת השלמת אימון

──────────────────────────────
ביטולים והתחייבות
──────────────────────────────
✓ ניתן לבטל אימון עד 24 שעות מראש
✓ ביטול מאוחר / היעדרות ייחשבו כאימון שבוצע

──────────────────────────────
כרטיסיות וסיום מוקדם
──────────────────────────────
✓ החבילה בתוקף עד למועד שצוין בפרטי ההתקשרות
✓ במקרה של הפסקת חבילה לפני סיומה:
עלות כל אימון שבוצע תחושב לפי {{early_exit_price}} ₪ למפגש
✓ ההפרש יחושב בהתאם לשימוש בפועל

──────────────────────────────
בטיחות והקשבה לגוף
──────────────────────────────
✓ האימונים מתבצעים בצורה מדורגת וזהירה
אני מבין/ה כי:
- מאמץ שרירי הוא חלק טבעי מהאימון
- כאב חד / כאב במפרקים אינו תקין
✓ אני מתחייב/ת להפסיק פעילות ולדווח מיידית במקרה של כאב חריג

──────────────────────────────
הסכמה ומודעות לסיכונים
──────────────────────────────
✓ אני מבין/ה כי פעילות גופנית כרוכה בסיכון מסוים
✓ אני משתתף/ת מרצוני החופשי ובאחריותי האישית

──────────────────────────────
שימוש בצילומים (שיווק)
──────────────────────────────
סטטוס אישור צילום: {{photo_consent_label}}

──────────────────────────────
פרטיות וסודיות
──────────────────────────────
✓ המידע האישי נשמר בהתאם לחוק הגנת הפרטיות

──────────────────────────────
תוקף ההסכם
──────────────────────────────
✓ ההסכם בתוקף לאורך כל תקופת ההתקשרות

──────────────────────────────
אישור והסכמה
──────────────────────────────
✓ קראתי והבנתי את ההסכם
✓ אני מאשר/ת את כל תנאי ההתקשרות והמחיר שסוכם

שם מלא: {{trainee_name}}
תאריך חתימה: {{signed_date}}
`,
  },

  agreement_group: {
    key: 'agreement_group',
    title: 'הסכם רישום — אימון קבוצתי',
    icon: '👥',
    fields: [
      { key: 'placeholder_note', label: 'שדה זמני', type: 'text', required: false },
    ],
    bodyTemplate: `[[ נוסח הסכם קבוצתי — להחלפה על ידי המשתמש ]]

שם המתאמן: {{trainee_name}}
תאריך חתימה: {{signed_date}}`,
  },

  agreement_online: {
    key: 'agreement_online',
    title: 'הסכם שירות אונליין',
    icon: '💻',
    fields: [
      { key: 'placeholder_note', label: 'שדה זמני', type: 'text', required: false },
    ],
    bodyTemplate: `[[ נוסח הסכם אונליין — להחלפה על ידי המשתמש ]]

שם המתאמן: {{trainee_name}}
תאריך חתימה: {{signed_date}}`,
  },
};

export const DOCUMENT_TYPES_LIST = Object.values(DOCUMENT_TEMPLATES);

function resolveFieldLabel(fieldDef, value) {
  if (!fieldDef?.options) return value ?? '';
  const opt = fieldDef.options.find(o => o.value === value);
  return opt?.label ?? (value ?? '');
}

// ── Photo consent helpers (object-shape with backwards compat) ──────────
const PHOTO_CONSENT_LABELS = {
  allowed:  'מאשר/ת שימוש בצילומים ותכנים לצרכי שיווק',
  denied:   'לא מאשר/ת',
  deferred: 'טרם הוחלט',
};

function fmtHebDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL');
}

export function getPhotoConsentStatus(value) {
  if (!value) return 'deferred';
  if (typeof value === 'string') {
    if (value === 'allowed' || value === 'denied' || value === 'deferred') return value;
    return 'deferred';
  }
  return value.status || 'deferred';
}

export function resolvePhotoConsentLabel(value) {
  // Legacy string shape (pre-upgrade-feature signed docs)
  if (!value || typeof value === 'string') {
    if (value === 'allowed') return PHOTO_CONSENT_LABELS.allowed;
    if (value === 'denied')  return PHOTO_CONSENT_LABELS.denied;
    return PHOTO_CONSENT_LABELS.deferred;
  }
  // Object shape: { status, decided_at, upgraded_at }
  const base = PHOTO_CONSENT_LABELS[value.status] ?? PHOTO_CONSENT_LABELS.deferred;
  const decided  = value.decided_at  ? ` (החלטה: ${fmtHebDate(value.decided_at)})`  : '';
  const upgraded = value.upgraded_at ? ` · עודכן: ${fmtHebDate(value.upgraded_at)}` : '';
  return `${base}${decided}${upgraded}`;
}

export function renderTemplateBody(key, fieldValues, vars = {}) {
  const tpl = DOCUMENT_TEMPLATES[key];
  if (!tpl || tpl.useCustomForm) return '';

  let body = tpl.bodyTemplate || '';

  body = body
    .replace(/\{\{trainee_name\}\}/g, vars.trainee_name || '')
    .replace(/\{\{signed_date\}\}/g, vars.signed_date || '');

  for (const field of (tpl.fields || [])) {
    const raw = fieldValues?.[field.key] ?? '';
    body = body.replace(
      new RegExp(`\\{\\{${field.key}\\}\\}`, 'g'),
      String(raw),
    );
    body = body.replace(
      new RegExp(`\\{\\{${field.key}_label\\}\\}`, 'g'),
      resolveFieldLabel(field, raw),
    );
  }

  // photo_consent is filled by the trainee at sign time, not a coach field.
  // The value can be:
  //   - undefined / null  → coach preview (placeholder shown empty)
  //   - 'allowed' | 'denied' | 'deferred'  → legacy string shape
  //   - { status, decided_at, upgraded_at }  → new object shape
  // resolvePhotoConsentLabel() handles all three.
  const pc = fieldValues?.photo_consent;
  body = body.replace(/\{\{photo_consent\}\}/g, pc ? String(getPhotoConsentStatus(pc)) : '');
  body = body.replace(/\{\{photo_consent_label\}\}/g, pc ? resolvePhotoConsentLabel(pc) : '');

  return body;
}
