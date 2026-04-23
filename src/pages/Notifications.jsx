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

    const tid = notif.trainee_id || notif.data?.trainee_id;
    if (tid) {
      const cat = getFilterCategory(notif.type);
      if (cat === 'sessions') navigate(`/trainee/${tid}?tab=sessions`);
      else if (cat === 'packages') navigate(`/trainee/${tid}?tab=packages`);
      else if (cat === 'plans') navigate(`/trainee/${tid}?tab=plans`);
      else if (cat === 'records') navigate(`/trainee/${tid}?tab=records`);
      else navigate(`/trainee/${tid}`);
      return;
    }
    const cat = getFilterCategory(notif.type);
    if (cat === 'sessions') navigate('/sessions');
    else if (cat === 'plans') navigate('/planbuilder');
    else if (cat === 'packages') navigate('/allusers');
    else navigate('/dashboard');
  };

  const handleNotificationClick = (n) => {
    if (!n.is_read) markAsRead(n.id);
    navigateToRelevant(n);
  };

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.is_read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (filter === 'all') return true;
      if (filter === 'unread') return !n.is_read;
      if (filter === 'sessions') return getFilterCategory(n.type) === 'sessions';
      return true;
    });
  }, [notifications, filter]);

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

      {/* B. Filter — single row of small chips */}
      <div style={{
        display: 'flex', gap: '6px',
        padding: '12px 16px',
        direction: 'rtl',
      }}>
        {[
          { id: 'all', label: 'הכל' },
          { id: 'unread', label: 'לא נקראו' },
          { id: 'sessions', label: 'מפגשים' },
        ].map(f => (
          <div
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px', fontWeight: 600,
              cursor: 'pointer',
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
              }}>
                {formatRelativeTime(n.created_at)}
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
