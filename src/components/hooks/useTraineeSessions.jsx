import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { CACHE_CONFIG } from "@/components/utils/queryKeys";

// Trainee "My Sessions" data — packages + coach + sessions in one query.
// Cached so navigating away and back is instant; staleTime matches the
// shared CACHE_CONFIG (30s) and the realtime channel in the page
// invalidates this key the moment the coach changes a session.
export function useTraineeSessions(traineeId, traineeEmail) {
  return useQuery({
    queryKey: ["trainee-sessions", traineeId],
    enabled: !!traineeId,
    staleTime: CACHE_CONFIG.STALE_TIME,
    queryFn: async () => {
      // Direct supabase read so we surface RLS / empty-result distinctions
      // in the console. The base44 wrapper throws-on-error and would mask
      // an RLS-silenced empty array vs a real network failure.
      const { data: rawServices, error: servicesError } = await supabase
        .from("client_services")
        .select("*")
        .eq("trainee_id", traineeId);
      console.log("[TraineeSessions] packages query result:", {
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

      // No status filtering — show every package linked to this
      // trainee, regardless of status. Display labels live in
      // STATUS_LABEL but never gate visibility.
      const activePackages = services.map(s => ({
        ...s,
        remaining: Math.max(0, (s.total_sessions || 0) - (s.used_sessions || 0)),
      }));

      // Get all sessions for this trainee
      const allSessions = await base44.entities.Session.filter({}, "-date", 500);
      const sessions = allSessions.filter(s =>
        s.participants?.some(p => p.trainee_id === traineeId)
      );

      return { coach, activePackages, sessions };
    },
  });
}
