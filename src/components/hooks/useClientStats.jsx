import { useQuery } from "@tanstack/react-query";
import { useContext, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { AuthContext } from "@/lib/AuthContext";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useClientStats() {
  const { user } = useContext(AuthContext);

  // Use shared query keys — same as useAppPrefetch, so data is cached
  // Returns ALL trainees (including former + suspended). Consumers
  // that need "active list only" use `visibleTrainees` below;
  // AllUsers' "× הצג לשעבר" toggle still has access to the full
  // set so archived rows can surface on demand.
  const { data: allTrainees = [], isLoading: traineesLoading } = useQuery({
    queryKey: QUERY_KEYS.TRAINEES,
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    initialData: [],
    staleTime: CACHE_CONFIG.STALE_TIME,
  });

  // Trainees that count for the main list / dashboards / counters.
  // Excludes archived statuses so former trainees stop polluting
  // metrics + dropdowns the moment client_status flips.
  const visibleTrainees = useMemo(
    () => allTrainees.filter(t =>
      t.client_status !== 'former' && t.client_status !== 'suspended'
    ),
    [allTrainees]
  );

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
    // Single source of truth: distinct trainee_ids from active
    // packages, scoped to non-archived trainees only. After
    // commit fd05995 archive flips client_status='former'; we
    // filter those out so the active-clients count never lags
    // behind the archive action.
    const visibleIds = new Set(visibleTrainees.map(t => t.id));
    const activeServiceRecords = allServices.filter(s =>
      (s.status === 'פעיל' || s.status === 'active') &&
      visibleIds.has(s.trainee_id)
    );
    const activeClientIds = new Set(activeServiceRecords.map(s => s.trainee_id));

    const serviceIds = new Set(allServices.map(s => s.trainee_id));
    const coachTrainees = visibleTrainees.filter(t => serviceIds.has(t.id) || t.coach_id === user?.id);

    return {
      activeClientsCount: activeClientIds.size,
      totalClientsCount: coachTrainees.length,
    };
  }, [visibleTrainees, allServices, user?.id]);

  return {
    allTrainees,        // full set incl. former (for the toggle)
    visibleTrainees,    // active list — drops former + suspended
    allServices,
    activeClientsCount,
    totalClientsCount,
    traineesLoading
  };
}
