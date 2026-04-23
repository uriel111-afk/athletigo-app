import {
  getTypeIcon, getTypeTitle, getTypeBg,
  getResponseOptions, getResponseLabel,
  formatDate,
} from '@/utils/notificationHelpers';

// Trainee-side popup: shows full notification + type-based response
// buttons. After respond, the trainee_response is saved and the coach
// sees the status badge in their notifications view.

export default function NotificationResponsePopup({ notif, onClose, onRespond }) {
  if (!notif) return null;

  const responseOptions = getResponseOptions(notif.type);
  const alreadyResponded = !!notif.trainee_response;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 6000, padding: 20,
      }}
    >
      <div
        style={{
          background: '#FFF9F0',
          borderRadius: 24,
          padding: 24,
          width: '100%', maxWidth: 340,
          maxHeight: '85vh', overflowY: 'auto',
          direction: 'rtl',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 60, height: 60, borderRadius: 18,
          background: getTypeBg(notif.type),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, margin: '0 auto 16px',
        }}>{getTypeIcon(notif.type)}</div>

        {/* Title */}
        <div style={{
          fontSize: 20, fontWeight: 700, color: '#1a1a1a',
          textAlign: 'center', marginBottom: 8,
        }}>{notif.title || getTypeTitle(notif.type)}</div>

        {/* Message */}
        {notif.message && (
          <div style={{
            fontSize: 15, color: '#555',
            textAlign: 'center', lineHeight: 1.6,
            marginBottom: 20,
          }}>{notif.message}</div>
        )}

        {/* Time */}
        <div style={{
          fontSize: 12, color: '#aaa',
          textAlign: 'center', marginBottom: 20,
        }}>{formatDate(notif.created_at)}</div>

        {/* Already responded */}
        {alreadyResponded && (
          <div style={{
            textAlign: 'center', padding: 12,
            background: 'white', borderRadius: 14,
            marginBottom: 16, border: '0.5px solid #F0E4D0',
          }}>
            <div style={{ fontSize: 12, color: '#888' }}>התגובה שלך:</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#FF6F20', marginTop: 4 }}>
              {getResponseLabel(notif.trainee_response)}
            </div>
            {notif.responded_at && (
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                {formatDate(notif.responded_at)}
              </div>
            )}
          </div>
        )}

        {/* Response buttons */}
        {!alreadyResponded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {responseOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onRespond(notif.id, opt.value)}
                style={{
                  width: '100%', padding: 14, borderRadius: 14,
                  fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  background: opt.primary ? '#FF6F20' : 'white',
                  color: opt.primary ? 'white' : '#1a1a1a',
                  border: opt.primary ? 'none' : '0.5px solid #F0E4D0',
                  boxShadow: opt.primary ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >{opt.icon} {opt.label}</button>
            ))}
          </div>
        )}

        {/* Close */}
        <button onClick={onClose} style={{
          width: '100%', marginTop: 12, padding: 10,
          background: 'none', border: 'none',
          color: '#888', fontSize: 14, cursor: 'pointer',
        }}>סגור</button>
      </div>
    </div>
  );
}
