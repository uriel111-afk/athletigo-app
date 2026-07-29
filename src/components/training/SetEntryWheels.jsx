import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── Horizontal number wheels — the set entry area ────────────────────
// One wheel per measured value the exercise actually uses. Which wheels
// appear is decided by the caller from the exercise row; a value the
// coach never prescribed gets no wheel at all.
//
// Interaction mirrors MetronomeMode.jsx: pointer events with
// `touchAction: 'none'` set on the DRAGGABLE ELEMENT ONLY, never on a
// parent — putting it on a container kills page scrolling on Android.
//
// Inline styles only.

const ORANGE = '#FF6F20';
const INK = '#1a1a1a';
const MUTED = '#8a8177';
const AMBER_BG = '#FAEEDA';
const AMBER_INK = '#412402';
const SANS = "'Rubik', system-ui, sans-serif";

// Pixels of horizontal travel per single step.
const PX_PER_STEP = 26;

const roundToStep = (v, step) => {
  const n = Math.round(v / step) * step;
  // Avoid 7.500000000000001 on 2.5 steps.
  return Math.round(n * 100) / 100;
};

const fmt = (v) => {
  if (v == null || Number.isNaN(v)) return '';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
};

// ── Numeric keypad ───────────────────────────────────────────────────
// Opens when the trainee taps the centre number. Portalled so the
// card's overflow:hidden can't clip it.
function NumericKeypad({ open, title, initial, allowDecimal, onClose, onConfirm }) {
  const [buf, setBuf] = useState('');
  React.useEffect(() => { if (open) setBuf(''); }, [open]);
  if (!open || typeof document === 'undefined') return null;

  const shown = buf === '' ? fmt(initial) : buf;
  const press = (k) => {
    if (k === '⌫') { setBuf((b) => (b === '' ? '' : b.slice(0, -1))); return; }
    if (k === '.') { setBuf((b) => (b.includes('.') ? b : (b === '' ? '0.' : b + '.'))); return; }
    setBuf((b) => (b === '' ? k : b + k));
  };
  const keys = ['1','2','3','4','5','6','7','8','9', allowDecimal ? '.' : '', '0', '⌫'];

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(20,14,8,0.42)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: '#FFFFFF',
          borderRadius: '18px 18px 0 0',
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom,0px))',
          fontFamily: SANS,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 500, color: INK, marginBottom: 4 }}>{title}</div>
        <div style={{
          fontSize: 40, fontWeight: 500, color: ORANGE,
          textAlign: 'center', lineHeight: 1.2, minHeight: 48,
        }}>{shown || '0'}</div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8, marginTop: 12,
        }}>
          {keys.map((k, i) => k === '' ? <span key={i} /> : (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              style={{
                padding: '14px 0', fontSize: 21, fontWeight: 500,
                fontFamily: SANS, color: INK,
                background: '#FBF6EE', border: '1px solid #F0E4D0',
                borderRadius: 12, cursor: 'pointer',
              }}
            >{k}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '13px 0', fontSize: 16, fontFamily: SANS,
              background: '#FFFFFF', color: MUTED,
              border: '1px solid #F0E4D0', borderRadius: 12, cursor: 'pointer',
            }}
          >ביטול</button>
          <button
            type="button"
            onClick={() => {
              const n = buf === '' ? initial : Number(buf);
              onConfirm(Number.isFinite(n) ? n : initial);
              onClose();
            }}
            style={{
              flex: 2, padding: '13px 0', fontSize: 16, fontWeight: 500,
              fontFamily: SANS, background: ORANGE, color: '#FFFFFF',
              border: 'none', borderRadius: 12, cursor: 'pointer',
            }}
          >אישור</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── One wheel ────────────────────────────────────────────────────────
function NumberWheel({ metric, value, planned, previous, setNumber, fromClock, onChange }) {
  const { key, step, question, unit, allowDecimal } = metric;
  const [dragging, setDragging] = useState(false);
  const [keypad, setKeypad] = useState(false);
  const dragRef = useRef({ x: 0, base: 0, moved: false });

  const deviates = planned != null && value != null && value !== planned;

  const onDown = useCallback((e) => {
    dragRef.current = { x: e.clientX, base: value ?? planned ?? 0, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [value, planned]);

  const onMove = useCallback((e) => {
    if (!dragging) return;
    const dx = e.clientX - dragRef.current.x;
    if (Math.abs(dx) > 3) dragRef.current.moved = true;
    // RTL: dragging right (positive dx) lowers the value, matching the
    // way the numbers advance leftwards on screen.
    const steps = Math.round(-dx / PX_PER_STEP);
    const next = Math.max(0, roundToStep(dragRef.current.base + steps * step, step));
    if (next !== value) onChange(key, next);
  }, [dragging, key, onChange, step, value]);

  const onUp = useCallback((e) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const v = value ?? planned ?? 0;
  const slots = [-2, -1, 0, 1, 2].map((o) => {
    const n = roundToStep(v + o * step, step);
    return { offset: o, n, visible: n >= 0 };
  });

  return (
    <div style={{
      // Sunken well — the exact opposite of the floating card it sits
      // in, so the entry area reads as something you press into.
      background: deviates ? AMBER_BG : '#FBF6EE',
      border: 'none',
      boxShadow: 'inset 2px 2px 6px rgba(197,175,145,0.40), inset -1px -1px 4px rgba(255,255,255,0.90)',
      borderRadius: 13,
      padding: '11px 12px 9px',
      marginBottom: 10,
      transition: 'background 0.15s',
    }}>
      {/* Question label — right-aligned, 17/500. */}
      <div style={{
        fontFamily: SANS, fontSize: 17, fontWeight: 500,
        color: deviates ? AMBER_INK : INK,
        textAlign: 'right', lineHeight: 1.4,
      }}>{question}</div>

      {/* Planned line, and from set 2 the previous set as well. */}
      {planned != null && (
        <div style={{
          fontFamily: SANS, fontSize: 13,
          color: deviates ? AMBER_INK : MUTED,
          textAlign: 'right', marginTop: 2, lineHeight: 1.5,
          opacity: deviates ? 0.85 : 1,
        }}>
          מתוכנן {fmt(planned)}
          {/* What the clock actually measured, when one ran for this
              metric. Extends the planned line rather than adding a row,
              so the wheel's height never changes. */}
          {fromClock != null && ` · מהשעון ${fmt(fromClock)}`}
          {setNumber > 1 && previous != null && ` · בסט הקודם ${fmt(previous)}`}
        </div>
      )}

      {/* Five numbers, centred. Drag horizontally to change; tap the
          centre number for the keypad. touchAction:none lives HERE, on
          the draggable element only — never on a parent container. */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => { if (!dragRef.current.moved) setKeypad(true); }}
        role="button"
        tabIndex={0}
        aria-label={question}
        style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'center',
          gap: 14, marginTop: 8,
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          cursor: dragging ? 'grabbing' : 'ew-resize',
        }}
      >
        {slots.map((s) => {
          const isCentre = s.offset === 0;
          const size = isCentre ? 44 : Math.abs(s.offset) === 1 ? 22 : 17;
          return (
            <span key={s.offset} style={{
              fontFamily: SANS,
              fontSize: size,
              fontWeight: isCentre ? 600 : 400,
              color: isCentre
                ? (deviates ? AMBER_INK : '#1a1a1a')
                : (deviates ? 'rgba(65,36,2,0.32)'
                  : Math.abs(s.offset) === 1 ? '#B3A794' : '#D9CDBA'),
              lineHeight: 1.1,
              minWidth: isCentre ? 44 : undefined,
              textAlign: 'center',
              transform: isCentre && dragging ? 'scale(1.06)' : 'scale(1)',
              transition: 'transform 0.12s ease',
            }}>{s.visible ? fmt(s.n) : ''}</span>
          );
        })}
      </div>

      {/* Tick row — the tick sitting under the PLANNED value is orange. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 14, marginTop: 4,
      }}>
        {slots.map((s) => {
          const isCentre = s.offset === 0;
          const onPlanned = planned != null && s.n === planned && s.visible;
          return (
            <span key={s.offset} aria-hidden style={{
              width: isCentre ? 44 : Math.abs(s.offset) === 1 ? 22 : 17,
              display: 'inline-flex', justifyContent: 'center',
            }}>
              <span style={{
                width: onPlanned ? 8 : 4,
                height: onPlanned ? 8 : 4,
                borderRadius: 99,
                background: onPlanned ? ORANGE : '#E4DACB',
                display: 'block',
              }} />
            </span>
          );
        })}
      </div>

      {unit && (
        <div style={{
          fontFamily: SANS, fontSize: 12,
          color: deviates ? AMBER_INK : MUTED,
          textAlign: 'center', marginTop: 5, opacity: 0.8,
        }}>{unit}</div>
      )}

      <NumericKeypad
        open={keypad}
        title={question}
        initial={v}
        allowDecimal={!!allowDecimal}
        onClose={() => setKeypad(false)}
        onConfirm={(n) => onChange(key, Math.max(0, roundToStep(n, allowDecimal ? 0.5 : step)))}
      />
    </div>
  );
}

export default function SetEntryWheels({
  metrics = [], values = {}, planned = {}, previous = {}, setNumber = 1,
  fromClock = {}, onChange,
}) {
  if (!metrics.length) return null;
  return (
    <div dir="rtl">
      {metrics.map((m) => (
        <NumberWheel
          key={m.key}
          metric={m}
          value={values[m.key]}
          planned={planned[m.key] ?? null}
          previous={previous[m.key] ?? null}
          setNumber={setNumber}
          fromClock={fromClock[m.key] ?? null}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

// Metric descriptors, built from the exercise row by the caller.
// `step` per unit: reps 1, seconds 1, weight 2.5.
export const METRIC_DEFS = {
  reps:    { key: 'reps',    step: 1,   question: 'כמה חזרות עשית?',  unit: 'חזרות', allowDecimal: false, noun: 'חזרות' },
  seconds: { key: 'seconds', step: 1,   question: 'כמה שניות החזקת?', unit: 'שניות', allowDecimal: false, noun: 'שניות' },
  weight:  { key: 'weight',  step: 2.5, question: 'כמה משקל הרמת?',   unit: 'ק"ג',   allowDecimal: true,  noun: 'ק"ג' },
};
