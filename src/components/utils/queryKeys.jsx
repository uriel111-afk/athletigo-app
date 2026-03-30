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
  STALE_TIME: 1000 * 60 * 5, // 5 minutes
  GC_TIME: 1000 * 60 * 30,   // 30 minutes
  REFETCH_INTERVAL: 30000    // 30 seconds
};