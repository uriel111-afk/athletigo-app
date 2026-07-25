import React, { useState } from 'react';
import { X } from 'lucide-react';
import { FOCUS, hexAlpha, hebrewDateLabel } from '@/lib/lifeos/focus-api';

// ─── "איך זה היה" — the light completion prompt ────────────────────
// Deliberately NOT FocusDocSheet: no start/end time, no duration, no numeric
// metric, no improve field. Just one free-text line and a 3-icon feeling
// picker, in FocusDocSheet's visual language (bottom sheet, 22px top radius,
// orange gradient primary, zIndex 1400).
// The item is ALREADY marked done before this opens — this sheet only enriches
// it, so dismissing it never loses the completion.
const FEELINGS = [
  { value: 1, emoji: '😕', label: 'פחות' },
  { value: 3, emoji: '🙂', label: 'טוב' },
  { value: 5, emoji: '🤩', label: 'מדהים' },
];

export default function InspirationDoneSheet({ item, date, existing = null, onSave, onClose }) {
  const [note, setNote] = useState(existing?.summary || '');
  const [feeling, setFeeling] = useState(Number(existing?.feeling) || 0);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    await onSave({ summary: note.trim() || null, feeling: feeling || null });
    setBusy(false);
  };

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: FOCUS.ink }}>{item.title || 'פריט'}</div>
            <div style={{ fontSize: 11.5, color: FOCUS.muted, marginTop: 2 }}>בוצע · {hebrewDateLabel(date)}</div>
          </div>
          <button onClick={onClose} aria-label="סגור"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <X size={20} /><span style={cap}>סגור</span>
          </button>
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 700, color: FOCUS.ink, marginBottom: 6 }}>איך זה היה?</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {FEELINGS.map(f => {
            const on = feeling === f.value;
            return (
              <button key={f.value} onClick={() => setFeeling(on ? 0 : f.value)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '10px 4px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`,
                  background: on ? hexAlpha(FOCUS.orange, 0.12) : '#FFFDFA',
                }}>
                <span style={{ fontSize: 26, lineHeight: 1 }}>{f.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: on ? '#B4531A' : FOCUS.muted }}>{f.label}</span>
              </button>
            );
          })}
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="כמה מילים — מה היה שם, עם מי, מה נשאר ממנו…"
          style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${FOCUS.border}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none', resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={save} disabled={busy}
            style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: busy ? FOCUS.border : FOCUS.orangeGrad, color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {busy ? 'שומר…' : 'שמור'}
          </button>
          <button onClick={onClose}
            style={{ padding: '12px 16px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            דלג
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: FOCUS.muted, textAlign: 'center', marginTop: 8 }}>
          הפריט כבר סומן כבוצע — זה רק התיעוד
        </div>
      </div>
    </div>
  );
}

const cap = { fontSize: 9, fontWeight: 700, lineHeight: 1 };
