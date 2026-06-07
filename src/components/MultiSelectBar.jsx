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
//
// Layout note (2026-06): the bar now wraps when the row of actions
// exceeds the available width on narrow phones. Earlier flat-row
// layouts let labels truncate at ~380px (e.g. "הקם קבו..."); with
// flexWrap + flexShrink:0 on every atom, each button stays at its
// natural width and overflow lands on a second row instead of clipping
// the Hebrew label. Counter and close are still always visible —
// they're just first/last in DOM and stay anchored to the row edges
// under RTL wrap.
export function MultiSelectBar({ count, actions, onCancel }) {
  if (!count) return null;
  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)',
        background: '#1A1A1A', borderRadius: 14, padding: '10px 14px',
        display: 'flex', alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 10, rowGap: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999,
        // Cap to a reasonable max while letting the bar fill narrow
        // phones — 'min()' makes the bar both wide enough on mobile
        // and bounded on tablets/desktop so it never looks oversized.
        width: 'min(720px, 95%)',
        boxSizing: 'border-box',
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
      }}
    >
      <span style={{
        color: 'white', fontSize: 14, fontWeight: 600,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {count} נבחרו
      </span>
      <div style={{
        width: 1, height: 24, background: 'rgba(255,255,255,0.2)',
        flexShrink: 0,
      }} />
      {(actions || []).map((action, i) => (
        <button
          key={i}
          type="button"
          onClick={action.onClick}
          style={{
            padding: '6px 12px', borderRadius: 10, border: 'none',
            background: action.danger
              ? '#C62828'
              : action.primary ? '#FF6F20' : 'rgba(255,255,255,0.15)',
            color: 'white', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', whiteSpace: 'nowrap',
            flexShrink: 0,
            fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
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
          flexShrink: 0,
          // Push to the row's end (LTR end under RTL is the left edge)
          // so the close stays anchored regardless of wrap.
          marginInlineStart: 'auto',
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
