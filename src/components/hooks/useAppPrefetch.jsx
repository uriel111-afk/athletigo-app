import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from "@/api/base44Client";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useAppPrefetch(user) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const isCoach = user.isCoach || user.role === 'admin';

    // Common Prefetch Options
    const prefetchOptions = {
      staleTime: CACHE_CONFIG.STALE_TIME,
    };

    const prefetchData = async () => {
      // Critical Data for All Users
      // 1. Notifications (Example - Assuming a key exists or adding one)
      // queryClient.prefetchQuery({ queryKey: QUERY_KEYS.NOTIFICATIONS, ... })

      if (isCoach) {
        // Coach Critical Data - Parallel Prefetching
        const coachPrefetches = [
          // 1. Trainees List
          queryClient.prefetchQuery({
            queryKey: QUERY_KEYS.TRAINEES,
            queryFn: async () => {
              const users = await base44.entities.User.list('-created_at', 1000);
              return users.filter(u => u.role === 'user' || u.role === 'trainee');
            },
            ...prefetchOptions
          }),

          // 2. Services (Active & History)
          queryClient.prefetchQuery({
            queryKey: QUERY_KEYS.SERVICES,
            queryFn: () => base44.entities.ClientService.list(),
            ...prefetchOptions
          }),

          // 3. Sessions (Calendar)
          queryClient.prefetchQuery({
            queryKey: QUERY_KEYS.SESSIONS,
            queryFn: async () => {
               try {
                 return await base44.entities.Session.list('-date', 1000);
               } catch { return []; }
            },
            ...prefetchOptions
          }),

          // 4. Training Plans
          queryClient.prefetchQuery({
            queryKey: QUERY_KEYS.PLANS,
            queryFn: async () => {
               try {
                 return await base44.entities.TrainingPlan.list('-created_at', 1000);
               } catch { return []; }
            },
            ...prefetchOptions
          }),

          // 5. Leads
          queryClient.prefetchQuery({
            queryKey: QUERY_KEYS.LEADS,
            queryFn: async () => {
               try {
                 return await base44.entities.Lead.list('-created_at');
               } catch { return []; }
            },
            ...prefetchOptions
          }),

          // 6. Financials (Payments)
          queryClient.prefetchQuery({
            queryKey: QUERY_KEYS.PAYMENTS,
            queryFn: async () => {
               try {
                 const allServices = await base44.entities.ClientService.list('-payment_date', 2000);
                 return allServices.filter(s => s.payment_status === 'שולם');
               } catch { return []; }
            },
            ...prefetchOptions
          })
        ];

        await Promise.all(coachPrefetches);
      } else {
        // Trainee Prefetches (My Plan, My Sessions)
        // Add trainee specific logic here if needed
        // For example:
        // queryClient.prefetchQuery({ queryKey: ['my-plan', user.id], ... })
      }
    };

    prefetchData();
  }, [user, queryClient]);
}