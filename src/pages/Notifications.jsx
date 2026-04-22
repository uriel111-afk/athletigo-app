import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ViewToggle, { useViewToggle } from "@/components/ViewToggle";

// ── Type helpers ─────────────────────────────────────────────────────
const getTypeIcon = (type) => {
  switch (type) {
    case 'session_request': return '📅';
    case 'session_approved': return '✅';
    case 'session_rejected': return '❌';
    case 'session_confirmed': return '✅';
    case 'session_completed': return '✅';
    case 'session_cancelled_by_trainee': return '🚫';
    case 'session_scheduled': return '📅';
    case 'reschedule_request': return '🔄';
    case 'package_expiring':
    case 'low_balance':
    case 'renewal_alert':
    case 'renewal_request': return '💰';
    case 'package_expired':
    case 'service_completed': return '💸';
    case 'plan_completed': return '📋';
    case 'plan_created':
    case 'plan_assigned':
    case 'plan_updated': return '📝';
    case 'record_broken':
    case 'new_record': return '🏆';
    case 'new_baseline':
    case 'measurement_added':
    case 'metrics_updated': return '📐';
    case 'goal_reached': return '🎯';
    case 'new_message':
    case 'coach_message': return '💬';
    case 'exercise_completed': return '💪';
    default: return '🔔';
  }
};

const getTypeColor = (type) => {
  if (type?.includes('session')) return '#FF6F20';
  if (type?.includes('package') || type?.includes('renewal') || type === 'low_balance' || type === 'service_completed') return '#dc2626';
  if (type?.includes('plan')) return '#16a34a';
  if (type?.includes('record') || type?.includes('goal') || type?.includes('baseline') || type?.includes('measurement') || type === 'metrics_updated') return '#7F47B5';
  return '#FF6F20';
};

const getTypeBg = (type) => {
  if (type?.includes('session')) return '#FFF0E4';
  if (type?.includes('package') || type?.includes('renewal') || type === 'low_balance' || type === 'service_completed') return '#FFEBEE';
  if (type?.includes('plan')) return '#E8F5E9';
  if (type?.includes('record') || type?.includes('goal') || type?.includes('baseline') || type?.includes('measurement') || type === 'metrics_updated') return '#F3E8FF';
  return '#FFF0E4';
};

const getTypeShadow = (type) => {
  const c = getTypeColor(type);
  if (c === '#FF6F20') return 'rgba(255,111,32,0.12)';
  if (c === '#dc2626') return 'rgba(220,38,38,0.12)';
  if (c === '#16a34a') return 'rgba(22,163,74,0.12)';
  if (c === '#7F47B5') return 'rgba(127,71,181,0.12)';
  return 'rgba(0,0,0,0.08)';
};

const getTypeTitle = (type) => {
  switch (type) {
    case 'session_request': return 'בקשת מפגש חדשה';
    case 'session_approved': return 'מפגש אושר';
    case 'session_rejected': return 'מפגש נדחה';
    case 'session_confirmed': return 'מפגש אושר';
    case 'session_completed': return 'מפגש הסתיים';
    case 'session_cancelled_by_trainee': return 'מפגש בוטל';
    case 'session_scheduled': return 'מפגש נקבע';
    case 'reschedule_request': return 'בקשת שינוי מועד';
    case 'package_expiring':
    case 'low_balance':
    case 'renewal_alert': return 'חבילה עומדת להסתיים';
    case 'renewal_request': return 'בקשת חידוש';
    case 'package_expired':
    case 'service_completed': return 'חבילה הסתיימה';
    case 'plan_completed': return 'תוכנית הושלמה';
    case 'plan_created':
    case 'plan_assigned': return 'תוכנית חדשה';
    case 'plan_updated': return 'תוכנית עודכנה';
    case 'record_broken':
    case 'new_record': return 'שיא חדש';
    case 'new_baseline': return 'בייסליין חדש';
    case 'measurement_added': return 'מדידה חדשה';
    case 'metrics_updated': return 'מדדים עודכנו';
    case 'goal_reached': return 'יעד הושג';
    case 'new_message':
    case 'coach_message': return 'הודעה חדשה';
    case 'exercise_completed': return 'תרגיל הושלם';
    default: return 'התראה';
  }
};

const getNavigateLabel = (type) => {
  if (type?.includes('session') || type === 'reschedule_request') return '← עבור למפגשים';
  if (type?.includes('package') || type?.includes('renewal') || type === 'low_balance' || type === 'service_completed') return '← עבור לחבילות';
  if (type?.includes('plan')) return '← עבור לתוכניות';
  if (type?.includes('record') || type === 'new_record') return '← עבור לשיאים';
  if (type?.includes('goal')) return '← עבור ליעדים';
  if (type?.includes('measurement') || type?.includes('baseline') || type === 'metrics_updated') return '← עבור למדידות';
  return '← עבור';
};

const getFilterCategory = (type) => {
  if (type?.includes('session') || type === 'reschedule_request') return 'sessions';
  if (type?.includes('package') || type?.includes('renewal') || type === 'low_balance' || type === 'service_completed') return 'packages';
  if (type?.includes('plan')) return 'plans';
  if (type?.includes('record') || type === 'new_record' || type?.includes('goal')) return 'records';
  return 'other';
};

const timeAgo = (iso) => {
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

const getTimeBucket = (iso) => {
  if (!iso) return 'older';
  const d = new Date(iso);
  const now = new Date();
  const ymd = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (ymd(d) === ymd(now)) return 'today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (ymd(d) === ymd(y)) return 'yesterday';
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (d.getTime() > weekAgo) return 'week';
  return 'older';
};

const FILTERS = [
  { id: 'all',      label: 'הכל',        icon: '' },
  { id: 'unread',   label: 'לא נקראו',   icon: '🔴' },
  { id: 'sessions', label: 'מפגשים',     icon: '📅' },
  { id: 'plans',    label: 'תוכניות',    icon: '📋' },
  { id: 'packages', label: 'חבילות',     icon: '💰' },
  { id: 'records',  label: 'שיאים',      icon: '🏆' },
];

const TIME_SECTIONS = [
  { id: 'today',     label: 'היום' },
  { id: 'yesterday', label: 'אתמול' },
  { id: 'week',      label: 'השבוע' },
  { id: 'older',     label: 'ישן יותר' },
];

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

  // UI state — all three persist in localStorage
  const [filter, setFilter] = useState(() => {
    try { return localStorage.getItem('notifications_filter') || 'all'; } catch { return 'all'; }
  });
  React.useEffect(() => { try { localStorage.setItem('notifications_filter', filter); } catch {} }, [filter]);

  const [view, setView] = useViewToggle('notifications_view', 'list');

  const [groupBy, setGroupBy] = useState(() => {
    try { return localStorage.getItem('notifications_group') || 'time'; } catch { return 'time'; }
  });
  React.useEffect(() => { try { localStorage.setItem('notifications_group', groupBy); } catch {} }, [groupBy]);

  const [expandedIds, setExpandedIds] = useState({});

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

  // Navigation
  const navigateToRelevant = (notif) => {
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

  // Filter counts
  const filterCounts = useMemo(() => {
    const c = { all: notifications.length, unread: 0, sessions: 0, plans: 0, packages: 0, records: 0 };
    for (const n of notifications) {
      if (!n.is_read) c.unread++;
      const cat = getFilterCategory(n.type);
      if (cat in c) c[cat]++;
    }
    return c;
  }, [notifications]);

  // Apply filter
  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter(n => !n.is_read);
    return notifications.filter(n => getFilterCategory(n.type) === filter);
  }, [notifications, filter]);

  // Group
  const groups = useMemo(() => {
    if (groupBy === 'trainee') {
      const map = new Map();
      for (const n of filtered) {
        const key = n.data?.trainee_name || n.trainee_name || 'כללי';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(n);
      }
      return [...map.entries()].map(([label, items]) => ({ label, items, isUnread: false }));
    }
    // time-based
    const unread = filtered.filter(n => !n.is_read);
    const read = filtered.filter(n => n.is_read);
    const buckets = { today: [], yesterday: [], week: [], older: [] };
    for (const n of read) buckets[getTimeBucket(n.created_at)].push(n);
    const result = [];
    if (unread.length) result.push({ label: 'לא נקראו', items: unread, isUnread: true });
    for (const sec of TIME_SECTIONS) {
      if (buckets[sec.id].length) result.push({ label: sec.label, items: buckets[sec.id], isUnread: false });
    }
    return result;
  }, [filtered, groupBy]);

  const unreadCount = filterCounts.unread;

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
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  const toggleExpand = (notif) => {
    setExpandedIds(prev => ({ ...prev, [notif.id]: !prev[notif.id] }));
    if (!notif.is_read) markAsRead(notif.id);
  };

  // ── Card renderers ─────────────────────────────────────────────────
  const ListCard = (notif) => {
    const isExpanded = !!expandedIds[notif.id];
    return (
      <div
        key={notif.id}
        onClick={() => toggleExpand(notif)}
        style={{
          background: 'white',
          borderRadius: 14,
          padding: '12px 14px',
          marginBottom: 8,
          borderRight: notif.is_read ? 'none' : `4px solid ${getTypeColor(notif.type)}`,
          border: notif.is_read ? '0.5px solid #F0E4D0' : 'none',
          boxShadow: notif.is_read ? 'none' : `0 2px 8px ${getTypeShadow(notif.type)}`,
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: notif.is_read ? '#F3F4F6' : getTypeBg(notif.type),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>{getTypeIcon(notif.type)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14,
              fontWeight: notif.is_read ? 500 : 600,
              color: notif.is_read ? '#6b7280' : '#1a1a1a',
            }}>{notif.title || getTypeTitle(notif.type)}</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{timeAgo(notif.created_at)}</div>
          </div>
          {!notif.is_read && (
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF6F20', flexShrink: 0 }} />
          )}
          <div style={{
            fontSize: 14, color: '#888',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}>▼</div>
        </div>
        {isExpanded && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #F0E4D0' }}>
            {notif.message && (
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5, marginBottom: 12 }}>{notif.message}</div>
            )}
            {(notif.data?.trainee_name || notif.trainee_name) && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
                מתאמן: {notif.data?.trainee_name || notif.trainee_name}
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); navigateToRelevant(notif); }}
              style={{
                width: '100%', padding: 10,
                background: '#FF6F20', color: 'white',
                border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >{getNavigateLabel(notif.type)}</button>
          </div>
        )}
      </div>
    );
  };

  const GridCard = (notif) => (
    <div
      key={notif.id}
      onClick={() => { if (!notif.is_read) markAsRead(notif.id); navigateToRelevant(notif); }}
      style={{
        background: 'white',
        borderRadius: 14,
        padding: '14px 10px',
        textAlign: 'center',
        borderRight: notif.is_read ? 'none' : `3px solid ${getTypeColor(notif.type)}`,
        border: notif.is_read ? '0.5px solid #F0E4D0' : 'none',
        boxShadow: notif.is_read ? 'none' : `0 2px 8px ${getTypeShadow(notif.type)}`,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {!notif.is_read && (
        <div style={{ position: 'absolute', top: 8, left: 8, width: 8, height: 8, borderRadius: '50%', background: '#FF6F20' }} />
      )}
      <div style={{ fontSize: 24, marginBottom: 6 }}>{getTypeIcon(notif.type)}</div>
      <div style={{
        fontSize: 13, fontWeight: notif.is_read ? 500 : 600,
        color: notif.is_read ? '#6b7280' : '#1a1a1a',
      }}>{notif.title || getTypeTitle(notif.type)}</div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{timeAgo(notif.created_at)}</div>
    </div>
  );

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: '#FAFAFA' }} dir="rtl">
      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', background: 'white', borderBottom: '0.5px solid #F0E4D0',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>
          התראות {unreadCount > 0 && <span style={{ color: '#FF6F20' }}>({unreadCount})</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isCoach && (
            <button onClick={() => setShowSend(true)}
              style={{ background: 'none', border: 'none', color: '#FF6F20', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Send className="w-3 h-3" /> שלח
            </button>
          )}
          {unreadCount > 0 && (
            <button onClick={() => markAllAsReadMutation.mutate()} disabled={markAllAsReadMutation.isPending}
              style={{ background: 'none', border: 'none', color: '#FF6F20', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              סמן הכל כנקרא
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="notif-filter-row" style={{
        display: 'flex', gap: 6, padding: '10px 14px',
        overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        <style>{`.notif-filter-row::-webkit-scrollbar { display: none; }`}</style>
        {FILTERS.map(f => {
          const active = filter === f.id;
          const count = filterCounts[f.id];
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0,
                background: active ? '#FF6F20' : 'white',
                color: active ? 'white' : '#1a1a1a',
                border: active ? 'none' : '0.5px solid #F0E4D0',
              }}>
              {f.icon && <span style={{ marginLeft: 4 }}>{f.icon}</span>}
              {f.label} {count !== undefined && count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {/* View toggle + Group toggle */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 14px 10px', gap: 8,
      }}>
        <ViewToggle view={view} onChange={setView} />
        <div style={{ display: 'flex', gap: 4, background: '#F0F0F0', borderRadius: 10, padding: 3 }}>
          {[{ id: 'time', label: 'לפי זמן' }, { id: 'trainee', label: 'לפי מתאמן' }].map(g => {
            const active = groupBy === g.id;
            return (
              <button key={g.id} onClick={() => setGroupBy(g.id)}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: active ? '#FF6F20' : 'transparent',
                  color: active ? 'white' : '#888',
                }}>
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List / grid */}
      <div style={{ padding: '0 14px 40px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>אין התראות</div>
          </div>
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {filtered.map(GridCard)}
          </div>
        ) : (
          groups.map((g, idx) => (
            <div key={`${g.label}-${idx}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: idx === 0 ? 4 : 14 }}>
                {g.isUnread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />}
                <div style={{ fontSize: 13, fontWeight: 600, color: g.isUnread ? '#dc2626' : '#888' }}>
                  {g.label} ({g.items.length})
                </div>
                {!g.isUnread && <div style={{ flex: 1, height: '0.5px', background: '#E5E5E5' }} />}
              </div>
              {g.items.map(ListCard)}
            </div>
          ))
        )}
      </div>

      {/* Send dialog (coach) */}
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
