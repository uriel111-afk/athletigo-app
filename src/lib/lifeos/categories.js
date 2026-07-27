import { Briefcase, Dumbbell, Repeat, Camera, Clapperboard, Users, Home, Circle } from 'lucide-react';
import { PERSONAL_ARM_TITLE, indexNodes } from './focus-api';

// ═══════════════════════════════════════════════════════════════════
// Categories — one per real domain, never merged
// ═══════════════════════════════════════════════════════════════════
// The seeded tree does not have one branch per domain: צילום and עריכה both
// live under 'יצירה', and 'גוף' holds both training and plain personal habits.
// Merging by branch would therefore collapse domains the user wants apart, so
// classification is an explicit ordered rule list instead:
//
//   0. a `cat:<key>` tag                  (the user said so — nothing overrides it)
//   1. a keyword rule on the task title   (splits one branch into domains)
//   2. the branch title                   (the common case)
//   3. outside the personal arm           → business
//   4. nothing matched                    → 'אחר', so a task is never lost
//
// Rule 0 exists because the drawer lets you add a task INTO a named category:
// that promise has to hold even when the title trips a keyword rule ("אימון
// בוקר" filed under בית must stay in בית). Only tasks created through that UI
// carry the tag, so everything else still classifies exactly as before.
//
// Colour families follow the brief: business/filming/content are the
// orange-red family, training/habits green, family/home purple. The colour is
// the category's identity — the same value paints the accordion header and the
// month-view dots, so one glance means the same thing on both.
// ═══════════════════════════════════════════════════════════════════

export const CATEGORIES = [
  { key: 'business', label: 'אתלטיגו · עסקי', color: '#E4572E', Icon: Briefcase },
  { key: 'training', label: 'אימון', color: '#16A34A', Icon: Dumbbell },
  { key: 'habits', label: 'הרגלים אישיים', color: '#0E9F6E', Icon: Repeat },
  { key: 'filming', label: 'צילום', color: '#F0803C', Icon: Camera },
  { key: 'content', label: 'תוכן ועריכה', color: '#C2410C', Icon: Clapperboard },
  { key: 'family', label: 'משפחה וחברים', color: '#7C3AED', Icon: Users },
  { key: 'home', label: 'בית', color: '#9333EA', Icon: Home },
  { key: 'other', label: 'אחר', color: '#8B7355', Icon: Circle },
];

export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));
export const colorOfCategory = (key) => (CATEGORY_BY_KEY[key] || CATEGORY_BY_KEY.other).color;

// ── rule 0: an explicit `cat:<key>` tag ───────────────────────────
export const CAT_TAG = 'cat:';
export const catTagFor = (key) => CAT_TAG + key;
const taggedCategory = (node) => {
  const hit = (node?.tags || []).find(t => String(t).startsWith(CAT_TAG));
  if (!hit) return null;
  const key = String(hit).slice(CAT_TAG.length);
  return CATEGORY_BY_KEY[key] ? key : null;   // an unknown key falls through
};

// ── rule 1: title keywords ────────────────────────────────────────
// Ordered — the first match wins, so 'צילום תוכן' lands in צילום, not תוכן.
const TITLE_RULES = [
  [/אימון|כושר|ריצה|חדר כושר|סיבולת|כוח/, 'training'],
  [/צילום|סטורי|מצלמה|לצלם/, 'filming'],
  [/עריכה|תסריט|כתיבה|פרסום|תוכן|מוצר|קורס|פוסט|ריל/, 'content'],
  [/ליד|מכיר|סגיר|הצעה|לקוח|פנייה|הפניה|הודעות|שיחות/, 'business'],
  [/משפחה|חבר|מפגש|קשר יזום/, 'family'],
  [/בית|ניקיון|כביסה|קניות|תחזוקה|סדר/, 'home'],
  [/שינה|תזונה|תפילה|מדיטציה|תרגול|זמן שקט|קריאה|לימוד/, 'habits'],
];

// ── rule 2: branch titles ─────────────────────────────────────────
const BRANCH_RULES = [
  [/יוזמה|מכירה|עסק/, 'business'],
  [/יצירה|תוכן/, 'content'],
  [/גוף|בריאות/, 'habits'],
  [/חברה|משפחה/, 'family'],
  [/בית|סדר/, 'home'],
  [/נפש|למידה|רוח/, 'habits'],
];

const matchRules = (rules, text) => {
  const t = String(text || '');
  for (const [re, key] of rules) if (re.test(t)) return key;
  return null;
};

// Build a classifier bound to the current tree. Returns (node) → category key.
// The walk from a node up to its branch is done once per node and memoised by
// the caller through useMemo, so this stays cheap on a large tree.
export function categoryClassifier(nodes = []) {
  const { byId, children } = indexNodes(nodes);
  const arm = nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
  const armId = arm?.id || null;

  // id → the branch node directly under the personal arm, or null when the
  // node lives somewhere else entirely (a business arm).
  const branchCache = new Map();
  const branchOf = (node) => {
    if (branchCache.has(node.id)) return branchCache.get(node.id);
    let cur = node, out = null, guard = 0;
    while (cur && guard++ < 60) {
      if (armId && cur.parent_id === armId) { out = cur; break; }
      cur = byId[cur.parent_id];
    }
    branchCache.set(node.id, out);
    return out;
  };

  const personalIds = new Set();
  if (armId) {
    const stack = [armId];
    while (stack.length) {
      const id = stack.pop();
      (children[id] || []).forEach(c => { personalIds.add(c.id); stack.push(c.id); });
    }
  }

  return (node) => {
    if (!node) return 'other';
    const tagged = taggedCategory(node);
    if (tagged) return tagged;
    const byTitle = matchRules(TITLE_RULES, node.title);
    if (byTitle) return byTitle;
    const br = branchOf(node);
    if (br) {
      const byBranch = matchRules(BRANCH_RULES, br.title);
      if (byBranch) return byBranch;
    }
    if (!personalIds.has(node.id)) return 'business';   // outside the personal arm
    return 'other';
  };
}

// Group tasks into the fixed category order. Categories with no tasks are
// dropped, so the accordion never shows an empty domain.
export function groupByCategory(tasks = [], classify) {
  const buckets = Object.fromEntries(CATEGORIES.map(c => [c.key, []]));
  tasks.forEach(t => {
    const k = classify(t);
    (buckets[k] || buckets.other).push(t);
  });
  return CATEGORIES
    .map(c => ({ ...c, tasks: buckets[c.key] }))
    .filter(c => c.tasks.length > 0);
}
