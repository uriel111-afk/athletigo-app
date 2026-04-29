import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import DetailDialog from '@/components/ui/Card3Levels/DetailDialog';
import SessionStatusPicker from '@/components/sessions/SessionStatusPicker';

// Level 3 — full session detail view. Two modes per viewerRole:
//
//   coach
//     • Full edit: status pills, date/time, type, location,
//       duration, price, public notes, AND a private-notes panel
//       that the trainee NEVER sees.
//     • Single "שמור שינויים" footer button that writes the
//       collected diff in one update + invalidates relevant
//       caches via the parent's onSaved callback.
//
//   trainee
//     • Read-only display of every field except the coach-only
//       private notes block (which is not even rendered).
//     • Footer collapses to a single "סגור" button when the
//       session is settled. For pending sessions, the trainee
//       gets the spec's three-CTA row (אישור / שינוי תאריך /
//       ביטול) — wired via callback props the parent can opt into.
//
// Save logic
//   Coach saves write all fields including coach_private_notes.
//   Trainee never has a save path here; their actions hit the
//   callback props directly so the parent owns whatever side
//   effects run (notifications, package deduction, etc.).

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL');
};
const fmtTime = (t) => (t || '').slice(0, 5);

const PENDING_STATUSES = ['ממתין', 'ממתין לאישור', 'pending', 'pending_approval'];

export default function SessionDetailDialog({
  session,
  otherParty,
  viewerRole = 'coach',
  isOpen,
  onClose,
  onSaved,
  // Trainee-only callback hooks. The parent decides what each one
  // does. Leaving them undefined hides the corresponding button.
  onTraineeApprove,
  onTraineeReschedule,
  onTraineeCancel,
}) {
  const isCoach = viewerRole === 'coach';

  // Local edit state (coach-only). Initialised from the session
  // prop on each open so a stale prior edit doesn't leak across
  // sessions.
  const [form, setForm] = useState({
    status: '',
    date: '',
    time: '',
    type: '',
    location: '',
    duration: '',
    price: '',
    notes: '',
    coach_private_notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !session) return;
    setForm({
      status: session.status || '',
      date: session.date ? String(session.date).split('T')[0] : '',
      time: session.time || '',
      type: session.session_type || session.type || '',
      location: session.location || '',
      duration: session.duration != null ? String(session.duration) : '',
      price: session.price != null ? String(session.price) : '',
      notes: session.notes || '',
      coach_private_notes: session.coach_private_notes || '',
    });
    setSaving(false);
  }, [isOpen, session?.id]);

  if (!session) return null;

  const partyName = otherParty?.full_name || otherParty?.name || '';
  const title = isCoach
    ? `מפגש עם ${partyName || 'מתאמן'}`
    : (partyName ? `המפגש שלך עם ${partyName}` : 'המפגש שלך');
  const subtitle = `${fmtDate(session.date)}${session.time ? ` · ${fmtTime(session.time)}` : ''}`;

  const handleSave = async () => {
    if (!isCoach || !session?.id || saving) return;
    setSaving(true);
    try {
      const payload = {
        status: form.status || null,
        date: form.date || null,
        time: form.time || null,
        session_type: form.type || null,
        location: form.location || null,
        duration: form.duration === '' ? null : Number(form.duration),
        price: form.price === '' ? null : Number(form.price),
        notes: form.notes || null,
        coach_private_notes: form.coach_private_notes || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('sessions')
        .update(payload)
        .eq('id', session.id);
      if (error) throw error;
      toast.success('המפגש עודכן ✓');
      onSaved?.(payload);
      onClose?.();
    } catch (e) {
      console.error('[SessionDetail] save failed:', e);
      toast.error('שגיאה בשמירה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setSaving(false);
    }
  };

  const isPending = PENDING_STATUSES.includes(session.status);

  // ─── Footer ─────────────────────────────────────────────────
  let footer = null;
  if (isCoach) {
    footer = (
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          style={btnStyle('secondary', saving)}
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={btnStyle('primary', saving)}
        >
          {saving ? '...שומר' : 'שמור שינויים'}
        </button>
      </div>
    );
  } else if (isPending && (onTraineeApprove || onTraineeReschedule || onTraineeCancel)) {
    footer = (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onTraineeApprove && (
          <button type="button" onClick={() => onTraineeApprove(session)} style={btnStyle('primary')}>
            ✓ אישור
          </button>
        )}
        {onTraineeReschedule && (
          <button type="button" onClick={() => onTraineeReschedule(session)} style={btnStyle('secondary')}>
            📅 שינוי תאריך
          </button>
        )}
        {onTraineeCancel && (
          <button type="button" onClick={() => onTraineeCancel(session)} style={btnStyle('danger')}>
            ✕ ביטול
          </button>
        )}
      </div>
    );
  } else {
    footer = (
      <button type="button" onClick={onClose} style={btnStyle('secondary')}>
        סגור
      </button>
    );
  }

  return (
    <DetailDialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      viewerRole={viewerRole}
      footer={footer}
    >
      {/* A. Status */}
      <Section title="סטטוס">
        {isCoach ? (
          <SessionStatusPicker
            variant="pills"
            value={form.status}
            onChange={(s) => setForm((p) => ({ ...p, status: s }))}
          />
        ) : (
          <ReadOnly value={session.status || '—'} />
        )}
      </Section>

      {/* B. Session details */}
      <Section title="פרטי המפגש">
        <Grid>
          {isCoach ? (
            <>
              <InputField label="תאריך" type="date" value={form.date}
                onChange={(v) => setForm((p) => ({ ...p, date: v }))} />
              <InputField label="שעה" type="time" value={form.time}
                onChange={(v) => setForm((p) => ({ ...p, time: v }))} />
              <InputField label="סוג מפגש" value={form.type}
                onChange={(v) => setForm((p) => ({ ...p, type: v }))} />
              <InputField label="מיקום" value={form.location}
                onChange={(v) => setForm((p) => ({ ...p, location: v }))} />
              <InputField label="משך (דקות)" type="number" value={form.duration}
                onChange={(v) => setForm((p) => ({ ...p, duration: v }))} />
              <InputField label="מחיר" type="number" value={form.price}
                onChange={(v) => setForm((p) => ({ ...p, price: v }))} />
            </>
          ) : (
            <>
              <ReadField label="תאריך" value={fmtDate(session.date) || '—'} />
              <ReadField label="שעה" value={fmtTime(session.time) || '—'} />
              <ReadField label="סוג מפגש" value={session.session_type || session.type || '—'} />
              <ReadField label="מיקום" value={session.location || '—'} />
              {session.duration != null && (
                <ReadField label="משך" value={`${session.duration} דקות`} />
              )}
              {Number(session.price) > 0 && (
                <ReadField label="מחיר" value={`${session.price}₪`} />
              )}
            </>
          )}
        </Grid>
      </Section>

      {/* C. Public notes */}
      <Section title="הערות">
        {isCoach ? (
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={3}
            placeholder="הערות גלויות לשני הצדדים"
            style={textareaStyle()}
          />
        ) : (
          <ReadOnly value={session.notes || 'אין הערות'} />
        )}
      </Section>

      {/* D. Coach private notes — coach-only section. Not even
          rendered to the DOM on the trainee side. */}
      {isCoach && (
        <Section
          title="🔒 הערות פרטיות (גלויות רק לך)"
          accent="#FF6F20"
        >
          <textarea
            value={form.coach_private_notes}
            onChange={(e) => setForm((p) => ({ ...p, coach_private_notes: e.target.value }))}
            rows={3}
            placeholder="הערות לעצמך — המתאמן לא רואה את התוכן הזה"
            style={textareaStyle({ bg: '#FFF5EE', border: '#FF6F20' })}
          />
        </Section>
      )}
    </DetailDialog>
  );
}

// ────── helpers ────────────────────────────────────────────────

function Section({ title, accent, children }) {
  return (
    <section
      style={{
        marginBottom: 18,
        padding: accent ? 14 : 0,
        background: accent ? '#FFF5EE' : 'transparent',
        border: accent ? `1px solid ${accent}` : 'none',
        borderRadius: accent ? 12 : 0,
      }}
    >
      <h3
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: accent || '#666',
          margin: '0 0 8px',
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Grid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

function ReadField({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#1A1A1A', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function ReadOnly({ value }) {
  return (
    <div style={{
      fontSize: 14, color: '#1A1A1A', whiteSpace: 'pre-wrap',
      lineHeight: 1.5,
    }}>
      {value}
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 12,
          border: '1px solid #FF6F20',
          fontSize: 14,
          direction: 'rtl',
          background: '#FFF5EE',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
    </div>
  );
}

function textareaStyle({ bg = '#FFFFFF', border = '#F0E4D0' } = {}) {
  return {
    width: '100%',
    padding: 10,
    borderRadius: 10,
    border: `1px solid ${border}`,
    fontSize: 14,
    direction: 'rtl',
    background: bg,
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  };
}

function btnStyle(variant, disabled = false) {
  const base = {
    flex: 1,
    height: 44,
    border: 'none',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: "'Heebo', 'Assistant', sans-serif",
  };
  if (variant === 'primary') {
    return { ...base, background: disabled ? '#ccc' : '#FF6F20', color: 'white' };
  }
  if (variant === 'danger') {
    return { ...base, background: 'white', border: '1px solid #FCA5A5', color: '#DC2626' };
  }
  return { ...base, background: 'white', border: '1px solid #F0E4D0', color: '#1A1A1A' };
}
