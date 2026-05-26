// Curated option lists for text-type parameters. Defaults come from
// the pre-STEP-9 form's BODY_POSITION_OPTIONS / EQUIPMENT_OPTIONS /
// DEFAULTS table (recovered from git history at dd9c441~1). User-added
// custom values append into localStorage and merge with defaults on
// read — so a coach's "+ הוסף מותאם" survives across exercises and
// reloads but never overwrites the curated baseline.

const STORAGE_PREFIX = 'athletigo:paramOptions:';

const DEFAULTS = {
  body_position: [
    'עמידה',
    'ישיבה',
    'שכיבה על הגב',
    'שכיבה על הבטן',
    'שכיבה על צד',
    'תלייה',
    'תמיכה',
    'ברכיים',
    'טבעות',
    'מקבילים',
    'פראלטים',
  ],
  foot_position: [
    'צמוד',
    'רוחב כתפיים',
    'רחב',
    'רגל אחת (L/R)',
    'מפוסקות',
  ],
  grip: [
    'צרה',
    'בינונית',
    'רחבה',
    'פרונציה',
    'סופינציה',
    'ניטרלית',
    'מעורבת',
  ],
  equipment: [
    'משקל גוף',
    'משקולות יד',
    'מוט',
    'קטלבל',
    'גומיות',
    'TRX',
    'טבעות',
    'מתח',
    'מקבילים',
    'פראלטים',
    'Dream Machine',
    'תיבה',
    'כדור',
    'מכונה',
  ],
  load_type: [
    'משקל גוף',
    'משקל חיצוני',
    'גומיות',
    'משקל וגומיות',
    'מכונה',
    'טבעות',
  ],
  side: [
    'דו־צדדי',
    'ימין',
    'שמאל',
    'לסירוגין',
  ],
  range_of_motion: [
    'מלא',
    'חצי',
    'חלקי',
    'אקצנטרי בלבד',
    'איזומטרי',
  ],
  tempo: [
    '2-0-2',
    '3-1-1',
    '2-1-2',
    '4-0-1',
    'איטי',
    'מהיר',
    'נפיץ',
  ],
};

// Get the full option list for a param — defaults + user-added
// customs from localStorage. Deduped so a custom that matches an
// existing default doesn't double-render.
export function getParamOptions(paramKey) {
  const defaults = DEFAULTS[paramKey] || [];
  try {
    if (typeof localStorage === 'undefined') return defaults;
    const stored = localStorage.getItem(STORAGE_PREFIX + paramKey);
    const custom = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(custom)) return defaults;
    const seen = new Set();
    const merged = [];
    for (const opt of [...defaults, ...custom]) {
      if (typeof opt !== 'string') continue;
      const trimmed = opt.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      merged.push(trimmed);
    }
    return merged;
  } catch {
    return defaults;
  }
}

// Persist a user-added option (called when they type a new value via
// the "+ הוסף מותאם" path). Defaults aren't re-stored. Existing
// customs aren't duplicated.
export function addParamOption(paramKey, newOption) {
  if (!newOption || typeof newOption !== 'string') return;
  const trimmed = newOption.trim();
  if (!trimmed) return;
  const defaults = DEFAULTS[paramKey] || [];
  if (defaults.includes(trimmed)) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_PREFIX + paramKey);
    const custom = Array.isArray(JSON.parse(stored || '[]')) ? JSON.parse(stored || '[]') : [];
    if (custom.includes(trimmed)) return;
    custom.push(trimmed);
    localStorage.setItem(STORAGE_PREFIX + paramKey, JSON.stringify(custom));
  } catch {
    // localStorage unavailable — ignore.
  }
}

// Whether a param has preset options vs. free-text input.
export function hasOptions(paramKey) {
  return Object.prototype.hasOwnProperty.call(DEFAULTS, paramKey);
}

export const ALL_PARAM_KEYS = Object.keys(DEFAULTS);
