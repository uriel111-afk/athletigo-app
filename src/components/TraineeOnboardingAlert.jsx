import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { createPageUrl } from "@/utils";

// Coach-facing popup that fires when a trainee finishes onboarding.
// Renders the title + message exactly as Onboarding.jsx wrote them
// (no re-fetch / re-summary) — the trainee's name is already in the
// title and the storytelling summary in the message. The trainee_id
// rides in the title as `[uuid]` so we can wire the "צפה בפרופיל"
// button without depending on the optional `link` / `data` columns.

const UUID_RE = /\[([0-9a-f-]{36})\]/i;

export default function TraineeOnboardingAlert({ notif, onClose }) {
  const navigate = useNavigate();

  // Trainee id resolution chain: data jsonb (if available) → uuid
  // bracketed in title → null. The display title strips the bracket
  // so it never leaks to the UI.
  const titleRaw = notif?.title || '';
  const idFromTitle = titleRaw.match(UUID_RE)?.[1];
  const traineeId = notif?.data?.trainee_id || idFromTitle || null;
  const titleClean = titleRaw.replace(UUID_RE, '').trim() || '🎉 מתאמן חדש השלים את תהליך ההרשמה';
  const messageText = notif?.message || '';

  const markRead = async () => {
    try {
      if (notif?.id) {
        await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
      }
    } catch (e) { console.warn('[TraineeOnboardingAlert] mark-read failed:', e?.message); }
  };

  const handleViewProfile = async () => {
    await markRead();
    if (traineeId) {
      navigate(createPageUrl('TraineeProfile') + `?userId=${traineeId}`);
    }
    onClose?.();
  };

  const handleLater = async () => {
    await markRead();
    onClose?.();
  };

  const handleClose = () => onClose?.();

  return (
    <div
      dir="rtl"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 14, padding: 24,
          maxWidth: 360, width: '90%',
          position: 'relative', textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}
      >
        {/* X — top-left in RTL */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="סגור"
          style={{
            position: 'absolute', top: 10, left: 10,
            background: 'none', border: 'none',
            fontSize: 22, cursor: 'pointer', color: '#888',
            padding: 4, lineHeight: 1,
          }}
        >✕</button>

        <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>

        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#1A1A1A', lineHeight: 1.4 }}>
          {titleClean}
        </div>

        {messageText && (
          <div style={{
            fontSize: 14, color: '#555', lineHeight: 1.7,
            marginBottom: 20, whiteSpace: 'pre-line',
            maxHeight: '50vh', overflowY: 'auto',
            textAlign: 'right',
          }}>
            {messageText}
          </div>
        )}

        <button
          type="button"
          onClick={handleViewProfile}
          style={{
            width: '100%', padding: 14, borderRadius: 14, border: 'none',
            background: '#FF6F20', color: 'white', fontSize: 16,
            fontWeight: 600, cursor: 'pointer', marginBottom: 8,
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >👤 צפה בפרופיל</button>

        <button
          type="button"
          onClick={handleLater}
          style={{
            width: '100%', padding: 12, borderRadius: 12,
            border: '1px solid #F0E4D0', background: 'white',
            color: '#888', fontSize: 14, cursor: 'pointer',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >אחר כך</button>
      </div>
    </div>
  );
}
