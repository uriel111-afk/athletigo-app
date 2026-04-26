import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { createPageUrl } from "@/utils";

// Lightweight confirm/cancel popup the coach sees when a trainee
// approves or cancels a session. Shape parallels TraineeOnboardingAlert
// but the body is just the notification's own message — no fetch needed.
//
// variant = 'confirmed' (green border) | 'cancelled' (red border)

const VARIANT_STYLE = {
  confirmed: { color: '#16A34A', icon: '✅' },
  cancelled: { color: '#E24B4A', icon: '❌' },
};

export default function SimpleSessionAlert({ notif, variant, onClose }) {
  const navigate = useNavigate();
  const v = VARIANT_STYLE[variant] || VARIANT_STYLE.confirmed;
  const traineeId = notif?.data?.trainee_id || null;

  const dismiss = async () => {
    try {
      if (notif?.id) {
        await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
      }
    } catch (e) { console.warn('[SimpleSessionAlert] mark-read failed:', e?.message); }
    onClose?.();
  };

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 20000,
        animation: 'ssa-fade 0.2s ease-out',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <style>{`
        @keyframes ssa-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ssa-rise { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#FFFFFF', borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        borderRight: `4px solid ${v.color}`,
        overflow: 'hidden',
        animation: 'ssa-rise 0.25s ease-out',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}>
        <div style={{
          padding: '20px 24px',
          textAlign: 'right',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: v.color, marginBottom: 6 }}>
            {v.icon} {notif?.title || ''}
          </div>
          <div style={{ fontSize: 14, color: '#1A1A1A', lineHeight: 1.5 }}>
            {notif?.message || ''}
          </div>
        </div>
        <div style={{
          padding: '12px 16px 16px',
          display: 'flex', gap: 8,
          borderTop: '1px solid #F0E4D0',
        }}>
          {traineeId && (
            <button
              type="button"
              onClick={async () => {
                await dismiss();
                navigate(createPageUrl('TraineeProfile') + `?userId=${traineeId}`);
              }}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
                background: '#FF6F20', color: '#FFFFFF',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
              }}
            >פרטים</button>
          )}
          <button
            type="button"
            onClick={dismiss}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid #E5E7EB', background: '#FFFFFF',
              color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >הבנתי ✓</button>
        </div>
      </div>
    </div>
  );
}
