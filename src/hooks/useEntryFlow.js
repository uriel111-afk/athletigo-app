import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Pending status values across the schema legacy:
//   English: 'pending', 'scheduled'
//   Hebrew:  'ממתין', 'מתוכנן', 'ממתין לאישור'
const PENDING_STATUSES = ['pending', 'scheduled', 'ממתין', 'מתוכנן', 'ממתין לאישור'];

const todayISO = () => new Date().toISOString().split('T')[0];

const wasShownToday = (key) => {
  try { return localStorage.getItem(key) === todayISO(); } catch { return false; }
};
const markShownToday = (key) => {
  try { localStorage.setItem(key, todayISO()); } catch {}
};

// Trainee entry-flow controller: pending-sessions popup → notifications
// popup → home. Skipped entirely while client_status === 'onboarding'
// (the wizard takes over). Each popup is throttled to once per day per
// user via localStorage so a refresh doesn't re-pop.
export function useEntryFlow(trainee) {
  const [showSessions, setShowSessions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingSessionsCount, setPendingSessionsCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  const checkAndShowNotifications = useCallback(async () => {
    if (!trainee?.id) return;
    const key = `notifications_last_shown_${trainee.id}`;
    if (wasShownToday(key)) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', trainee.id)
        .eq('is_read', false)
        .or('status.is.null,status.neq.deleted');
      if (error) {
        console.warn('[EntryFlow] notifications count failed:', error.message);
        return;
      }
      const n = count || 0;
      setUnreadNotificationsCount(n);
      if (n > 0) {
        setShowNotifications(true);
        markShownToday(key);
      }
    } catch (e) {
      console.warn('[EntryFlow] notifications check threw:', e?.message);
    }
  }, [trainee?.id]);

  const checkAndShowSessions = useCallback(async () => {
    if (!trainee?.id) return;
    const key = `pending_sessions_last_shown_${trainee.id}`;
    if (wasShownToday(key)) {
      // Skip the popup but still continue down the chain.
      checkAndShowNotifications();
      return;
    }
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('id')
        .eq('trainee_id', trainee.id)
        .in('status', PENDING_STATUSES);
      if (error) {
        console.warn('[EntryFlow] sessions query failed:', error.message);
        checkAndShowNotifications();
        return;
      }
      const n = (data || []).length;
      setPendingSessionsCount(n);
      if (n > 0) {
        setShowSessions(true);
        markShownToday(key);
      } else {
        checkAndShowNotifications();
      }
    } catch (e) {
      console.warn('[EntryFlow] sessions check threw:', e?.message);
      checkAndShowNotifications();
    }
  }, [trainee?.id, checkAndShowNotifications]);

  useEffect(() => {
    if (!trainee?.id) return;
    if (trainee.client_status === 'onboarding') return; // wizard owns this user
    checkAndShowSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainee?.id, trainee?.client_status]);

  const closeSessions = useCallback(() => {
    setShowSessions(false);
    checkAndShowNotifications();
  }, [checkAndShowNotifications]);

  const closeNotifications = useCallback(() => {
    setShowNotifications(false);
  }, []);

  return {
    showSessions,
    showNotifications,
    closeSessions,
    closeNotifications,
    pendingSessionsCount,
    unreadNotificationsCount,
  };
}

export default useEntryFlow;
