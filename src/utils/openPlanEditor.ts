import { createPageUrl } from './index';

/**
 * Single entry point for opening the training-plan editor.
 *
 * With a planId → routes to /trainingplanview?planId=… which mounts
 * UnifiedPlanBuilder for that plan (coach edit mode).
 *
 * Without a planId → falls back to /activeplans (plans list) instead of
 * the legacy /planbuilder wizard, which no longer exists after the
 * consolidation refactor.
 */
export function openPlanEditor(
  navigate: (path: string) => void,
  planId?: string | null,
): void {
  if (planId) {
    navigate(`${createPageUrl('TrainingPlanView')}?planId=${planId}`);
  } else {
    navigate(createPageUrl('ActivePlans'));
  }
}
