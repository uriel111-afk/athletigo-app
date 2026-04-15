export const QUERY_KEYS = {
  TRAINEES: ['all-trainees'],
  SERVICES: ['all-services-list'],
  SESSIONS: ['all-sessions'],
  PLANS: ['training-plans'],
  LEADS: ['leads'],
  PAYMENTS: ['financial-stats-payments'],
  NOTIFICATIONS: ['notifications']
};

export const CACHE_CONFIG = {
  STALE_TIME: 1000 * 30,      // 30 seconds — ensures cross-side sync
  GC_TIME: 1000 * 60 * 10,    // 10 minutes
  REFETCH_INTERVAL: false      // disabled — use refetchOnWindowFocus instead
};

/**
 * Invalidate all dashboard-related query keys.
 * Call this after any mutation that affects dashboard stats.
 * Replaces the old ['dashboard-stats'] key which never existed as a real query.
 */
export function invalidateDashboard(queryClient) {
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TRAINEES });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLANS });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LEADS });
}