import React from 'react';

// Per-metric "actuals" grid for the open exercise card (normal / none /
// reps_new variants). ONE grid per metric the exercise prescribes
// (reps / seconds / weight). Presentational only — the parent
// (ExerciseCard) owns the picker + the saveSetActual write path and
// prefills `actuals` from exercise_set_logs. RTL, inline styles, brand
// orange #FF6F20.
//
// Props:
//   label      — grid title (e.g. 'חזרות' / 'החזקה (שניות)' / 'משקל (ק"ג)')
//   setCount   — number of set rows
//   target     — planned value for every set (same per set in normal mode)
//   actuals    — { [setNumber 1-based]: number | null } filled values
//   readOnly   — coach view OR no active execution → cells not tappable
//   footerNote — small green note on the LEFT of the footer
//   onCellTap  — (setNumber) => void, opens the parent picker
const ORANGE = '#FF6F20';

export default function ActualsGrid({
  label,
  setCount,
  target,
  actuals,
  readOnly = false,
  footerNote = '↗ נשמר לגרף ההתקדמות',
  onCellTap,
}) {
  const rows = Array.from({ length: Math.max(1, setCount) }, (_, i) => i + 1);
  const targetNum = Number(target) || 0;

  let sumActual = 0;
  let sumTarget = 0;
  rows.forEach((setN) => {
    const v = actuals?.[setN];
    if (v != null && v !== '') sumActual += Number(v) || 0;
    sumTarget += targetNum;
  });

  const gridCols = '44px 1fr 64px';

  return (
    <div dir="rtl" style={{
      background: '#FFFFFF',
      borderRadius: 14,
      padding: '12px 14px',
      border: '1px solid #F0E8D8',
    }}>
      {label && (
        <div style={{ fontSize: 14, color: '#555', marginBottom: 8, fontWeight: 600 }}>
          {label}
        </div>
      )}

      {/* Header row */}
      <div style={{
        display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center',
        padding: '0 2px 8px', fontSize: 13, color: '#999',
      }}>
        <div style={{ textAlign: 'center' }}>סט</div>
        <div style={{ textAlign: 'center' }}>יעד</div>
        <div style={{ textAlign: 'center', color: ORANGE, fontWeight: 500 }}>בפועל</div>
      </div>

      {/* One row per set */}
      {rows.map((setN) => {
        const raw = actuals?.[setN];
        const filled = raw != null && raw !== '';
        const val = filled ? Number(raw) : null;

        let cellStyle;
        if (!filled) {
          cellStyle = { background: '#FFF8F2', border: '1.5px dashed #FFB27E', color: '#B98A63' };
        } else if (val >= targetNum) {
          cellStyle = { background: '#F0FAF2', border: '1px solid #9FE1CB', color: '#0F6E56' };
        } else {
          cellStyle = { background: '#FFF6EE', border: '1px solid #FFC79A', color: '#B05A1F' };
        }

        return (
          <div key={setN} style={{
            display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', gap: 6,
            padding: '7px 2px', borderTop: '1px solid #f0e8d8',
          }}>
            <div style={{ textAlign: 'center', fontWeight: 700, color: '#1a1a1a' }}>{setN}</div>
            <div style={{ textAlign: 'center', color: '#999' }}>{targetNum ? targetNum : '—'}</div>
            <div
              role={readOnly ? undefined : 'button'}
              tabIndex={readOnly ? -1 : 0}
              onClick={readOnly ? undefined : (e) => { e.stopPropagation(); onCellTap && onCellTap(setN); }}
              onKeyDown={readOnly ? undefined : (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellTap && onCellTap(setN); }
              }}
              style={{
                height: 38,
                borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 15,
                cursor: readOnly ? 'default' : 'pointer',
                ...cellStyle,
              }}
            >
              {filled ? String(raw) : '—'}
            </div>
          </div>
        );
      })}

      {/* Footer — total on the RIGHT (first RTL child), note on the LEFT */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 10, paddingTop: 8, borderTop: '1px solid #f0e8d8',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>
          {`סה"כ: ${sumActual} מתוך ${sumTarget}`}
        </div>
        {footerNote && (
          <div style={{ fontSize: 13, color: '#0F6E56' }}>{footerNote}</div>
        )}
      </div>
    </div>
  );
}
