import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

// ── Brand tokens ─────────────────────────────────────────────────
const COLORS = {
  bg: '#FFF9F0', card: '#FFFFFF', border: '#FFE5D0',
  accent: '#FF6F20', danger: '#dc2626',
  text: '#1a1a1a', textMuted: '#6b7280',
};

// ── Helpers ──────────────────────────────────────────────────────
function isUnread(n) {
  // Bridge legacy is_read boolean and new read_at timestamptz.
  if (n.read_at) return false;
  if (n.is_read === true) return false;
  return true;
}

function formatShortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

function formatFullTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date} בשעה ${time}`;
}

// ── SectionBlock — collapsible group container ───────────────────
function SectionBlock({ icon, title, count, color, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 4px',
          marginBottom: open ? 10 : 0,
          borderBottom: open ? `2px solid ${COLORS.border}` : '2px solid transparent',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 15, color }}>{title}</span>
          <span style={{
            background: COLORS.card, color: COLORS.textMuted,
            fontSize: 12, padding: '1px 9px', borderRadius: 10, fontWeight: 600,
            border: `1px solid ${COLORS.border}`,
          }}>
            {count}
          </span>
        </div>
        <span style={{ color: COLORS.accent, fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── NotificationCard — compact collapsed / inline-expanded ───────
function NotificationCard({ notification, variant, onMarkRead, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [hasMarked, setHasMarked] = useState(false);
  const unread = variant === 'unread';
  const isCoachView = variant === 'coach';
  const isHigh = notification.priority === 'important' || notification.priority === 'high';
  const readByTrainee = !isUnread(notification);

  const handleToggle = () => {
    setExpanded(v => !v);
    // Mark read only on first expansion; don't re-mark on re-expand.
    if (!expanded && unread && !hasMarked) {
      setHasMarked(true);
      onMarkRead?.(notification);
    }
  };

  return (
    <div
      onClick={handleToggle}
      style={{
        background: unread ? COLORS.bg : COLORS.card,
        border: `1px solid ${unread ? COLORS.accent : COLORS.border}`,
        borderRight: `3px solid ${isHigh ? COLORS.danger : unread ? COLORS.accent : COLORS.border}`,
        borderRadius: 8,
        padding: expanded ? '14px 16px' : '10px 12px',
        marginBottom: 6,
        cursor: 'pointer',
        transition: 'padding 0.15s',
        boxShadow: unread ? '0 2px 6px rgba(255,111,32,0.08)' : 'none',
      }}
    >
      {/* Top row — dot + title + time + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {unread && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: COLORS.accent, flexShrink: 0,
          }} />
        )}
        {isCoachView && (
          <span style={{ fontSize: 12, flexShrink: 0 }} title={readByTrainee ? 'נקרא' : 'ממתין'}>
            {readByTrainee ? '✓' : '⏳'}
          </span>
        )}
        {isHigh && <span style={{ fontSize: 12, flexShrink: 0 }}>🔥</span>}
        <div style={{
          flex: 1, minWidth: 0,
          fontWeight: 700, fontSize: 14, color: COLORS.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {notification.title}
        </div>
        <span style={{ fontSize: 11, color: COLORS.textMuted, flexShrink: 0 }}>
          {formatShortTime(notification.created_at)}
        </span>
        <span style={{ color: COLORS.accent, fontSize: 12, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Message — preview when collapsed, full when expanded */}
      {notification.message && (
        <div style={{
          fontSize: expanded ? 14 : 13,
          color: expanded ? COLORS.text : COLORS.textMuted,
          lineHeight: expanded ? 1.6 : 1.3,
          marginTop: 6,
          whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
          overflow: expanded ? 'visible' : 'hidden',
          textOverflow: expanded ? 'clip' : 'ellipsis',
        }}>
          {notification.message}
        </div>
      )}

      {/* Full timestamp + delete, only when expanded */}
      {expanded && (
        <div style={{
          marginTop: 10, paddingTop: 8, borderTop: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>
            {isCoachView ? 'נשלח ב-' : 'התקבל ב-'}{formatFullTimestamp(notification.created_at)}
          </span>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(notification); }}
              style={{
                background: 'transparent', border: 'none', color: COLORS.textMuted,
                cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12,
              }}
              title="מחק התראה"
            >
              <Trash2 size={14} /> מחק
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
// Trainee view (isCoachView=false): unread / today / history
// Coach view (isCoachView=true):    today / thisWeek / history, no unread section
export default function TraineeNotificationsTab({ traineeId, isCoachView = false }) {
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['trainee-notifications', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', traineeId)
        .order('created_at', { ascending: false });
      if (error) { console.warn('[Notifications] load failed:', error); return []; }
      return data ?? [];
    },
    enabled: !!traineeId,
    staleTime: 10000,
  });

  const groups = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    if (isCoachView) {
      const today = [], thisWeek = [], older = [];
      for (const n of notifications) {
        const d = new Date(n.created_at);
        if (d >= startOfToday) today.push(n);
        else if (d >= startOfWeek) thisWeek.push(n);
        else older.push(n);
      }
      return { unread: [], today, thisWeek, older };
    }

    const unread = [], today = [], older = [];
    for (const n of notifications) {
      if (isUnread(n)) { unread.push(n); continue; }
      const d = new Date(n.created_at);
      if (d >= startOfToday) today.push(n);
      else older.push(n);
    }
    return { unread, today, thisWeek: [], older };
  }, [notifications, isCoachView]);

  async function markRead(n) {
    if (!n?.id) return;
    try {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString(), is_read: true })
        .eq('id', n.id);
      queryClient.invalidateQueries({ queryKey: ['trainee-notifications', traineeId] });
    } catch (e) { console.warn('[Notifications] mark read failed:', e); }
  }

  async function handleMarkAllRead() {
    const ids = groups.unread.map(n => n.id);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString(), is_read: true })
        .in('id', ids);
      if (error) { toast.error('שגיאה בסימון: ' + error.message); return; }
      queryClient.invalidateQueries({ queryKey: ['trainee-notifications', traineeId] });
      toast.success('כל ההתראות סומנו כנקראו');
    } catch {
      toast.error('שגיאה לא צפויה');
    }
  }

  async function handleDelete(n) {
    if (!window.confirm('למחוק התראה זו?')) return;
    try {
      const { error } = await supabase.from('notifications').delete().eq('id', n.id);
      if (error) { toast.error('שגיאה במחיקה: ' + error.message); return; }
      queryClient.invalidateQueries({ queryKey: ['trainee-notifications', traineeId] });
    } catch {}
  }

  const total = notifications.length;

  return (
    <div style={{ background: COLORS.bg, borderRadius: 12, padding: 16 }} dir="rtl">

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 17 }}>
          🔔 {isCoachView ? 'התראות שנשלחו' : 'ההתראות שלך'}
        </div>
        {!isCoachView && groups.unread.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              background: 'transparent', color: COLORS.accent,
              border: `1px solid ${COLORS.accent}`, borderRadius: 8,
              padding: '6px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            סמן הכל כנקרא
          </button>
        )}
      </div>

      {/* Unread — trainee only, open by default */}
      {!isCoachView && groups.unread.length > 0 && (
        <SectionBlock icon="🔴" title="לא נקראו" count={groups.unread.length}
          color={COLORS.accent} defaultOpen={true}>
          {groups.unread.map(n => (
            <NotificationCard key={n.id} notification={n} variant="unread"
              onMarkRead={markRead} onDelete={handleDelete} />
          ))}
        </SectionBlock>
      )}

      {/* Today — open by default */}
      {groups.today.length > 0 && (
        <SectionBlock icon="📅" title="היום" count={groups.today.length}
          color={COLORS.text} defaultOpen={true}>
          {groups.today.map(n => (
            <NotificationCard key={n.id} notification={n}
              variant={isCoachView ? 'coach' : 'read'}
              onMarkRead={markRead} onDelete={handleDelete} />
          ))}
        </SectionBlock>
      )}

      {/* This week — coach view only, open by default */}
      {isCoachView && groups.thisWeek.length > 0 && (
        <SectionBlock icon="🗓️" title="השבוע" count={groups.thisWeek.length}
          color={COLORS.text} defaultOpen={true}>
          {groups.thisWeek.map(n => (
            <NotificationCard key={n.id} notification={n} variant="coach"
              onMarkRead={markRead} onDelete={handleDelete} />
          ))}
        </SectionBlock>
      )}

      {/* History — closed by default on both sides */}
      {groups.older.length > 0 && (
        <SectionBlock icon="📜" title="היסטוריה" count={groups.older.length}
          color={COLORS.text} defaultOpen={false}>
          {groups.older.map(n => (
            <NotificationCard key={n.id} notification={n}
              variant={isCoachView ? 'coach' : 'read'}
              onMarkRead={markRead} onDelete={handleDelete} />
          ))}
        </SectionBlock>
      )}

      {/* Empty state */}
      {total === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: COLORS.textMuted,
          background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text }}>
            אין התראות עדיין
          </div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            כשתישלח התראה, היא תופיע כאן
          </div>
        </div>
      )}
    </div>
  );
}
