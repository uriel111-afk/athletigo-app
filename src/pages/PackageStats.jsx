import React, { useState, useContext } from "react";
import { AuthContext } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { Package, Users, DollarSign, AlertTriangle, Clock, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { usePackageExpiry } from "../components/hooks/usePackageExpiry";
import PackageDetailsDialog from "../components/PackageDetailsDialog";
import PackageFormDialog from "../components/forms/PackageFormDialog";
import PageLoader from "../components/PageLoader";
import ProtectedCoachPage from "../components/ProtectedCoachPage";

export default function PackageStats() {
  const { user: coach } = useContext(AuthContext);
  const navigate = useNavigate();
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [editingPkg, setEditingPkg] = useState(null);

  usePackageExpiry(coach?.id);

  const { data: allServices = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.SERVICES,
    queryFn: () => base44.entities.ClientService.list('-created_at', 2000).catch(() => []),
    initialData: [],
  });

  if (!coach) return <ProtectedCoachPage><PageLoader /></ProtectedCoachPage>;

  const coachServices = allServices.filter(s => s.coach_id === coach.id);
  const active = coachServices.filter(s => s.status === "פעיל" || s.status === "active");
  const personal = active.filter(s => s.package_type === "personal" || (!s.package_type && s.service_type?.includes("אישי")));
  const group = active.filter(s => s.package_type === "group" || s.service_type?.includes("קבוצ"));
  const online = active.filter(s => s.package_type === "online");

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const ago30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const expiringSoon = coachServices.filter(s => {
    if (s.status !== "פעיל" && s.status !== "active") return false;
    if (!s.expires_at) {
      const rem = (s.total_sessions || s.sessions_count || 0) - (s.used_sessions || 0);
      return rem === 1;
    }
    const exp = new Date(s.expires_at);
    return exp >= now && exp <= in14Days;
  });

  const recentlyEnded = coachServices.filter(s => {
    if (s.status !== "completed" && s.status !== "expired") return false;
    const updated = new Date(s.updated_at || s.created_at);
    return updated >= ago30Days;
  });

  const sumPrice = (arr) => arr.reduce((sum, s) => sum + (s.price || s.final_price || 0), 0);

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen pb-24" dir="rtl" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
            <Package className="w-6 h-6 text-[#FF6F20]" />
            סטטיסטיקות חבילות
          </h1>

          {isLoading ? <PageLoader message="טוען חבילות..." /> : (
            <div className="space-y-4">
              {/* Distribution */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-sm font-bold text-gray-700 mb-3">חלוקה לפי סוג</h2>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "אישי", count: personal.length, revenue: sumPrice(personal), color: "#FF6F20" },
                    { label: "קבוצתי", count: group.length, revenue: sumPrice(group), color: "#4CAF50" },
                    { label: "אונליין", count: online.length, revenue: sumPrice(online), color: "#2196F3" },
                  ].map(t => (
                    <div key={t.label} className="text-center p-3 rounded-xl" style={{ backgroundColor: t.color + "10" }}>
                      <div className="text-2xl font-black" style={{ color: t.color }}>{t.count}</div>
                      <div className="text-[10px] font-bold text-gray-500">{t.label}</div>
                      <div className="text-xs font-bold mt-1" style={{ color: t.color }}>₪{t.revenue.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-sm font-bold text-gray-700 mb-3">הכנסות מחבילות</h2>
                <div className="text-3xl font-black text-[#FF6F20] text-center">₪{sumPrice(active).toLocaleString()}</div>
                <div className="text-xs text-gray-400 text-center mt-1">סה"כ מחבילות פעילות</div>
              </div>

              {/* Expiring soon */}
              {expiringSoon.length > 0 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-red-100">
                  <h2 className="text-sm font-bold text-red-600 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    מסתיימות ב-14 ימים ({expiringSoon.length})
                  </h2>
                  <div className="space-y-2">
                    {expiringSoon.map(s => (
                      <button key={s.id} onClick={() => setSelectedPkg(s)}
                        className="w-full flex items-center justify-between p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors text-right">
                        <div>
                          <span className="text-sm font-bold text-gray-900">{s.trainee_name || "מתאמן"}</span>
                          <span className="text-xs text-gray-500 mr-2">{s.package_name}</span>
                        </div>
                        <span className="text-xs text-red-600 font-bold">{s.expires_at || `נותר ${(s.total_sessions || 0) - (s.used_sessions || 0)}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recently ended */}
              {recentlyEnded.length > 0 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
                    <Clock size={16} />
                    הסתיימו לאחרונה ({recentlyEnded.length})
                  </h2>
                  <div className="space-y-2">
                    {recentlyEnded.map(s => (
                      <button key={s.id} onClick={() => navigate(createPageUrl("TraineeProfile") + `?userId=${s.trainee_id}`)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-right">
                        <span className="text-sm font-bold text-gray-700">{s.trainee_name || "מתאמן"}</span>
                        <span className="text-xs text-gray-400">{s.package_name} — {s.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {active.length === 0 && !isLoading && (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-bold">אין חבילות פעילות</p>
                </div>
              )}
            </div>
          )}
        </div>

        <PackageDetailsDialog isOpen={!!selectedPkg} onClose={() => setSelectedPkg(null)}
          packageData={selectedPkg} onEdit={(pkg) => { setSelectedPkg(null); setEditingPkg(pkg); }} />
        <PackageFormDialog isOpen={!!editingPkg} onClose={() => setEditingPkg(null)}
          traineeId={editingPkg?.trainee_id} traineeName={editingPkg?.trainee_name} editingPackage={editingPkg} />
      </div>
    </ProtectedCoachPage>
  );
}
