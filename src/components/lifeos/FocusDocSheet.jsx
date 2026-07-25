import React, { useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS, addNote, logTaskDetails, isoDate, hexAlpha } from '@/lib/lifeos/focus-api';
import { addExecution, addCustomField, CUSTOM_FIELD_TYPES } from '@/lib/lifeos/personal-day-api';

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

// Minutes between two HH:MM strings. An end earlier than the start is treated
// as having crossed midnight (realistic for late-evening habits). Null if
// either bound is missing.
const durationMin = (start, end) => {
  if (!start || !end) return null;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let d = toMin(end) - toMin(start);
  if (d < 0) d += 1440;           // crossed midnight
  return d;
};
const fmtDuration = (min) => {
  if (min == null) return '';
  const h = Math.floor(min / 60), m = min % 60;
  const hp = h ? `${h} ${h === 1 ? 'שעה' : 'שעות'}` : '';
  const mp = m ? `${m} דקות` : '';
  return [hp, mp].filter(Boolean).join(' ') || '0 דקות';
};
// Satisfaction-on-completion icon scale — stores the same feeling smallint 1-5.
const SAT_ICONS = [{ v: 1, icon: '😞' }, { v: 2, icon: '😕' }, { v: 3, icon: '😐' }, { v: 4, icon: '🙂' }, { v: 5, icon: '😄' }];

// ─── Rich documentation sheet — ALL fields optional ───────────────
// summary (short cell label) · start/end time · מה עשיתי בפועל · תחושה
// (1-5) · מסקנה לפעם הבאה. Writes the structured fields to focus_task_logs
// via logTaskDetails AND appends a formatted focus_node_notes entry so the
// daySummary feed stays populated. Opens fresh (on check) or prefilled from
// `existing` (tapping a done cell = view/edit). `onUncheck` removes the mark.
// Monthly habits log the whole month, not a timed session → no time inputs.
export default function FocusDocSheet({
  node, userId, date = isoDate(), existing = null, onClose, onSaved, onUncheck,
  // ── Stage 1 additions, all optional so every existing caller is unchanged ──
  // prefillStart   — 'HH:MM' captured when 'מתחיל' was pressed on the day screen.
  // customFields   — focus_custom_fields rows, rendered under the fixed fields.
  // onFieldsChanged— called after 'הוסף שדה' so the host can refetch them.
  prefillStart = null, customFields = [], onFieldsChanged,
}) {
  const [summary, setSummary] = useState(existing?.summary || '');
  const [startTime, setStartTime] = useState(hhmm(existing?.start_time) || prefillStart || '');
  const [endTime, setEndTime] = useState(hhmm(existing?.end_time));
  const [note, setNote] = useState(existing?.note || '');
  const [feeling, setFeeling] = useState(Number(existing?.feeling || 0));
  const [improve, setImprove] = useState(existing?.improve || '');
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState({});          // customFieldId → value
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const isMonthly = node?.frequency === 'monthly';
  // Completion context = opened to mark a fresh done (no saved row yet). The
  // satisfaction question only frames THIS case; editing an existing entry
  // keeps the neutral mood label.
  const completion = !existing;
  const durMin = isMonthly ? null : durationMin(startTime, endTime);

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
      // 1. the day mark — one row per (node, day), upserted, exactly as before
      await logTaskDetails(userId, node, date, patch);
      // 2. the execution — APPENDED, never upserted. Saving twice on one day
      //    creates two focus_executions rows, which is the whole point: the
      //    matrix cell then shows ×2 while focus_task_logs still holds one row.
      try {
        const stamp = (t) => (t ? new Date(`${date}T${t}:00`).toISOString() : null);
        await addExecution(userId, {
          node_id: node.id,
          day: date,
          started_at: isMonthly ? null : stamp(startTime),
          ended_at: isMonthly ? null : stamp(endTime),
          minutes: durMin,
          what_happened: note.trim() || summary.trim() || null,
          satisfaction: feeling || null,
          improve_next: improve.trim() || null,
          custom,
        });
      } catch { /* the day mark already landed; never lose it over this */ }
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
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><X size={20} /><span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1 }}>סגור</span></button>
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

        {/* Auto-derived duration — read-only, no manual field. */}
        {durMin != null && (
          <div style={{ fontSize: 12, color: '#B4531A', fontWeight: 700, margin: '6px 2px 0', background: hexAlpha(FOCUS.orange, 0.1), borderRadius: 9, padding: '6px 10px', display: 'inline-block' }}>
            משך: {fmtDuration(durMin)} (מחושב אוטומטית)
          </div>
        )}

        <div style={label}>מה עשיתי בפועל</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="תיאור חופשי…" style={{ ...input, resize: 'none', lineHeight: 1.4 }} />

        <div style={label}>{completion ? 'כמה מספק היה לסיים את זה?' : 'תחושה'}</div>
        {completion ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            {SAT_ICONS.map(({ v, icon }) => {
              const on = feeling === v;
              return (
                <button key={v} onClick={() => setFeeling(on ? 0 : v)} aria-label={`שביעות רצון ${v}`}
                  style={{ width: 46, height: 46, borderRadius: 12, cursor: 'pointer', flexShrink: 0, fontSize: 24, lineHeight: 1, padding: 0,
                    border: `2px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.14) : '#fff',
                    filter: feeling && !on ? 'grayscale(0.7)' : 'none', opacity: feeling && !on ? 0.55 : 1, transition: 'filter .1s, opacity .1s' }}>
                  {icon}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
            {[1, 2, 3, 4, 5].map(v => (
              <button key={v} onClick={() => setFeeling(feeling === v ? 0 : v)} aria-label={`תחושה ${v}`}
                style={{ width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                  border: `2px solid ${v <= feeling ? FOCUS.orange : FOCUS.border}`,
                  background: v <= feeling ? FOCUS.orange : '#fff' }} />
            ))}
          </div>
        )}

        <div style={label}>מסקנה לפעם הבאה</div>
        <textarea value={improve} onChange={(e) => setImprove(e.target.value)} rows={2} placeholder="מה לשפר?" style={{ ...input, resize: 'none', lineHeight: 1.4 }} />

        {/* ── User-defined fields, from focus_custom_fields. Answers ride along
            in the execution row's `custom` jsonb, so adding a field never needs
            a migration. ── */}
        {customFields.map(f => (
          <div key={f.id}>
            <div style={label}>{f.label}</div>
            {f.field_type === 'scale' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map(v => {
                  const on = Number(custom[f.id]) === v;
                  return (
                    <button key={v} onClick={() => setCustom(p => ({ ...p, [f.id]: on ? '' : v }))}
                      style={{ width: 40, height: 36, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 600,
                        border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.14) : '#fff', color: on ? '#B4531A' : FOCUS.ink }}>
                      {v}
                    </button>
                  );
                })}
              </div>
            ) : f.field_type === 'select' ? (
              <select value={custom[f.id] || ''} onChange={(e) => setCustom(p => ({ ...p, [f.id]: e.target.value }))} style={input}>
                <option value="">—</option>
                {(Array.isArray(f.options) ? f.options : []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                value={custom[f.id] || ''} onChange={(e) => setCustom(p => ({ ...p, [f.id]: e.target.value }))}
                style={input} />
            )}
          </div>
        ))}

        {/* ── הוסף שדה — define a new documentation field from here ── */}
        {addingField ? (
          <div style={{ marginTop: 12, padding: 10, border: `1px dashed ${FOCUS.edge}`, borderRadius: 12, background: '#FFFDFA' }}>
            <input autoFocus value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)}
              placeholder="שם השדה" style={input} />
            <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} style={{ ...input, marginTop: 8 }}>
              {CUSTOM_FIELD_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={async () => {
                  if (!newFieldLabel.trim()) return;
                  try {
                    await addCustomField(userId, { label: newFieldLabel, field_type: newFieldType });
                    setNewFieldLabel(''); setAddingField(false);
                    onFieldsChanged && onFieldsChanged();
                    toast.success('שדה נוסף ✓');
                  } catch { toast.error('שגיאה'); }
                }}
                style={{ flex: 1, padding: '10px', borderRadius: 11, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                שמור שדה
              </button>
              <button onClick={() => setAddingField(false)}
                style={{ padding: '10px 14px', borderRadius: 11, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                בטל
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddingField(true)}
            style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 12, border: `1px dashed ${FOCUS.edge}`, background: hexAlpha(FOCUS.orange, 0.05), color: '#B4531A', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={15} /> הוסף שדה
          </button>
        )}

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
