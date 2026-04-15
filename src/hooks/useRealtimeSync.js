import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * Subscribes to Supabase Realtime changes on key tables.
 * Automatically invalidates React Query caches so UI updates instantly.
 */
export function useRealtimeSync(userId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('app-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
        queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
        queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'measurements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results_log' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-results'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
        queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baselines' }, () => {
        queryClient.invalidateQueries({ queryKey: ['baselines'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
        queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, queryClient]);
}
