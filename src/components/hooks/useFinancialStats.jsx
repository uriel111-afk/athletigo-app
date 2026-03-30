import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

export function useFinancialStats() {
  const { data: allServices = [], isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.SERVICES,
    queryFn: async () => {
      try {
        // Canonical Source: ClientService
        return await base44.entities.ClientService.list('-payment_date', 2000);
      } catch (error) {
        console.error("[useFinancialStats] Error loading services:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: CACHE_CONFIG.REFETCH_INTERVAL,
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME,
    retry: 2
  });

  const payments = allServices.filter(s => s.payment_status === 'שולם');

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  // --- Calculations ---
  
  // 1. Total Revenue (All Time)
  const totalRevenue = payments.reduce((sum, p) => sum + (p.price || 0), 0);

  // 2. Monthly Revenue (This Month)
  const thisMonthPayments = payments.filter(p => {
    if (!p.payment_date) return false;
    const date = new Date(p.payment_date);
    return date >= thisMonthStart && date <= thisMonthEnd;
  });
  const monthlyRevenue = thisMonthPayments.reduce((sum, p) => sum + (p.price || 0), 0);

  // 3. Last Month Revenue
  const lastMonthPayments = payments.filter(p => {
    if (!p.payment_date) return false;
    const date = new Date(p.payment_date);
    return date >= lastMonthStart && date <= lastMonthEnd;
  });
  const lastMonthRevenue = lastMonthPayments.reduce((sum, p) => sum + (p.price || 0), 0);

  // 4. Month over Month Change
  const monthOverMonthChange = lastMonthRevenue > 0
    ? (((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
    : 0;

  // --- Logging (Required) ---
  console.log("USE_FINANCIAL_STATS_paymentsCount", payments.length);
  console.log("USE_FINANCIAL_STATS_totalRevenue", totalRevenue);
  console.log("USE_FINANCIAL_STATS_monthlyRevenue", monthlyRevenue);
  console.log("USE_FINANCIAL_STATS_lastMonthRevenue", lastMonthRevenue);

  return {
    payments, // Expose raw if needed
    totalRevenue,
    monthlyRevenue,
    lastMonthRevenue,
    monthOverMonthChange,
    isLoading,
    isError
  };
}