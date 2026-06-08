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
import useMultiSelect from "../hooks/useMultiSelect";
import { MultiSelectBar, SelectCheckbox } from "../components/MultiSelectBar";
import FeedbackInbox from "@/components/feedback/FeedbackInbox";
import { ATHLETIGO_ADMIN_UUID } from "@/constants/admin";

// Icon set — keyed off notification type. New entries added 2026-05-10
// for trainee onboarding / payment / workout-completed / health flows
// so the cards stop falling back to the generic bell.
const getNotifIcon = (type) => {
  if (!type) return '🔔';
  if (type === 'birthday') return '🎂';
  if (type === 'new_trainee' || type === 'onboarding_complete') return '👤';
  if (type === 'package_expiring' || type === 'low_balance' || type === 'renewal_alert') return '⚠️';
  if (type === 'package_expired' || type === 'service_completed') return '🎫';
  if (type?.includes('package') || type?.includes('renewal')) return '🎫';
  if (type === 'session_reminder') return '⏰';
  if (type?.includes('session') || type === 'reschedule_request') return '📅';
  if (type === 'workout_completed' || type === 'workout_done') return '💪';
  if (type?.includes('plan')) return '📋';
  if (type?.includes('measurement') || type?.includes('baseline') || type === 'metrics_updated') return '📏';
  if (type === 'goal_achieved') return '🏆';
  if (type?.includes('record') || type?.includes('goal')) return '🏆';
  if (type === 'payment' || type?.includes('payment')) return '💳';
  if (type === 'health_declaration' || type?.includes('health')) return '📋';
  if (type === 'new_message' || type === 'coach_message') return '💬';
  if (type === 'system') return '🔔';
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

  // Surface a Hebrew toast on fetch failure so the page never blanks
  // silently when notifications can't load (RLS misconfig, network
  // hiccup, etc.). Returning [] from the catch keeps the empty-state
  // UI working as before; the toast is the only behavioural change.
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      try {
        return await base44.entities.Notification.filter({ user_id: user?.id }, '-created_at');
      } catch (e) {
        console.warn('[Notifications] fetch failed:', e?.message);
        toast.error('שגיאה בטעינת ההתראות: ' + (e?.message || 'נסה לרענן'));
        return [];
      }
    },
    initialData: [],
    enabled: !!user?.id,
  });

  const isCoach = user?.is_coach === true || user?.role === 'coach' || user?.role === 'admin';

  // Multi-select for bulk handle/read/soft-delete on notifications.
  const notifSel = useMultiSelect();

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

  // Coach-only filter: limit the list to a single trainee. Reads
  // trainee id from data.trainee_id (preferred) or parses ?userId=
  // out of notification.link as a fallback for older rows that didn't
  // populate the data field.
  const [filterTrainee, setFilterTrainee] = useState('all');
  const traineeIdFromNotif = (n) => {
    if (n.data?.trainee_id) return n.data.trainee_id;
    if (n.link && typeof n.link === 'string' && n.link.includes('userId=')) {
      const part = n.link.split('userId=')[1] || '';
      return decodeURIComponent(part.split('&')[0] || '') || null;
    }
    return null;
  };

  const filteredNotifications = useMemo(() => {
    return visibleNotifications.filter(n => {
      if (filterTrainee !== 'all') {
        const tid = traineeIdFromNotif(n);
        if (tid !== filterTrainee) return false;
      }
      if (filter === 'all')      return true;
      if (filter === 'unread')   return !n.is_read && n.status !== 'handled';
      if (filter === 'deferred') return n.status === 'deferred';
      if (filter === 'reminder') return n.status === 'reminder';
      if (filter === 'handled')  return n.status === 'handled';
      return true;
    });
  }, [visibleNotifications, filter, filterTrainee]);

  // Grouping by trainee — May 2026 redesign. Each trainee becomes a
  // collapsible folder; notifications without a parsable trainee_id
  // (system messages) bucket under "התראות מערכת". Sort: groups with
  // unread come first, then by total count.
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const traineeGroups = useMemo(() => {
    const acc = new Map();
    for (const n of filteredNotifications) {
      const tid = traineeIdFromNotif(n) || 'system';
      const lookupName = tid !== 'system'
        ? (n.data?.trainee_name
            || coachTrainees.find(t => t.id === tid)?.full_name
            || 'מתאמן')
        : 'התראות מערכת';
      if (!acc.has(tid)) {
        acc.set(tid, { id: tid, name: lookupName, notifications: [], unreadCount: 0 });
      }
      const g = acc.get(tid);
      g.notifications.push(n);
      if (!n.is_read && n.status !== 'handled') g.unreadCount += 1;
    }
    return Array.from(acc.values()).sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      return b.notifications.length - a.notifications.length;
    });
  }, [filteredNotifications, coachTrainees]);

  const toggleGroup = (id) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const expandAll  = () => setExpandedGroups(new Set(traineeGroups.map(g => g.id)));
  const collapseAll = () => setExpandedGroups(new Set());

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
    <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: 'var(--cream)' }} dir="rtl">

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
          {/* Expand / collapse all groups — appear next to the
              "send" + "mark all read" controls for one-tap overview. */}
          {traineeGroups.length > 1 && (
            <>
              <button
                type="button"
                onClick={expandAll}
                style={{
                  background: 'none', border: 'none', color: '#888',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                }}
              >
                פתח הכל
              </button>
              <button
                type="button"
                onClick={collapseAll}
                style={{
                  background: 'none', border: 'none', color: '#888',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                }}
              >
                סגור הכל
              </button>
            </>
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
          <button
            onClick={() => notifSel.isSelecting ? notifSel.clearSelection() : notifSel.startSelecting()}
            style={{
              padding: '6px 12px', borderRadius: 10,
              border: '1px solid #F0E4D0',
              background: notifSel.isSelecting ? '#FFF5EE' : 'white',
              color: notifSel.isSelecting ? '#FF6F20' : '#888',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {notifSel.isSelecting ? '✕ ביטול' : '☑ בחירה'}
          </button>
        </div>
      </div>

      {/* B0. Coach-only trainee filter. coachTrainees is already
          fetched at the top of the component for the birthday popup,
          so we reuse it here without an extra query. Hidden for
          trainee accounts (they only see their own notifications). */}
      {isCoach && coachTrainees.length > 0 && (
        <div style={{ padding: '0 16px', marginTop: 8, direction: 'rtl' }}>
          <select
            value={filterTrainee}
            onChange={(e) => setFilterTrainee(e.target.value)}
            style={{
              width: '100%', padding: 10, borderRadius: 12,
              border: '1px solid #F0E4D0', fontSize: 14,
              direction: 'rtl', background: 'white',
              appearance: 'auto',
            }}
          >
            <option value="all">כל המתאמנים</option>
            {coachTrainees.map(t => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* B. Filter chips — May 2026 spec: 4 lifecycle states. The
          older 'reminder' chip was folded into 'נדחו' since reminders
          are a per-row mechanism, not a top-level category.
          5th chip "💡 שיפורים" is admin-only — opens the FeedbackInbox
          tab in place of the notifications list. */}
      <div style={{
        display: 'flex', gap: 6,
        padding: '12px 16px',
        direction: 'rtl',
        overflowX: 'auto',
      }}>
        {[
          { id: 'all',      label: 'הכל' },
          { id: 'unread',   label: 'חדש' },
          { id: 'deferred', label: 'נדחו' },
          { id: 'handled',  label: 'טופלו' },
          ...(user?.id === ATHLETIGO_ADMIN_UUID
            ? [{ id: 'feedback', label: '💡 שיפורים' }]
            : []),
        ].map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            style={{
              padding: '8px 16px',
              borderRadius: 18,
              border: 'none',
              fontSize: 13,
              fontWeight: filter === f.id ? 700 : 600,
              background: filter === f.id ? '#FF6F20' : 'white',
              color: filter === f.id ? 'white' : '#888',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              outline: 'none',
              boxShadow: 'none',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Admin-only feedback inbox — renders in place of the
          notifications list when the "💡 שיפורים" tab is active.
          FeedbackInbox owns its own data + filters + status triage
          and double-checks the admin UUID itself. */}
      {filter === 'feedback' && <FeedbackInbox />}

      {/* C. Trainee-grouped folders — May 2026 redesign. Each
          trainee gets a collapsible header (avatar + name + counts +
          unread badge). Tap to expand → notifications render inline
          with compact action chips. All existing handlers (markHandled
          / markDeferred / setReminderTarget / softDelete /
          markAsRead / navigateToRelevant) are unchanged — only the
          shell layout moved. */}
      {filter !== 'feedback' && (
      <div style={{ padding: '0 12px' }}>
        {traineeGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.id);
          return (
            <div key={group.id} style={{
              background: 'white',
              borderRadius: 12,
              marginBottom: 8,
              overflow: 'hidden',
              border: '1px solid #F0E4D0',
            }}>
              {/* Folder header — tap to toggle */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: group.unreadCount > 0 ? '#FFF9F0' : 'white',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexDirection: 'row-reverse',
                  cursor: 'pointer',
                  textAlign: 'right',
                  outline: 'none',
                }}
              >
                <div style={{
                  width: 38, height: 38,
                  borderRadius: '50%',
                  background: '#FFF0E4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, color: '#FF6F20',
                  flexShrink: 0,
                }}>
                  {group.name?.[0] || '?'}
                </div>
                <div style={{ flex: 1, textAlign: 'right', minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 700, color: '#1a1a1a',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {group.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {group.notifications.length} התראות
                    {group.unreadCount > 0 && ` · ${group.unreadCount} חדשות`}
                  </div>
                </div>
                {group.unreadCount > 0 && (
                  <div style={{
                    background: '#FF6F20', color: 'white',
                    fontSize: 11, fontWeight: 700,
                    minWidth: 22, height: 22, borderRadius: 11, padding: '0 7px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {group.unreadCount}
                  </div>
                )}
                <div style={{
                  color: '#888', fontSize: 14,
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.2s',
                }}>
                  ▼
                </div>
              </button>

              {/* Notifications inside this folder */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #F0E4D0' }}>
                  {group.notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (notifSel.isSelecting) { notifSel.toggleSelect(n.id); return; }
                        handleNotificationClick(n);
                      }}
                      style={{
                        display: 'flex', alignItems: 'flex-start',
                        gap: 10, padding: '10px 12px',
                        background: notifSel.isSelecting && notifSel.isSelected(n.id)
                          ? '#FFF5EE'
                          : (n.is_read ? 'white' : '#FFFCF7'),
                        borderBottom: '1px solid #F8F0E8',
                        cursor: 'pointer', direction: 'rtl',
                      }}
                    >
                      {notifSel.isSelecting && (
                        <SelectCheckbox
                          isSelected={notifSel.isSelected(n.id)}
                          onToggle={() => notifSel.toggleSelect(n.id)}
                        />
                      )}
                      {!n.is_read && !notifSel.isSelecting && (
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#FF6F20',
                          marginTop: 8, flexShrink: 0,
                        }} />
                      )}
                      <div style={{ fontSize: 18, flexShrink: 0, lineHeight: 1, marginTop: 2 }}>
                        {getNotifIcon(n.type)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {n.title && (
                          <div style={{
                            fontSize: 13,
                            fontWeight: n.is_read ? 600 : 700,
                            color: '#1a1a1a', lineHeight: 1.35,
                            marginBottom: n.message && n.message !== n.title ? 2 : 0,
                          }}>
                            {n.title}
                          </div>
                        )}
                        {n.message && n.message !== n.title && (
                          <div style={{
                            fontSize: 12,
                            fontWeight: n.is_read ? 400 : 500,
                            color: '#666', lineHeight: 1.4,
                          }}>
                            {n.message}
                          </div>
                        )}
                        {!n.title && !n.message && (
                          <div style={{ fontSize: 13, color: '#888' }}>
                            {n.type || 'התראה'}
                          </div>
                        )}
                        <div style={{
                          fontSize: 11, color: '#aaa',
                          marginTop: 4,
                          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                        }}>
                          <span>{formatRelativeTime(n.created_at)}</span>
                          {n.status === 'handled' && <span style={{ color: '#2E7D32' }}>• טופל</span>}
                          {n.status === 'deferred' && <span style={{ color: '#E65100' }}>• נדחה</span>}
                          {n.status === 'reminder' && n.reminder_at && (
                            <span style={{ color: '#FF6F20' }}>
                              • תזכורת ל-{new Date(n.reminder_at).toLocaleDateString('he-IL')}{' '}
                              {new Date(n.reminder_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>

                        {/* Compact action chips — May 2026 spec.
                            Smaller padding (5×10) + 11px font so 4
                            chips fit in one row on narrow screens. */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {n.status !== 'handled' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); markHandled(n.id); }}
                              style={{
                                padding: '5px 10px', background: 'white',
                                border: '1px solid #E8E0D8', borderRadius: 14,
                                fontSize: 11, fontWeight: 600, color: '#16a34a',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                whiteSpace: 'nowrap', outline: 'none',
                              }}
                            >
                              <span>✓</span><span>טופל</span>
                            </button>
                          )}
                          {n.status !== 'deferred' && n.status !== 'handled' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); markDeferred(n.id); }}
                              style={{
                                padding: '5px 10px', background: 'white',
                                border: '1px solid #E8E0D8', borderRadius: 14,
                                fontSize: 11, fontWeight: 600, color: '#888',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                whiteSpace: 'nowrap', outline: 'none',
                              }}
                            >
                              <span>⏰</span><span>דחה</span>
                            </button>
                          )}
                          {n.status !== 'handled' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setReminderTarget(n.id); }}
                              style={{
                                padding: '5px 10px', background: 'white',
                                border: '1px solid #E8E0D8', borderRadius: 14,
                                fontSize: 11, fontWeight: 600, color: '#FF6F20',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                whiteSpace: 'nowrap', outline: 'none',
                              }}
                            >
                              <span>🔔</span><span>תזכורת</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); softDelete(n.id); }}
                            style={{
                              padding: '5px 10px', background: 'white',
                              border: '1px solid #E8E0D8', borderRadius: 14,
                              fontSize: 11, fontWeight: 600, color: '#dc2626',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                              whiteSpace: 'nowrap', outline: 'none',
                            }}
                          >
                            <span>🗑️</span><span>מחק</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* D. Empty state */}
        {filteredNotifications.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#aaa' }}>
              אין התראות
            </div>
            <div style={{ fontSize: 13, color: '#ccc', marginTop: 6 }}>
              כשיהיו חדשות — הן יופיעו כאן
            </div>
          </div>
        )}
      </div>
      )}

      {/* Multi-select bar — bulk handle / mark-read / soft-delete */}
      <MultiSelectBar
        count={notifSel.selectedCount}
        onCancel={notifSel.clearSelection}
        actions={[
          {
            icon: '✓', label: 'טופל', primary: true,
            onClick: async () => {
              const ids = Array.from(notifSel.selectedIds);
              try {
                for (const id of ids) {
                  await supabase.from('notifications').update({
                    status: 'handled',
                    handled_at: new Date().toISOString(),
                    is_read: true,
                  }).eq('id', id);
                }
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
                toast.success(`${ids.length} סומנו כטופלו`);
                notifSel.clearSelection();
              } catch (e) { toast.error('שגיאה בעדכון'); }
            },
          },
          {
            icon: '👁', label: 'נקרא',
            onClick: async () => {
              const ids = Array.from(notifSel.selectedIds);
              try {
                for (const id of ids) {
                  await supabase.from('notifications').update({ is_read: true }).eq('id', id);
                }
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
                toast.success(`${ids.length} סומנו כנקראו`);
                notifSel.clearSelection();
              } catch (e) { toast.error('שגיאה בעדכון'); }
            },
          },
          {
            icon: '🗑️', label: 'מחק', danger: true,
            onClick: async () => {
              const ids = Array.from(notifSel.selectedIds);
              if (!window.confirm(`למחוק ${ids.length} התראות?`)) return;
              try {
                for (const id of ids) {
                  await supabase.from('notifications').update({
                    status: 'deleted',
                    deleted_at: new Date().toISOString(),
                  }).eq('id', id);
                }
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
                toast.success(`${ids.length} נמחקו`);
                notifSel.clearSelection();
              } catch (e) { toast.error('שגיאה במחיקה'); }
            },
          },
        ]}
      />

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
