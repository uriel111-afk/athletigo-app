import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

// Override dialog — fires when a coach tries to flip a paid session
// to 'הושלם' before the trainee paid through Grow. The coach must
// type a reason (>5 chars) so the audit row in payment_override_reason
// isn't a one-letter shrug. Confirming writes:
//   sessions.status='הושלם'
//   sessions.payment_status='override_no_payment'
//   sessions.payment_override_reason=<reason>
//   sessions.completed_at=now
// + a 'payment_override' notification on the coach's own feed (audit
// trail; the row also gets the reason for retro reporting).

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL');
};

export default function PaymentOverrideDialog({ session, isOpen, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset on open so a previous attempt's text doesn't leak through.
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setBusy(false);
    }
  }, [isOpen]);

  if (!isOpen || !session) return null;

  const reasonValid = reason.trim().length > 5;

  const handleConfirm = async () => {
    if (!reasonValid || busy) return;
    setBusy(true);
    try {
      const completedAt = new Date().toISOString();
      const { error } = await supabase
        .from('sessions')
        .update({
          status: 'הושלם',
          payment_status: 'override_no_payment',
          payment_override_reason: reason.trim(),
          completed_at: completedAt,
        })
        .eq('id', session.id);
      if (error) throw error;

      // Audit notification on the coach's own feed.
      if (session.coach_id) {
        try {
          await supabase.from('notifications').insert({
            user_id: session.coach_id,
            type: 'payment_override',
            title: '⚠ מפגש סומן כהושלם ללא תשלום',
            message: `סימנת השלמת מפגש ב-${fmtDate(session.date)} ללא תשלום. סיבה: ${reason.trim()}`,
            is_read: false,
            data: {
              session_id: session.id,
              reason: reason.trim(),
              amount: Number(session.price) || null,
            },
          });
        } catch (e) {
          console.warn('[Override] notification insert failed:', e?.message);
        }
      }

      toast.success('המפגש סומן כהושלם ללא תשלום');
      onConfirm?.({ session, reason: reason.trim(), completedAt });
    } catch (e) {
      console.error('[Override] update failed:', e);
      toast.error('שגיאה בעדכון: ' + (e?.message || 'נסה שוב'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 12000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, direction: 'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          maxWidth: 420,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Red-bg header band — visually flags this as a destructive
            confirmation, not a routine save. */}
        <div style={{
          background: '#FEE2E2',
          padding: '14px 18px',
          borderBottom: '1px solid #FCA5A5',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <svg
            width="22" height="22" viewBox="0 0 24 24"
            fill="none" stroke="#991B1B" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9"  x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#991B1B' }}>
            תשלום לא בוצע
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: '#444', marginBottom: 4 }}>
            מפגש: <strong>{fmtDate(session.date)} {session.time || ''}</strong>
          </div>
          <div style={{ fontSize: 13, color: '#444', marginBottom: 14 }}>
            סכום: <strong style={{ color: '#FF6F20' }}>{session.price}₪</strong>
          </div>

          <div style={{
            fontSize: 13, color: '#991B1B', fontWeight: 600,
            background: '#FFF5F5',
            padding: 10, borderRadius: 10,
            marginBottom: 10,
            border: '1px solid #FCA5A5',
          }}>
            המפגש דורש תשלום שטרם בוצע
          </div>

          <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5, marginBottom: 14 }}>
            אם תסמן 'הושלם' עכשיו — המפגש יסומן כ"הושלם ללא תשלום" ולא יוכל
            לעבור תשלום בעתיד דרך המערכת.
          </div>

          <label style={{
            display: 'block', fontSize: 13, color: '#1A1A1A',
            fontWeight: 600, marginBottom: 6,
          }}>
            סיבת העקיפה (חובה — לתיעוד)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder="לדוגמה: ניתן בחינם לציון 100 מפגשים"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 10,
              border: '1px solid #F0E4D0',
              fontSize: 14,
              direction: 'rtl',
              boxSizing: 'border-box',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div style={{
            fontSize: 11, color: reason.trim().length > 5 ? '#888' : '#C62828',
            marginTop: 4,
          }}>
            {reason.trim().length > 5
              ? `${reason.trim().length} תווים`
              : `נדרש לפחות 6 תווים (יש ${reason.trim().length})`}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                border: '1px solid #F0E4D0',
                background: 'white',
                fontSize: 14,
                cursor: busy ? 'default' : 'pointer',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
              }}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!reasonValid || busy}
              style={{
                flex: 2,
                padding: 12,
                borderRadius: 12,
                border: 'none',
                background: (reasonValid && !busy) ? '#991B1B' : '#ccc',
                color: 'white',
                fontSize: 14,
                fontWeight: 700,
                cursor: (reasonValid && !busy) ? 'pointer' : 'default',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
              }}
            >
              {busy ? '...שומר' : 'כן, סמן הושלם בלי תשלום'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
