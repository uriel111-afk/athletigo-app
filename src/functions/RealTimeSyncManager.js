/**
 * syncActions — convenience wrappers that invalidate React Query caches
 * after mutations so all subscribers re-fetch in real time.
 *
 * Each method receives the queryClient instance from the calling component.
 */
export const syncActions = {
  measurementChanged(queryClient) {
    queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
    queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  },

  sessionChanged(queryClient) {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  },

  planChanged(queryClient) {
    queryClient.invalidateQueries({ queryKey: ['training-plans'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  },

  userChanged(queryClient) {
    queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  },
};
