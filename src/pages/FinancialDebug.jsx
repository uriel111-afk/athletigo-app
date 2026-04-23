import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import PageLoader from "@/components/PageLoader";

export default function FinancialDebug() {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['financial-debug-payments'],
    queryFn: async () => {
      // Fetching ClientService as the canonical payments source
      // Filter: payment_status === 'שולם'
      const allServices = await base44.entities.ClientService.list('-payment_date', 1000);
      return allServices.filter(s => s.payment_status === 'שולם');
    },
    refetchInterval: 5000
  });

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  // Calculations
  const totalAllTime = payments.reduce((sum, p) => sum + (p.price || 0), 0);

  const thisMonthPayments = payments.filter(p => {
    if (!p.payment_date) return false;
    const date = new Date(p.payment_date);
    return date >= thisMonthStart && date <= thisMonthEnd;
  });
  const totalThisMonth = thisMonthPayments.reduce((sum, p) => sum + (p.price || 0), 0);

  const lastMonthPayments = payments.filter(p => {
    if (!p.payment_date) return false;
    const date = new Date(p.payment_date);
    return date >= lastMonthStart && date <= lastMonthEnd;
  });
  const totalLastMonth = lastMonthPayments.reduce((sum, p) => sum + (p.price || 0), 0);

  // Debug Logs
  console.log("FIN_DEBUG_rawPaymentsCount", payments.length);
  console.log("FIN_DEBUG_totalAllTime", totalAllTime);
  console.log("FIN_DEBUG_totalThisMonth", totalThisMonth);
  console.log("FIN_DEBUG_totalLastMonth", totalLastMonth);

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <ProtectedCoachPage>
      <div className="p-8 bg-white min-h-screen text-gray-900" dir="ltr">
        <h1 className="text-3xl font-bold mb-6">Financial Debug (Admin Only)</h1>
        
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-gray-100 rounded border">
            <h3 className="text-sm font-bold text-gray-500">Total All Time</h3>
            <p className="text-2xl font-bold">{totalAllTime.toLocaleString()} ₪</p>
          </div>
          <div className="p-4 bg-blue-50 rounded border border-blue-200">
            <h3 className="text-sm font-bold text-blue-500">Total This Month</h3>
            <p className="text-2xl font-bold text-blue-700">{totalThisMonth.toLocaleString()} ₪</p>
            <p className="text-xs text-blue-600">{payments.length} total records</p>
          </div>
          <div className="p-4 bg-gray-50 rounded border">
            <h3 className="text-sm font-bold text-gray-500">Total Last Month</h3>
            <p className="text-2xl font-bold">{totalLastMonth.toLocaleString()} ₪</p>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-4">Raw Payments List (Last 1000)</h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Client</th>
                <th className="p-3">Service/Package</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">ID</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{p.payment_date || "No Date"}</td>
                  <td className="p-3">{p.trainee_name}</td>
                  <td className="p-3">{p.package_name || p.service_type}</td>
                  <td className="p-3 font-mono font-bold">{p.price} ₪</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                      {p.payment_status}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-400">{p.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ProtectedCoachPage>
  );
}