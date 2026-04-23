import React, { useState, useEffect } from 'react';

const getIcon = (type) => {
  if (!type) return '🔔';
  if (type === 'birthday') return '🎂';
  if (type === 'package_expiring' || type === 'low_balance' || type === 'renewal_alert') return '⚠️';
  if (type?.includes('package') || type?.includes('renewal')) return '🎫';
  if (type === 'session_reminder') return '⏰';
  if (type?.includes('session') || type === 'reschedule_request') return '📅';
  if (type?.includes('plan')) return '📋';
  if (type?.includes('measurement') || type?.includes('baseline') || type === 'metrics_updated') return '📏';
  if (type?.includes('record') || type?.includes('goal')) return '🏆';
  if (type === 'new_message' || type === 'coach_message') return '💬';
  return '🔔';
};

const NotificationPopup = ({ notification, onDismiss, onTap }) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (notification) {
      setVisible(true);
      setExiting(false);
      const timer = setTimeout(() => {
        setExiting(true);
        setTimeout(() => {
          setVisible(false);
          onDismiss();
        }, 300);
      }, 5000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification]);

  if (!visible || !notification) return null;

  return (
    <div
      onClick={() => { onTap(notification); onDismiss(); }}
      style={{
        position: 'fixed',
        top: '16px',
        left: '16px',
        right: '16px',
        zIndex: 15000,
        background: 'white',
        borderRadius: '16px',
        padding: '14px 16px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
        border: '1.5px solid #FF6F20',
        direction: 'rtl',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        animation: exiting
          ? 'athletigoNotifSlideOut 0.3s ease forwards'
          : 'athletigoNotifSlideIn 0.3s ease forwards',
      }}
    >
      <div style={{
        width: '40px', height: '40px',
        borderRadius: '12px',
        background: '#FFF0E4',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px', flexShrink: 0,
      }}>{getIcon(notification.type)}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px', fontWeight: 600,
          color: '#1a1a1a',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{notification.message || notification.title || 'התראה חדשה'}</div>
        <div style={{
          fontSize: '11px', color: '#888',
          marginTop: '2px',
        }}>עכשיו</div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setExiting(true);
          setTimeout(() => { setVisible(false); onDismiss(); }, 300);
        }}
        style={{
          background: 'none', border: 'none',
          color: '#888', fontSize: '16px',
          cursor: 'pointer', padding: '4px',
          flexShrink: 0,
        }}
      >✕</button>

      <style>{`
        @keyframes athletigoNotifSlideIn {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes athletigoNotifSlideOut {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-100%); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default NotificationPopup;
