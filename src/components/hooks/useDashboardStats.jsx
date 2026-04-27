import { useQuery } from "@tanstack/react-query";
import { useMemo, useContext } from "react";
import { base44 } from "@/api/base44Client";
import { startOfMonth, endOfMonth, format, addMonths } from "date-fns";
import { AuthContext } from "@/lib/AuthContext";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

// ─────────────────────────────────────────────────────────────────────
// useDashboardStats — computes all dashboard metrics from shared caches
// ─────────────────────────────────────────────────────────────────────

export function useDashboardStats() {
  const { user } = useContext(AuthContext);

  // ── Shared queries — NO initialData so isLoading is accurate ──────
  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: QUERY_KEYS.TRAINEES,
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    staleTime: CACHE_CONFIG.STALE_TIME,
    refetchOnMount: 'always',
  });

  const { data: allServices = [], isLoading: servicesLoading } = useQuery({
    queryKey: QUERY_KEYS.SERVICES,
    queryFn: () => base44.entities.ClientService.list('-created_at', 2000).catch(() => []),
    staleTime: CACHE_CONFIG.STALE_TIME,
    refetchOnMount: 'always',
  });

  const { data: allSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS,
    queryFn: () => base44.entities.Session.list('-date', 1000).catch(() => []),
    staleTime: CACHE_CONFIG.STALE_TIME,
    refetchOnMount: 'always',
  });

  const { data: allPlans = [], isLoading: plansLoading } = useQuery({
    queryKey: QUERY_KEYS.PLANS,
    queryFn: () => base44.entities.TrainingPlan.list('-created_at', 1000).catch(() => []),
    staleTime: CACHE_CONFIG.STALE_TIME,
    refetchOnMount: 'always',
  });

  const { data: allLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: QUERY_KEYS.LEADS,
    queryFn: () => base44.entities.Lead.list('-created_at', 1000).catch(() => []),
    staleTime: CACHE_CONFIG.STALE_TIME,
    refetchOnMount: 'always',
  });

  const isLoading = usersLoading || servicesLoading || sessionsLoading || plansLoading || leadsLoading;

  // ── Compute all metrics client-side from cached data ─────────────
  const stats = useMemo(() => {
    const coachId = user?.id;
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const startMonthStr = format(monthStart, 'yyyy-MM-dd');
    const endMonthStr = format(monthEnd, 'yyyy-MM-dd');

    // Filter services by coach
    const coachServices = allServices.filter(s => s.coach_id === coachId);
    // Accept both Hebrew ('פעיל') and English ('active') status — legacy records use English
    const activeServices = coachServices.filter(s => s.status === 'פעיל' || s.status === 'active');

    console.log('[DashboardCount] coachId:', coachId);
    console.log('[DashboardCount] allServices total:', allServices.length);
    console.log('[DashboardCount] coachServices (after coach filter):', coachServices.length,
      coachServices.map(s => ({ id: s.id, trainee_id: s.trainee_id, status: s.status, total: s.total_sessions, used: s.used_sessions })));
    console.log('[DashboardCount] activeServices (פעיל || active):', activeServices.length,
      activeServices.map(s => ({ id: s.id, trainee_id: s.trainee_id, status: s.status })));

    // Filter sessions by coach
    const coachSessions = allSessions.filter(s => s.coach_id === coachId);

    // Filter leads by coach. Canonical owner column is user_id;
    // accept the legacy coach_id alias as a defensive fallback for
    // any old rows that still carry it.
    const coachLeads = allLeads.filter(l => l.user_id === coachId || l.coach_id === coachId);

    // Filter plans by coach
    const coachPlans = allPlans.filter(p => p.created_by === coachId);

    // ── Trainees ────────────────────────────────────────────────────
    const serviceTraineeIds = new Set(coachServices.map(s => s.trainee_id));
    const trainees = allUsers.filter(t => serviceTraineeIds.has(t.id) || t.coach_id === coachId);

    // Single source of truth: distinct trainee_ids from active packages.
    // We intentionally do NOT fall back to users.status/client_status —
    // users.status could be stale after a package was deleted, which was
    // the bug that kept the dashboard counter ahead of reality.
    const activeClientIds = new Set(activeServices.map(s => s.trainee_id));
    console.log('[DashboardCount] FINAL activeClientsCount:', activeClientIds.size, [...activeClientIds]);

    // ── Revenue ─────────────────────────────────────────────────────
    const paidThisMonth = coachServices.filter(s =>
      s.payment_status === 'שולם' &&
      s.payment_date >= startMonthStr && s.payment_date <= endMonthStr
    );
    const monthlyRevenue = paidThisMonth.reduce((sum, s) => sum + (s.price || 0), 0);

    // Revenue by type (from active services)
    const revenueByType = { personal: 0, group: 0, online: 0 };
    const countByType = { personal: 0, group: 0, online: 0 };
    const groupTraineesSet = new Set();

    activeServices.forEach(s => {
      const st = (s.service_type || '').toLowerCase();
      const type = (st.includes('קבוצ') || st === 'group') ? 'group' :
                   (st === 'אונליין' || st === 'online') ? 'online' : 'personal';
      countByType[type]++;
      if (type === 'group') groupTraineesSet.add(s.trainee_id);

      const price = s.final_price || s.price || 0;
      if (s.billing_model === 'subscription' || s.is_recurring) {
        revenueByType[type] += price;
      } else {
        const pDate = s.payment_date ? new Date(s.payment_date) : null;
        if (pDate && pDate >= monthStart && pDate <= monthEnd) {
          revenueByType[type] += price;
        }
      }
    });

    // ── Sessions ────────────────────────────────────────────────────
    const excludedStatuses = ['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'];
    const todaySessions = coachSessions.filter(s => s.date === todayStr && !excludedStatuses.includes(s.status));
    const upcomingSessions = coachSessions.filter(s => s.date > todayStr && !excludedStatuses.includes(s.status));
    const monthSessions = coachSessions.filter(s => s.date >= startMonthStr && s.date <= endMonthStr);
    const monthlyCompletedSessionsCount = monthSessions.filter(s => s.status === 'התקיים').length;

    // ── Leads ────────────────────────────────────────────────────────
    const newLeads = coachLeads.filter(l => l.status === 'חדש');
    const convertedLeads = coachLeads.filter(l => l.status === 'סגור עסקה');
    const conversionRate = coachLeads.length > 0 ? Math.round((convertedLeads.length / coachLeads.length) * 100) : 0;

    // ── Plans ────────────────────────────────────────────────────────
    const activePlans = coachPlans.filter(p => p.status === 'פעילה');

    // ── Renewals ─────────────────────────────────────────────────────
    const renewalsCount = activeServices.filter(s => {
      const endDate = s.next_billing_date || s.end_date;
      if (!endDate) return false;
      const d = new Date(endDate);
      const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 30;
    }).length;

    // ── Pending session requests ────────────────────────────────────
    const pendingSessionsCount = coachSessions.filter(s => s.status === 'ממתין לאישור').length;

    // ── Packages expiring within 7 days ─────────────────────────────
    const expiringPackages = activeServices.filter(s => {
      const endDate = s.end_date || s.expires_at;
      if (!endDate) return false;
      const d = new Date(endDate);
      const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    });

    // ── Trainee card data ────────────────────────────────────────────
    const traineeCards = trainees.map(t => {
      // Find best active package: has remaining sessions, earliest end_date
      const tServices = activeServices
        .filter(s => s.trainee_id === t.id)
        .filter(s => {
          const tot = s.total_sessions || s.sessions_count || 0;
          const usd = s.used_sessions || 0;
          return tot === 0 || (tot - usd) > 0; // group (no sessions) or has remaining
        })
        .sort((a, b) => {
          const aEnd = a.end_date || a.expires_at || '9999-12-31';
          const bEnd = b.end_date || b.expires_at || '9999-12-31';
          return new Date(aEnd) - new Date(bEnd);
        });
      const activePkg = tServices[0] || null;
      const total = activePkg ? (activePkg.total_sessions || activePkg.sessions_count || 0) : 0;
      const used = activePkg ? (activePkg.used_sessions || 0) : 0;
      const remaining = total > 0 ? total - used : null;
      const tSessions = coachSessions.filter(s => s.participants?.some(p => p.trainee_id === t.id));
      const lastSession = [...tSessions].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      return {
        ...t,
        activePkg,
        remaining,
        used,
        total,
        lastSessionDate: lastSession?.date || null,
        hasActivePackage: !!activePkg,
      };
    });

    return {
      trainees,
      traineeCards,
      totalClientsCount: trainees.length,
      activeClientsCount: activeClientIds.size,
      monthlyRevenue,
      todaySessions,
      upcomingSessions,
      completedSessions: coachSessions.filter(s => s.status === 'התקיים').slice(0, 10),
      serviceStats: {
        personal: monthSessions.filter(s => (s.session_type || '').includes('אישי')).length,
        group: monthSessions.filter(s => (s.session_type || '').includes('קבוצ')).length,
        online: monthSessions.filter(s => s.session_type === 'אונליין').length,
      },
      activePlansCount: activePlans.length,
      newLeadsCount: newLeads.length,
      pendingSessionsCount,
      expiringPackagesCount: expiringPackages.length,
      conversionRate,
      todaySessionsCount: todaySessions.length,
      upcomingSessionsCount: upcomingSessions.length,
      monthlyCompletedSessionsCount,
      revenueByType,
      countByType,
      groupTraineesCount: groupTraineesSet.size,
      renewalsCount,
    };
  }, [allUsers, allServices, allSessions, allPlans, allLeads, user?.id]);

  return { data: stats, isLoading };
}
