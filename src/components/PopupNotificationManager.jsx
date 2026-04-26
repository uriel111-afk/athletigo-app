import React, { useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import TraineeOnboardingAlert from "@/components/TraineeOnboardingAlert";
import SimpleSessionAlert from "@/components/SimpleSessionAlert";
import SessionFollowupDialog from "@/components/SessionFollowupDialog";

// Single mount-point that serializes every coach-side popup queue.
// Each tick:
//   1. Fetch unread notifications for these popup-worthy types
//      (onboarding_complete / session_confirmed / session_cancelled).
//   2. Fetch confirmed sessions that already happened in the last
//      3 days and the coach hasn't updated yet — those become
//      session-followup prompts.
//   3. Render them one at a time. When the coach dismisses the
//      current one, advance to the next.
//
// Mount this once at coach root (Dashboard / CoachHub). Trainees
// should NOT mount this — the popups are coach-only by design.

const POPUP_TYPES = ['onboarding_complete', 'session_confirmed', 'session_cancelled'];

export default function PopupNotificationManager() {
  const { user } = useContext(AuthContext);
  const isCoach = user?.is_coach === true || user?.role === 'coach' || user?.role === 'admin';
  const [queue, setQueue] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id || !isCoach) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const items = [];

      // ─ Notifications branch ────────────────────────────────
      try {
        const { data: notifs } = await supabase
          .from('notifications')
          .select('id, type, title, message, link, data, created_at')
          .eq('user_id', user.id)
          .in('type', POPUP_TYPES)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(10);
        for (const n of (notifs || [])) {
          items.push({ kind: n.type, key: `notif-${n.id}`, notif: n });
        }
      } catch (e) {
        console.warn('[PopupManager] notifications fetch failed:', e?.message);
      }

      // ─ Session-followup branch ────────────────────────────
      // Confirmed sessions whose date is in [today-3d, today-1d] and
      // the coach hasn't moved them off 'confirmed' (i.e., didn't yet
      // answer "what happened?"). The 3-day window keeps the prompt
      // relevant without surfacing forever-stale rows.
      try {
        const today = new Date().toISOString().split('T')[0];
        const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
        const { data: sessions } = await supabase
          .from('sessions')
          .select('id, date, time, trainee_id, service_id, status, trainee:trainee_id(full_name)')
          .eq('coach_id', user.id)
          .eq('status', 'confirmed')
          .gte('date', cutoff)
          .lt('date', today)
          .order('date', { ascending: true })
          .limit(5);
        for (const s of (sessions || [])) {
          items.push({ kind: 'session_followup', key: `sess-${s.id}`, session: s });
        }
      } catch (e) {
        console.warn('[PopupManager] session followup fetch failed:', e?.message);
      }

      if (!cancelled) {
        setQueue(items);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // user.id is the only meaningful change driver — re-running on
    // every render would cause popup flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isCoach]);

  if (!loaded || queue.length === 0) return null;
  const current = queue[0];
  const advance = () => setQueue((prev) => prev.slice(1));

  switch (current.kind) {
    case 'onboarding_complete':
      return <TraineeOnboardingAlert key={current.key} notif={current.notif} onClose={advance} />;
    case 'session_confirmed':
      return <SimpleSessionAlert key={current.key} notif={current.notif} variant="confirmed" onClose={advance} />;
    case 'session_cancelled':
      return <SimpleSessionAlert key={current.key} notif={current.notif} variant="cancelled" onClose={advance} />;
    case 'session_followup':
      return <SessionFollowupDialog key={current.key} session={current.session} onClose={advance} />;
    default:
      // Unknown kind — drop silently and continue.
      return <FallbackAdvance key={current.key} onMount={advance} />;
  }
}

// Tiny advance-on-mount helper for unknown queue entries; React
// can't call setState during render so this defers it to an effect.
function FallbackAdvance({ onMount }) {
  useEffect(() => { onMount?.(); }, [onMount]);
  return null;
}
