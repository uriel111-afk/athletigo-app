import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { startOfMonth, endOfMonth, format, addMonths } from "date-fns";
import { useContext } from "react";
import { AuthContext } from "@/lib/AuthContext";

const CACHE_TIME = 1000 * 60 * 5; // 5 minutes
const STALE_TIME = 1000 * 60 * 2; // 2 minutes

export function useDashboardStats() {
  const queryClient = useQueryClient();
  const { user } = useContext(AuthContext);

  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      const startMonthStr = format(startOfMonth(today), 'yyyy-MM-dd');
      const endMonthStr = format(endOfMonth(today), 'yyyy-MM-dd');
      const nextMonthEndStr = format(endOfMonth(addMonths(today, 1)), 'yyyy-MM-dd');

      console.log("🚀 Fetching Dashboard Stats...");

      try {
        const [
          users,
          activeServices,
          paidServicesMonth,
          sessionsFuture,
          sessionsMonth,
          sessionsCompletedRecent,
          activePlans,
          leadsNew,
          leadsConverted,
          leadsTotal
        ] = await Promise.all([
          // 1. All Users (Trainees) - for forms & total count
          base44.entities.User.list('-created_at', 1000).catch(() => []),
          
          // 2. Active Services - for Active Clients count
          base44.entities.ClientService.filter({ status: 'פעיל', coach_id: user?.id }, '-created_at', 1000).catch(() => []),
          
          // 3. Paid Services This Month - for Revenue
          base44.entities.ClientService.filter({ 
            payment_status: 'שולם',
            payment_date: { $gte: startMonthStr, $lte: endMonthStr },
            coach_id: user?.id
          }, '-payment_date', 1000).catch(() => []),

          // 4. Sessions Future (Today + Upcoming)
          base44.entities.Session.filter({
            date: { $gte: todayStr },
            coach_id: user?.id
          }, 'date', 100).catch(() => []),

          // 5. Sessions This Month (for Service Type breakdown)
          base44.entities.Session.filter({
            date: { $gte: startMonthStr, $lte: endMonthStr },
            coach_id: user?.id
          }, '-date', 500).catch(() => []),

          // 6. Sessions Completed (Recent) - for "Completed" list preview
          base44.entities.Session.filter({
            status: 'התקיים',
            coach_id: user?.id
          }, '-date', 10).catch(() => []),

          // 7. Active Plans
          base44.entities.TrainingPlan.filter({ status: 'פעילה', created_by: user?.id }, '-created_at', 1000).catch(() => []),

          // 8. Leads (New)
          base44.entities.Lead.filter({ status: 'חדש', coach_id: user?.id }, '-created_at', 1000).catch(() => []),

          // 9. Leads (Converted) - for rate
          base44.entities.Lead.filter({ status: 'סגור עסקה', coach_id: user?.id }, '-created_at', 1000).catch(() => []),

          // 10. Leads (Total) - for rate (limit 1000 approx)
          base44.entities.Lead.filter({ coach_id: user?.id }, '-created_at', 1000).catch(() => []),
        ]);

        // --- Process Data (Safe Arrays) ---
        const safeUsers = Array.isArray(users) ? users : [];
        const safeActiveServices = Array.isArray(activeServices) ? activeServices : [];
        const safePaidServices = Array.isArray(paidServicesMonth) ? paidServicesMonth : [];
        const safeSessionsFuture = Array.isArray(sessionsFuture) ? sessionsFuture : [];
        const safeSessionsMonth = Array.isArray(sessionsMonth) ? sessionsMonth : [];
        const safeCompletedRecent = Array.isArray(sessionsCompletedRecent) ? sessionsCompletedRecent : [];
        const safeActivePlans = Array.isArray(activePlans) ? activePlans : [];
        const safeLeadsNew = Array.isArray(leadsNew) ? leadsNew : [];
        const safeLeadsConverted = Array.isArray(leadsConverted) ? leadsConverted : [];
        const safeLeadsTotal = Array.isArray(leadsTotal) ? leadsTotal : [];

        // Users — filter to trainees that belong to this coach (have any service)
        const allTrainees = safeUsers.filter(u => u.role === 'user' || u.role === 'trainee');
        const coachTraineeIds = new Set(safeActiveServices.map(s => s.trainee_id));
        const trainees = allTrainees.filter(t => coachTraineeIds.has(t.id));

        // Active Clients (Unique Trainees with Active Service — already filtered by coach_id)
        const activeClientIds = new Set(safeActiveServices.map(s => s.trainee_id));
        const activeClientsCount = activeClientIds.size;

        // Revenue
        const monthlyRevenue = safePaidServices.reduce((sum, s) => sum + (s.price || 0), 0);

        // Sessions
        // Filter "Future" to separate Today vs Upcoming
        const todaySessions = safeSessionsFuture.filter(s => s.date === todayStr && !['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(s.status));
        const upcomingSessions = safeSessionsFuture.filter(s => s.date > todayStr && !['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(s.status));
        
        // Service Stats (from Active Services Definitions)
        // Calculate Counts & Revenue by Type
        const revenueByType = { personal: 0, group: 0, online: 0 };
        const countByType = { personal: 0, group: 0, online: 0 };
        
        // Group Trainees Count
        const groupTraineesSet = new Set();

        safeActiveServices.forEach(s => {
            const type = (s.service_type === 'group' || s.service_type === 'פעילות קבוצתית') ? 'group' :
                         (s.service_type === 'online' || s.service_type === 'ליווי אונליין') ? 'online' : 'personal';
            
            countByType[type]++;
            if (type === 'group') groupTraineesSet.add(s.trainee_id);

            // MRR Calculation: If active subscription, count it. If punch card, only if paid this month.
            // For simplicity based on user request: "Sum of final_price... charged this month".
            // We assume if it's active subscription, it counts. If it's punch card, check payment_date.
            
            const price = s.final_price || s.price || 0;
            
            if (s.billing_model === 'subscription' || s.is_recurring) {
                // Assume active subscription contributes to monthly revenue
                revenueByType[type] += price;
            } else {
                // One-time / Punch card: Count only if paid in this range
                const pDate = s.payment_date ? new Date(s.payment_date) : null;
                if (pDate && pDate >= startOfMonth(today) && pDate <= endOfMonth(today)) {
                    revenueByType[type] += price;
                }
            }
        });

        // Renewals (Next 30 days)
        const renewalsCount = safeActiveServices.filter(s => {
            if (!s.next_billing_date && !s.end_date) return false;
            const targetDate = s.next_billing_date ? new Date(s.next_billing_date) : new Date(s.end_date);
            const diffTime = targetDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 30;
        }).length;

        // Valid Sessions for display
        const validMonthSessions = safeSessionsMonth.filter(s => !['בוטל על ידי מאמן', 'בוטל על ידי מתאמן', 'לא הגיע'].includes(s.status));
        const monthlyCompletedSessionsCount = safeSessionsMonth.filter(s => s.status === 'התקיים').length;

        // Legacy stats for compatibility
        const serviceStats = {
          personal: validMonthSessions.filter(s => s.session_type?.includes('personal')).length,
          group: validMonthSessions.filter(s => s.session_type?.includes('קבוצ')).length,
          online: validMonthSessions.filter(s => s.session_type === 'אונליין').length
        };

        // Leads Stats
        const convertedCount = safeLeadsConverted.length;
        const conversionRate = safeLeadsTotal.length > 0 ? Math.round((convertedCount / safeLeadsTotal.length) * 100) : 0;

        return {
          trainees,
          totalClientsCount: trainees.length,
          activeClientsCount,
          monthlyRevenue,
          todaySessions,
          upcomingSessions,
          completedSessions: safeCompletedRecent,
          serviceStats,
          activePlansCount: safeActivePlans.length,
          newLeadsCount: safeLeadsNew.length,
          conversionRate,
          
          // Raw data if needed
          todaySessionsCount: todaySessions.length,
          upcomingSessionsCount: upcomingSessions.length,
          monthlyCompletedSessionsCount,
          revenueByType,
          countByType,
          groupTraineesCount: groupTraineesSet.size,
          renewalsCount
        };
      } catch (error) {
        console.error("Error in useDashboardStats:", error);
        return {
          trainees: [],
          totalClientsCount: 0,
          activeClientsCount: 0,
          monthlyRevenue: 0,
          todaySessions: [],
          upcomingSessions: [],
          completedSessions: [],
          serviceStats: { personal: 0, group: 0, online: 0 },
          activePlansCount: 0,
          newLeadsCount: 0,
          conversionRate: 0,
          todaySessionsCount: 0,
          upcomingSessionsCount: 0,
          monthlyCompletedSessionsCount: 0
        };
      }
    },
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchOnWindowFocus: false
  });
}