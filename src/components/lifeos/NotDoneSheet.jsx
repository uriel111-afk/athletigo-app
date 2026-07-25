import React, { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS, hexAlpha, skipTask, isoDate } from '@/lib/lifeos/focus-api';
import { addExecution } from '@/lib/lifeos/personal-day-api';

// Reason chips — the label IS the stored key (reason column is free text).
const REASONS = ['אין זמן', 'עייפות', 'שכחתי', 'דחיתי בכוונה'];

// ─── Lighter "why not done" sheet ─────────────────────────────────
// Quick reason chips + optional free text. Saving writes a focus_task_logs
// row with status='skipped' so the day is recorded as a real not-done (with
// a reason) without ever counting as complete. `onMarkDone` keeps a retro
// "actually did it" escape so the matrix never traps a missed cell.
export default function NotDoneSheet({ node, userId, date = isoDate(), existing = null, onClose, onSaved, onMarkDone }) {
  const [reason, setReason] = useState(existing?.reason && REASONS.includes(existing.reason) ? existing.reason : null);
  const [text, setText] = useState(existing?.reason && !REASONS.includes(existing.reason) ? existing.reason : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const finalReason = text.trim() || reason || null;   // free text wins, else chip
    if (!finalReason) { onClose(); return; }              // nothing chosen → skip silently
    setSaving(true);
    try {
      await skipTask(userId, node, date, { reason: finalReason, note: text.trim() || null });
      // The lighter sheet also records the miss as an execution row carrying
      // skipped_reason, so the week maths and the reviews can see WHY a day was
      // short — focus_task_logs only has room for one reason per day.
      try { await addExecution(userId, { node_id: node.id, day: date, skipped_reason: finalReason }); }
      catch { /* the day mark already landed */ }
      onSaved && onSaved();
      toast('נרשם — לא בוצע');
      onClose();
    } catch { toast.error('שגיאה בשמירה'); setSaving(false); }
  };

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>לא בוצע · {node?.title || 'משימה'}</div>
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><X size={20} /><span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1 }}>סגור</span></button>
        </div>
        <div style={{ fontSize: 11, color: FOCUS.muted, marginBottom: 12 }}>למה לא יצא? (אופציונלי)</div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {REASONS.map(r => {
            const active = reason === r && !text.trim();
            return (
              <button key={r} onClick={() => { setReason(active ? null : r); }}
                style={{ padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                  border: `1px solid ${active ? FOCUS.orange : FOCUS.border}`, background: active ? hexAlpha(FOCUS.orange, 0.14) : '#fff',
                  color: active ? '#B4531A' : FOCUS.muted }}>{r}</button>
            );
          })}
        </div>

        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="פירוט חופשי…"
          style={{ width: '100%', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none', boxSizing: 'border-box', resize: 'none', lineHeight: 1.4 }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={save} disabled={saving}
            style={{ flex: 1, padding: '13px', borderRadius: 14, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'שומר…' : 'שמור'}
          </button>
          {onMarkDone && (
            <button onClick={() => { onMarkDone(); onClose(); }}
              style={{ flex: '0 0 42%', padding: '13px', borderRadius: 14, border: `1.5px solid ${FOCUS.border}`, background: '#fff', color: '#16a34a', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              בעצם בוצע ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
