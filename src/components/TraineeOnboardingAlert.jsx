import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { generateTraineeSummary } from "@/lib/onboardingSummary";
import { createPageUrl } from "@/utils";

// Orange "trainee finished onboarding" popup. The PopupNotificationManager
// passes the raw notification row; this component fetches the trainee's
// users row + their first booked session, builds the Hebrew summary,
// and renders the card.

export default function TraineeOnboardingAlert({ notif, onClose }) {
  const navigate = useNavigate();
  const [trainee, setTrainee] = useState(null);
  const [loading, setLoading] = useState(true);

  const traineeId = notif?.data?.trainee_id || null;
  const traineeName = notif?.data?.trainee_name || '';

  useEffect(() => {
    if (!traineeId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // Pull the user row + their soonest upcoming session to
        // include "first session" in the summary line.
        const today = new Date().toISOString().split('T')[0];
        const [{ data: userRow }, { data: sessions }] = await Promise.all([
          supabase.from('users').select('*').eq('id', traineeId).maybeSingle(),
          supabase.from('sessions')
            .select('date, time')
            .eq('trainee_id', traineeId)
            .gte('date', today)
            .order('date', { ascending: true })
            .limit(1),
        ]);
        if (cancelled) return;
        const next = sessions?.[0];
        const composed = {
          ...(userRow || { full_name: traineeName, id: traineeId }),
          health_declaration_signed: true,
          first_session_label: next
            ? (() => {
                const d = new Date(next.date);
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                return `${dd}/${mm}/${yyyy}${next.time ? ` בשעה ${next.time.slice(0,5)}` : ''}`;
              })()
            : null,
        };
        setTrainee(composed);
      } catch (e) {
        console.warn('[TraineeOnboardingAlert] fetch failed:', e?.message);
        // Fall back to whatever name we already have so the popup
        // still shows something useful.
        if (!cancelled) setTrainee({ full_name: traineeName, id: traineeId, health_declaration_signed: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [traineeId, traineeName]);

  // Mark the notification as read in the background — the popup's
  // appearance counts as "delivered". Both action buttons close the
  // popup; the read-flag is set on either path.
  const dismiss = async () => {
    try {
      if (notif?.id) {
        await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
      }
    } catch (e) { console.warn('[TraineeOnboardingAlert] mark-read failed:', e?.message); }
    onClose?.();
  };

  const summary = trainee ? generateTraineeSummary(trainee) : '';

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 20000,
        animation: 'oba-fade 0.2s ease-out',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <style>{`
        @keyframes oba-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes oba-rise { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#FFFFFF', borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        animation: 'oba-rise 0.25s ease-out',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}>
        {/* Orange header */}
        <div style={{
          background: '#FF6F20', color: '#FFFFFF',
          padding: 16, fontSize: 18, fontWeight: 700,
          textAlign: 'right',
        }}>
          🎉 מתאמן/ת חדש/ה השלים/ה הרשמה!
        </div>

        {/* Body — narrative summary, line-broken */}
        <div style={{
          padding: 24,
          fontSize: 14, lineHeight: 1.7,
          color: '#1A1A1A', whiteSpace: 'pre-line',
          textAlign: 'right',
          maxHeight: '60vh', overflowY: 'auto',
        }}>
          {loading ? 'טוען פרטים…' : (summary || `${traineeName} השלים/ה את תהליך ההרשמה.`)}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px 16px',
          display: 'flex', flexDirection: 'column', gap: 8,
          borderTop: '1px solid #F0E4D0',
        }}>
          <button
            type="button"
            onClick={async () => {
              await dismiss();
              if (traineeId) navigate(createPageUrl('TraineeProfile') + `?userId=${traineeId}`);
            }}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
              background: '#FF6F20', color: '#FFFFFF',
              fontSize: 15, fontWeight: 800, cursor: 'pointer',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >צפה בפרופיל →</button>
          <button
            type="button"
            onClick={dismiss}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 10, border: 'none',
              background: 'transparent', color: '#6B7280',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >אחר כך</button>
        </div>
      </div>
    </div>
  );
}
