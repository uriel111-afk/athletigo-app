import { invalidateDashboard } from '@/components/utils/queryKeys';

/**
 * syncActions — convenience wrappers that invalidate React Query caches
 * after mutations so all subscribers re-fetch in real time.
 *
 * Each method receives the queryClient instance from the calling component.
 */
export const syncActions = {
  measurementChanged(queryClient) {
    queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
    invalidateDashboard(queryClient);
  },

  sessionChanged(queryClient) {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    invalidateDashboard(queryClient);
  },

  planChanged(queryClient) {
    queryClient.invalidateQueries({ queryKey: ['training-plans'] });
    invalidateDashboard(queryClient);
  },

  userChanged(queryClient) {
    queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
    invalidateDashboard(queryClient);
  },
};
