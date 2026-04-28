import React from 'react';

// Floating black action bar for multi-select on list pages. Pair with
// useMultiSelect (src/hooks/useMultiSelect.js).
//
//   <MultiSelectBar
//     count={sel.selectedCount}
//     onCancel={sel.clearSelection}
//     actions={[
//       { icon: '✓', label: 'הושלם', primary: true, onClick: ... },
//       { icon: '🗑️', label: 'מחק',   danger:  true, onClick: ... },
//     ]}
//   />
//
// Sits above the bottom nav (z=9999, bottom=70). Returns null when
// count===0 so it auto-hides whenever the selection drops to empty.
export function MultiSelectBar({ count, actions, onCancel }) {
  if (!count) return null;
  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)',
        background: '#1A1A1A', borderRadius: 14, padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999,
        maxWidth: '95%', width: 'auto',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <span style={{ color: 'white', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {count} נבחרו
      </span>
      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />
      {(actions || []).map((action, i) => (
        <button
          key={i}
          type="button"
          onClick={action.onClick}
          style={{
            padding: '6px 14px', borderRadius: 10, border: 'none',
            background: action.danger
              ? '#C62828'
              : action.primary ? '#FF6F20' : 'rgba(255,255,255,0.15)',
            color: 'white', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >
          {action.icon ? <span style={{ marginLeft: 4 }}>{action.icon}</span> : null}
          {action.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        aria-label="בטל"
        style={{
          padding: '6px 10px', borderRadius: 10, border: 'none',
          background: 'rgba(255,255,255,0.1)', color: '#888',
          fontSize: 13, cursor: 'pointer',
        }}
      >✕</button>
    </div>
  );
}

// Per-row checkbox. Stops propagation so the underlying card's onClick
// (typically navigate to detail) doesn't fire while selecting.
export function SelectCheckbox({ isSelected, onToggle }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        width: 22, height: 22, borderRadius: 6,
        border: isSelected ? '2px solid #FF6F20' : '2px solid #ccc',
        background: isSelected ? '#FF6F20' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {isSelected && <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>✓</span>}
    </div>
  );
}

export default MultiSelectBar;
