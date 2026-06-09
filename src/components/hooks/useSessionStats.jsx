import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isToday, isFuture, isTomorrow, parseISO } from "date-fns";

import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useSessionStats() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS,
    queryFn: async () => {
      try {
        // No date cap — the coach's principle is that no session
        // should ever disappear from the UI unless the coach explicitly
        // deletes it. Sessions.jsx groups the full history into time
        // buckets (planned / this-week / this-month / per-month) so
        // older months don't dominate the view without being lost.
        // Limit raised to 5000 to accommodate years of accumulated rows.
        return await base44.entities.Session.filter({}, '-date', 5000);
      } catch (error) {
        console.error("[useSessionStats] Error loading sessions:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: CACHE_CONFIG.REFETCH_INTERVAL, // Optimized polling
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME
  });

  // Minimal data validity check — a row without a date+time can't be
  // placed on any list, so it's the one thing we drop. Past pending
  // sessions ("ghosts") used to be auto-hidden here, but per the
  // coach's principle nothing disappears from the UI unless it's
  // explicitly deleted; if the coach planned a session that never got
  // a final status, it stays visible until they act on it.
  const cleanSessions = sessions.filter(s => {
    if (!s.date || !s.time) return false;
    return true;
  });

  const todaySessions = cleanSessions.filter((s) => {
    try {
      return s.date && isToday(new Date(s.date)) && !['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(s.status);
    } catch {
      return false;
    }
  });

  const upcomingSessions = cleanSessions.filter((s) => {
    try {
      if (!s.date) return false;
      const sessionDate = new Date(s.date);
      // Basic "upcoming" definition: future date, not today, not cancelled/completed
      return isFuture(sessionDate) && !isToday(sessionDate) && !['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(s.status);
    } catch {
      return false;
    }
  });

  return {
    sessions: cleanSessions, // Return cleaned list as the source of truth
    rawSessions: sessions, // Keep raw if needed for debug
    todaySessionsCount: todaySessions.length,
    todaySessionsList: todaySessions, // For dashboard list
    upcomingSessionsCount: upcomingSessions.length,
    upcomingSessionsList: upcomingSessions.slice(0, 3), // limit for preview
    isLoading
  };
}