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

      // Merge GROUP sessions from the trainee's group memberships
      // (read-only). group_id-based so a member added after a session was
      // created still sees it. Deduped by id; RLS-gated.
      try {
        const { data: memberships } = await supabase
          .from('training_group_members')
          .select('group_id')
          .eq('trainee_id', traineeId);
        const groupIds = [...new Set((memberships || []).map(m => m.group_id).filter(Boolean))];
        if (groupIds.length) {
          const { data: groupSessions } = await supabase
            .from('sessions')
            .select('*')
            .in('group_id', groupIds);
          const seen = new Set(sessions.map(s => s.id));
          for (const gs of (groupSessions || [])) {
            if (!seen.has(gs.id)) { sessions.push(gs); seen.add(gs.id); }
          }
        }
      } catch (e) {
        console.warn('[TraineeSessions] group sessions merge failed:', e?.message);
      }

      return { coach, activePackages, sessions };
    },
  });
}
