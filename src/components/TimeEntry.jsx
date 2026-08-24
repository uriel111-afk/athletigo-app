import { useEffect, useState } from 'react';
import { formatTime } from '@/lib/formatTime';

// ────────────────────────────────────────────────────────────────
// Minutes + seconds entry.
//
// The DB column stays exactly as it is — an integer number of SECONDS
// (exercise_set_logs.time_completed, exercises.static_hold_time /
// work_time / rest_time). This control only changes how a human types
// that number: two fields instead of one, because "1 minute 30" is how
// people think about a plank and "90" is not.
//
// Contract: value is seconds (or null), onChange hands back seconds
// (or null when both fields are cleared). Seconds are clamped to 0-59;
// anything larger rolls into the minutes field rather than being
// silently accepted as a bad value.
// ────────────────────────────────────────────────────────────────

const box = (accent) => ({
  width: '100%', height: 38, border: 'none', textAlign: 'center',
  fontFamily: "'Bebas Neue', sans-serif", fontSize: 24,
  color: accent, background: 'transparent', outline: 'none',
});

export function MinutesSecondsInput({
  value,
  onChange,
  readOnly = false,
  accent = '#FF6F20',
  borderColor = '#EFE3D2',
  autoFocus = false,
}) {
  const total = value === '' || value == null ? null : Number(value);
  const valid = Number.isFinite(total);

  // Local strings so a half-typed field ("" while the user retypes)
  // doesn't get normalised out from under the caret on every keystroke.
  const [mm, setMm] = useState(valid ? String(Math.floor(total / 60)) : '');
  const [ss, setSs] = useState(valid ? String(total % 60) : '');

  useEffect(() => {
    if (!valid) { setMm(''); setSs(''); return; }
    setMm(String(Math.floor(total / 60)));
    setSs(String(total % 60));
  }, [total, valid]);

  const emit = (nextMm, nextSs) => {
    if (nextMm === '' && nextSs === '') { onChange(null); return; }
    const m = Math.max(0, parseInt(nextMm, 10) || 0);
    const s = Math.max(0, parseInt(nextSs, 10) || 0);
    onChange(m * 60 + s);
  };

  const onMinutes = (raw) => {
    const clean = raw.replace(/[^\d]/g, '').slice(0, 3);
    setMm(clean);
    emit(clean, ss);
  };

  // 0-59 only. Typing 75 rolls over into the minutes field instead of
  // storing a nonsense "75 seconds".
  const onSeconds = (raw) => {
    const clean = raw.replace(/[^\d]/g, '').slice(0, 3);
    const n = parseInt(clean, 10);
    if (Number.isFinite(n) && n > 59) {
      const carried = Math.floor(n / 60);
      const rest = n % 60;
      const nextMm = String((parseInt(mm, 10) || 0) + carried);
      const nextSs = String(rest);
      setMm(nextMm);
      setSs(nextSs);
      emit(nextMm, nextSs);
      return;
    }
    setSs(clean);
    emit(mm, clean);
  };

  const field = (label, val, handler, focus) => (
    <div style={{
      flex: 1, minWidth: 0, background: '#FFFFFF',
      border: `1px solid ${borderColor}`, borderRadius: 8,
      padding: '6px 4px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 2,
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: '#9B958B' }}>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={val}
        disabled={readOnly}
        autoFocus={focus}
        placeholder="0"
        onFocus={(e) => e.target.select()}
        onChange={(e) => handler(e.target.value)}
        style={box(accent)}
      />
    </div>
  );

  return (
    <div dir="rtl" style={{ display: 'flex', alignItems: 'stretch', gap: 6, width: '100%' }}>
      {field('דקות', mm, onMinutes, autoFocus)}
      <span style={{
        alignSelf: 'center', fontSize: 20, fontWeight: 800, color: '#DED5C8',
      }}>:</span>
      {field('שניות', ss, onSeconds, false)}
    </div>
  );
}

// Popup wrapper — same chrome as ScrollPickerPopup so the two entry
// surfaces feel like one control. Used wherever a set's time value is
// filled in; reps and weight keep the scroll picker.
export function TimeEntryPopup({ isOpen, value, title, onSelect, onClose }) {
  const [draft, setDraft] = useState(value ?? null);

  useEffect(() => { if (isOpen) setDraft(value ?? null); }, [isOpen, value]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 6000,
      }}
    >
      <div style={{
        background: 'rgba(255,249,240,0.97)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 20, padding: 16, width: 280,
        border: '1.5px solid rgba(255,111,32,0.2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)', direction: 'rtl',
      }}>
        {title && (
          <div style={{
            color: '#FF6F20', fontSize: 16, fontWeight: 700,
            textAlign: 'center', marginBottom: 12,
          }}>{title}</div>
        )}

        <MinutesSecondsInput value={draft} onChange={setDraft} autoFocus />

        <div style={{
          textAlign: 'center', fontSize: 13, color: '#9B958B',
          marginTop: 8, minHeight: 18,
        }}>
          {draft != null ? formatTime(draft) : ''}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => { onSelect(draft); onClose(); }}
            style={{
              flex: 1, height: 42, borderRadius: 10, border: 'none',
              background: '#FF6F20', color: '#FFFFFF',
              fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >אישור</button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 88, height: 42, borderRadius: 10,
              border: '1px solid #EFE3D2', background: '#FFFFFF',
              color: '#9B958B', fontSize: 15, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >ביטול</button>
        </div>
      </div>
    </div>
  );
}

export default MinutesSecondsInput;
