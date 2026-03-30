import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useClientStats() {
  // 1. Fetch Users
  const { data: allTrainees = [], isLoading: traineesLoading } = useQuery({
    queryKey: QUERY_KEYS.TRAINEES,
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_date', 1000);
      return users.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    initialData: [],
    refetchInterval: CACHE_CONFIG.REFETCH_INTERVAL,
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME
  });

  // 2. Fetch Services (for "Active" check)
  const { data: allServices = [] } = useQuery({
    queryKey: QUERY_KEYS.SERVICES,
    queryFn: () => base44.entities.ClientService.list('-created_date', 1000),
    initialData: [],
    refetchInterval: CACHE_CONFIG.REFETCH_INTERVAL,
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME
  });

  // Stats - Logic matching AllUsers.js
  const activeServiceRecords = allServices.filter(s => 
    s.status === 'פעיל' || 
    (s.total_sessions > 0 && (s.used_sessions || 0) < s.total_sessions)
  );
  const activeClientIds = new Set(activeServiceRecords.map(s => s.trainee_id));
  const activeClientsCount = activeClientIds.size;
  const totalClientsCount = allTrainees.length;

  return {
    allTrainees,
    allServices,
    activeClientsCount,
    totalClientsCount,
    traineesLoading
  };
}