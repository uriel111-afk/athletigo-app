import { useEffect, useRef } from 'react';

export const SECONDS_OPTIONS = Array.from({ length: 300 }, (_, i) => i + 1);
export const MINUTES_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
export const ROUNDS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30];
export const PREP_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];

export default function ScrollPickerPopup({ isOpen, value, options, onSelect, onClose, title }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const t = setTimeout(() => {
      const selected = listRef.current?.querySelector('[data-picker-selected="true"]');
      if (selected) selected.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen, value, options]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(255,249,240,0.97)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 20,
          padding: 16,
          width: 280,
          maxHeight: '65vh',
          display: 'flex', flexDirection: 'column',
          border: '1.5px solid rgba(255,111,32,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          direction: 'rtl',
        }}
      >
        {title && (
          <div style={{ color: '#FF6F20', fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
            {title}
          </div>
        )}
        <div
          ref={listRef}
          className="scroll-picker-popup-list"
          style={{ overflowY: 'auto', maxHeight: '50vh', WebkitOverflowScrolling: 'touch' }}
        >
          <style>{`.scroll-picker-popup-list::-webkit-scrollbar { display: none; }`}</style>
          {options.map(opt => {
            const active = value === opt;
            return (
              <button
                key={opt}
                data-picker-selected={active ? 'true' : 'false'}
                onClick={() => { onSelect(opt); onClose(); }}
                style={{
                  width: '100%',
                  height: 56,
                  background: active ? '#FF6F20' : 'transparent',
                  color: active ? '#FFFFFF' : '#1a1a1a',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,111,32,0.08)',
                  fontSize: 28,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
