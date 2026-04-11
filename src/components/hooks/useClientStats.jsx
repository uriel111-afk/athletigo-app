import { useQuery } from "@tanstack/react-query";
import { useContext, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { AuthContext } from "@/lib/AuthContext";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useClientStats() {
  const { user } = useContext(AuthContext);

  // 1. Fetch Users
  const { data: allTrainees = [], isLoading: traineesLoading } = useQuery({
    queryKey: QUERY_KEYS.TRAINEES,
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    initialData: [],
    refetchInterval: CACHE_CONFIG.REFETCH_INTERVAL,
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME
  });

  // 2. Fetch Services — filtered by current coach
  const { data: allServices = [] } = useQuery({
    queryKey: [...QUERY_KEYS.SERVICES, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.ClientService.filter({ coach_id: user.id }, '-created_at', 1000);
      } catch {
        return await base44.entities.ClientService.list('-created_at', 1000);
      }
    },
    initialData: [],
    enabled: !!user?.id,
    refetchInterval: CACHE_CONFIG.REFETCH_INTERVAL,
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME
  });

  // Stats
  const { activeClientsCount, totalClientsCount } = useMemo(() => {
    const activeServiceRecords = allServices.filter(s =>
      s.status === 'פעיל' ||
      (s.total_sessions > 0 && (s.used_sessions || 0) < s.total_sessions)
    );
    const activeClientIds = new Set(activeServiceRecords.map(s => s.trainee_id));

    // Also count trainees with status='active' and coach_id matching
    allTrainees.forEach(t => {
      if (t.coach_id === user?.id && (t.status === 'active' || t.client_status === 'לקוח פעיל')) {
        activeClientIds.add(t.id);
      }
    });

    // Total = trainees with service OR coach_id matching
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