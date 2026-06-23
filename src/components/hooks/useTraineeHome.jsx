import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { CACHE_CONFIG } from "@/components/utils/queryKeys";

// TraineeHome's main data bundle — coach, packages, sessions, completed-
// session stats, unread notifications and the health-declaration flag.
// Lifted verbatim out of the page's old loadData() so it's cached: the
// first app open hits the network (PageLoader), every later return to the
// home screen serves this from cache instantly (no PageLoader).
export function useTraineeHome(traineeId, traineeEmail) {
  return useQuery({
    queryKey: ["trainee-home", traineeId],
    enabled: !!traineeId,
    staleTime: CACHE_CONFIG.STALE_TIME,
    queryFn: async () => {
      // Direct supabase read so the console surfaces both the raw
      // rows and any RLS / network error — a thrown error from the
      // base44 wrapper looks identical to an RLS-silenced empty
      // array, which is the exact ambiguity we're trying to debug.
      const { data: rawServices, error: servicesError } = await supabase
        .from('client_services')
        .select('*')
        .eq('trainee_id', traineeId);
      console.log('[TraineeHome] packages query result:', {
        trainee_id: traineeId,
        email: traineeEmail,
        count: rawServices?.length ?? 0,
        data: rawServices,
        error: servicesError,
      });
      const services = rawServices || [];

      let coach = null;
      if (services.length > 0 && services[0].created_by) {
        const coaches = await base44.entities.User.filter({ id: services[0].created_by });
        if (coaches.length > 0) coach = coaches[0];
      }
      // No status filtering — surface every linked package.
      const activeServices = services;

      // Load unread notifications
      let unreadNotifs = [];
      try {
        const notifs = await base44.entities.Notification.filter({ user_id: traineeId }, '-created_at');
        unreadNotifs = notifs.filter(n => !n.is_read || (n.requires_acknowledgment && !n.acknowledged_at));
      } catch (e) { console.error("Error fetching notifications", e); }

      // Fetch completed sessions count for streak card
      let completedCount = 0;
      let completedDates = [];
      let firstSessionDate = null;
      try {
        const allUserSessions = await base44.entities.Session.filter({}, '-date', 500);
        const mineCompleted = allUserSessions.filter(s =>
          s.participants?.some(p => p.trainee_id === traineeId) &&
          (s.status === 'הושלם' || s.status === 'התקיים' || s.status === 'הגיע')
        );
        completedCount = mineCompleted.length;
        // Date keys (YYYY-MM-DD) for the 28-day activity heatmap.
        // We store the raw list and bucket downstream so the same
        // source feeds streak, weeks-active, and the heatmap.
        completedDates = mineCompleted
          .map(s => (s.date ? String(s.date).slice(0, 10) : null))
          .filter(Boolean);
        if (mineCompleted.length > 0) {
          const dates = mineCompleted.map(s => new Date(s.date)).sort((a, b) => a - b);
          firstSessionDate = dates[0];
        }
      } catch (e) { console.error("Error fetching completed sessions", e); }

      // Per-trainee health-declaration check. Drives the approval
      // banner gate for both NEW sessions (no per-session link
      // yet) AND legacy sessions where the link column was never
      // populated. Any signed row → trainee is considered signed.
      let hasSignedHealth = false;
      try {
        const { data: hd, error: hdErr } = await supabase
          .from('health_declarations')
          .select('id')
          .eq('trainee_id', traineeId)
          .limit(1);
        hasSignedHealth = !hdErr ? (hd?.length || 0) > 0 : false;
      } catch (e) {
        console.warn('[TraineeHome] health-declaration check failed:', e?.message);
        hasSignedHealth = false;
      }

      // Fetch sessions
      let mySessions = [];
      try {
        // Attempt server-side filtering for privacy and performance
        // We filter by date to avoid loading old history
        const today = new Date().toISOString().split('T')[0];
        const allSessions = await base44.entities.Session.filter({
            date: { $gte: today }
        }, 'date', 100); // Limit 100 upcoming

        // Client-side filter for participants (as JSON array filtering might vary by backend)
        mySessions = allSessions.filter(s =>
          s.participants?.some(p => p.trainee_id === traineeId)
        );
      } catch (err) {
        console.error("Error fetching sessions", err);
      }

      return {
        coach,
        activeServices,
        unreadNotifs,
        completedCount,
        completedDates,
        firstSessionDate,
        hasSignedHealth,
        mySessions,
      };
    },
  });
}
