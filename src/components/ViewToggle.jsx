// Small list/grid toggle used on coach list pages.
// Persists preference via a localStorage key supplied by the caller.

export default function ViewToggle({ view, onChange }) {
  const btnStyle = (active) => ({
    width: 36,
    height: 32,
    borderRadius: 8,
    border: 'none',
    background: active ? '#FF6F20' : 'transparent',
    color: active ? 'white' : '#888',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      background: '#F0F0F0',
      borderRadius: 10,
      padding: 3,
    }}>
      <button
        onClick={() => onChange('list')}
        style={btnStyle(view === 'list')}
        aria-label="תצוגת רשימה"
      >☰</button>
      <button
        onClick={() => onChange('grid')}
        style={btnStyle(view === 'grid')}
        aria-label="תצוגת רשת"
      >⊞</button>
    </div>
  );
}

// Hook that manages the toggle state and syncs with localStorage.
import { useEffect, useState } from 'react';

export function useViewToggle(storageKey, defaultView = 'list') {
  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === 'list' || saved === 'grid' ? saved : defaultView;
    } catch { return defaultView; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, view); } catch {}
  }, [storageKey, view]);

  return [view, setView];
}
