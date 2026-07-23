import React, { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS, addNote, logTaskDetails, isoDate } from '@/lib/lifeos/focus-api';

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

const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

// ─── Rich documentation sheet — ALL fields optional ───────────────
// summary (short cell label) · start/end time · מה עשיתי בפועל · תחושה
// (1-5) · מסקנה לפעם הבאה. Writes the structured fields to focus_task_logs
// via logTaskDetails AND appends a formatted focus_node_notes entry so the
// daySummary feed stays populated. Opens fresh (on check) or prefilled from
// `existing` (tapping a done cell = view/edit). `onUncheck` removes the mark.
// Monthly habits log the whole month, not a timed session → no time inputs.
export default function FocusDocSheet({ node, userId, date = isoDate(), existing = null, onClose, onSaved, onUncheck }) {
  const [summary, setSummary] = useState(existing?.summary || '');
  const [startTime, setStartTime] = useState(hhmm(existing?.start_time));
  const [endTime, setEndTime] = useState(hhmm(existing?.end_time));
  const [note, setNote] = useState(existing?.note || '');
  const [feeling, setFeeling] = useState(Number(existing?.feeling || 0));
  const [improve, setImprove] = useState(existing?.improve || '');
  const [saving, setSaving] = useState(false);
  const isMonthly = node?.frequency === 'monthly';

  const buildFeedNote = () => {
    const parts = [];
    if (summary.trim()) parts.push(`✅ ${summary.trim()}`);
    if (!isMonthly && (startTime || endTime)) parts.push(`🕐 ${startTime || '—'}–${endTime || '—'}`);
    if (feeling > 0) parts.push(`תחושה: ${'●'.repeat(feeling)}${'○'.repeat(5 - feeling)} (${feeling}/5)`);
    if (note.trim()) parts.push(note.trim());
    if (improve.trim()) parts.push(`➡️ לפעם הבאה: ${improve.trim()}`);
    return parts.join('\n');
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const patch = {
      summary: summary.trim(),
      note: note.trim(),
      feeling: feeling || null,
      improve: improve.trim(),
      ...(isMonthly ? {} : { start_time: startTime || null, end_time: endTime || null }),
    };
    try {
      await logTaskDetails(userId, node, date, patch);
      const body = buildFeedNote();
      if (body) { try { await addNote(userId, node.id, body); } catch { /* feed is best-effort */ } }
      onSaved && onSaved();
      toast.success('התיעוד נשמר');
      onClose();
    } catch { toast.error('שגיאה בשמירת התיעוד'); setSaving(false); }
  };

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>תיעוד · {node?.title || 'משימה'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 11, color: FOCUS.muted, marginBottom: 10 }}>הכול אופציונלי — מלא מה שרלוונטי</div>

        <div style={label}>כותרת קצרה (מופיעה בתא)</div>
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="למשל: 45' חזה וכתפיים" style={input} />

        {!isMonthly && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={label}>שעת התחלה</div>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={input} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>שעת סיום</div>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={input} />
            </div>
          </div>
        )}

        <div style={label}>מה עשיתי בפועל</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="תיאור חופשי…" style={{ ...input, resize: 'none', lineHeight: 1.4 }} />

        <div style={label}>תחושה</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          {[1, 2, 3, 4, 5].map(v => (
            <button key={v} onClick={() => setFeeling(feeling === v ? 0 : v)} aria-label={`תחושה ${v}`}
              style={{ width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                border: `2px solid ${v <= feeling ? FOCUS.orange : FOCUS.border}`,
                background: v <= feeling ? FOCUS.orange : '#fff' }} />
          ))}
        </div>

        <div style={label}>מסקנה לפעם הבאה</div>
        <textarea value={improve} onChange={(e) => setImprove(e.target.value)} rows={2} placeholder="מה לשפר?" style={{ ...input, resize: 'none', lineHeight: 1.4 }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={save} disabled={saving}
            style={{ flex: 1, padding: '13px', borderRadius: 14, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'שומר…' : 'שמור תיעוד'}
          </button>
          <button onClick={onClose}
            style={{ flex: '0 0 26%', padding: '13px', borderRadius: 14, border: `1.5px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.ink, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            דלג
          </button>
        </div>

        {/* Uncheck — remove the done mark for this day (the capability lost by
            no longer un-checking on cell tap). */}
        {onUncheck && (
          <button onClick={onUncheck}
            style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#FCEBEB', color: '#C0392B', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Trash2 size={15} /> בטל סימון בוצע
          </button>
        )}
      </div>
    </div>
  );
}

const label = { fontSize: 11, fontWeight: 700, color: FOCUS.muted, margin: '12px 0 5px' };
const input = { width: '100%', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none', boxSizing: 'border-box' };
