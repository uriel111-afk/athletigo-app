import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

// Floating, minimizable baseline form. Sits alongside the minimized
// timer so the coach can run a Tabata test, dive into the trainee's
// profile, and tap the form back open without losing data. Draft is
// persisted to localStorage on every keystroke.
//
// States:
//   'expanded'  — full bottom-sheet form
//   'minimized' — small pill above the timer bar (or above the
//                 bottom nav if no timer is active)
//
// Hidden state lives at the parent (do not render this component
// when not active).

const FIELD_GROUPS = [
  {
    key: 'rope', emoji: '🪢', title: 'קפיצת חבל',
    fields: [
      { id: 'rope_consecutive', label: 'קפיצות רצופות' },
      { id: 'rope_per_minute',  label: 'דקה (מס׳ קפיצות)' },
      { id: 'rope_doubles',     label: 'כפולים', full: true },
    ],
  },
  {
    key: 'strength', emoji: '💪', title: 'כוח',
    fields: [
      { id: 'pullups', label: 'מתח' },
      { id: 'pushups', label: 'שכיבות סמיכה' },
      { id: 'dips',    label: 'דיפס' },
    ],
  },
  {
    key: 'hold', emoji: '🧘', title: 'החזקה וגמישות',
    fields: [
      { id: 'plank_sec', label: 'פלאנק (שניות)' },
      { id: 'hang_sec',  label: 'תלייה (שניות)' },
      { id: 'lsit_sec',  label: 'L-sit (שניות)' },
    ],
  },
  {
    key: 'equipment', emoji: '🛠', title: 'ציוד',
    fields: [
      { id: 'rings_hang',    label: 'טבעות (שניות תלייה)' },
      { id: 'handstand_sec', label: 'עמידת ידיים (שניות)' },
    ],
  },
];

// Pulls the timer bar height so the minimized baseline pill stacks
// above it instead of overlapping. Layout sets data-timer-bar="true"
// when one or more timers are minimized; if it's not in the DOM, the
// pill drops to its default position.
function useTimerBarOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('[data-timer-bar="true"]');
      if (el) {
        const rect = el.getBoundingClientRect();
        // Only count if visible (display !== none).
        const visible = rect.height > 0 && el.offsetParent !== null;
        setOffset(visible ? rect.height : 0);
      } else {
        setOffset(0);
      }
    };
    measure();
    const id = setInterval(measure, 1000);
    return () => clearInterval(id);
  }, []);
  return offset;
}

export default function FloatingBaselineForm({
  traineeId, traineeName, coachId, onClose, onSaved,
}) {
  const [viewState, setViewState] = useState('expanded');
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const timerOffset = useTimerBarOffset();

  const DRAFT_KEY = `baseline_draft_${traineeId}`;

  // Load draft once per trainee.
  useEffect(() => {
    if (!traineeId) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setFormData(JSON.parse(saved));
    } catch {}
  }, [traineeId, DRAFT_KEY]);

  // Persist on every change. Empty object skipped so we don't
  // immediately wipe a freshly-loaded draft.
  useEffect(() => {
    if (!traineeId) return;
    if (Object.keys(formData).length === 0) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(formData)); } catch {}
  }, [formData, traineeId, DRAFT_KEY]);

  const updateField = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const filledCount = Object.values(formData).filter(v =>
    v !== undefined && v !== null && String(v).trim() !== ''
  ).length;

  const handleSave = async () => {
    if (filledCount === 0) {
      toast.error('הזן לפחות שדה אחד');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        trainee_id: traineeId,
        coach_id: coachId || null,
        type: 'baseline',
        data: formData,
        date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
      };
      // The measurements table is the source of truth in this app;
      // we store the structured baseline data in the JSONB `data`
      // column. Falling back to a row even if the column shape
      // differs slightly — the catch surfaces the real error.
      const { error } = await supabase.from('measurements').insert(payload);
      if (error) {
        console.error('[FloatingBaselineForm] save error:', error);
        toast.error('שגיאה: ' + error.message);
        return;
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast.success('בייסליין נשמר ✓');
      onSaved?.(formData);
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  // ── Minimized pill ──────────────────────────────────────────────
  if (viewState === 'minimized') {
    return (
      <div
        onClick={() => setViewState('expanded')}
        style={{
          position: 'fixed',
          bottom: timerOffset + 90,
          left: 12, right: 12,
          background: '#3B82F6',
          borderRadius: 14,
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
          zIndex: 11500,
          boxShadow: '0 4px 15px rgba(59,130,246,0.3)',
          direction: 'rtl',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'white',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              בייסליין — {traineeName || 'מתאמן'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>
              {filledCount} שדות מולאו · טיוטה שמורה
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'white', fontWeight: 600, flexShrink: 0 }}>
          הרחב ▲
        </div>
      </div>
    );
  }

  // ── Expanded bottom sheet ───────────────────────────────────────
  return (
    <div
      onClick={() => setViewState('minimized')}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 11500,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFF9F0',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          width: '100%', maxWidth: 500,
          maxHeight: '85vh', overflowY: 'auto',
          padding: 16, direction: 'rtl',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>📊</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>בייסליין</div>
              <div style={{ fontSize: 11, color: '#888' }}>{traineeName}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setViewState('minimized')}
              style={{
                background: '#3B82F6', color: 'white', border: 'none',
                borderRadius: 10, padding: '6px 12px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >מזער ▼</button>
            <button
              onClick={() => onClose?.()}
              aria-label="סגור"
              style={{
                background: 'none', border: 'none',
                fontSize: 18, color: '#888', cursor: 'pointer',
              }}
            >✕</button>
          </div>
        </div>

        {/* Draft indicator */}
        <div style={{
          background: '#E6F1FB', borderRadius: 8,
          padding: '6px 10px', marginBottom: 12,
          fontSize: 11, color: '#3B82F6',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          💾 טיוטה נשמרת אוטומטית
        </div>

        {/* Field groups */}
        {FIELD_GROUPS.map(g => (
          <FieldGroup key={g.key} group={g} formData={formData} onChange={updateField} />
        ))}

        {/* Notes */}
        <div style={cardStyle}>
          <div style={cardTitle}>📝 הערות</div>
          <textarea
            value={formData.notes || ''}
            onChange={e => updateField('notes', e.target.value)}
            placeholder="הערות כלליות..."
            style={{
              width: '100%', padding: 8,
              borderRadius: 10, border: '0.5px solid #F0E4D0',
              fontSize: 13, direction: 'rtl',
              minHeight: 50, resize: 'vertical',
              background: '#FFF9F0', boxSizing: 'border-box',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
              outline: 'none',
            }}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: 14,
            borderRadius: 14, border: 'none',
            background: '#FF6F20', color: 'white',
            fontSize: 16, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(255,111,32,0.2)',
          }}
        >
          {saving ? 'שומר...' : '💾 שמור בייסליין'}
        </button>
        <div style={{
          textAlign: 'center', padding: 8,
          fontSize: 10, color: '#aaa',
        }}>
          טיוטה נשמרת אוטומטית · לא תאבד נתונים
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function FieldGroup({ group, formData, onChange }) {
  const fullFields = group.fields.filter(f => f.full);
  const inlineFields = group.fields.filter(f => !f.full);
  return (
    <div style={cardStyle}>
      <div style={cardTitle}>{group.emoji} {group.title}</div>
      {inlineFields.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: fullFields.length > 0 ? 6 : 0 }}>
          {inlineFields.map(f => (
            <NumberCell key={f.id} field={f} formData={formData} onChange={onChange} />
          ))}
        </div>
      )}
      {fullFields.map(f => (
        <NumberCell key={f.id} field={f} formData={formData} onChange={onChange} fullWidth />
      ))}
    </div>
  );
}

function NumberCell({ field, formData, onChange, fullWidth }) {
  return (
    <div style={{ flex: fullWidth ? undefined : 1, width: fullWidth ? '100%' : undefined }}>
      <label style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 2 }}>
        {field.label}
      </label>
      <input
        type="number"
        inputMode="numeric"
        value={formData[field.id] ?? ''}
        onChange={e => onChange(field.id, e.target.value)}
        placeholder="0"
        style={{
          width: '100%', padding: 8,
          borderRadius: 10, border: '0.5px solid #F0E4D0',
          fontSize: 14, textAlign: 'center',
          background: '#FFF9F0', boxSizing: 'border-box',
          fontFamily: "'Heebo', 'Assistant', sans-serif",
          outline: 'none',
        }}
      />
    </div>
  );
}

const cardStyle = {
  background: 'white', borderRadius: 14,
  padding: 12, marginBottom: 8,
  border: '0.5px solid #F0E4D0',
};

const cardTitle = {
  fontSize: 13, fontWeight: 600,
  marginBottom: 8,
  display: 'flex', alignItems: 'center', gap: 6,
};
