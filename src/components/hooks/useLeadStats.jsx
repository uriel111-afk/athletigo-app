import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useLeadStats() {
  const { data: leads = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.LEADS,
    queryFn: async () => {
      try {
        return await base44.entities.Lead.list('-created_date', 1000);
      } catch (error) {
        console.error("[useLeadStats] Error loading leads:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: CACHE_CONFIG.REFETCH_INTERVAL,
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME
  });

  const newLeadsCount = leads.filter(l => l.status === 'חדש').length;
  
  return {
    leads,
    newLeadsCount,
    totalLeadsCount: leads.length,
    isLoading
  };
}