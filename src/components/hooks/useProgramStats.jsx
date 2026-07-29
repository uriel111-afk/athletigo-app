import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AuthContext } from "@/lib/AuthContext";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useProgramStats() {
  const { user } = useContext(AuthContext);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.PLANS,
    queryFn: async () => {
      try {
        // Soft-deleted plans are excluded in the query itself.
        // Filter the 'deleted' value OUT — never filter an active
        // value IN, because statuses are mixed Hebrew and English
        // ('פעילה' and 'deleted'). There is no deleted_at column.
        const all = await base44.entities.TrainingPlan.filter(
          { created_by: user?.id, status: { $ne: 'deleted' } }, '-created_at', 1000);
        return all || [];
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