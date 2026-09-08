import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ScrollPickerPopup, {
  SECONDS_OPTIONS, ROUNDS_OPTIONS,
} from '@/components/ScrollPickerPopup';
import { formatDuration, formatDurationPadded, LTR_TIME } from '@/lib/duration';
import { playBeep, unlock as unlockAudio } from '@/lib/tabataSounds';

/**
 * ClockLeadIn — the ten seconds between tapping a clock and the clock
 * starting.
 *
 * It shows the trainee what is about to run before it runs: the
 * exercise name, WHICH clock it is and its values, and a large
 * descending number. Two buttons, each on its own line:
 *
 *   שינוי  pauses the countdown and opens the SAME value controls the
 *          clocks tab uses — ScrollPickerPopup, the component behind
 *          TimerView's TimerCol and TabataTimer's own settings. No
 *          second picker was built.
 *   ביטול  drops the whole thing and returns to the sheet.
 *
 * EDITS ARE SCOPED TO THIS RUN. onConfirm hands the caller a values
 * object; the caller runs the clock from it and never writes it back
 * to the plan. Nothing in this file touches the database.
 */

// The lead-in length, in ONE place.
export const LEAD_IN_SECONDS = 10;

const ORANGE = '#FF6F20';
const CHARCOAL = '#2D2A26';
const CREAM = '#FBF3EA';
const MUTED = '#8A8079';
const SANS = "'Rubik', system-ui, -apple-system, sans-serif";

/** What each clock kind lets the trainee change, and with which options. */
function editableFields(spec) {
  if (!spec) return [];
  if (spec.kind === 'countdown') {
    return [{ key: 'seconds', label: 'זמן', options: SECONDS_OPTIONS, time: true }];
  }
  return [
    { key: 'workSeconds', label: 'עבודה', options: SECONDS_OPTIONS, time: true },
    { key: 'restSeconds', label: 'מנוחה', options: SECONDS_OPTIONS, time: true },
    { key: 'rounds', label: 'סבבים', options: ROUNDS_OPTIONS, time: false },
    { key: 'sets', label: 'סטים', options: ROUNDS_OPTIONS, time: false },
  ];
}

/** The one-line summary of which clock is about to run. */
export function clockSummary(v) {
  if (!v) return '';
  if (v.kind === 'countdown') return formatDuration(v.seconds);
  const bits = [formatDuration(v.workSeconds)];
  if (v.restSeconds > 0) bits.push(formatDuration(v.restSeconds));
  let out = bits.join(' / ');
  if (v.rounds > 1) out += ` ×${v.rounds}`;
  if (v.sets > 1) out += ` · ${v.sets} סטים`;
  return out;
}

const KIND_NAME = {
  countdown: 'טיימר',
  intervals: 'אינטרוולים',
  tabata: 'טבטה',
};

export default function ClockLeadIn({ open, exerciseName, spec, onCancel, onConfirm }) {
  // The working copy. Seeded from the spec each time the lead-in opens
  // and thrown away when it closes — this is the "this run only" part.
  const [values, setValues] = useState(spec || null);
  const [left, setLeft] = useState(LEAD_IN_SECONDS);
  const [paused, setPaused] = useState(false);
  const [picking, setPicking] = useState(null);   // the field being edited
  const firedRef = useRef(false);
  const lastBeepRef = useRef(-1);

  useEffect(() => {
    if (!open) return;
    setValues(spec || null);
    setLeft(LEAD_IN_SECONDS);
    setPaused(false);
    setPicking(null);
    firedRef.current = false;
    lastBeepRef.current = -1;
    try { unlockAudio(); } catch { /* audio unlock is best-effort */ }
  }, [open, spec]);

  // The countdown. Stops dead while שינוי has it paused.
  useEffect(() => {
    if (!open || paused) return undefined;
    const id = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [open, paused]);

  // The last three seconds tick, the same cue the clocks use.
  useEffect(() => {
    if (!open || paused) return;
    if (left <= 3 && left > 0 && lastBeepRef.current !== left) {
      lastBeepRef.current = left;
      try { playBeep(); } catch { /* sound is best-effort */ }
    }
  }, [left, open, paused]);

  // Zero — hand the (possibly edited) values back, exactly once.
  useEffect(() => {
    if (!open || paused || left > 0 || firedRef.current) return;
    firedRef.current = true;
    onConfirm(values);
  }, [left, open, paused, values, onConfirm]);

  const openPicker = useCallback((field) => {
    setPaused(true);
    setPicking(field);
  }, []);

  // Confirm an edit → resume the countdown from the top, so the
  // trainee gets a full lead-in with the values they just chose.
  const applyPick = useCallback((field, picked) => {
    setValues((v) => ({ ...v, [field.key]: picked }));
  }, []);

  const closePicker = useCallback(() => {
    setPicking(null);
    setLeft(LEAD_IN_SECONDS);
    lastBeepRef.current = -1;
    setPaused(false);
  }, []);

  if (!open || typeof document === 'undefined') return null;

  const fields = editableFields(values);
  const kindName = KIND_NAME[values?.kind] || 'שעון';

  return createPortal(
    <div
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 12200,
        background: CHARCOAL, color: CREAM,
        fontFamily: SANS,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
        textAlign: 'center',
      }}
    >
      {/* WHAT is about to run */}
      <div style={{
        fontSize: 20, fontWeight: 500, lineHeight: 1.35,
        maxWidth: 420, overflowWrap: 'anywhere',
      }}>{exerciseName}</div>

      <div style={{ marginTop: 10, fontSize: 13, color: '#C9BCAB' }}>{kindName}</div>
      <div style={{
        marginTop: 4, fontSize: 17, fontWeight: 500, color: ORANGE, ...LTR_TIME,
      }}>{clockSummary(values)}</div>

      {/* The big descending number */}
      <div style={{
        marginTop: 26, marginBottom: 26,
        fontSize: 104, fontWeight: 700, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        color: paused ? '#8A8079' : CREAM,
        ...LTR_TIME,
      }}>{paused ? formatDurationPadded(left) : left}</div>

      {/* The two buttons, each on its own line */}
      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          onClick={() => (fields.length ? openPicker(fields[0]) : null)}
          style={{
            width: '100%', minHeight: 52, borderRadius: 10,
            border: `1px solid ${ORANGE}`, background: 'transparent',
            color: ORANGE, fontSize: 17, fontWeight: 500,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >שינוי</button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            width: '100%', minHeight: 52, borderRadius: 10,
            border: '1px solid rgba(251,243,234,0.35)', background: 'transparent',
            color: CREAM, fontSize: 17, fontWeight: 400,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >ביטול</button>
      </div>

      {/* While paused for editing, every field is reachable — the first
          one opens straight from שינוי, the rest from this strip. */}
      {paused && fields.length > 1 && (
        <div style={{
          marginTop: 18, display: 'flex', flexWrap: 'wrap',
          gap: 8, justifyContent: 'center', maxWidth: 340,
        }}>
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => openPicker(f)}
              style={{
                border: '1px solid rgba(251,243,234,0.3)', background: 'transparent',
                color: CREAM, borderRadius: 8, padding: '7px 12px',
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                minHeight: 36,
              }}
            >
              {f.label}{' '}
              <span style={{ color: ORANGE, fontWeight: 500, ...LTR_TIME }}>
                {f.time ? formatDuration(values?.[f.key]) : (values?.[f.key] ?? 1)}
              </span>
            </button>
          ))}
        </div>
      )}

      {paused && (
        <div style={{ marginTop: 14, fontSize: 12, color: MUTED, maxWidth: 300, lineHeight: 1.5 }}>
          השינוי חל על האימון הזה בלבד ולא נשמר בתוכנית
        </div>
      )}

      {/* THE clocks-tab value control. Not a copy of it. */}
      <ScrollPickerPopup
        isOpen={!!picking}
        value={picking ? (values?.[picking.key] ?? 0) : 0}
        options={picking ? picking.options : []}
        onSelect={(picked) => picking && applyPick(picking, picked)}
        onClose={closePicker}
        title={picking ? picking.label : ''}
      />
    </div>,
    document.body,
  );
}
