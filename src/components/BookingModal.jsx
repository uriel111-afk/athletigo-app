import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { notifySessionRequest } from '@/functions/notificationTriggers';
import { toast } from 'sonner';

async function resolveCoachId(user) {
  // Try 1: ClientService.created_by (main path)
  try {
    const services = await base44.entities.ClientService.filter({ trainee_id: user.id });
    if (services.length > 0 && services[0].created_by) {
      const coaches = await base44.entities.User.filter({ id: services[0].created_by });
      if (coaches.length > 0) return coaches[0];
    }
  } catch {}

  // Try 2: find any coach/admin user in the system
  try {
    const allUsers = await base44.entities.User.list('-created_at', 50);
    const coachUser = allUsers.find(u =>
      u.role === 'coach' || u.role === 'admin' || u.is_coach === true || u.user_role === 'coach'
    );
    if (coachUser) return coachUser;
  } catch {}

  return null;
}

export default function BookingModal({ user, coach: coachProp, onClose, onSuccess }) {
  const [bookDate, setBookDate] = useState('');
  const [bookTime, setBookTime] = useState('');
  const [bookNote, setBookNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coach, setCoach] = useState(coachProp || null);
  const [resolving, setResolving] = useState(!coachProp);

  useEffect(() => {
    if (coach?.id) { setResolving(false); return; }
    if (!user?.id) return;
    setResolving(true);
    resolveCoachId(user).then(resolved => {
      if (resolved) setCoach(resolved);
      setResolving(false);
    });
  }, [user?.id, coach?.id]);

  const handleSubmit = async () => {
    setError('');

    if (!bookDate) { setError('יש לבחור תאריך'); return; }
    if (!bookTime) { setError('יש לבחור שעה'); return; }

    const selectedDT = new Date(`${bookDate}T${bookTime}`);
    if (selectedDT <= new Date()) {
      setError('יש לבחור תאריך ושעה עתידיים');
      return;
    }

    if (!coach?.id) {
      setError('לא נמצא מאמן מקושר — פנה למאמן שלך');
      return;
    }

    setLoading(true);

    try {
      const sessionData = {
        date: bookDate,
        time: bookTime,
        session_type: 'אישי',
        location: '',
        coach_id: coach.id,
        status: 'ממתין לאישור',
        participants: [
          {
            trainee_id: user.id,
            trainee_name: user.full_name || 'מתאמן',
            attendance_status: 'ממתין',
          },
        ],
        coach_notes: `בקשת מפגש מ${user.full_name || 'מתאמן'}${bookNote ? `\nהערות: ${bookNote}` : ''}`,
      };

      const newSession = await base44.entities.Session.create(sessionData);

      try {
        await notifySessionRequest({
          coachId: coach.id,
          traineeId: user.id,
          traineeName: user.full_name,
          sessionId: newSession?.id,
          sessionDate: bookDate,
          sessionTime: bookTime,
        });
      } catch {}

      toast.success('בקשת המפגש נשלחה למאמן!');
      window.dispatchEvent(new CustomEvent('data-changed'));
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Booking error:', err);
      setError('שגיאה בשליחה: ' + (err?.message || 'נסה שוב'));
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  if (resolving) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'white', borderRadius: '16px',
          padding: '32px', textAlign: 'center', fontSize: '16px',
          fontWeight: '700', color: '#555',
        }}>
          מחפש מאמן...
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 1000,
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', direction: 'rtl',
      }}
    >
      <div style={{
        background: 'white',
        borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: '480px',
        padding: '24px',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '20px',
        }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#1a1a1a' }}>
            קביעת מפגש
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none',
            fontSize: '26px', cursor: 'pointer', color: '#999',
            lineHeight: 1, padding: '0 4px',
          }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Date */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '8px' }}>
              תאריך
            </div>
            <input
              type="date"
              value={bookDate}
              min={today}
              onChange={e => setBookDate(e.target.value)}
              style={{
                width: '100%', padding: '14px',
                fontSize: '16px', border: '1.5px solid',
                borderColor: bookDate ? '#FF6F20' : '#ddd',
                borderRadius: '12px', boxSizing: 'border-box',
                direction: 'rtl', outline: 'none',
              }}
            />
          </div>

          {/* Time */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '8px' }}>
              שעה
            </div>
            <input
              type="time"
              value={bookTime}
              onChange={e => setBookTime(e.target.value)}
              style={{
                width: '100%', padding: '14px',
                fontSize: '16px', border: '1.5px solid',
                borderColor: bookTime ? '#FF6F20' : '#ddd',
                borderRadius: '12px', boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* Note */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '8px' }}>
              הערה למאמן
              <span style={{ fontWeight: '400', color: '#999', fontSize: '12px', marginRight: '6px' }}>
                (אופציונלי)
              </span>
            </div>
            <textarea
              value={bookNote}
              onChange={e => setBookNote(e.target.value)}
              placeholder="למשל: מעדיף בוקר, יש כאב גב..."
              rows={3}
              style={{
                width: '100%', padding: '12px 14px',
                fontSize: '15px', border: '1.5px solid #ddd',
                borderRadius: '12px', boxSizing: 'border-box',
                resize: 'none', fontFamily: 'inherit',
                direction: 'rtl', outline: 'none',
              }}
            />
          </div>

          {/* Info */}
          <div style={{
            background: '#FFF0E8', borderRadius: '10px',
            padding: '10px 14px', fontSize: '13px',
            color: '#CC4A00', fontWeight: '600',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ fontSize: '16px' }}>ℹ️</span>
            ניתן לבטל עד 24 שעות לפני המפגש
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#fee2e2', borderRadius: '10px',
              padding: '10px 14px', fontSize: '13px',
              color: '#dc2626', fontWeight: '600',
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', height: '54px',
              background: loading ? '#ccc' : '#FF6F20',
              color: 'white', border: 'none',
              borderRadius: '12px', fontSize: '18px',
              fontWeight: '900', cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'שולח...' : 'שלח בקשה למאמן ✓'}
          </button>

        </div>
      </div>
    </div>
  );
}
