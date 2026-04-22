import { useEffect, useRef } from 'react';

// Vertical picker that lists every phase of a tabata/emom workout so
// the user can jump to any round/phase. Works from the full-screen
// timer AND from the minimized footer bar. Tapping a button dispatches
// an onSelect callback; the caller is responsible for the jump logic.

export default function RoundJumpPicker({
  isOpen,
  currentRound,
  currentPhase,
  totalRounds,
  hasPrepare = true,
  hasRest = true,
  onSelect,
  onClose,
}) {
  const listRef = useRef(null);

  const phases = [];
  if (hasPrepare) {
    phases.push({ id: 'prepare', label: '⏳ הכנה', round: 0, phase: 'prepare' });
  }
  for (let r = 1; r <= totalRounds; r++) {
    phases.push({ id: `work_${r}`,  label: `סבב ${r} — עבודה 🔥`, round: r, phase: 'work' });
    if (hasRest) {
      phases.push({ id: `rest_${r}`, label: `סבב ${r} — מנוחה 💤`, round: r, phase: 'rest' });
    }
  }

  const isActive = (p) => {
    if (p.phase === 'prepare' && currentPhase === 'prepare') return true;
    return p.round === currentRound && p.phase === currentPhase;
  };

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const t = setTimeout(() => {
      const el = listRef.current?.querySelector('[data-picker-selected="true"]');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen, currentRound, currentPhase]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 6000,
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
        <div style={{ color: '#FF6F20', fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          קפוץ לסבב
        </div>
        <div
          ref={listRef}
          className="round-jump-picker-list"
          style={{ overflowY: 'auto', maxHeight: '50vh', WebkitOverflowScrolling: 'touch' }}
        >
          <style>{`.round-jump-picker-list::-webkit-scrollbar { display: none; }`}</style>
          {phases.map(p => {
            const active = isActive(p);
            const color = active
              ? '#FFFFFF'
              : p.phase === 'work'
                ? '#FF6F20'
                : p.phase === 'rest'
                  ? '#6b7280'
                  : '#3B82F6';
            return (
              <button
                key={p.id}
                data-picker-selected={active ? 'true' : 'false'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(p.round, p.phase);
                  onClose();
                }}
                style={{
                  width: '100%',
                  height: 52,
                  background: active ? '#FF6F20' : 'transparent',
                  color,
                  border: 'none',
                  borderBottom: '1px solid rgba(255,111,32,0.08)',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
