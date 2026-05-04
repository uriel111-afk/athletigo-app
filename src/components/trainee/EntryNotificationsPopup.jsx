import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const ICON = (type) => {
  if (!type) return '🔔';
  if (type === 'birthday') return '🎂';
  if (type?.includes('package') || type?.includes('renewal')) return '🎫';
  if (type === 'session_reminder') return '⏰';
  if (type?.includes('session')) return '📅';
  if (type?.includes('plan')) return '📋';
  if (type?.includes('record') || type?.includes('goal')) return '🏆';
  if (type?.includes('measurement') || type?.includes('baseline')) return '📏';
  if (type === 'new_message' || type === 'coach_message') return '💬';
  if (type === 'new_record') return '🏆';
  return '🔔';
};

const fmtRelative = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.max(0, Date.now() - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} ד׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString('he-IL');
};

// Trainee entry popup #2 — appears after PendingSessionsPopup closes
// (or directly if there were no pending sessions). Shows up to 10
// unread notifications with טופל / מאוחר יותר / מחק actions per row.
// Self-closes when the queue empties or when the trainee taps X.
export default function EntryNotificationsPopup({ trainee, onClose }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const traineeId = trainee?.id;

  // localStorage defense layer — when a dismiss action's DB write
  // fails silently (RLS / network), the id stored here still
  // suppresses the notification on the next entry. Keys are
  // notification ids (UUIDs); the array is bounded to last 200
  // entries so the storage doesn't grow forever.
  const DISMISSED_KEY = 'dismissed_notifications';
  const readDismissed = () => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  };
  const pushDismissed = (id) => {
    try {
      const arr = readDismissed();
      if (arr.includes(id)) return;
      arr.push(id);
      const trimmed = arr.slice(-200);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(trimmed));
    } catch {}
  };

  const fetchNotifs = useCallback(async () => {
    if (!traineeId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, created_at, is_read, status, user_id')
        .eq('user_id', traineeId)
        .eq('is_read', false)
        .or('status.is.null,status.neq.deleted')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        console.warn('[EntryNotifs] fetch failed:', error.message);
        setNotifs([]);
        return;
      }
      // Filter out anything already dismissed locally — covers the
      // "DB write failed but trainee tapped dismiss" edge case.
      const dismissed = readDismissed();
      const filtered = (data || []).filter((n) => !dismissed.includes(n.id));
      setNotifs(filtered);
    } finally {
      setLoading(false);
    }
  }, [traineeId]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  // Auto-close on empty queue.
  useEffect(() => {
    if (!loading && notifs.length === 0) {
      const t = setTimeout(() => onClose?.(), 250);
      return () => clearTimeout(t);
    }
  }, [loading, notifs.length, onClose]);

  const removeLocal = (id) => {
    pushDismissed(id);
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const markRead = async (id) => {
    setBusyId(id);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
      removeLocal(id);
    } catch (e) {
      console.warn('[EntryNotifs] mark read failed:', e?.message);
      // Still suppress locally so a transient DB failure doesn't
      // re-prompt on the next entry.
      removeLocal(id);
      toast.error('שגיאה בעדכון');
    } finally { setBusyId(null); }
  };

  const markHandled = async (id) => {
    setBusyId(id);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          status: 'handled',
          handled_at: new Date().toISOString(),
          is_read: true,
        })
        .eq('id', id);
      if (error) throw error;
      removeLocal(id);
    } catch (e) {
      console.warn('[EntryNotifs] mark handled failed:', e?.message);
      removeLocal(id);
      toast.error('שגיאה בעדכון');
    } finally { setBusyId(null); }
  };

  const softDelete = async (id) => {
    if (!window.confirm('למחוק את ההתראה?')) return;
    setBusyId(id);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      removeLocal(id);
    } catch (e) {
      console.warn('[EntryNotifs] delete failed:', e?.message);
      removeLocal(id);
      toast.error('שגיאה במחיקה');
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
      {/* Soft header — no orange gradient like the sessions popup,
          since these are informational rather than action-required. */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #F0E4D0',
        padding: '20px 16px',
        position: 'relative',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          style={{
            position: 'absolute', top: 14, left: 14,
            width: 32, height: 32, borderRadius: 999,
            background: '#FFF5EE', color: '#FF6F20',
            border: 'none', fontSize: 18, cursor: 'pointer',
          }}
        >✕</button>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1A1A', marginBottom: 4 }}>
          🔔 התראות חדשות עבורך
        </div>
        <div style={{ fontSize: 13, color: '#888' }}>
          סגור ב-✕ או טפל בכל התראה כדי להמשיך
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>טוען...</div>
        )}
        {!loading && notifs.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>
            אין התראות חדשות — סוגר...
          </div>
        )}
        {notifs.map(n => {
          const busy = busyId === n.id;
          return (
            <div
              key={n.id}
              style={{
                background: 'white', borderRadius: 14, padding: 14,
                border: '1px solid #F0E4D0', marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: '#FFF0E4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>{ICON(n.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {n.title && (
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>
                      {n.title}
                    </div>
                  )}
                  {n.message && (
                    <div style={{ fontSize: 13, color: '#555', marginTop: 2, lineHeight: 1.5 }}>
                      {n.message}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                    {fmtRelative(n.created_at)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => markHandled(n.id)}
                  style={{
                    flex: 1, height: 40, borderRadius: 10, border: 'none',
                    background: '#FF6F20', color: 'white',
                    fontSize: 13, fontWeight: 600,
                    cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    fontFamily: "'Heebo', 'Assistant', sans-serif",
                  }}
                >✓ טופל</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => markRead(n.id)}
                  style={{
                    flex: 1, height: 40, borderRadius: 10,
                    border: '1px solid #F0E4D0',
                    background: 'white', color: '#555',
                    fontSize: 13, fontWeight: 500,
                    cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    fontFamily: "'Heebo', 'Assistant', sans-serif",
                  }}
                >מאוחר יותר</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => softDelete(n.id)}
                  aria-label="מחק"
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    border: '1px solid #F0E4D0',
                    background: 'white', color: '#DC2626',
                    fontSize: 14, cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                  }}
                >🗑</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
