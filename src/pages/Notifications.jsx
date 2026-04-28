import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PageLoader from "@/components/PageLoader";

// Minimal icon set — keyed off notification type
const getNotifIcon = (type) => {
  if (!type) return '🔔';
  if (type === 'birthday') return '🎂';
  if (type === 'package_expiring' || type === 'low_balance' || type === 'renewal_alert') return '⚠️';
  if (type === 'package_expired' || type === 'service_completed') return '🎫';
  if (type?.includes('package') || type?.includes('renewal')) return '🎫';
  if (type === 'session_reminder') return '⏰';
  if (type?.includes('session') || type === 'reschedule_request') return '📅';
  if (type?.includes('plan')) return '📋';
  if (type?.includes('measurement') || type?.includes('baseline') || type === 'metrics_updated') return '📏';
  if (type?.includes('record') || type?.includes('goal')) return '🏆';
  if (type === 'new_message' || type === 'coach_message') return '💬';
  return '🔔';
};

const getFilterCategory = (type) => {
  if (type?.includes('session') || type === 'reschedule_request') return 'sessions';
  if (type?.includes('package') || type?.includes('renewal') || type === 'low_balance' || type === 'service_completed') return 'packages';
  if (type?.includes('plan')) return 'plans';
  if (type?.includes('record') || type === 'new_record' || type?.includes('goal')) return 'records';
  return 'other';
};

const formatRelativeTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק'`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString('he-IL');
};

export default function Notifications() {
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error("[Notifications] Error loading user:", error);
      }
    };
    loadUser();
  }, []);

  // Realtime — pick up trainee responses instantly
  React.useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`coach-notif-responses-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },
        () => queryClient.invalidateQueries({ queryKey: ['notifications', user.id] }))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id, queryClient]);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      try { return await base44.entities.Notification.filter({ user_id: user?.id }, '-created_at'); }
      catch { return []; }
    },
    initialData: [],
    enabled: !!user?.id,
  });

  const isCoach = user?.is_coach === true || user?.role === 'coach' || user?.role === 'admin';

  const [filter, setFilter] = useState(() => {
    try { return localStorage.getItem('notifications_filter') || 'all'; } catch { return 'all'; }
  });
  React.useEffect(() => { try { localStorage.setItem('notifications_filter', filter); } catch {} }, [filter]);

  // Coach roster — needed for birthday popup
  const { data: coachTrainees = [] } = useQuery({
    queryKey: ['notif-coach-trainees', user?.id],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, full_name, birth_date')
          .eq('coach_id', user.id)
          .order('full_name');
        return data || [];
      } catch { return []; }
    },
    enabled: !!user?.id && isCoach,
    initialData: [],
  });

  // Reminder dialog target — id of the notification a reminder is
  // currently being scheduled for. null = dialog closed.
  const [reminderTarget, setReminderTarget] = useState(null);
  const [customReminderInput, setCustomReminderInput] = useState('');

  // Per-row lifecycle actions. All updates write to the supabase row
  // directly (the columns: status / handled_at / reminder_at /
  // deleted_at were added via the recent ALTER) and rely on the
  // realtime channel above to invalidate the query. Optimistic
  // invalidation here keeps the UI snappy when realtime is slow.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });

  const markHandled = async (id) => {
    const { error } = await supabase.from('notifications')
      .update({ status: 'handled', handled_at: new Date().toISOString(), is_read: true })
      .eq('id', id);
    if (error) { toast.error('שגיאה: ' + error.message); return; }
    refresh();
    toast.success('סומן כטופל ✓');
  };

  const markDeferred = async (id) => {
    const { error } = await supabase.from('notifications')
      .update({ status: 'deferred' })
      .eq('id', id);
    if (error) { toast.error('שגיאה: ' + error.message); return; }
    refresh();
    toast.success('נדחה למאוחר יותר ⏳');
  };

  const softDelete = async (id) => {
    const { error } = await supabase.from('notifications')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error('שגיאה: ' + error.message); return; }
    refresh();
    toast.success('התראה נמחקה');
  };

  const setReminderAt = async (id, date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      toast.error('תאריך לא תקין'); return;
    }
    if (date <= new Date()) {
      toast.error('בחר זמן עתידי'); return;
    }
    const { error } = await supabase.from('notifications')
      .update({
        status: 'reminder',
        reminder_at: date.toISOString(),
        is_read: false, // make sure it pops back up when due
      })
      .eq('id', id);
    if (error) { toast.error('שגיאה: ' + error.message); return; }
    refresh();
    const dateLabel = date.toLocaleDateString('he-IL');
    const timeLabel = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    toast.success(`תזכורת הוגדרה ל-${dateLabel} ${timeLabel}`);
    setReminderTarget(null);
    setCustomReminderInput('');
  };

  // Mutations
  const markAsRead = async (id) => {
    try {
      await base44.entities.Notification.update(id, { is_read: true });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {}
  };

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.is_read);
      for (const n of unread) {
        await base44.entities.Notification.update(n.id, { is_read: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success("כל ההתראות סומנו כנקראו");
    },
    onError: () => toast.error("שגיאה בסימון התראות"),
  });

  // Navigation — unchanged
  const navigateToRelevant = (notif) => {
    if (notif.type === 'birthday') {
      const tid = notif.trainee_id || notif.data?.trainee_id;
      const trainee = tid ? coachTrainees.find(t => t.id === tid) : null;
      if (tid && trainee) {
        let age = null;
        if (trainee.birth_date) {
          const b = new Date(trainee.birth_date);
          if (!Number.isNaN(b.getTime())) {
            age = new Date().getFullYear() - b.getFullYear();
          }
        }
        window.dispatchEvent(new CustomEvent('athletigo:birthday-tap', {
          detail: { coachId: user?.id, traineeId: tid, name: trainee.full_name, age: age ?? '' },
        }));
        return;
      }
    }

    // Prefer the explicit `link` field set by inserters that already
    // know the right destination (e.g. session_confirmed writes
    // /TraineeProfile?userId=...). Fall back to category-based routing
    // for older rows that don't carry a link.
    if (notif.link) {
      const path = String(notif.link).startsWith('/')
        ? notif.link
        : `/${notif.link}`;
      try { navigate(path); return; } catch { /* fall through */ }
    }

    const tid = notif.trainee_id || notif.data?.trainee_id;
    if (tid) {
      const cat = getFilterCategory(notif.type);
      // The trainee profile page route is /traineeprofile (lowercased
      // by pages.config). The /trainee/:id form used here previously
      // did NOT exist as a route — every notification that hit this
      // branch landed on the 404 page. Map to the correct route + the
      // canonical tab ids (attendance / services / plans / achievements).
      const tabFor = {
        sessions:  'attendance',
        packages:  'services',
        plans:     'plans',
        records:   'achievements',
      }[cat];
      const base = `/traineeprofile?userId=${encodeURIComponent(tid)}`;
      try {
        navigate(tabFor ? `${base}&tab=${tabFor}` : base);
      } catch (e) {
        console.warn('[Notifications] navigation failed:', e);
        toast.error('הדף לא נמצא');
      }
      return;
    }

    // No trainee context — send to the relevant top-level page.
    const cat = getFilterCategory(notif.type);
    try {
      if (cat === 'sessions') navigate('/sessions');
      else if (cat === 'plans') navigate('/trainingplans');
      else if (cat === 'packages') navigate('/allusers');
      else navigate('/dashboard');
    } catch (e) {
      console.warn('[Notifications] fallback navigation failed:', e);
    }
  };

  const handleNotificationClick = (n) => {
    if (!n.is_read) markAsRead(n.id);
    navigateToRelevant(n);
  };

  // Soft-deleted rows never show in this list. The header counter
  // also ignores rows the coach already handled — only the genuinely
  // unread items inflate the badge.
  const visibleNotifications = useMemo(
    () => notifications.filter(n => n.status !== 'deleted'),
    [notifications]
  );

  const unreadCount = useMemo(
    () => visibleNotifications.filter(n => !n.is_read && n.status !== 'handled').length,
    [visibleNotifications]
  );

  const filteredNotifications = useMemo(() => {
    return visibleNotifications.filter(n => {
      if (filter === 'all')      return true;
      if (filter === 'unread')   return !n.is_read && n.status !== 'handled';
      if (filter === 'deferred') return n.status === 'deferred';
      if (filter === 'reminder') return n.status === 'reminder';
      if (filter === 'handled')  return n.status === 'handled';
      return true;
    });
  }, [visibleNotifications, filter]);

  // Send dialog (coach)
  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees-for-notif'],
    queryFn: async () => {
      const all = await base44.entities.User.list('-created_at', 500);
      return all.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    enabled: isCoach,
  });
  const [showSend, setShowSend] = useState(false);
  const [sendForm, setSendForm] = useState({ title: '', message: '', selectedTrainees: [] });
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!sendForm.title.trim() || !sendForm.message.trim()) { toast.error('יש למלא כותרת והודעה'); return; }
    if (sendForm.selectedTrainees.length === 0) { toast.error('יש לבחור לפחות מתאמן אחד'); return; }
    setSending(true);
    try {
      for (const tid of sendForm.selectedTrainees) {
        await base44.entities.Notification.create({
          user_id: tid, type: 'coach_message',
          title: sendForm.title, message: sendForm.message, is_read: false,
          data: { from_coach: user.id, coach_name: user.full_name },
        });
      }
      toast.success(`נשלחה התראה ל-${sendForm.selectedTrainees.length} מתאמנים`);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setShowSend(false);
      setSendForm({ title: '', message: '', selectedTrainees: [] });
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || 'נסה שוב'));
    } finally { setSending(false); }
  };

  if (!user) {
    return <PageLoader />;
  }

  const markAllRead = () => markAllAsReadMutation.mutate();

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: '#FAFAFA' }} dir="rtl">

      {/* A. Page header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', padding: '16px',
        direction: 'rtl', background: 'white',
        borderBottom: '0.5px solid #F0E4D0',
      }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a' }}>
          🔔 התראות
          {unreadCount > 0 && (
            <span style={{ fontSize: '14px', color: '#FF6F20', marginRight: '6px' }}>
              ({unreadCount})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isCoach && (
            <button
              onClick={() => setShowSend(true)}
              style={{
                background: 'none', border: 'none', color: '#FF6F20',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Send className="w-3 h-3" /> שלח
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markAllAsReadMutation.isPending}
              style={{
                background: 'none', border: 'none', color: '#FF6F20',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              סמן הכל כנקרא ✓
            </button>
          )}
        </div>
      </div>

      {/* B. Filter — chip row. Five lifecycle states now: everything,
          fresh unread, deferred ("ill handle this later"), reminders,
          handled. status==='deleted' rows are filtered out at the
          source so they never appear in any tab. */}
      <div style={{
        display: 'flex', gap: '6px',
        padding: '12px 16px',
        direction: 'rtl',
        overflowX: 'auto',
      }}>
        {[
          { id: 'all',      label: 'הכל' },
          { id: 'unread',   label: 'חדשות' },
          { id: 'deferred', label: 'נדחו' },
          { id: 'reminder', label: 'תזכורות' },
          { id: 'handled',  label: 'טופלו' },
        ].map(f => (
          <div
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
              background: filter === f.id ? '#FF6F20' : 'white',
              color: filter === f.id ? 'white' : '#888',
              border: filter === f.id ? 'none' : '0.5px solid #F0E4D0',
            }}
          >
            {f.label}
          </div>
        ))}
      </div>

      {/* C. Notification cards — clean list */}
      <div>
        {filteredNotifications.map(n => (
          <div
            key={n.id}
            onClick={() => handleNotificationClick(n)}
            style={{
              display: 'flex', alignItems: 'flex-start',
              gap: '10px', padding: '12px 16px',
              background: n.is_read ? 'transparent' : '#FFF9F0',
              borderBottom: '0.5px solid #F8F0E8',
              cursor: 'pointer', direction: 'rtl',
            }}
          >
            {!n.is_read && (
              <div style={{
                width: '8px', height: '8px',
                borderRadius: '50%',
                background: '#FF6F20',
                marginTop: '6px', flexShrink: 0,
              }} />
            )}

            <div style={{
              width: '36px', height: '36px',
              borderRadius: '10px',
              background: '#FFF0E4',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px', flexShrink: 0,
            }}>
              {getNotifIcon(n.type)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '14px',
                fontWeight: n.is_read ? 400 : 600,
                color: '#1a1a1a',
                lineHeight: 1.4,
              }}>
                {n.message || n.title}
              </div>
              <div style={{
                fontSize: '11px', color: '#888',
                marginTop: '4px',
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              }}>
                <span>{formatRelativeTime(n.created_at)}</span>
                {n.status === 'handled' && (
                  <span style={{ color: '#2E7D32' }}>• טופל</span>
                )}
                {n.status === 'deferred' && (
                  <span style={{ color: '#E65100' }}>• נדחה</span>
                )}
                {n.status === 'reminder' && n.reminder_at && (
                  <span style={{ color: '#FF6F20' }}>
                    • תזכורת ל-
                    {new Date(n.reminder_at).toLocaleDateString('he-IL')}
                    {' '}
                    {new Date(n.reminder_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              {/* Per-row lifecycle actions. stopPropagation so the
                  card click (navigateToRelevant) doesn't also fire. */}
              <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8,
              }}>
                {n.status !== 'handled' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); markHandled(n.id); }}
                    style={{
                      padding: '4px 10px', borderRadius: 10, fontSize: 12,
                      cursor: 'pointer', border: '1px solid #F0E4D0',
                      background: 'white', color: '#2E7D32',
                    }}
                  >
                    ✓ טופל
                  </button>
                )}
                {n.status !== 'deferred' && n.status !== 'handled' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); markDeferred(n.id); }}
                    style={{
                      padding: '4px 10px', borderRadius: 10, fontSize: 12,
                      cursor: 'pointer', border: '1px solid #F0E4D0',
                      background: 'white', color: '#E65100',
                    }}
                  >
                    ⏳ מאוחר יותר
                  </button>
                )}
                {n.status !== 'handled' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setReminderTarget(n.id); }}
                    style={{
                      padding: '4px 10px', borderRadius: 10, fontSize: 12,
                      cursor: 'pointer', border: '1px solid #F0E4D0',
                      background: 'white', color: '#FF6F20',
                    }}
                  >
                    🔔 תזכורת
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); softDelete(n.id); }}
                  style={{
                    padding: '4px 10px', borderRadius: 10, fontSize: 12,
                    cursor: 'pointer', border: '1px solid #F0E4D0',
                    background: 'white', color: '#C62828',
                  }}
                >
                  🗑️ מחק
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* D. Empty state */}
        {filteredNotifications.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: '#888',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔔</div>
            <div style={{ fontSize: '14px' }}>אין התראות</div>
          </div>
        )}
      </div>

      {/* Reminder picker — opens when "🔔 תזכורת" is clicked on any
          row. Quick-pick buttons + manual datetime-local. Backdrop tap
          closes; saving wires the row to status='reminder' +
          reminder_at + is_read=false so the App.jsx polling loop will
          surface it as a popup when the time arrives. */}
      {reminderTarget && (
        <div
          onClick={() => { setReminderTarget(null); setCustomReminderInput(''); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            zIndex: 10000, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 16, direction: 'rtl',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 14, padding: 20,
              maxWidth: 340, width: '100%', position: 'relative',
              maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <button
              onClick={() => { setReminderTarget(null); setCustomReminderInput(''); }}
              aria-label="סגור"
              style={{
                position: 'absolute', top: 10, left: 10, background: 'none',
                border: 'none', fontSize: 22, cursor: 'pointer', color: '#888',
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>הגדר תזכורת</div>
            </div>

            {[
              { label: 'עוד 30 דקות',          minutes: 30 },
              { label: 'עוד שעה',              minutes: 60 },
              { label: 'עוד 3 שעות',           minutes: 180 },
              { label: 'מחר בבוקר (08:00)',     preset: 'tomorrow_morning' },
              { label: 'מחר בערב (18:00)',      preset: 'tomorrow_evening' },
              { label: 'בעוד יומיים',           minutes: 2880 },
              { label: 'בעוד שבוע',             minutes: 10080 },
            ].map(opt => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  let when;
                  if (opt.preset === 'tomorrow_morning') {
                    when = new Date();
                    when.setDate(when.getDate() + 1);
                    when.setHours(8, 0, 0, 0);
                  } else if (opt.preset === 'tomorrow_evening') {
                    when = new Date();
                    when.setDate(when.getDate() + 1);
                    when.setHours(18, 0, 0, 0);
                  } else {
                    when = new Date(Date.now() + opt.minutes * 60 * 1000);
                  }
                  setReminderAt(reminderTarget, when);
                }}
                style={{
                  width: '100%', padding: 12, borderRadius: 12,
                  border: '1px solid #F0E4D0', background: 'white',
                  fontSize: 14, cursor: 'pointer', marginBottom: 6,
                  textAlign: 'center',
                }}
              >
                {opt.label}
              </button>
            ))}

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
                או בחר תאריך ושעה:
              </div>
              <input
                type="datetime-local"
                value={customReminderInput}
                onChange={(e) => setCustomReminderInput(e.target.value)}
                style={{
                  width: '100%', padding: 10, borderRadius: 12,
                  border: '1px solid #F0E4D0', fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (!customReminderInput) { toast.error('בחר תאריך ושעה'); return; }
                  setReminderAt(reminderTarget, new Date(customReminderInput));
                }}
                style={{
                  width: '100%', padding: 12, borderRadius: 12, border: 'none',
                  background: '#FF6F20', color: 'white', fontSize: 14,
                  fontWeight: 600, cursor: 'pointer', marginTop: 6,
                }}
              >
                הגדר תזכורת
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send dialog (coach) — unchanged */}
      {isCoach && (
        <Dialog open={showSend} onOpenChange={setShowSend}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-black">שלח התראה למתאמנים</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2" dir="rtl">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2">בחר מתאמנים</label>
                <div style={{ maxHeight: '30vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <button onClick={() => setSendForm(f => ({ ...f, selectedTrainees: f.selectedTrainees.length === trainees.length ? [] : trainees.map(t => t.id) }))}
                    className="w-full text-xs font-bold text-[#FF6F20] mb-2 text-right">
                    {sendForm.selectedTrainees.length === trainees.length ? 'בטל הכל' : 'בחר הכל'}
                  </button>
                  {trainees.map(t => {
                    const sel = sendForm.selectedTrainees.includes(t.id);
                    return (
                      <div key={t.id} onClick={() => setSendForm(f => ({
                        ...f,
                        selectedTrainees: sel ? f.selectedTrainees.filter(id => id !== t.id) : [...f.selectedTrainees, t.id],
                      }))}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, border: sel ? '2px solid #FF6F20' : '1px solid #eee', background: sel ? '#FFF0E8' : 'white', marginBottom: 6, cursor: 'pointer' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{t.full_name}</span>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? '#FF6F20' : '#ddd'}`, background: sel ? '#FF6F20' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12 }}>
                          {sel ? '✓' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">כותרת</label>
                <input value={sendForm.title} onChange={e => setSendForm(f => ({ ...f, title: e.target.value }))} placeholder="כותרת ההתראה"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1.5px solid', borderColor: sendForm.title ? '#FF6F20' : '#ddd', borderRadius: 10, boxSizing: 'border-box', direction: 'rtl', outline: 'none' }} />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">הודעה</label>
                <textarea value={sendForm.message} onChange={e => setSendForm(f => ({ ...f, message: e.target.value }))} placeholder="תוכן ההודעה..."
                  rows={3} style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1.5px solid', borderColor: sendForm.message ? '#FF6F20' : '#ddd', borderRadius: 10, boxSizing: 'border-box', direction: 'rtl', outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
              </div>
              <Button onClick={handleSend} disabled={sending} className="w-full rounded-xl py-3 font-bold text-white min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />שולח...</> : `שלח ל-${sendForm.selectedTrainees.length} מתאמנים`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
