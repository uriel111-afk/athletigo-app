import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, invalidateDashboard } from "@/components/utils/queryKeys";

/**
 * Central cache invalidation hook.
 * Call invalidate(action, traineeId?) after any mutation to bust all related caches.
 *
 * This ensures changes propagate to:
 *  - The trainee profile (all tabs)
 *  - The coach dashboard & trainee list
 *  - Both coach and trainee sides
 */
export function useInvalidateRelated() {
  const qc = useQueryClient();

  const invalidate = (action, traineeId) => {
    const keys = INVALIDATION_MAP[action] || [];
    // Always invalidate the static keys
    keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));

    // If traineeId provided, also invalidate trainee-specific keys
    if (traineeId) {
      const traineeKeys = TRAINEE_KEYS_MAP[action] || [];
      traineeKeys.forEach(k => qc.invalidateQueries({ queryKey: [k, traineeId] }));
    }

    // Always bust dashboard — invalidates all 5 real query keys
    invalidateDashboard(qc);
  };

  return invalidate;
}

// Static (non-parameterized) keys to invalidate per action type
const INVALIDATION_MAP = {
  package_change: ['all-services-list', 'trainee-services', 'all-trainees'],
  session_change: ['all-sessions', 'trainee-sessions', 'all-trainees'],
  result_change: ['my-results', 'trainee-goals'],
  goal_change: ['trainee-goals', 'my-goals'],
  measurement_change: ['my-measurements'],
  baseline_change: ['baselines', 'my-results'],
  trainee_change: ['all-trainees', 'current-user-trainee-profile'],
  lead_change: ['leads'],
  plan_change: ['training-plans', 'all-trainees'],
  notification_change: ['notifications'],
  document_change: ['current-user-trainee-profile'],
};

// Trainee-specific (parameterized with traineeId) keys
const TRAINEE_KEYS_MAP = {
  package_change: ['trainee-services'],
  session_change: ['trainee-sessions'],
  result_change: ['my-results'],
  goal_change: ['trainee-goals', 'my-goals'],
  measurement_change: ['my-measurements'],
  baseline_change: ['baselines'],
  trainee_change: ['target-user-profile'],
  plan_change: ['training-plans', 'trainee-workout-history'],
};
