import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// Listens for the global `athletigo:last-session` CustomEvent dispatched
// from useServiceDeduction when a personal package drops to remaining=1.
// Coach picks one of three Hebrew message tones to send the trainee a
// renewal nudge; the trainee responds via the existing notification
// response system (interested / not_now).

const buildMessages = (traineeName, packageName) => ([
  {
    id: 'friendly',
    label: 'ידידותי',
    text: `היי ${traineeName}! נותר לך מפגש אחרון בחבילת "${packageName}". בוא נדבר על המשך — יש לי הצעה מיוחדת בשבילך 💪`,
  },
  {
    id: 'professional',
    label: 'מקצועי',
    text: `${traineeName}, רציתי לעדכן שנותר מפגש אחד בחבילה הנוכחית. כדי לשמור על רצף האימונים וההתקדמות שלך, מומלץ לחדש את החבילה. נשמח לשוחח על האפשרויות.`,
  },
  {
    id: 'motivation',
    label: 'מוטיבציה',
    text: `${traineeName}, איזו דרך עשית! נשאר לך מפגש אחד לסיום החבילה. ההתקדמות שלך מרשימה ואני רוצה שנמשיך ביחד. מה אומר/ת, מחדשים? 🔥`,
  },
]);

export default function LastSessionAlert() {
  const [alert, setAlert] = useState(null); // { coachId, traineeId, traineeName, packageName }
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      const detail = e?.detail;
      if (!detail?.traineeId || !detail?.packageName) return;
      setSelected(null);
      setAlert(detail);
    };
    window.addEventListener('athletigo:last-session', handler);
    return () => window.removeEventListener('athletigo:last-session', handler);
  }, []);

  if (!alert) return null;

  const traineeName = alert.traineeName || 'המתאמן';
  const packageName = alert.packageName;
  const messages = buildMessages(traineeName, packageName);

  const dismiss = () => {
    setAlert(null);
    setSelected(null);
  };

  const handleSend = async () => {
    const msg = messages.find(m => m.id === selected);
    if (!msg) return;
    setSending(true);
    try {
      // Notification to trainee — uses existing package_expiring type so
      // the trainee popup shows interested / not_now response options.
      await base44.entities.Notification.create({
        user_id: alert.traineeId,
        type: 'package_expiring',
        title: 'חידוש חבילה',
        message: msg.text,
        is_read: false,
      });
      // Read confirmation to coach
      if (alert.coachId) {
        await base44.entities.Notification.create({
          user_id: alert.coachId,
          type: 'package_expiring',
          title: 'הודעת חידוש נשלחה',
          message: `שלחת הודעת חידוש (${msg.label}) ל${traineeName}`,
          is_read: true,
        });
      }
      toast.success('ההודעה נשלחה בהצלחה');
      dismiss();
    } catch (err) {
      console.error('[LastSessionAlert] send failed:', err);
      toast.error('שגיאה בשליחת ההודעה');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        bottom: 'var(--timer-bar-height, 0px)',
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 11000, padding: 20,
      }}
      // Backdrop NO-OPS — close only via "אח״כ" or after send.
      onClick={(e) => { e.stopPropagation(); }}
      onPointerDown={(e) => { e.stopPropagation(); }}
      onTouchStart={(e) => { e.stopPropagation(); }}
    >
      <div
        dir="rtl"
        style={{
          background: '#FFF9F0',
          borderRadius: 24,
          padding: 24,
          width: '100%',
          maxWidth: 360,
          maxHeight: '78vh',
          overflowY: 'auto',
          textAlign: 'right',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
            מפגש אחרון בחבילה
          </div>
          <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
            ל{traineeName} נותר מפגש אחד בחבילת "{packageName}"
          </div>
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 10 }}>
          בחר הודעה לשלוח למתאמן:
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
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
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
            {sending ? 'שולח...' : 'שלח למתאמן'}
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
