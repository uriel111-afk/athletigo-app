import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useProgramStats() {
  const { data: plans = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.PLANS,
    queryFn: async () => {
      try {
        const all = await base44.entities.TrainingPlan.list('-created_at', 1000);
        // Filter soft-deleted plans (status='deleted' / deleted_at
        // populated) so a coach who deletes a plan stops seeing it
        // on this list immediately. Old data stays in DB; the list
        // hides it.
        return (all || []).filter(p => p.status !== 'deleted' && !p.deleted_at);
      } catch { return []; }
    },
    initialData: [],
    refetchInterval: CACHE_CONFIG.REFETCH_INTERVAL,
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME
  });

  const activePlansCount = plans.filter(p => p.status === 'פעילה').length;

  return {
    plans,
    activePlansCount,
    isLoading
  };
}