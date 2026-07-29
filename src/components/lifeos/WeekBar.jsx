import React, { useCallback, useEffect, useState } from 'react';
import { FOCUS } from '@/lib/lifeos/focus-api';
import { fetchFocusWeek, saveFocusWeek, weekStartOf } from '@/lib/lifeos/focus-weeks-api';

// ═══════════════════════════════════════════════════════════════════
// The week bar — one collapsed row, two more lines on tap
// ═══════════════════════════════════════════════════════════════════
// Collapsed:  [מיקוד]  <focus text, one line, ellipsis>        NN%
// Expanded:   + [פרס]    <reward>
//             + [משפט]   <affirmation>
//
// Collapsed is the default on EVERY load — deliberately not persisted.
// The bar is a glance, and a bar that reopens expanded because it was
// left that way three days ago stops being one.
//
// The three texts live in focus_weeks (per user, per week). The percent
// is derived by the caller from the same executions the matrix reads.
// ═══════════════════════════════════════════════════════════════════

const LABELS = { focus: 'מיקוד', reward: 'פרס', affirmation: 'משפט' };
const ORDER = ['focus', 'reward', 'affirmation'];

function Pill({ children }) {
  return (
    <span style={{
      flexShrink: 0, padding: '3px 9px', borderRadius: 999,
      background: FOCUS.border, color: '#7A5A38',
      fontSize: 10.5, fontWeight: 800, lineHeight: 1.5,
    }}>{children}</span>
  );
}

// One editable line. Tap the text to edit; blur or Enter commits.
function Line({ label, value, onSave, muted = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value || '')) onSave(next);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <Pill>{label}</Pill>
      {editing ? (
        <input
          autoFocus value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }}
          style={{
            flex: 1, minWidth: 0, border: `1px solid ${FOCUS.border}`, borderRadius: 8,
            padding: '5px 8px', fontSize: 12.5, fontFamily: 'inherit',
            color: FOCUS.ink, background: '#FFFDFA', outline: 'none',
          }} />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          style={{
            flex: 1, minWidth: 0, textAlign: 'right', border: 'none', background: 'none',
            padding: 0, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12.5, fontWeight: muted ? 600 : 700,
            color: value ? FOCUS.ink : FOCUS.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
          {value || '—'}
        </button>
      )}
    </div>
  );
}

export default function WeekBar({ userId, date, percent = 0, courage = null, remaining = null }) {
  const weekStart = weekStartOf(date);
  const [open, setOpen] = useState(false);          // collapsed on every load
  const [row, setRow] = useState(null);

  // Reset to collapsed whenever the week changes — a different week is a
  // different glance, not a continuation of the one that was open.
  useEffect(() => { setOpen(false); }, [weekStart]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetchFocusWeek(userId, weekStart);
        console.log('[WeekBar] raw focus_weeks row', { userId, weekStart, row: r });
        if (!dead) setRow(r);
      } catch (e) {
        console.warn('[WeekBar] focus_weeks read failed', e?.message);
        if (!dead) setRow(null);
      }
    })();
    return () => { dead = true; };
  }, [userId, weekStart]);

  const save = useCallback(async (field, text) => {
    setRow(prev => ({ ...(prev || {}), [field]: text }));      // optimistic
    try {
      const saved = await saveFocusWeek(userId, weekStart, { [field]: text });
      if (saved) setRow(saved);
    } catch (e) {
      console.warn('[WeekBar] focus_weeks save failed', e?.message);
    }
  }, [userId, weekStart]);

  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div style={{
      margin: '0 12px 8px', background: FOCUS.card,
      border: `1px solid ${FOCUS.border}`, borderRadius: 14,
      boxShadow: FOCUS.neu, overflow: 'hidden',
    }}>
      {/* collapsed row — pill, focus text, percent */}
      <div
        role="button" tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', cursor: 'pointer', minWidth: 0,
        }}>
        <Pill>{LABELS.focus}</Pill>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700,
          color: row?.focus ? FOCUS.ink : FOCUS.muted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{row?.focus || '—'}</span>
        <span style={{
          flexShrink: 0, fontSize: 15, fontWeight: 800, color: FOCUS.orange,
          fontVariantNumeric: 'tabular-nums',
        }}>{pct}%</span>
      </div>

      {open && (
        <div style={{
          padding: '2px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8,
          borderTop: `1px solid ${FOCUS.border}`,
        }}>
          <div style={{ height: 2 }} />
          {/* The focus line is editable here; collapsed it is display-only so
              a tap on the row expands rather than opening an input. */}
          <Line label={LABELS.focus} value={row?.focus || ''} onSave={(t) => save('focus', t)} />
          {ORDER.slice(1).map(f => (
            <Line key={f} label={LABELS[f]} value={row?.[f] || ''} onSave={(t) => save(f, t)} />
          ))}
          {/* Carried over from the summary card this bar replaced: the day's
              remaining count and the אומץ task. Kept rather than dropped —
              relocating a feature is not the same as deleting it. */}
          {(remaining != null || courage) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              fontSize: 11, color: FOCUS.muted, paddingTop: 2,
            }}>
              {remaining != null && <span>היום: נותרו {remaining}</span>}
              {courage && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>אומץ: {courage}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
