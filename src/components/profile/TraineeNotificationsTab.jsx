import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

// ── Brand tokens ──────────────────────────────────────────────────
const COLORS = {
  bg: '#FFF9F0', card: '#FFFFFF', border: '#FFE5D0',
  accent: '#FF6F20', danger: '#dc2626',
  text: '#1a1a1a', textMuted: '#6b7280',
};

// ── Helpers ───────────────────────────────────────────────────────
function isUnread(n) {
  // Bridge the legacy `is_read` boolean and the new `read_at` timestamptz.
  if (n.read_at) return false;
  if (n.is_read === true) return false;
  return true;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

// ── Subcomponents ────────────────────────────────────────────────
function SectionBlock({ icon, title, count, color, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${COLORS.border}`,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 16, color }}>{title}</span>
        <span style={{
          background: COLORS.card, color: COLORS.textMuted,
          fontSize: 13, padding: '2px 10px', borderRadius: 10, fontWeight: 600,
        }}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function NotificationCard({ notification, variant, onClick, onDelete }) {
  const unread = variant === 'unread';
  const isCoachView = variant === 'coach';
  const isHigh = notification.priority === 'important' || notification.priority === 'high';
  const readByTrainee = !isUnread(notification);

  return (
    <div
      onClick={onClick}
      style={{
        background: unread ? COLORS.bg : COLORS.card,
        border: `1px solid ${unread ? COLORS.accent : COLORS.border}`,
        borderRight: `3px solid ${isHigh ? COLORS.danger : unread ? COLORS.accent : COLORS.border}`,
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        cursor: 'pointer',
        boxShadow: unread ? '0 2px 6px rgba(255,111,32,0.08)' : 'none',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'start',
        marginBottom: 6, gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {unread && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: COLORS.accent, flexShrink: 0,
            }} />
          )}
          {isCoachView && (
            <span style={{ fontSize: 14, flexShrink: 0 }} title={readByTrainee ? 'נקרא' : 'ממתין'}>
              {readByTrainee ? '✓' : '⏳'}
            </span>
          )}
          {isHigh && <span style={{ fontSize: 14, flexShrink: 0 }}>🔥</span>}
          <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.text, lineHeight: 1.3 }}>
            {notification.title}
          </div>
        </div>
        <div style={{
          fontSize: 12, color: COLORS.textMuted, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {isCoachView ? 'נשלח ב-' : ''}{formatTime(notification.created_at)}
        </div>
      </div>
      <div style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.6, marginTop: 4, whiteSpace: 'pre-line' }}>
        {notification.message}
      </div>
      {onDelete && (
        <div style={{ marginTop: 8, textAlign: 'left' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(notification); }}
            style={{
              background: 'transparent', border: 'none', color: COLORS.textMuted,
              cursor: 'pointer', padding: 4,
            }}
            title="מחק התראה"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function CollapsibleHistory({ count, notifications, onItemClick, onDelete, variant = 'read' }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.border}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 16,
    }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📜</span>
          <span style={{ fontWeight: 700, color: COLORS.text, fontSize: 15 }}>היסטוריית התראות</span>
          <span style={{
            background: COLORS.bg, color: COLORS.textMuted,
            fontSize: 12, padding: '2px 8px', borderRadius: 10,
          }}>
            {count}
          </span>
        </div>
        <span style={{ color: COLORS.accent, fontSize: 14 }}>{open ? '▼' : '◀'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 14px 14px 14px' }}>
          {notifications.map(n => (
            <NotificationCard
              key={n.id}
              notification={n}
              variant={variant}
              onClick={() => onItemClick(n)}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────
// When isCoachView=true: shows what the coach sent to this trainee,
// grouped by היום / השבוע / היסטוריה, with ✓/⏳ status icons.
// When isCoachView=false: trainee view — unread / today / history.
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
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday = start of week (ISR)

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

  async function handleOpen(n) {
    // Only the trainee side marks read. Coach viewing doesn't mutate.
    if (!isCoachView && isUnread(n)) {
      try {
        await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString(), is_read: true })
          .eq('id', n.id);
        queryClient.invalidateQueries({ queryKey: ['trainee-notifications', traineeId] });
      } catch (e) { console.warn('[Notifications] mark read failed:', e); }
    }
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
    } catch (e) {
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

      {/* Unread — trainee only */}
      {!isCoachView && groups.unread.length > 0 && (
        <SectionBlock icon="🔴" title="לא נקראו" count={groups.unread.length} color={COLORS.accent}>
          {groups.unread.map(n => (
            <NotificationCard key={n.id} notification={n} variant="unread"
              onClick={() => handleOpen(n)} onDelete={handleDelete} />
          ))}
        </SectionBlock>
      )}

      {/* Today */}
      {groups.today.length > 0 && (
        <SectionBlock icon="📅" title="היום" count={groups.today.length} color={COLORS.text}>
          {groups.today.map(n => (
            <NotificationCard key={n.id} notification={n}
              variant={isCoachView ? 'coach' : 'read'}
              onClick={() => handleOpen(n)} onDelete={handleDelete} />
          ))}
        </SectionBlock>
      )}

      {/* This week — coach view only */}
      {isCoachView && groups.thisWeek.length > 0 && (
        <SectionBlock icon="🗓️" title="השבוע" count={groups.thisWeek.length} color={COLORS.text}>
          {groups.thisWeek.map(n => (
            <NotificationCard key={n.id} notification={n} variant="coach"
              onClick={() => handleOpen(n)} onDelete={handleDelete} />
          ))}
        </SectionBlock>
      )}

      {/* History — collapsible */}
      {groups.older.length > 0 && (
        <CollapsibleHistory
          count={groups.older.length}
          notifications={groups.older}
          onItemClick={handleOpen}
          onDelete={handleDelete}
          variant={isCoachView ? 'coach' : 'read'}
        />
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
