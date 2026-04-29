import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const PENDING_STATUSES = ['pending', 'scheduled', 'ממתין', 'מתוכנן', 'ממתין לאישור'];

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL');
};
const fmtTime = (t) => (t || '').slice(0, 5);
const todayISO = () => new Date().toISOString().split('T')[0];

// Trainee entry popup — lists every pending session and lets the
// trainee approve / reject / reschedule each one inline. Auto-closes
// when the queue empties; X button always available. Each action
// also drops a notification on the coach's row so the coach sees
// the trainee's response without polling.
export default function PendingSessionsPopup({ trainee, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reschedTarget, setReschedTarget] = useState(null);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedTime, setReschedTime] = useState('');
  const [busyId, setBusyId] = useState(null);

  const traineeId = trainee?.id;
  const traineeName = trainee?.full_name || 'מתאמן';
  const coachId = trainee?.coach_id || null;

  const fetchSessions = useCallback(async () => {
    if (!traineeId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('trainee_id', traineeId)
        .in('status', PENDING_STATUSES)
        .order('date', { ascending: true });
      if (error) {
        console.warn('[PendingSessions] fetch failed:', error.message);
        setSessions([]);
        return;
      }
      setSessions(data || []);
    } finally {
      setLoading(false);
    }
  }, [traineeId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Auto-close when the queue empties from a successful action.
  useEffect(() => {
    if (!loading && sessions.length === 0) {
      const t = setTimeout(() => onClose?.(), 250);
      return () => clearTimeout(t);
    }
  }, [loading, sessions.length, onClose]);

  const notifyCoach = async (title, message) => {
    if (!coachId) return;
    try {
      await supabase.from('notifications').insert({
        user_id: coachId,
        type: 'session_response',
        title,
        message,
        is_read: false,
      });
    } catch (e) {
      console.warn('[PendingSessions] coach notif failed:', e?.message);
    }
  };

  const handleApprove = async (s) => {
    setBusyId(s.id);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'מאושר' })
        .eq('id', s.id);
      if (error) throw error;
      await notifyCoach(
        '✅ מפגש אושר',
        `${traineeName} אישר את המפגש ב-${fmtDate(s.date)}${s.time ? ` בשעה ${fmtTime(s.time)}` : ''}`
      );
      toast.success('המפגש אושר');
      setSessions(prev => prev.filter(x => x.id !== s.id));
    } catch (e) {
      console.warn('[PendingSessions] approve failed:', e?.message);
      toast.error('שגיאה באישור');
    } finally { setBusyId(null); }
  };

  const handleReject = async (s) => {
    if (!window.confirm(`לדחות את המפגש ב-${fmtDate(s.date)}?`)) return;
    setBusyId(s.id);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'בוטל' })
        .eq('id', s.id);
      if (error) throw error;
      await notifyCoach(
        '❌ מפגש בוטל',
        `${traineeName} ביטל את המפגש ב-${fmtDate(s.date)}${s.time ? ` בשעה ${fmtTime(s.time)}` : ''}`
      );
      toast.success('המפגש בוטל');
      setSessions(prev => prev.filter(x => x.id !== s.id));
    } catch (e) {
      console.warn('[PendingSessions] reject failed:', e?.message);
      toast.error('שגיאה בביטול');
    } finally { setBusyId(null); }
  };

  const openReschedule = (s) => {
    setReschedTarget(s);
    setReschedDate(s.date || todayISO());
    setReschedTime((s.time || '').slice(0, 5) || '18:00');
  };

  const submitReschedule = async () => {
    if (!reschedTarget || !reschedDate) return;
    setBusyId(reschedTarget.id);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ date: reschedDate, time: reschedTime })
        .eq('id', reschedTarget.id);
      if (error) throw error;
      await notifyCoach(
        '📅 בקשת שינוי מועד',
        `${traineeName} ביקש לשנות מפגש ל-${fmtDate(reschedDate)}${reschedTime ? ` בשעה ${reschedTime}` : ''}`
      );
      toast.success('המועד עודכן והמאמן עודכן');
      // Status stays 'ממתין' per spec — refresh so the card reflects
      // the new date but stays in the queue until the coach (or the
      // trainee) approves it.
      await fetchSessions();
      setReschedTarget(null);
    } catch (e) {
      console.warn('[PendingSessions] reschedule failed:', e?.message);
      toast.error('שגיאה בעדכון המועד');
    } finally { setBusyId(null); }
  };

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', inset: 0, zIndex: 11000,
        background: '#FFF9F0',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      {/* Orange header */}
      <div style={{
        background: 'linear-gradient(135deg, #FF6F20 0%, #FF8A47 100%)',
        color: 'white',
        padding: '20px 16px',
        position: 'relative',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          style={{
            position: 'absolute', top: 12, left: 12,
            width: 32, height: 32, borderRadius: 999,
            background: 'rgba(255,255,255,0.2)', color: 'white',
            border: 'none', fontSize: 18, cursor: 'pointer',
          }}
        >✕</button>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          📅 יש לך מפגשים שממתינים לאישור
        </div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>
          אישור עוזר למאמן לתכנן את הזמן שלו
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>טוען...</div>
        )}
        {!loading && sessions.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>
            אין מפגשים ממתינים — סוגר...
          </div>
        )}
        {sessions.map(s => {
          const busy = busyId === s.id;
          const price = Number(s.price || 0);
          return (
            <div
              key={s.id}
              style={{
                background: 'white', borderRadius: 14, padding: 16,
                border: '1px solid #F0E4D0', marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>
                    {fmtDate(s.date)}{s.time ? ` · ${fmtTime(s.time)}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {s.session_type || s.type || 'מפגש'}
                    {price > 0 ? ` · ${price}₪` : ''}
                  </div>
                </div>
                {s.notes && (
                  <div style={{ fontSize: 11, color: '#888', maxWidth: 140, textAlign: 'left' }}>
                    {s.notes}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleApprove(s)}
                  style={{
                    width: '100%', height: 44, borderRadius: 12, border: 'none',
                    background: '#16a34a', color: 'white',
                    fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    fontFamily: "'Heebo', 'Assistant', sans-serif",
                  }}
                >✅ אישור</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openReschedule(s)}
                  style={{
                    width: '100%', height: 44, borderRadius: 12, border: 'none',
                    background: '#FF6F20', color: 'white',
                    fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    fontFamily: "'Heebo', 'Assistant', sans-serif",
                  }}
                >📅 שינוי תאריך</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleReject(s)}
                  style={{
                    width: '100%', height: 44, borderRadius: 12,
                    border: '1px solid #DC2626',
                    background: '#FFFFFF', color: '#DC2626',
                    fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    fontFamily: "'Heebo', 'Assistant', sans-serif",
                  }}
                >❌ דחייה</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reschedule sheet — native inputs */}
      {reschedTarget && (
        <div
          onClick={() => setReschedTarget(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 11050,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', width: '100%', maxWidth: 440,
              borderTopLeftRadius: 16, borderTopRightRadius: 16,
              padding: 20, direction: 'rtl',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
              📅 שינוי מועד המפגש
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>תאריך חדש</div>
            <input
              type="date"
              value={reschedDate}
              min={todayISO()}
              onChange={(e) => setReschedDate(e.target.value)}
              style={{
                width: '100%', padding: 12, borderRadius: 10,
                border: '1px solid #F0E4D0', fontSize: 14,
                marginBottom: 12, boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>שעה</div>
            <input
              type="time"
              value={reschedTime}
              onChange={(e) => setReschedTime(e.target.value)}
              style={{
                width: '100%', padding: 12, borderRadius: 10,
                border: '1px solid #F0E4D0', fontSize: 14,
                marginBottom: 16, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setReschedTarget(null)}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  border: '1px solid #F0E4D0', background: 'white',
                  color: '#888', fontSize: 14, cursor: 'pointer',
                }}
              >ביטול</button>
              <button
                type="button"
                onClick={submitReschedule}
                disabled={!reschedDate || busyId === reschedTarget.id}
                style={{
                  flex: 2, height: 44, borderRadius: 12, border: 'none',
                  background: '#FF6F20', color: 'white',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: !reschedDate ? 0.6 : 1,
                  fontFamily: "'Heebo', 'Assistant', sans-serif",
                }}
              >שלח בקשה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
