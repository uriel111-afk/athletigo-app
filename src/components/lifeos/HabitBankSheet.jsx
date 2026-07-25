import React, { useState } from 'react';
import { Plus, X, Trash2, Info } from 'lucide-react';
import { FOCUS, hexAlpha, hebrewDateLabel } from '@/lib/lifeos/focus-api';

// ─── One habit's task bank ─────────────────────────────────────────
// A flat list of the habit's own sub-items (e.g. under 'אימון כוח':
// 'פלג גוף עליון', 'רגליים'). Each item is completable on its own for the
// shown date; completing the FIRST one is what marks the habit's day done
// (the parent handles that). The bank is optional — a habit with an empty
// bank keeps working as a plain done/not-done cell in the matrix.
// zIndex 1390 sits just under the doc/not-done sheets (1400) so those still
// paint on top when one opens over this.
export default function HabitBankSheet({
  habit, date, items = [], isItemDone, onAdd, onToggle, onDelete, onClose, onDetails,
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await onAdd(t);
    setBusy(false);
    if (ok !== false) setText('');
  };

  const doneCount = items.filter(i => isItemDone(i)).length;

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1390, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>{habit.title || 'הרגל'}</div>
            <div style={{ fontSize: 11.5, color: FOCUS.muted, marginTop: 2 }}>
              {hebrewDateLabel(date)}{items.length ? ` · ${doneCount}/${items.length} בוצעו` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {onDetails && (
              <button onClick={onDetails} aria-label="פרטים" title="פרטי ההרגל"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <Info size={19} /><span style={cap}>פרטים</span>
              </button>
            )}
            <button onClick={onClose} aria-label="סגור"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <X size={20} /><span style={cap}>סגור</span>
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: FOCUS.muted, background: '#FFFDFA', border: `1px solid ${FOCUS.border}`, borderRadius: 10, padding: '8px 10px', margin: '8px 0 12px', lineHeight: 1.45 }}>
          בנק המשימות של ההרגל — סימון פריט אחד מסמן את ההרגל כבוצע ליום הזה.
        </div>

        {/* Bank items */}
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '22px 12px', color: FOCUS.muted, fontSize: 13 }}>
            הבנק ריק — הוסף למטה פריטים שאתה בוחר מהם ביום נתון.
            <div style={{ fontSize: 11.5, marginTop: 6 }}>בלי פריטים ההרגל ממשיך לעבוד כסימון רגיל בטבלה.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {items.map(item => {
              const done = isItemDone(item);
              return (
                <div key={item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 11, border: `1px solid ${done ? hexAlpha(FOCUS.orange, 0.5) : FOCUS.border}`, background: done ? hexAlpha(FOCUS.orange, 0.07) : '#FFFDFA' }}>
                  <button onClick={() => onToggle(item)} aria-label={done ? 'בטל סימון' : 'סמן כבוצע'}
                    style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, cursor: 'pointer', border: done ? 'none' : `1.5px solid ${hexAlpha(FOCUS.orange, 0.7)}`, background: done ? FOCUS.orange : '#fff', color: '#fff', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
                    {done ? '✓' : ''}
                  </button>
                  <span onClick={() => onToggle(item)}
                    style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: FOCUS.ink, cursor: 'pointer', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>
                    {item.title || 'פריט'}
                  </span>
                  <button onClick={() => onDelete(item)} aria-label="מחק פריט"
                    style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 9, border: 'none', background: '#FCEBEB', color: '#C0392B', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Trash2 size={14} /><span style={cap}>מחק</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add item — always available */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="פריט חדש לבנק…"
            style={{ flex: 1, minWidth: 0, border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' }} />
          <button onClick={submit} disabled={!text.trim() || busy} aria-label="הוסף"
            style={{ flexShrink: 0, width: 46, height: 44, borderRadius: 11, border: 'none', background: text.trim() && !busy ? FOCUS.orangeGrad : FOCUS.border, color: '#fff', cursor: text.trim() && !busy ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Plus size={19} /><span style={cap}>הוסף</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const cap = { fontSize: 9, fontWeight: 700, lineHeight: 1 };
