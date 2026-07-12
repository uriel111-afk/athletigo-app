import React from 'react';
import { isoInDays } from '@/lib/lifeos/lead-helpers';

// Follow-up date picker: chips היום / מחר / עוד יומיים / תאריך מותאם.
// value/onChange are ISO date strings (YYYY-MM-DD). '' = none.
const ORANGE = '#FF6F20';
const OPTS = [
  { label: 'היום', days: 0 },
  { label: 'מחר', days: 1 },
  { label: 'עוד יומיים', days: 2 },
];

export default function FollowupChips({ value, onChange }) {
  const presets = OPTS.map((o) => ({ ...o, date: isoInDays(o.days) }));
  const matched = presets.find((p) => p.date === value);
  const isCustom = !!value && !matched;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {presets.map((p) => {
        const on = value === p.date;
        return (
          <button key={p.label} type="button" onClick={() => onChange(p.date)} style={chip(on)}>{p.label}</button>
        );
      })}
      {/* Custom-date chip — reveals a native date input when active */}
      <label style={{ ...chip(isCustom), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }}>
        {isCustom ? String(value).slice(5) : 'תאריך מותאם'}
        <input type="date" value={isCustom ? value : ''} onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
      </label>
    </div>
  );
}

// Matches the intake form's uniform chip: height 40, 1px border in both
// states (selected = full orange fill), so rows never jump or clip.
const chip = (on) => ({
  minHeight: 40, padding: '0 14px', borderRadius: 999, cursor: 'pointer', boxSizing: 'border-box',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${on ? ORANGE : '#E4D8C6'}`,
  background: on ? ORANGE : '#fff', color: on ? '#fff' : '#3a3a3a',
  fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
});
