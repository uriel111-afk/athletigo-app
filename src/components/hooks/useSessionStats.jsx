import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isToday, isFuture, isTomorrow, parseISO, subMonths, format } from "date-fns";

import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useSessionStats() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS,
    queryFn: async () => {
      try {
        // Optimization: Fetch sessions from 3 months ago to future
        // This prevents loading years of history while keeping recent context
        const startDate = format(subMonths(new Date(), 3), 'yyyy-MM-dd');
        return await base44.entities.Session.filter({
          date: { $gte: startDate }
        }, '-date', 1000);
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

  // Global Data Scrubbing / Cleanup Logic
  const cleanSessions = sessions.filter(s => {
    if (!s.date || !s.time) return false;
    
    // Orphan Check: If session is in the past (before today) AND status is 'pending' -> It's an orphan
    // We treat them as invalid for counters to prevent "ghost" numbers
    const sessionDate = new Date(s.date);
    const today = new Date();
    today.setHours(0,0,0,0);
    sessionDate.setHours(0,0,0,0);

    if (sessionDate < today && ['ממתין לאישור', 'ממתין'].includes(s.status)) {
       return false; // Filter out past pending sessions (ghosts)
    }
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