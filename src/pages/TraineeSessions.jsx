import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Calendar, Clock as ClockIcon } from "lucide-react";
import { toast } from "sonner";
import BookingModal from "../components/BookingModal";

const STATUS_MAP = {
  'ממתין לאישור': { text: 'ממתין לאישור', bg: '#fef9c3', color: '#a16207' },
  'מאושר':        { text: 'מאושר',        bg: '#dbeafe', color: '#1d4ed8' },
  'התקיים':       { text: 'התקיים',       bg: '#dcfce7', color: '#16a34a' },
  'הושלם':        { text: 'הושלם',        bg: '#dcfce7', color: '#16a34a' },
  'הגיע':         { text: 'הגיע',         bg: '#dcfce7', color: '#16a34a' },
  'לא הגיע':      { text: 'לא הגיע',      bg: '#fee2e2', color: '#dc2626' },
  'בוטל על ידי מתאמן': { text: 'בוטל', bg: '#f1f5f9', color: '#64748b' },
  'בוטל על ידי מאמן':  { text: 'בוטל', bg: '#f1f5f9', color: '#64748b' },
  'בוטל':         { text: 'בוטל',         bg: '#f1f5f9', color: '#64748b' },
};

const DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const MONTHS = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];

function formatDate(d) {
  const date = new Date(d);
  return `יום ${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export default function TraineeSessions() {
  const [user, setUser] = useState(null);
  const [coach, setCoach] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [showBooking, setShowBooking] = useState(false);

  useEffect(() => {
    loadData();
    const onChange = () => loadData();
    window.addEventListener('data-changed', onChange);
    return () => window.removeEventListener('data-changed', onChange);
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      if (!currentUser) return;

      // Get coach
      const services = await base44.entities.ClientService.filter({ trainee_id: currentUser.id });
      if (services.length > 0 && services[0].created_by) {
        const coaches = await base44.entities.User.filter({ id: services[0].created_by });
        if (coaches.length > 0) setCoach(coaches[0]);
      }

      // Get all sessions for this trainee
      const allSessions = await base44.entities.Session.filter({}, '-date', 500);
      const mine = allSessions.filter(s =>
        s.participants?.some(p => p.trainee_id === currentUser.id)
      );
      setSessions(mine);
    } catch (err) {
      console.error("Error loading sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const filtered = sessions.filter(s => {
    if (filter === 'upcoming') {
      return s.date >= today &&
        !['בוטל על ידי מתאמן', 'בוטל על ידי מאמן', 'בוטל'].includes(s.status);
    }
    if (filter === 'past') {
      return s.date < today ||
        ['התקיים', 'הושלם', 'הגיע', 'לא הגיע'].includes(s.status);
    }
    return true;
  });

  const canCancel = (s) => {
    const dt = new Date(`${s.date}T${s.time || '00:00'}`);
    return (dt - new Date()) > 24 * 60 * 60 * 1000 &&
      !['בוטל על ידי מתאמן', 'בוטל על ידי מאמן', 'בוטל', 'התקיים', 'הושלם', 'הגיע', 'לא הגיע'].includes(s.status);
  };

  const canReschedule = (s) => {
    const dt = new Date(`${s.date}T${s.time || '00:00'}`);
    const hoursAway = (dt - new Date()) / (1000 * 60 * 60);
    return hoursAway > 0 && hoursAway <= 24 &&
      !['בוטל על ידי מתאמן', 'בוטל על ידי מאמן', 'בוטל', 'התקיים', 'הושלם', 'הגיע', 'לא הגיע'].includes(s.status);
  };

  const handleCancel = async (session) => {
    if (!window.confirm('האם לבטל את המפגש?')) return;
    try {
      await base44.entities.Session.update(session.id, {
        status: 'בוטל על ידי מתאמן',
        status_updated_at: new Date().toISOString(),
        status_updated_by: user.id,
      });
      if (session.service_id) {
        try {
          const svcs = await base44.entities.ClientService.filter({ id: session.service_id });
          const svc = svcs?.[0];
          if (svc && svc.used_sessions > 0) {
            await base44.entities.ClientService.update(svc.id, {
              used_sessions: Math.max(0, svc.used_sessions - 1),
              status: svc.status === 'completed' ? 'פעיל' : svc.status,
            });
          }
        } catch {}
      }
      if (coach?.id) {
        try {
          await base44.entities.Notification.create({
            user_id: coach.id,
            type: 'session_cancelled_by_trainee',
            title: 'מפגש בוטל על ידי מתאמן',
            message: `${user.full_name} ביטל את המפגש ב-${new Date(session.date).toLocaleDateString('he-IL')}`,
            is_read: false,
            data: { session_id: session.id },
          });
        } catch {}
      }
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'בוטל על ידי מתאמן' } : s));
      toast.success("המפגש בוטל והיתרה הוחזרה");
      window.dispatchEvent(new CustomEvent('data-changed'));
    } catch (err) {
      toast.error("שגיאה בביטול: " + (err?.message || "נסה שוב"));
    }
  };

  const handleReschedule = async (session) => {
    if (!coach?.id) return;
    try {
      await base44.entities.Notification.create({
        user_id: coach.id,
        type: 'reschedule_request',
        title: 'בקשה לשינוי מועד',
        message: `${user.full_name} מבקש לשנות את תאריך המפגש ב-${new Date(session.date).toLocaleDateString('he-IL')} ${session.time}`,
        is_read: false,
        data: { session_id: session.id, trainee_id: user.id },
      });
      toast.success("בקשת שינוי תאריך נשלחה למאמן");
    } catch (err) {
      toast.error("שגיאה בשליחת הבקשה");
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', direction: 'rtl', background: '#f5f5f5' }}>

      {/* Header */}
      <div style={{
        background: 'white', padding: '14px 16px',
        borderBottom: '1px solid #eee', flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ fontSize: '20px', fontWeight: '900', color: '#1a1a1a' }}>
          המפגשים שלי
        </div>
        <button
          onClick={() => setShowBooking(true)}
          style={{
            background: '#FF6F20', color: 'white',
            border: 'none', borderRadius: '10px',
            padding: '9px 16px', fontSize: '14px',
            fontWeight: '700', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          + קבע מפגש
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{
        background: 'white', padding: '0 16px',
        borderBottom: '1px solid #eee', flexShrink: 0,
        display: 'flex', gap: '0'
      }}>
        {[
          { key: 'upcoming', label: 'קרובים' },
          { key: 'all',      label: 'הכל' },
          { key: 'past',     label: 'עבר' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              flex: 1, height: '44px', border: 'none',
              background: 'none', cursor: 'pointer',
              fontSize: '14px', fontWeight: '700',
              color: filter === f.key ? '#FF6F20' : '#999',
              borderBottom: filter === f.key
                ? '3px solid #FF6F20' : '3px solid transparent'
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '12px 14px 80px',
        WebkitOverflowScrolling: 'touch'
      }}>
        {filtered.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            background: 'white', borderRadius: '14px',
            marginTop: '8px'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📅</div>
            <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>
              {filter === 'upcoming' ? 'אין מפגשים קרובים' : 'אין מפגשים'}
            </div>
            <div style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>
              לחץ על "קבע מפגש" לבקשת מפגש חדש
            </div>
            <button
              onClick={() => setShowBooking(true)}
              style={{
                background: '#FF6F20', color: 'white',
                border: 'none', borderRadius: '10px',
                padding: '10px 24px', fontSize: '15px',
                fontWeight: '700', cursor: 'pointer'
              }}
            >
              קבע מפגש חדש
            </button>
          </div>
        )}

        {filtered.map(s => {
          const st = STATUS_MAP[s.status] || { text: s.status, bg: '#f5f5f5', color: '#666' };
          return (
            <div key={s.id} style={{
              background: 'white', borderRadius: '14px',
              padding: '14px 16px', marginBottom: '10px',
              border: '1px solid #eee'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: '900', marginBottom: '3px' }}>
                    {formatDate(s.date)}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ClockIcon style={{ width: '13px', height: '13px' }} />
                    {s.time || '—'}
                    {s.session_type && <span> • {s.session_type}</span>}
                  </div>
                  {s.location && (
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                      📍 {s.location}
                    </div>
                  )}
                  {s.coach_notes && (
                    <div style={{
                      fontSize: '12px', color: '#888',
                      background: '#f9f9f9', borderRadius: '8px',
                      padding: '6px 10px', marginTop: '6px'
                    }}>
                      {s.coach_notes}
                    </div>
                  )}
                </div>
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-end', gap: '6px', marginRight: '8px'
                }}>
                  <span style={{
                    background: st.bg, color: st.color,
                    fontSize: '11px', fontWeight: '700',
                    padding: '3px 10px', borderRadius: '8px'
                  }}>
                    {st.text}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              {canCancel(s) && (
                <div style={{
                  display: 'flex', gap: '8px', marginTop: '10px',
                  paddingTop: '10px', borderTop: '1px solid #f0f0f0'
                }}>
                  <button
                    onClick={() => handleCancel(s)}
                    style={{
                      flex: 1, background: '#fef2f2', border: 'none',
                      borderRadius: '8px', padding: '8px',
                      fontSize: '12px', fontWeight: '700',
                      color: '#ef4444', cursor: 'pointer'
                    }}
                  >
                    ביטול מפגש
                  </button>
                </div>
              )}
              {canReschedule(s) && (
                <div style={{
                  display: 'flex', gap: '8px', marginTop: '10px',
                  paddingTop: '10px', borderTop: '1px solid #f0f0f0'
                }}>
                  <button
                    onClick={() => handleReschedule(s)}
                    style={{
                      flex: 1, background: '#fff7ed', border: 'none',
                      borderRadius: '8px', padding: '8px',
                      fontSize: '12px', fontWeight: '700',
                      color: '#FF6F20', cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '4px'
                    }}
                  >
                    <ClockIcon style={{ width: '12px', height: '12px' }} />
                    בקש שינוי תאריך
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Booking modal */}
      {showBooking && (
        <BookingModal
          user={user}
          coach={coach}
          onClose={() => setShowBooking(false)}
          onSuccess={() => loadData()}
        />
      )}
    </div>
  );
}
