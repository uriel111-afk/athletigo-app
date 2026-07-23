import React, { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS, addNote, formatDocNote } from '@/lib/lifeos/focus-api';

// ─── Done toast with an optional "add documentation" action ───────
// One tap to complete stays one tap — the mini-form is opt-in. Tapping
// 'הוסף תיעוד' calls onDoc(node) so the host can open <FocusDocSheet>.
export function doneToast(message, node, onDoc) {
  toast.success(message, {
    action: {
      label: 'הוסף תיעוד',
      onClick: () => onDoc && onDoc(node),
    },
    duration: 5000,
  });
}

// ─── The mini-form bottom sheet — ALL fields optional ─────────────
// מספר/תוצאה (free text) · תחושה (5 level dots) · תובנה (free text).
// Saves as ONE formatted focus_node_notes entry. Skipping saves nothing.
export default function FocusDocSheet({ node, userId, onClose, onSaved }) {
  const [number, setNumber] = useState('');
  const [feeling, setFeeling] = useState(0);
  const [insight, setInsight] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const body = formatDocNote({ number, feeling, insight });
    if (!body) { onClose(); return; }           // nothing filled → skip
    setSaving(true);
    try {
      await addNote(userId, node.id, body);
      onSaved && onSaved();
      toast.success('התיעוד נשמר');
      onClose();
    } catch { toast.error('שגיאה בשמירת התיעוד'); setSaving(false); }
  };

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>תיעוד · {node?.title || 'משימה'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 11, color: FOCUS.muted, marginBottom: 12 }}>הכול אופציונלי — מלא מה שרלוונטי</div>

        <div style={label}>מספר / תוצאה</div>
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="למשל: 3 מכירות, 5 ק״מ…" style={input} />

        <div style={label}>תחושה</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          {[1, 2, 3, 4, 5].map(v => (
            <button key={v} onClick={() => setFeeling(feeling === v ? 0 : v)} aria-label={`תחושה ${v}`}
              style={{
                width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                border: `2px solid ${v <= feeling ? FOCUS.orange : FOCUS.border}`,
                background: v <= feeling ? FOCUS.orange : '#fff',
              }} />
          ))}
        </div>

        <div style={label}>תובנה</div>
        <textarea value={insight} onChange={(e) => setInsight(e.target.value)} rows={2} placeholder="מה למדת? מה הלאה?"
          style={{ ...input, resize: 'none', lineHeight: 1.4 }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={save} disabled={saving}
            style={{ flex: 1, padding: '13px', borderRadius: 14, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'שומר…' : 'שמור תיעוד'}
          </button>
          <button onClick={onClose}
            style={{ padding: '13px 18px', borderRadius: 14, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            דלג
          </button>
        </div>
      </div>
    </div>
  );
}

const label = { fontSize: 11, fontWeight: 700, color: FOCUS.muted, margin: '12px 0 5px' };
const input = { width: '100%', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none', boxSizing: 'border-box' };
