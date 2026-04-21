#!/usr/bin/env node
// ============================================================
// check-enums — flags hardcoded Hebrew/English enum literals
// outside of src/lib/enums.js. Advisory only by default; wire to
// "prebuild" in package.json once the codebase is fully migrated.
// ============================================================

import { execSync } from 'child_process';

const literals = [
  'פעיל', 'לא שולם', 'מושהה', 'פג תוקף', 'בוטל', 'הסתיים', 'מוקפא',
  'לא פעיל', 'אישי', 'אונליין', 'קבוצתי',
  'הגיע', 'איחר', 'לא הגיע', 'מזדמן',
  'מתוכנן', 'הושלם', 'התקיים', 'מאושר', 'ממתין',
];
const pattern = literals.join('|');

let out = '';
try {
  out = execSync(
    // -E extended regex; quote the pattern; exclude enums.js itself
    `grep -rnE --include="*.jsx" --include="*.js" "'(${pattern})'" src/ | grep -v 'lib/enums' || true`,
    { encoding: 'utf-8' }
  );
} catch (e) {
  console.error('check-enums: grep failed:', e.message);
  process.exit(1);
}

const lines = out.trim() ? out.trim().split('\n') : [];
if (lines.length === 0) {
  console.log('check-enums: OK — no hardcoded literals outside src/lib/enums.js');
  process.exit(0);
}

console.warn(`check-enums: ${lines.length} hardcoded enum literal(s) found.`);
console.warn('Each should be replaced with a reference to src/lib/enums.js.');
console.warn('First 30:');
for (const l of lines.slice(0, 30)) console.warn('  ' + l);
if (lines.length > 30) console.warn(`  ... and ${lines.length - 30} more`);

// Advisory: exit 0 so the build is not blocked while migration is
// in progress. Switch to `process.exit(1)` once the count is zero
// to enforce going forward.
process.exit(0);
