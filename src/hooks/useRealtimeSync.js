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

    const invalidateDashboard = () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    };

    const channel = supabase.channel('app-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
        queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
        queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'measurements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results_log' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-results'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
        queryClient.invalidateQueries({ queryKey: ['my-goals'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baselines' }, () => {
        queryClient.invalidateQueries({ queryKey: ['baselines'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
        queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_plans' }, () => {
        queryClient.invalidateQueries({ queryKey: ['training-plans'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        invalidateDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reflections' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trainee-reflections'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_log' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trainee-attendance-log'] });
        invalidateDashboard();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, queryClient]);
}
