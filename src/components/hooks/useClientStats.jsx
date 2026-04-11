import { useQuery } from "@tanstack/react-query";
import { useContext, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { AuthContext } from "@/lib/AuthContext";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useClientStats() {
  const { user } = useContext(AuthContext);

  // Use shared query keys — same as useAppPrefetch, so data is cached
  const { data: allTrainees = [], isLoading: traineesLoading } = useQuery({
    queryKey: QUERY_KEYS.TRAINEES,
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    initialData: [],
    staleTime: CACHE_CONFIG.STALE_TIME,
  });

  // Shared services key (no user suffix — filter client-side for cache hits)
  const { data: allServicesRaw = [] } = useQuery({
    queryKey: QUERY_KEYS.SERVICES,
    queryFn: () => base44.entities.ClientService.list('-created_at', 2000).catch(() => []),
    initialData: [],
    staleTime: CACHE_CONFIG.STALE_TIME,
  });

  // Filter by coach client-side
  const allServices = useMemo(() =>
    allServicesRaw.filter(s => s.coach_id === user?.id),
    [allServicesRaw, user?.id]
  );

  const { activeClientsCount, totalClientsCount } = useMemo(() => {
    const activeServiceRecords = allServices.filter(s =>
      s.status === 'פעיל' ||
      (s.total_sessions > 0 && (s.used_sessions || 0) < s.total_sessions)
    );
    const activeClientIds = new Set(activeServiceRecords.map(s => s.trainee_id));

    allTrainees.forEach(t => {
      if (t.coach_id === user?.id && (t.status === 'active' || t.client_status === 'לקוח פעיל')) {
        activeClientIds.add(t.id);
      }
    });

    const serviceIds = new Set(allServices.map(s => s.trainee_id));
    const coachTrainees = allTrainees.filter(t => serviceIds.has(t.id) || t.coach_id === user?.id);

    return {
      activeClientsCount: activeClientIds.size,
      totalClientsCount: coachTrainees.length,
    };
  }, [allTrainees, allServices, user?.id]);

  return {
    allTrainees,
    allServices,
    activeClientsCount,
    totalClientsCount,
    traineesLoading
  };
}
