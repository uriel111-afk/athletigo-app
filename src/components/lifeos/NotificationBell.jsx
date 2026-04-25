import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import { generateNotifications, dismissNotification } from '@/lib/lifeos/notification-engine';

export default function NotificationBell({ userId }) {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await generateNotifications(userId);
      setNotifs(list);
    } catch (err) {
      console.error('[NotificationBell] load error:', err);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e) => {
      if (!open) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleTap = (n) => {
    dismissNotification(n.id);
    setNotifs(prev => prev.filter(x => x.id !== n.id));
    setOpen(false);
    navigate(n.href);
  };

  const handleDismiss = (e, n) => {
    e.stopPropagation();
    dismissNotification(n.id);
    setNotifs(prev => prev.filter(x => x.id !== n.id));
  };

  const count = notifs.length;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 36, height: 36, borderRadius: 10, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}
        aria-label="התראות"
      >
        <Bell size={20} color={LIFEOS_COLORS.textPrimary} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, backgroundColor: LIFEOS_COLORS.error, color: '#FFFFFF',
            fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, left: 0, minWidth: 280, maxWidth: 340,
          zIndex: 200, borderRadius: 12,
          backgroundColor: '#FFFFFF', border: `1px solid ${LIFEOS_COLORS.border}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: 420, overflowY: 'auto',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${LIFEOS_COLORS.border}`,
            fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary,
          }}>
            התראות {count > 0 ? `(${count})` : ''}
          </div>
          {count === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>
              אין התראות חדשות 🎉
            </div>
          ) : notifs.map(n => (
            <div
              key={n.id}
              onClick={() => handleTap(n)}
              style={{
                padding: '10px 14px',
                borderBottom: `0.5px solid ${LIFEOS_COLORS.border}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: LIFEOS_COLORS.textPrimary, lineHeight: 1.45 }}>
                  {n.text}
                </div>
              </div>
              <button
                onClick={(e) => handleDismiss(e, n)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: LIFEOS_COLORS.textSecondary, fontSize: 16,
                }}
                aria-label="סגור"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
