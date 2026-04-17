import React, { useState, useEffect, useContext, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import {
  Users, UserPlus, Calendar, ClipboardList, Loader2,
  Target, Plus, Award, Search, Dumbbell, Bell,
  DollarSign, Ruler, LogOut, Package, Zap, Clock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AuthContext } from "@/lib/AuthContext";

import { useDashboardStats } from "../components/hooks/useDashboardStats";
import { usePackageExpiry } from "../components/hooks/usePackageExpiry";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { toast } from "sonner";
import { notifySessionScheduled, notifyPlanCreated } from "@/functions/notificationTriggers";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import AddTraineeDialog from "../components/forms/AddTraineeDialog";
import LeadFormDialog from "../components/forms/LeadFormDialog";
import SessionFormDialog from "../components/forms/SessionFormDialog";
import PlanFormDialog from "../components/training/PlanFormDialog";
import GoalFormDialog from "../components/forms/GoalFormDialog";
import ResultFormDialog from "../components/forms/ResultFormDialog";
import MeasurementFormDialog from "../components/forms/MeasurementFormDialog";
import PackageFormDialog from "../components/forms/PackageFormDialog";
import BaselineFormDialog from "../components/forms/BaselineFormDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// ── Design ────────────────────────────────────────────────────────────
const SectionHeader = ({ title }) => (
  <div className="flex items-center gap-3 my-3">
    <div className="flex-1 h-[1.5px] rounded-full" style={{ backgroundColor: "#FF6F20" }} />
    <span className="text-[11px] font-black text-gray-700 whitespace-nowrap">{title}</span>
    <div className="flex-1 h-[1.5px] rounded-full" style={{ backgroundColor: "#FF6F20" }} />
  </div>
);

const BG = {
  backgroundColor: "#FDF8F3",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cpath d='M20 60 Q60 20 100 60 T180 60' fill='none' stroke='%23e8ddd0' stroke-width='0.8'/%3E%3Cpath d='M10 100 Q50 60 90 100 T170 100' fill='none' stroke='%23e8ddd0' stroke-width='0.6'/%3E%3C/svg%3E")`,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: coach } = useContext(AuthContext);
  usePackageExpiry(coach?.id);

  // Trainees with packages — real-time
  const [trainees, setTrainees] = useState([]);

  const fetchTrainees = useCallback(async () => {
    if (!coach?.id) return;
    try {
      const { data: services } = await supabase
        .from('client_services')
        .select('trainee_id')
        .eq('coach_id', coach.id);

      const traineeIds = [...new Set((services || []).map(s => s.trainee_id).filter(Boolean))];
      if (traineeIds.length === 0) { setTrainees([]); return; }

      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, client_services(id, status, total_sessions, remaining_sessions, used_sessions, start_date, end_date, package_name)')
        .in('id', traineeIds)
        .order('full_name');

      setTrainees(users || []);
    } catch (err) {
      console.error('[Dashboard] fetchTrainees error:', err);
    }
  }, [coach?.id]);

  useEffect(() => {
    fetchTrainees();

    if (!coach?.id) return;

    const traineeChannel = supabase
      .channel('dashboard-trainees')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => fetchTrainees())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services' }, () => fetchTrainees())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => fetchTrainees())
      .subscribe();

    window.addEventListener('data-changed', fetchTrainees);

    return () => {
      supabase.removeChannel(traineeChannel);
      window.removeEventListener('data-changed', fetchTrainees);
    };
  }, [coach?.id, fetchTrainees]);

  // Dialog states
  const [isAddTraineeOpen, setIsAddTraineeOpen] = useState(false);
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [isMeasurementDialogOpen, setIsMeasurementDialogOpen] = useState(false);

  const [showActionPicker, setShowActionPicker] = useState(false);
  const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
  const [isBaselineDialogOpen, setIsBaselineDialogOpen] = useState(false);

  // Trainee selection for goal/result/measurement actions
  const [showSelectTraineeDialog, setShowSelectTraineeDialog] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [traineeSearch, setTraineeSearch] = useState("");

  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  // Direct trainees query — shared key with useDashboardStats, no initialData
  const { data: allTrainees = [] } = useQuery({
    queryKey: QUERY_KEYS.TRAINEES,
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    staleTime: 1000 * 30,
    refetchOnMount: 'always',
  });

  // Force-refetch all dashboard data after any mutation
  const refreshAll = () => {
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.TRAINEES });
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.SERVICES });
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.SESSIONS });
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.PLANS });
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.LEADS });
  };

  const {
    activeClientsCount = 0,
    upcomingSessionsCount = 0,
    newLeadsCount = 0,
    activePlansCount = 0,
    pendingSessionsCount = 0,
    expiringPackagesCount = 0,
    traineeCards = [],
  } = stats || {};

  // ── Handlers ────────────────────────────────────────────────────────
  const handleActionClick = (action) => {
    setPendingAction(action);
    setTraineeSearch("");
    setShowSelectTraineeDialog(true);
  };

  const handleTraineeSelect = (trainee) => {
    setSelectedTrainee(trainee);
    setShowSelectTraineeDialog(false);
    if (pendingAction === "goal") setIsGoalDialogOpen(true);
    if (pendingAction === "result") setIsResultDialogOpen(true);
    if (pendingAction === "measurement") setIsMeasurementDialogOpen(true);
    if (pendingAction === "package") setIsPackageDialogOpen(true);
    if (pendingAction === "baseline") setIsBaselineDialogOpen(true);
  };

  // ── Mutations ───────────────────────────────────────────────────────
  const createLeadMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.entities.Lead.create(data);
      return result;
    },
    onSuccess: () => {
      refreshAll();
      toast.success("ליד חדש נוסף בהצלחה");
    },
    onError: (e) => {
      console.error("[Dashboard] Lead creation error:", e);
      toast.error("שגיאה ביצירת ליד: " + (e.message || "נסה שוב"));
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: (d) => {
      return base44.entities.Session.create(d);
    },
    onSuccess: async (s) => {
      refreshAll();
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      toast.success("המפגש נקבע בהצלחה");
      if (s?.participants && coach) {
        for (const p of s.participants) {
          try {
            await notifySessionScheduled({ traineeId: p.trainee_id, sessionId: s.id, sessionDate: s.date, sessionTime: s.time, sessionType: s.session_type, coachName: coach.full_name });
          } catch {}
        }
      }
    },
    onError: (e) => {
      console.error("[Dashboard] Session creation error:", e);
      toast.error("שגיאה ביצירת מפגש: " + (e.message || "נסה שוב"));
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: async ({ planData, selectedTrainees }) => {
      if (!coach?.id) throw new Error("פרטי מאמן חסרים");
      const gf = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0 ? planData.goal_focus : ["כוח"];
      const targets = selectedTrainees?.length > 0 ? selectedTrainees : [null];
      const results = [];
      for (const tid of targets) {
        const t = allTrainees.find((x) => x.id === tid);
        results.push(await base44.entities.TrainingPlan.create({
          title: planData.plan_name, plan_name: planData.plan_name,
          assigned_to: t?.id || "", assigned_to_name: t?.full_name || "",
          created_by: coach.id, created_by_name: coach.full_name,
          goal_focus: gf, description: planData.description || "",
          start_date: new Date().toISOString().split("T")[0], status: "פעילה", is_template: false,
        }));
      }
      return results;
    },
    onSuccess: async (results) => {
      refreshAll();
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      toast.success("תוכנית נוצרה!");
      // Notify assigned trainees
      if (results && coach) {
        for (const plan of results) {
          if (plan.assigned_to) {
            try {
              await notifyPlanCreated({
                traineeId: plan.assigned_to,
                traineeName: plan.assigned_to_name,
                planName: plan.plan_name || plan.title,
                coachName: coach.full_name,
              });
            } catch {}
          }
        }
      }
      if (results?.length === 1 && results[0]?.id) {
        navigate(createPageUrl("TrainingPlanView") + `?planId=${results[0].id}`);
      } else {
        navigate(createPageUrl("ActivePlans"));
      }
    },
    onError: (e) => {
      console.error("[Dashboard] Plan creation error:", e);
      toast.error("שגיאה ביצירת תוכנית: " + (e.message || "נסה שוב"));
    },
  });

  // ── Loading ─────────────────────────────────────────────────────────
  if (!coach) {
    return (
      <ProtectedCoachPage>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF6F20]" />
        </div>
      </ProtectedCoachPage>
    );
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <ProtectedCoachPage>
      <div className="flex flex-col" dir="rtl" style={BG}>
        <div className="max-w-md mx-auto w-full px-4 pt-4 pb-4">

          {/* ── Header ──────────────────────────────────────────── */}
          <div className="text-center mb-1">
            <h2 className="text-[11px] font-black tracking-[0.18em] text-[#FF6F20]" style={{ fontFamily: "Barlow, sans-serif" }}>ATHLETIGO</h2>
            <h1 className="text-xl font-black text-gray-900 mt-0.5">דשבורד מאמן</h1>
          </div>

          {/* ═══ SECTION 1 — פעולות ליבה ═══════════════════════ */}
          <SectionHeader title="פעולות ליבה" />
          <div className="grid grid-cols-2 gap-2 mb-1">
            {[
              { label: "הוסף ליד",    icon: UserPlus, onClick: () => setIsLeadDialogOpen(true) },
              { label: "הוסף מתאמן",  icon: Plus,     onClick: () => setIsAddTraineeOpen(true) },
              { label: "קבע מפגש",    icon: Calendar, onClick: () => setIsSessionDialogOpen(true) },
              { label: "בנה תוכנית",  icon: Dumbbell, onClick: () => setIsPlanDialogOpen(true) },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.onClick}
                className="h-11 bg-white rounded-full border border-gray-200 shadow-sm flex items-center justify-center gap-2 hover:border-[#FF6F20] hover:shadow-md transition-all active:scale-[0.97]">
                <btn.icon className="w-4 h-4 text-[#FF6F20]" />
                <span className="text-[13px] font-bold text-gray-800">{btn.label}</span>
              </button>
            ))}
          </div>

          {/* ═══ SECTION 2 — מטריקות מרכזיות ═══════════════════ */}
          <SectionHeader title="מטריקות" />
          <div className="grid grid-cols-3 gap-2 mb-1">
            {[
              { label: "מתאמנים פעילים", value: activeClientsCount,    color: "#4CAF50", to: createPageUrl("AllUsers") + "?filter=active" },
              { label: "מפגשים קרובים",  value: upcomingSessionsCount, color: "#9C27B0", to: createPageUrl("Sessions") + "?status=upcoming" },
              { label: "לידים חדשים",    value: newLeadsCount,         color: "#FFC107", to: createPageUrl("Leads") + "?filter=new" },
              { label: "תוכניות פעילות", value: activePlansCount,      color: "#FF6F20", to: createPageUrl("ActivePlans") },
            ].map((m) => (
              <button key={m.label} onClick={() => navigate(m.to)}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm py-3 flex flex-col items-center cursor-pointer hover:shadow-md transition-all active:scale-[0.97]">
                {statsLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                ) : (
                  <span className="text-2xl font-black leading-none" style={{ color: m.color }}>{m.value}</span>
                )}
                <span className="text-[10px] font-bold text-gray-500 mt-1">{m.label}</span>
              </button>
            ))}
          </div>

          {/* ═══ SECTION 3 — מתאמנים ═══════════════════════════ */}
          {trainees.length > 0 && (
            <>
              <SectionHeader title="מתאמנים" />
              <div style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                padding: '4px 0 8px'
              }}>
                <style>{`.trainees-row::-webkit-scrollbar { display: none; }`}</style>
                <div className="trainees-row" style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '12px',
                  width: 'max-content',
                  padding: '0 16px'
                }}>
                  {trainees.map((trainee) => {
                    const activePackage = trainee.client_services?.find(pkg =>
                      (pkg.status === 'active' || pkg.status === 'פעיל') &&
                      ((pkg.remaining_sessions ?? (pkg.total_sessions - (pkg.used_sessions || 0))) > 0) &&
                      (!pkg.end_date || new Date(pkg.end_date) >= new Date())
                    );

                    const total = activePackage?.total_sessions ?? 0;
                    const remaining = activePackage?.remaining_sessions ?? (total - (activePackage?.used_sessions || 0));
                    const used = total - remaining;

                    return (
                      <div
                        key={trainee.id}
                        onClick={() => navigate(`/trainee/${trainee.id}`)}
                        style={{
                          width: '120px',
                          flexShrink: 0,
                          background: 'white',
                          border: '0.5px solid #eee',
                          borderRadius: '16px',
                          padding: '14px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                        }}
                      >
                        {/* Avatar */}
                        <div style={{
                          width: '48px', height: '48px',
                          borderRadius: '50%',
                          background: '#FF6F20',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '20px', fontWeight: '900', color: 'white'
                        }}>
                          {(trainee.full_name || '?')[0]}
                        </div>

                        {/* Name */}
                        <div style={{
                          fontSize: '13px', fontWeight: '700', color: '#1a1a1a',
                          textAlign: 'center',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', width: '100%'
                        }}>
                          {trainee.full_name}
                        </div>

                        {/* Package info */}
                        {activePackage ? (
                          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '11px', color: '#666', textAlign: 'center' }}>
                              {remaining} נותרו
                            </div>
                            <div style={{
                              height: '4px', background: '#F0F0F0',
                              borderRadius: '2px', overflow: 'hidden'
                            }}>
                              <div style={{
                                height: '100%',
                                width: `${total > 0 ? (used / total) * 100 : 0}%`,
                                background: remaining <= 1 ? '#ef4444' : '#FF6F20',
                                borderRadius: '2px'
                              }}/>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            fontSize: '10px', color: '#FF6F20',
                            fontWeight: '600', textAlign: 'center'
                          }}>
                            אין חבילה
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ═══ SECTION 4 — גישה מהירה ═══════════════════════ */}
          <SectionHeader title="גישה מהירה" />
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "שיא",       icon: Award,      action: () => handleActionClick("result") },
              { label: "יעד",       icon: Target,     action: () => handleActionClick("goal") },
              { label: "בייסליין",  icon: Zap,        action: () => handleActionClick("baseline") },
              { label: "מדידה",     icon: Ruler,      action: () => handleActionClick("measurement") },
              { label: "חבילה",     icon: Package,    action: () => handleActionClick("package") },
              { label: "שעונים",    icon: Clock,      action: () => navigate(createPageUrl("Clocks")) },
              { label: "התראות",    icon: Bell,       action: () => navigate(createPageUrl("Notifications")) },
            ].map((q) => (
              <button key={q.label} onClick={q.action}
                className="bg-white rounded-xl border border-gray-100 shadow-sm py-3 flex flex-col items-center gap-1.5 cursor-pointer hover:border-[#FF6F20]/30 hover:shadow-md transition-all active:scale-[0.97]">
                <div className="w-9 h-9 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                  <q.icon className="w-4 h-4 text-[#FF6F20]" />
                </div>
                <span className="text-[10px] font-bold text-gray-600 text-center leading-tight">{q.label}</span>
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      <AddTraineeDialog open={isAddTraineeOpen} onClose={() => { setIsAddTraineeOpen(false); refreshAll(); }} />
      <LeadFormDialog isOpen={isLeadDialogOpen} onClose={() => setIsLeadDialogOpen(false)}
        onSubmit={async (data) => {
          await createLeadMutation.mutateAsync({ ...data, coach_id: coach?.id || null });
        }}
        isLoading={createLeadMutation.isPending} />
      <SessionFormDialog isOpen={isSessionDialogOpen} onClose={() => setIsSessionDialogOpen(false)}
        onSubmit={async (data) => {
          await createSessionMutation.mutateAsync({ ...data, location: data.location || "לא צוין", duration: data.duration || 60, coach_id: coach?.id, status: "ממתין לאישור" });
        }}
        trainees={allTrainees} isLoading={createSessionMutation.isPending} />
      <PlanFormDialog isOpen={isPlanDialogOpen} onClose={() => setIsPlanDialogOpen(false)}
        onSubmit={async (data) => { await createPlanMutation.mutateAsync(data); }}
        trainees={allTrainees} isLoading={createPlanMutation.isPending} />

      {/* Action Picker removed — שיא/יעד/בייסליין are separate buttons now */}
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent><div /></DialogContent>
      </Dialog>

      {/* Select Trainee Dialog */}
      <Dialog open={showSelectTraineeDialog} onOpenChange={setShowSelectTraineeDialog}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-right">בחר מתאמן</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input placeholder="חפש מתאמן..." value={traineeSearch}
              onChange={(e) => setTraineeSearch(e.target.value)} className="pr-9 h-10 rounded-xl" />
          </div>
          <div className="space-y-2">
            {allTrainees.filter((t) => t.full_name?.includes(traineeSearch)).map((trainee) => (
              <div key={trainee.id} onClick={() => handleTraineeSelect(trainee)}
                className="p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                  {trainee.full_name?.[0]}
                </div>
                <span className="font-medium text-sm text-gray-800">{trainee.full_name}</span>
              </div>
            ))}
            {allTrainees.length === 0 && <p className="text-center text-gray-400 text-sm py-4">אין מתאמנים</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Trainee-specific form dialogs */}
      {selectedTrainee && (
        <>
          <GoalFormDialog isOpen={isGoalDialogOpen} onClose={() => setIsGoalDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <ResultFormDialog isOpen={isResultDialogOpen} onClose={() => setIsResultDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <MeasurementFormDialog isOpen={isMeasurementDialogOpen} onClose={() => setIsMeasurementDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <PackageFormDialog isOpen={isPackageDialogOpen} onClose={() => setIsPackageDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <BaselineFormDialog isOpen={isBaselineDialogOpen} onClose={() => setIsBaselineDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
        </>
      )}
    </ProtectedCoachPage>
  );
}
