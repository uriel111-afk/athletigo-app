import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// Listens for the global `athletigo:birthday-tap` CustomEvent dispatched
// from Notifications.jsx when the coach taps a birthday notification.
// The coach picks one of three Hebrew tones; the message is sent to the
// trainee as a `birthday` notification (the trainee popup shows a single
// "תודה!" response option via getResponseOptions).

const BUILD_MESSAGES = (name, age) => ([
  {
    id: 'warm',
    label: 'חם ואישי',
    text: `${name} יקר/ה! 🎂\nמזל טוב ליום הולדת ${age}!\nשמח/ה שאת/ה חלק מהמסע שלנו.\nשתהיה שנה של בריאות, כוח והגשמה! 💪🎉`,
  },
  {
    id: 'sport',
    label: 'מקצועי וספורטיבי',
    text: `יום הולדת שמח ${name}! 🎂\n${age} שנים של כוח!\nממשיכים לשבור שיאים ביחד 💪\n— המאמן שלך`,
  },
  {
    id: 'short',
    label: 'קצר ומתוק',
    text: `🎂 מזל טוב ${name}!\nשנה מדהימה ומלאת הצלחות! 🎉💪`,
  },
]);

export default function BirthdayBlessingPopup() {
  const [data, setData] = useState(null); // { coachId, traineeId, name, age }
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      const detail = e?.detail;
      if (!detail?.traineeId || !detail?.name) return;
      setSelected(null);
      setData(detail);
    };
    window.addEventListener('athletigo:birthday-tap', handler);
    return () => window.removeEventListener('athletigo:birthday-tap', handler);
  }, []);

  if (!data) return null;

  const messages = BUILD_MESSAGES(data.name, data.age);
  const dismiss = () => { setData(null); setSelected(null); };

  const handleSend = async () => {
    const msg = messages.find(m => m.id === selected);
    if (!msg) return;
    setSending(true);
    try {
      await base44.entities.Notification.create({
        user_id: data.traineeId,
        trainee_id: data.traineeId,
        type: 'birthday',
        title: 'יום הולדת שמח!',
        message: msg.text,
        is_read: false,
      });
      toast.success('🎂 הברכה נשלחה!');
      dismiss();
    } catch (err) {
      console.error('[BirthdayBlessing] send failed:', err);
      toast.error('שגיאה בשליחת הברכה');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      // Backdrop NO-OPS — close only via the "אח״כ" button or
      // after a successful send (DEFINITIVE — no accidental closes).
      onClick={(e) => { e.stopPropagation(); }}
      onPointerDown={(e) => { e.stopPropagation(); }}
      onTouchStart={(e) => { e.stopPropagation(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 11000, padding: 20,
      }}
    >
      <div
        dir="rtl"
        style={{
          background: '#FFF9F0',
          borderRadius: 24,
          padding: 24,
          width: '100%',
          maxWidth: 360,
          maxHeight: '90vh',
          overflowY: 'auto',
          textAlign: 'right',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎂</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
            יום הולדת!
          </div>
          <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
            {data.name} חוגג/ת {data.age}
          </div>
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 10 }}>
          בחר ברכה לשלוח:
        </div>

        {messages.map(m => {
          const isSelected = selected === m.id;
          return (
            <div
              key={m.id}
              onClick={() => setSelected(m.id)}
              style={{
                background: isSelected ? '#FFF0E4' : 'white',
                border: isSelected ? '2px solid #FF6F20' : '0.5px solid #F0E4D0',
                borderRadius: 14,
                padding: 12,
                marginBottom: 8,
                cursor: 'pointer',
                transition: 'border 0.15s, background 0.15s',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#FF6F20', marginBottom: 4 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {m.text}
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={!selected || sending}
            style={{
              flex: 1, padding: 12, borderRadius: 14, border: 'none',
              background: selected && !sending ? '#FF6F20' : '#ccc',
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: selected && !sending ? 'pointer' : 'default',
            }}
          >
            {sending ? 'שולח...' : '🎉 שלח ברכה'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={sending}
            style={{
              padding: '12px 16px', borderRadius: 14,
              border: '0.5px solid #F0E4D0', background: 'white',
              color: '#888', fontSize: 14, cursor: 'pointer',
            }}
          >אח"כ</button>
        </div>
      </div>
    </div>
  );
}
