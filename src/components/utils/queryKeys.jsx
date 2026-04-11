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
  STALE_TIME: 1000 * 60,      // 1 minute (matches global default)
  GC_TIME: 1000 * 60 * 10,    // 10 minutes
  REFETCH_INTERVAL: false      // disabled — use refetchOnWindowFocus instead
};