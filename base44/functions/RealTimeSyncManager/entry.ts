/**
 * AthletiGo Real-Time Sync Manager
 * Central hub for invalidating queries and triggering real-time updates
 */

import { toast } from "sonner";

let lastSyncToastTime = 0;
const SYNC_TOAST_COOLDOWN = 10000; // 10 seconds

/**
 * Show sync toast with rate limiting
 */
export function showSyncToast(message, type = 'info') {
  const now = Date.now();
  if (now - lastSyncToastTime < SYNC_TOAST_COOLDOWN) {
    return; // Skip toast
  }
  lastSyncToastTime = now;
  
  if (type === 'success') toast.success(message);
  else if (type === 'error') toast.error(message);
  else toast.info(message);
}

/**
 * Invalidate ALL queries related to trainees/users
 */
export function invalidateTraineeQueries(queryClient) {
  const queries = [
    'users-trainees',
    'all-trainees',
    'trainees',
    'trainees-list',
    'users-financial',
    'trainee-plans',
    'current-user-profile',
    'my-services',
    'my-services-profile'
  ];
  
  queries.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
  
  console.log('[RealTimeSync] Invalidated trainee queries:', queries);
}

/**
 * Invalidate ALL queries related to services/packages
 */
export function invalidateServiceQueries(queryClient) {
  const queries = [
    'services',
    'all-services',
    'all-services-financial',
    'my-services',
    'my-services-profile'
  ];
  
  queries.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
  
  console.log('[RealTimeSync] Invalidated service queries:', queries);
}

/**
 * Invalidate ALL queries related to sessions
 */
export function invalidateSessionQueries(queryClient) {
  const queries = [
    'sessions',
    'all-sessions',
    'my-sessions'
  ];
  
  queries.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
  
  console.log('[RealTimeSync] Invalidated session queries:', queries);
}

/**
 * Invalidate ALL queries related to training plans
 */
export function invalidatePlanQueries(queryClient) {
  const queries = [
    'training-plans',
    'trainee-plans',
    'training-sections',
    'trainee-sections',
    'exercises',
    'trainee-exercises',
    'section-templates'
  ];
  
  queries.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
  
  console.log('[RealTimeSync] Invalidated plan queries:', queries);
}

/**
 * Invalidate ALL queries related to goals
 */
export function invalidateGoalQueries(queryClient) {
  const queries = [
    'all-goals',
    'my-goals'
  ];
  
  queries.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
  
  console.log('[RealTimeSync] Invalidated goal queries:', queries);
}

/**
 * Invalidate ALL queries related to measurements
 */
export function invalidateMeasurementQueries(queryClient) {
  const queries = [
    'all-measurements',
    'measurements'
  ];
  
  queries.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
  
  console.log('[RealTimeSync] Invalidated measurement queries:', queries);
}

/**
 * Invalidate ALL queries related to results
 */
export function invalidateResultQueries(queryClient) {
  const queries = [
    'all-results',
    'results'
  ];
  
  queries.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
  
  console.log('[RealTimeSync] Invalidated result queries:', queries);
}

/**
 * MASTER INVALIDATION - triggers when a critical change happens
 * Use this for actions that affect multiple areas (e.g., adding a service)
 */
export function invalidateAllHomeScreens(queryClient) {
  invalidateTraineeQueries(queryClient);
  invalidateServiceQueries(queryClient);
  invalidateSessionQueries(queryClient);
  invalidatePlanQueries(queryClient);
  invalidateGoalQueries(queryClient);
  
  console.log('[RealTimeSync] ✅ FULL SYNC triggered - all home screens will update');
  
  showSyncToast("מעדכן נתונים…", 'info');
  
  // After a short delay, confirm sync
  setTimeout(() => {
    showSyncToast("עודכן בזמן אמת.", 'success');
  }, 1500);
}

/**
 * Specific invalidation patterns for common actions
 */
export const syncActions = {
  
  // When a service is created/updated/deleted
  serviceChanged: (queryClient) => {
    invalidateServiceQueries(queryClient);
    invalidateTraineeQueries(queryClient);
    showSyncToast("מעדכן נתונים…", 'info');
  },
  
  // When session attendance changes
  sessionAttendanceChanged: (queryClient) => {
    invalidateSessionQueries(queryClient);
    invalidateServiceQueries(queryClient); // For session usage counter
    showSyncToast("מעדכן נתונים…", 'info');
  },
  
  // When a payment is made
  paymentChanged: (queryClient) => {
    invalidateServiceQueries(queryClient);
    invalidateTraineeQueries(queryClient);
    showSyncToast("מעדכן נתונים…", 'info');
  },
  
  // When a training plan is updated
  planChanged: (queryClient) => {
    invalidatePlanQueries(queryClient);
    showSyncToast("מעדכן נתונים…", 'info');
  },
  
  // When a goal is updated
  goalChanged: (queryClient) => {
    invalidateGoalQueries(queryClient);
    showSyncToast("מעדכן נתונים…", 'info');
  },
  
  // When a measurement is added
  measurementChanged: (queryClient) => {
    invalidateMeasurementQueries(queryClient);
    showSyncToast("מעדכן נתונים…", 'info');
  },
  
  // When a trainee is added/updated
  traineeChanged: (queryClient) => {
    invalidateTraineeQueries(queryClient);
    invalidateServiceQueries(queryClient);
    showSyncToast("מעדכן נתונים…", 'info');
  }
};

/**
 * Get optimized refetch interval based on data criticality
 */
export const REFETCH_INTERVALS = {
  CRITICAL: 1000,    // 1s - Services, Sessions, Dashboard KPIs
  IMPORTANT: 3000,   // 3s - Goals, Measurements, Results
  NORMAL: 5000,      // 5s - Templates, Historical data
  BACKGROUND: 10000  // 10s - User profiles, Static data
};

/**
 * Standard query config for real-time data
 */
export function getRealTimeQueryConfig(interval = REFETCH_INTERVALS.CRITICAL) {
  return {
    refetchInterval: interval,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: interval / 2, // Consider stale at half the interval
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(300 * 2 ** attemptIndex, 3000)
  };
}

/**
 * Create optimistic entity for immediate UI update
 */
export function createOptimisticEntity(entity, data, userId = null) {
  return {
    id: `temp-${entity}-${Date.now()}`,
    ...data,
    created_date: new Date().toISOString(),
    updated_date: new Date().toISOString(),
    created_by: userId || 'temp',
    _optimistic: true // Flag for debugging
  };
}

/**
 * Check if data is fresh (based on timestamp)
 */
export function isDataFresh(dataUpdatedAt, maxAgeMs = 2000) {
  const now = Date.now();
  return (now - dataUpdatedAt) < maxAgeMs;
}