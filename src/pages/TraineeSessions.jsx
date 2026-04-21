import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Calendar, Clock as ClockIcon } from "lucide-react";
import { toast } from "sonner";
import { syncPackageStatus } from "@/lib/packageStatus";
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
  const [activePackages, setActivePackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [showBooking, setShowBooking] = useState(false);
  const [rescheduleSession, setRescheduleSession] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadData();
    const onChange = () => loadData();
    window.addEventListener('data-changed', onChange);
    return () => window.removeEventListener('data-changed', onChange);
  }, []);

  // Realtime — when coach changes session status, trainee sees it instantly
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`trainee-sessions-rt-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services' }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      if (!currentUser) return;

      // Get coach + packages
      const services = await base44.entities.ClientService.filter({ trainee_id: currentUser.id });
      if (services.length > 0 && services[0].created_by) {
        const coaches = await base44.entities.User.filter({ id: services[0].created_by });
        if (coaches.length > 0) setCoach(coaches[0]);
      }
      const active = services.filter(s =>
        (s.status === 'פעיל' || s.status === 'active') &&
        s.total_sessions > 0
      ).map(s => ({
        ...s,
        remaining: (s.total_sessions || 0) - (s.used_sessions || 0),
      }));
      setActivePackages(active);

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

  const canCancel = (s) => isOver24h(s) && isActive(s);

  const DONE_STATUSES = ['בוטל על ידי מתאמן', 'בוטל על ידי מאמן', 'בוטל', 'התקיים', 'הושלם', 'הגיע', 'לא הגיע'];

  const isOver24h = (s) => {
    const dt = new Date(`${s.date}T${s.time || '00:00'}`);
    return (dt - new Date()) > 24 * 60 * 60 * 1000;
  };

  const isActive = (s) => !DONE_STATUSES.includes(s.status);

  const canReschedule = (s) => isOver24h(s) && isActive(s);

  const canDelete = (s) => isOver24h(s) && s.status === 'ממתין לאישור';

  const isWithin24h = (s) => {
    const dt = new Date(`${s.date}T${s.time || '00:00'}`);
    const diff = dt - new Date();
    return diff > 0 && diff <= 24 * 60 * 60 * 1000 && isActive(s);
  };

  const handleDelete = async (session) => {
    if (!window.confirm('האם למחוק את הבקשה למפגש?')) return;
    setActionLoading(session.id);
    try {
      await base44.entities.Session.delete(session.id);
      setSessions(prev => prev.filter(s => s.id !== session.id));
      toast.success('הבקשה נמחקה');
      window.dispatchEvent(new CustomEvent('data-changed'));
    } catch (err) {
      toast.error('שגיאה במחיקה: ' + (err?.message || 'נסה שוב'));
    } finally {
      setActionLoading(null);
    }
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
              status: svc.status === 'completed' ? 'active' : svc.status,
            });
            await syncPackageStatus(svc.id);
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

  const handleConfirmSession = async (session) => {
    setActionLoading(session.id);
    try {
      await base44.entities.Session.update(session.id, {
        status: 'מאושר',
        status_updated_at: new Date().toISOString(),
        status_updated_by: user.id,
      });
      if (coach?.id) {
        try {
          await base44.entities.Notification.create({
            user_id: coach.id,
            type: 'session_confirmed',
            title: 'אישור הגעה למפגש',
            message: `${user.full_name} אישר/ה הגעה למפגש ב-${new Date(session.date).toLocaleDateString('he-IL')} ${session.time || ''}`,
            is_read: false,
            data: { session_id: session.id, trainee_id: user.id },
          });
        } catch {}
      }
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'מאושר' } : s));
      toast.success('ההגעה אושרה. המאמן קיבל הודעה.');
      window.dispatchEvent(new CustomEvent('data-changed'));
    } catch (err) {
      toast.error('שגיאה באישור: ' + (err?.message || 'נסה שוב'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRescheduleRequest = async () => {
    if (!newDate || !newTime) return;
    setRescheduleLoading(true);
    try {
      const oldDate = new Date(rescheduleSession.date).toLocaleDateString('he-IL');
      await base44.entities.Session.update(rescheduleSession.id, {
        date: newDate,
        time: newTime,
        status: 'ממתין לאישור',
        coach_notes: rescheduleNote
          ? `בקשת שינוי מועד מ${user.full_name}: ${rescheduleNote}`
          : `בקשת שינוי מועד מ${user.full_name}`,
      });
      if (coach?.id) {
        try {
          await base44.entities.Notification.create({
            user_id: coach.id,
            type: 'reschedule_request',
            title: 'בקשת שינוי מועד',
            message: `${user.full_name} שינה את המפגש מ-${oldDate} ${rescheduleSession.time} ל-${new Date(newDate).toLocaleDateString('he-IL')} ${newTime}`,
            is_read: false,
            data: { session_id: rescheduleSession.id, trainee_id: user.id },
          });
        } catch {}
      }
      setRescheduleSession(null);
      setNewDate(''); setNewTime(''); setRescheduleNote('');
      toast.success('בקשת שינוי המועד נשלחה למאמן');
      window.dispatchEvent(new CustomEvent('data-changed'));
      loadData();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || 'נסה שוב'));
    } finally {
      setRescheduleLoading(false);
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
        {/* Active package balance */}
        {activePackages.length > 0 && activePackages[0].remaining > 0 && (
          <div style={{
            background: '#FFF0E8', borderRadius: '14px',
            padding: '14px 16px', marginBottom: '12px',
            border: '1px solid #FFD0A0',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '13px', color: '#CC4A00', fontWeight: '700', marginBottom: '2px' }}>
                יתרת חבילה פעילה
              </div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: '#FF6F20' }}>
                {activePackages[0].remaining} מפגשים
              </div>
              {activePackages[0].package_name && (
                <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>{activePackages[0].package_name}</div>
              )}
            </div>
            <div style={{ fontSize: '32px' }}>📦</div>
          </div>
        )}

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

              {/* Pending-approval banner — shown once per pending session at the top of its actions */}
              {s.status === 'ממתין לאישור' && isActive(s) && (
                <div style={{
                  marginTop: '10px', padding: '8px 12px',
                  background: '#FFF9F0', border: '1px solid #FF6F20',
                  borderRadius: 8, color: '#1a1a1a', fontSize: 13, fontWeight: 600,
                }}>
                  מפגש ממתין לאישור — בחר/י אחת מהאפשרויות למטה
                </div>
              )}

              {/* Action buttons */}
              {(s.status === 'ממתין לאישור' || canReschedule(s) || canCancel(s) || canDelete(s)) && (
                <div style={{
                  display: 'flex', gap: '8px', marginTop: '10px',
                  paddingTop: '10px', borderTop: '1px solid #f0f0f0', flexWrap: 'wrap',
                }}>
                  {s.status === 'ממתין לאישור' && isActive(s) && (
                    <button
                      disabled={actionLoading === s.id}
                      onClick={() => handleConfirmSession(s)}
                      style={{
                        flex: 1, minWidth: 110, height: '36px',
                        background: '#FF6F20', color: '#FFFFFF',
                        border: 'none', borderRadius: '8px',
                        fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                      }}
                    >
                      אשר הגעה
                    </button>
                  )}
                  {canReschedule(s) && (
                    <button
                      onClick={() => {
                        setRescheduleSession(s);
                        setNewDate(s.date);
                        setNewTime(s.time || '');
                      }}
                      style={{
                        flex: 1, height: '36px',
                        background: '#FFF0E8', color: '#FF6F20',
                        border: '1px solid #FFD0A0', borderRadius: '8px',
                        fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '4px'
                      }}
                    >
                      <ClockIcon style={{ width: '12px', height: '12px' }} />
                      {s.status === 'ממתין לאישור' ? 'הצע שינוי' : 'שנה מועד'}
                    </button>
                  )}
                  {canCancel(s) && (
                    <button
                      disabled={actionLoading === s.id}
                      onClick={() => handleCancel(s)}
                      style={{
                        flex: 1, minWidth: 100, height: '36px',
                        background: '#fff', color: '#ef4444',
                        border: '1px solid #fca5a5', borderRadius: '8px',
                        fontSize: '13px', fontWeight: '700', cursor: 'pointer'
                      }}
                    >
                      {s.status === 'ממתין לאישור' ? 'דחה' : 'ביטול'}
                    </button>
                  )}
                  {canDelete(s) && (
                    <button
                      disabled={actionLoading === s.id}
                      onClick={() => handleDelete(s)}
                      style={{
                        height: '36px', width: '36px', flexShrink: 0,
                        background: '#fff', color: '#dc2626',
                        border: '1px solid #fca5a5', borderRadius: '8px',
                        fontSize: '16px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              )}
              {isWithin24h(s) && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#f59e0b', fontWeight: '600' }}>
                  ⚠️ פחות מ-24 שעות — לא ניתן לשנות או לבטל
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

      {/* Reschedule modal */}
      {rescheduleSession && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setRescheduleSession(null); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)', zIndex: 1000,
            display: 'flex', alignItems: 'flex-end',
            justifyContent: 'center', direction: 'rtl',
          }}
        >
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: '480px', padding: '24px',
            paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '20px', fontWeight: '900' }}>בקשת שינוי מועד</div>
              <button onClick={() => setRescheduleSession(null)} style={{ background: 'none', border: 'none', fontSize: '26px', cursor: 'pointer', color: '#999' }}>×</button>
            </div>

            <div style={{ background: '#f5f5f5', borderRadius: '10px', padding: '10px 14px', marginBottom: '18px', fontSize: '13px', color: '#666' }}>
              מועד נוכחי: {formatDate(rescheduleSession.date)} בשעה {rescheduleSession.time}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '8px' }}>תאריך חדש</div>
                <input type="date" value={newDate} min={new Date().toISOString().split('T')[0]}
                  onChange={e => setNewDate(e.target.value)}
                  style={{ width: '100%', padding: '14px', fontSize: '16px', border: '1.5px solid', borderColor: newDate ? '#FF6F20' : '#ddd', borderRadius: '12px', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '8px' }}>שעה חדשה</div>
                <input type="time" value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  style={{ width: '100%', padding: '14px', fontSize: '16px', border: '1.5px solid', borderColor: newTime ? '#FF6F20' : '#ddd', borderRadius: '12px', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '8px' }}>
                  סיבת השינוי
                  <span style={{ fontWeight: '400', color: '#999', fontSize: '12px', marginRight: '6px' }}>(אופציונלי)</span>
                </div>
                <textarea value={rescheduleNote}
                  onChange={e => setRescheduleNote(e.target.value)}
                  placeholder="למשל: יש לי עבודה, מעדיף שעה אחרת..."
                  rows={2}
                  style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '12px', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', direction: 'rtl', outline: 'none' }}
                />
              </div>
              <div style={{ background: '#FFF0E8', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#CC4A00', fontWeight: '600' }}>
                הבקשה תישלח למאמן לאישור
              </div>
              <button
                onClick={handleRescheduleRequest}
                disabled={!newDate || !newTime || rescheduleLoading}
                style={{
                  width: '100%', height: '54px',
                  background: (!newDate || !newTime) ? '#ccc' : '#FF6F20',
                  color: 'white', border: 'none', borderRadius: '12px',
                  fontSize: '18px', fontWeight: '900', cursor: 'pointer',
                }}
              >
                {rescheduleLoading ? 'שולח...' : 'שלח בקשת שינוי ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
