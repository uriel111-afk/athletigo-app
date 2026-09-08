import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * CompletionSheet — what the trainee is asked AFTER an exercise is
 * already marked done.
 *
 * EVERYTHING ON IT IS OPTIONAL, and the exercise is complete before it
 * opens. Closing it — by the X, by the backdrop, by the חזרה button —
 * leaves the tick exactly where it was and writes no ratings. Nothing
 * here can block or undo a completion.
 *
 * The plan sheet's own language: cream page, tinted header band,
 * charcoal text, orange as the single accent.
 */

const CREAM     = '#FBF3EA';
const CHARCOAL  = '#2D2A26';
const ORANGE    = '#FF6F20';
const WHITE     = '#FFFFFF';
const MUTED     = '#8A8079';
const BAND_BG   = '#FFF4EA';
const BAND_LINE = '#F0C9A8';
const BORDER    = '#E0D4C2';
const SANS = "'Rubik', system-ui, -apple-system, sans-serif";

const SCALE = [1, 2, 3, 4, 5];

/** Five circles. Tapping the chosen one again clears it — it is optional. */
function Scale({ value, onChange, ariaLabel }) {
  return (
    <div style={{ display: 'flex', gap: 10 }} role="radiogroup" aria-label={ariaLabel}>
      {SCALE.map((n) => {
        const on = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${ariaLabel} ${n}`}
            onClick={() => onChange(on ? null : n)}
            style={{
              width: 42, height: 42, minHeight: 42, borderRadius: '50%',
              border: `1px solid ${on ? ORANGE : BORDER}`,
              background: on ? ORANGE : WHITE,
              color: on ? WHITE : CHARCOAL,
              fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
              padding: 0, cursor: 'pointer', flexShrink: 0,
            }}
          >{n}</button>
        );
      })}
    </div>
  );
}

const labelStyle = {
  fontSize: 12, fontWeight: 500, color: CHARCOAL,
  marginBottom: 8, display: 'block',
};

export default function CompletionSheet({ open, exerciseName, initial, onClose, onSave }) {
  const [note, setNote] = useState('');
  const [difficulty, setDifficulty] = useState(null);
  const [control, setControl] = useState(null);

  // Seeded from whatever is already stored for this exercise, so
  // reopening shows what the trainee said last time rather than a
  // blank form.
  useEffect(() => {
    if (!open) return;
    setNote(initial?.note ?? '');
    setDifficulty(initial?.difficulty ?? null);
    setControl(initial?.control ?? null);
  }, [open, initial]);

  if (!open || typeof document === 'undefined') return null;

  // Closing IS the skip path. Whatever has been chosen is handed over;
  // an untouched sheet hands over nothing and writes nothing.
  const close = () => {
    onSave?.({
      note: note.trim(),
      difficulty,
      control,
    });
    onClose?.();
  };

  return createPortal(
    <div
      dir="rtl"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 12300,
        background: 'rgba(20,14,8,0.42)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: SANS,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: CREAM,
          borderRadius: '14px 14px 0 0',
          overflow: 'hidden',
          boxShadow: '0 -10px 30px rgba(0,0,0,0.18)',
          maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header band — the same tint the sheet's container titles use. */}
        <div style={{
          background: BAND_BG, borderBottom: `1px solid ${BAND_LINE}`,
          padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 400, color: MUTED, marginBottom: 3 }}>
              בוצע ✓
            </div>
            <div style={{
              fontSize: 16, fontWeight: 500, color: CHARCOAL, lineHeight: 1.35,
              overflowWrap: 'anywhere',
            }}>{exerciseName}</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="סגור"
            style={{
              flexShrink: 0, width: 32, height: 32, minHeight: 32,
              border: 'none', background: 'transparent', padding: 0,
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} color={MUTED} />
          </button>
        </div>

        <div style={{
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
          overflowY: 'auto',
        }}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle} htmlFor="cs-note">הערה</label>
            <input
              id="cs-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="אופציונלי"
              style={{
                width: '100%', height: 44, minHeight: 44,
                border: `1px solid ${BORDER}`, borderRadius: 8,
                background: WHITE, color: CHARCOAL,
                fontSize: 14, fontFamily: 'inherit', padding: '0 12px',
                boxSizing: 'border-box', textAlign: 'right',
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <span style={labelStyle}>קושי</span>
            <Scale value={difficulty} onChange={setDifficulty} ariaLabel="קושי" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <span style={labelStyle}>שליטה</span>
            <Scale value={control} onChange={setControl} ariaLabel="שליטה" />
          </div>

          <button
            type="button"
            onClick={close}
            style={{
              width: '100%', minHeight: 46, borderRadius: 8, border: 'none',
              background: CHARCOAL, color: CREAM,
              fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >סגור</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
