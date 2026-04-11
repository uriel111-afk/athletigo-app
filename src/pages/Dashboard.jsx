import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Users,
  UserPlus,
  Calendar,
  ClipboardList,
  TrendingUp,
  UserCheck,
  Activity,
  Loader2,
  Target,
  Star,
  Plus,
  DollarSign,
  Award,
  Search,
  Dumbbell,
  Video,
  LogOut } from
"lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { he } from "date-fns/locale";

// Shared Hooks
import { useDashboardStats } from "../components/hooks/useDashboardStats";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notifySessionScheduled } from "@/functions/notificationTriggers";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import AddTraineeDialog from "../components/forms/AddTraineeDialog";
import LeadFormDialog from "../components/forms/LeadFormDialog";
import SessionFormDialog from "../components/forms/SessionFormDialog";
import PlanFormDialog from "../components/training/PlanFormDialog";
import BaselineTestDialog from "../components/forms/BaselineTestDialog";
import GoalFormDialog from "../components/forms/GoalFormDialog";
import ResultFormDialog from "../components/forms/ResultFormDialog";
import MeasurementFormDialog from "../components/forms/MeasurementFormDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { QUERY_KEYS } from "@/components/utils/queryKeys";

const ShekelIcon = (props) =>
<span
  {...props}
  className={`font-sans font-bold inline-flex items-center justify-center ${props.className || ''}`}
  style={{ ...props.style, fontSize: '1.2em', lineHeight: 1 }}>
    ₪
  </span>;

// ── Design helpers ──────────────────────────────────────────────────────────
const SectionHeader = ({ title }) => (
  <div className="flex items-center gap-3 my-4">
    <div className="flex-1 h-[1.5px] rounded-full" style={{ backgroundColor: '#FF6F20' }} />
    <span className="text-xs font-black text-gray-800 whitespace-nowrap">{title}</span>
    <div className="flex-1 h-[1.5px] rounded-full" style={{ backgroundColor: '#FF6F20' }} />
  </div>
);

const BG_TEXTURE = {
  backgroundColor: '#FDF8F3',
  backgroundImage: `
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cpath d='M20 60 Q60 20 100 60 T180 60' fill='none' stroke='%23e8ddd0' stroke-width='0.8'/%3E%3Cpath d='M10 100 Q50 60 90 100 T170 100' fill='none' stroke='%23e8ddd0' stroke-width='0.6'/%3E%3Cpath d='M30 140 Q70 100 110 140 T190 140' fill='none' stroke='%23e8ddd0' stroke-width='0.7'/%3E%3C/svg%3E")
  `,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [coach, setCoach] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Dialog States
  const [isAddTraineeOpen, setIsAddTraineeOpen] = useState(false);
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [isBaselineDialogOpen, setIsBaselineDialogOpen] = useState(false);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [isMeasurementDialogOpen, setIsMeasurementDialogOpen] = useState(false);
  const [isSessionTypeOpen, setIsSessionTypeOpen] = useState(false);

  // Trainee Selection for Actions
  const [showSelectTraineeDialog, setShowSelectTraineeDialog] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [traineeSearch, setTraineeSearch] = useState("");

  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  useEffect(() => {
    if (!statsLoading) {
      setLastUpdated(new Date());
    }
  }, [stats, statsLoading]);

  useEffect(() => {
    const loadCoach = async () => {
      try {
        const currentCoach = await base44.auth.me();
        setCoach(currentCoach);
      } catch (error) {
        console.error("Error loading coach:", error);
      }
    };
    loadCoach();
  }, []);

  const {
    trainees: allTrainees = [],
    activeClientsCount = 0,
    totalClientsCount = 0,
    monthlyRevenue = 0,
    upcomingSessionsCount = 0,
    monthlyCompletedSessionsCount = 0,
    newLeadsCount = 0,
    conversionRate = 0,
    activePlansCount = 0,
    serviceStats = { personal: 0, group: 0, online: 0 },
    revenueByType = { personal: 0, group: 0, online: 0 },
    groupTraineesCount = 0,
    renewalsCount = 0
  } = stats || {};

  // --- Handlers ---

  const handleActionClick = (action) => {
    setPendingAction(action);
    setTraineeSearch("");
    setShowSelectTraineeDialog(true);
  };

  const handleTraineeSelect = (trainee) => {
    setSelectedTrainee(trainee);
    setShowSelectTraineeDialog(false);

    if (pendingAction === 'goal') setIsGoalDialogOpen(true);
    if (pendingAction === 'result') setIsResultDialogOpen(true);
    if (pendingAction === 'measurement') setIsMeasurementDialogOpen(true);
  };

  // --- Mutations ---

  const createLeadMutation = useMutation({
    mutationFn: (data) => base44.entities.Lead.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LEADS });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setIsLeadDialogOpen(false);
      toast.success("✅ ליד חדש נוסף בהצלחה");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בהוספת ליד: " + (error.message || "נסה שוב"));
    }
  });

  const createSessionMutation = useMutation({
    mutationFn: (sessionData) => base44.entities.Session.create(sessionData),
    onSuccess: async (createdSession) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS });
      setIsSessionDialogOpen(false);
      toast.success("✅ המפגש נקבע בהצלחה");
      if (createdSession?.participants && coach) {
        for (const participant of createdSession.participants) {
          await notifySessionScheduled({
            traineeId: participant.trainee_id,
            sessionDate: createdSession.date,
            sessionTime: createdSession.time,
            sessionType: createdSession.session_type,
            coachName: coach.full_name
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      toast.error("❌ שגיאה בקביעת המפגש: " + (error.message || "נסה שוב"));
    }
  });

  const createPlanMutation = useMutation({
    mutationFn: async ({ planData, selectedTrainees }) => {
      if (!coach || !coach.id) throw new Error("פרטי מאמן חסרים");
      const goalFocusArray = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0 ? planData.goal_focus : ['כוח'];
      const plansToCreate = [];

      if (selectedTrainees && selectedTrainees.length > 0) {
        for (const traineeId of selectedTrainees) {
          const trainee = allTrainees.find((t) => t.id === traineeId);
          if (trainee) {
            plansToCreate.push({
              title: planData.plan_name,
              plan_name: planData.plan_name,
              assigned_to: trainee.id,
              assigned_to_name: trainee.full_name,
              created_by: coach.id,
              created_by_name: coach.full_name,
              goal_focus: goalFocusArray,
              description: planData.description || "",
              start_date: new Date().toISOString().split('T')[0],
              status: "פעילה",
              is_template: false
            });
          }
        }
      } else {
        plansToCreate.push({
          title: planData.plan_name,
          plan_name: planData.plan_name,
          assigned_to: "",
          assigned_to_name: "",
          created_by: coach.id,
          created_by_name: coach.full_name,
          goal_focus: goalFocusArray,
          description: planData.description || "",
          start_date: new Date().toISOString().split('T')[0],
          status: "פעילה",
          is_template: false
        });
      }

      const results = [];
      for (const plan of plansToCreate) {
        const result = await base44.entities.TrainingPlan.create(plan);
        results.push(result);
      }
      return results;
    },
    onSuccess: async (results) => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLANS });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setIsPlanDialogOpen(false);
      toast.success("✅ תוכנית נוצרה בהצלחה!");
      if (results && results.length === 1 && results[0]?.id) {
        navigate(createPageUrl("TrainingPlanView") + `?planId=${results[0].id}`);
      } else {
        navigate(createPageUrl("ActivePlans"));
      }
    },
    onError: (error) => {
      toast.error("❌ שגיאה ביצירת תוכנית: " + (error.message || "נסה שוב"));
    }
  });

  if (!coach) {
    return (
      <ProtectedCoachPage>
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF6F20]" />
        </div>
      </ProtectedCoachPage>);

  }

  return (
    <ProtectedCoachPage>
      <div className="min-h-[100dvh] flex flex-col overflow-x-hidden" dir="rtl" style={BG_TEXTURE}>
        <div className="max-w-md mx-auto w-full px-4 pt-6 pb-24 flex-1 flex flex-col">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-1 px-1">
            <button
              onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
              className="flex items-center gap-1.5 text-gray-400 text-[10px] font-semibold hover:text-red-500 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              יציאה
            </button>
            <span className="text-[10px] text-gray-400 font-mono">
              {lastUpdated.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="text-center mb-2">
            <h2 className="text-sm font-black tracking-[0.15em] text-[#FF6F20]" style={{ fontFamily: 'Barlow, sans-serif' }}>ATHLETIGO</h2>
            <h1 className="text-2xl font-black text-gray-900 mt-0.5">דשבורד מאמן</h1>
          </div>

          {/* ── פעולות הליבה ────────────────────────────────────────── */}
          <SectionHeader title="פעולות הליבה" />
          <div className="flex flex-col gap-2 mb-1">
            <button
              onClick={() => setIsLeadDialogOpen(true)}
              className="w-full h-12 bg-white rounded-full border border-gray-200 shadow-sm flex items-center justify-center gap-2 hover:border-[#FF6F20] hover:shadow-md transition-all active:scale-[0.98]"
            >
              <span className="text-[#FF6F20] font-black text-sm">A:</span>
              <span className="text-sm font-bold text-gray-800">הוסף ליד</span>
            </button>
            <button
              onClick={() => setIsAddTraineeOpen(true)}
              className="w-full h-12 bg-white rounded-full border border-gray-200 shadow-sm flex items-center justify-center gap-2 hover:border-[#FF6F20] hover:shadow-md transition-all active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 text-[#FF6F20]" />
              <span className="text-sm font-bold text-gray-800">הוסף מתאמן</span>
            </button>
            <button
              onClick={() => setIsSessionDialogOpen(true)}
              className="w-full h-12 bg-white rounded-full border border-gray-200 shadow-sm flex items-center justify-center gap-2 hover:border-[#FF6F20] hover:shadow-md transition-all active:scale-[0.98]"
            >
              <Calendar className="w-4 h-4 text-[#FF6F20]" />
              <span className="text-sm font-bold text-gray-800">קבע מפגש</span>
            </button>
          </div>

          {/* ── Two side-by-side cards ──────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {/* Card: ניהול לקוחות */}
            <div className="bg-white rounded-2xl border border-[#FF6F20]/20 shadow-sm overflow-hidden">
              <div className="bg-[#FFF7ED] px-3 py-2 border-b border-[#FF6F20]/10">
                <h3 className="text-[11px] font-black text-gray-800 text-center">ניהול לקוחות</h3>
              </div>
              <div className="grid grid-cols-2 gap-1 p-2.5">
                <button onClick={() => navigate(createPageUrl("AllUsers") + "?filter=active")} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <Users className="w-4 h-4 text-[#FF6F20]" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600">מתאמנים</span>
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </button>
                <button onClick={() => navigate(createPageUrl("ActivePlans"))} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <ClipboardList className="w-4 h-4 text-[#FF6F20]" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600">תוכניות</span>
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </button>
                <button onClick={() => handleActionClick('goal')} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <Target className="w-4 h-4 text-[#FF6F20]" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600">יעדים</span>
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </button>
                <button onClick={() => navigate(createPageUrl("Leads"))} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-[#FF6F20]" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600">לידים</span>
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                </button>
              </div>
            </div>

            {/* Card: מדדים פיזיים */}
            <div className="bg-white rounded-2xl border border-[#FF6F20]/20 shadow-sm overflow-hidden">
              <div className="bg-[#FFF7ED] px-3 py-2 border-b border-[#FF6F20]/10">
                <h3 className="text-[11px] font-black text-gray-800 text-center">מדדים פיזיים</h3>
              </div>
              <div className="grid grid-cols-2 gap-1 p-2.5">
                <button onClick={() => setIsBaselineDialogOpen(true)} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <Activity className="w-4 h-4 text-[#FF6F20]" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600">Baseline</span>
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </button>
                <button onClick={() => handleActionClick('result')} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <Award className="w-4 h-4 text-[#FF6F20]" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600">שיאים</span>
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </button>
                <button onClick={() => handleActionClick('measurement')} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <Star className="w-4 h-4 text-[#FF6F20]" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600">מדידות</span>
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </button>
                <button onClick={() => setIsPlanDialogOpen(true)} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <Dumbbell className="w-4 h-4 text-[#FF6F20]" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600">בנה תוכנית</span>
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </button>
              </div>
            </div>
          </div>

          {/* ── המשימות — Stats ────────────────────────────────────── */}
          <SectionHeader title="המשימות" />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="grid grid-cols-3 gap-3">
              {/* Conversion rate */}
              <button onClick={() => navigate(createPageUrl("ConversionDashboard"))} className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-[#4CAF50]">{conversionRate}%</span>
                <span className="text-[10px] font-bold text-gray-500">שיעור המרה</span>
              </button>
              {/* New leads */}
              <button onClick={() => navigate(createPageUrl("Leads") + "?filter=new")} className="flex flex-col items-center gap-1 border-x border-gray-100">
                <span className="text-2xl font-black text-[#FF6F20]">{newLeadsCount}</span>
                <span className="text-[10px] font-bold text-gray-500">לידים חדשים</span>
              </button>
              {/* Total users */}
              <button onClick={() => navigate(createPageUrl("AllUsers"))} className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-gray-800">{totalClientsCount}</span>
                <span className="text-[10px] font-bold text-gray-500">כל המשתמשים</span>
              </button>
            </div>
          </div>

          {/* ── Quick stats row ────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div onClick={() => navigate(createPageUrl("Sessions") + "?status=completed")} className="bg-white rounded-xl border border-gray-100 shadow-sm py-3 flex flex-col items-center cursor-pointer hover:border-[#FF6F20]/30 transition-colors">
              <Dumbbell className="w-4 h-4 text-[#FF6F20] mb-1" />
              <span className="text-lg font-black text-gray-900">{monthlyCompletedSessionsCount}</span>
              <span className="text-[9px] font-bold text-gray-400">אימונים</span>
            </div>
            <div onClick={() => navigate(createPageUrl("Sessions") + "?status=upcoming")} className="bg-white rounded-xl border border-gray-100 shadow-sm py-3 flex flex-col items-center cursor-pointer hover:border-[#FF6F20]/30 transition-colors">
              <Calendar className="w-4 h-4 text-[#FF6F20] mb-1" />
              <span className="text-lg font-black text-gray-900">{upcomingSessionsCount}</span>
              <span className="text-[9px] font-bold text-gray-400">מפגשים קרובים</span>
            </div>
            <div onClick={() => navigate(createPageUrl("FinancialOverview") + "?period=current_month")} className="bg-white rounded-xl border border-gray-100 shadow-sm py-3 flex flex-col items-center cursor-pointer hover:border-[#FF6F20]/30 transition-colors">
              <ShekelIcon className="text-[#FF6F20] mb-1" style={{ fontSize: '16px' }} />
              <span className="text-lg font-black text-gray-900">₪{(monthlyRevenue || 0).toLocaleString()}</span>
              <span className="text-[9px] font-bold text-gray-400">הכנסות</span>
            </div>
          </div>

          {/* ── Revenue breakdown ──────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div onClick={() => navigate(createPageUrl("FinancialOverview") + "?serviceType=personal&period=current_month")} className="bg-white/70 rounded-xl py-2 flex flex-col items-center cursor-pointer hover:bg-white transition-colors">
              <span className="text-xs font-black text-[#FF6F20]">₪{revenueByType.personal.toLocaleString()}</span>
              <span className="text-[9px] text-gray-400 font-bold">אישי</span>
            </div>
            <div onClick={() => navigate(createPageUrl("FinancialOverview") + "?serviceType=group&period=current_month")} className="bg-white/70 rounded-xl py-2 flex flex-col items-center cursor-pointer hover:bg-white transition-colors">
              <span className="text-xs font-black text-[#FF6F20]">₪{revenueByType.group.toLocaleString()}</span>
              <span className="text-[9px] text-gray-400 font-bold">קבוצה</span>
            </div>
            <div onClick={() => navigate(createPageUrl("FinancialOverview") + "?serviceType=online&period=current_month")} className="bg-white/70 rounded-xl py-2 flex flex-col items-center cursor-pointer hover:bg-white transition-colors">
              <span className="text-xs font-black text-[#FF6F20]">₪{revenueByType.online.toLocaleString()}</span>
              <span className="text-[9px] text-gray-400 font-bold">אונליין</span>
            </div>
          </div>

          {/* ── Bottom row — groups & renewals ─────────────────────── */}
          <div className="grid grid-cols-2 gap-2 mt-2 mb-4">
            <div onClick={() => navigate(createPageUrl("AllUsers") + "?filter=group")} className="bg-white rounded-xl border border-gray-100 shadow-sm py-2.5 flex flex-col items-center cursor-pointer hover:border-[#FF6F20]/30 transition-colors">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#FF6F20]" />
                <span className="text-lg font-black text-gray-900">{groupTraineesCount}</span>
              </div>
              <span className="text-[9px] font-bold text-gray-400">מתאמני קבוצות</span>
            </div>
            <div onClick={() => navigate(createPageUrl("FinancialOverview") + "?paymentStatus=renewals&period=current_month")} className="bg-white rounded-xl border border-gray-100 shadow-sm py-2.5 flex flex-col items-center cursor-pointer hover:border-[#FF6F20]/30 transition-colors">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#FF6F20]" />
                <span className="text-lg font-black text-gray-900">{renewalsCount}</span>
              </div>
              <span className="text-[9px] font-bold text-gray-400">חידושים (30 יום)</span>
            </div>
          </div>

        </div>
        
        {/* Dialogs */}
        <AddTraineeDialog open={isAddTraineeOpen} onClose={() => setIsAddTraineeOpen(false)} />
        
        <LeadFormDialog
          isOpen={isLeadDialogOpen}
          onClose={() => setIsLeadDialogOpen(false)}
          onSubmit={async (data) => createLeadMutation.mutate({ ...data, coach_id: coach?.id || null })}
          isLoading={createLeadMutation.isPending} />


        <SessionFormDialog
          isOpen={isSessionDialogOpen}
          onClose={() => setIsSessionDialogOpen(false)}
          onSubmit={(data) => createSessionMutation.mutate({ ...data, location: data.location || "לא צוין", duration: data.duration || 60, coach_id: coach?.id, coach_name: coach?.full_name || "המאמן", status: 'ממתין לאישור' })}
          trainees={allTrainees}
          isLoading={createSessionMutation.isPending} />


        <PlanFormDialog
          isOpen={isPlanDialogOpen}
          onClose={() => setIsPlanDialogOpen(false)}
          onSubmit={(data) => createPlanMutation.mutate(data)}
          trainees={allTrainees}
          isLoading={createPlanMutation.isPending} />


        <BaselineTestDialog isOpen={isBaselineDialogOpen} onClose={() => setIsBaselineDialogOpen(false)} />

        {/* Select Trainee Dialog */}
        <Dialog open={showSelectTraineeDialog} onOpenChange={setShowSelectTraineeDialog}>
          <DialogContent className="w-[90vw] max-w-sm max-h-[80vh] overflow-y-auto p-4 bg-white" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-center">בחר מתאמן</DialogTitle>
            </DialogHeader>
            <div className="relative mb-3">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="חפש מתאמן..."
                value={traineeSearch}
                onChange={(e) => setTraineeSearch(e.target.value)}
                className="pr-9 h-10 rounded-xl" />

            </div>
            <div className="space-y-2">
              {allTrainees.filter((t) => t.full_name?.includes(traineeSearch)).map((trainee) =>
              <div
                key={trainee.id}
                onClick={() => handleTraineeSelect(trainee)}
                className="p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors">

                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                    {trainee.full_name?.[0]}
                  </div>
                  <span className="font-medium text-sm text-gray-800">{trainee.full_name}</span>
                </div>
              )}
              {allTrainees.length === 0 && <p className="text-center text-gray-400 text-sm py-4">אין מתאמנים זמינים</p>}
            </div>
          </DialogContent>
        </Dialog>

        {/* Forms linked to specific trainees */}
        {selectedTrainee &&
        <>
            <GoalFormDialog
            isOpen={isGoalDialogOpen}
            onClose={() => setIsGoalDialogOpen(false)}
            traineeId={selectedTrainee.id}
            traineeName={selectedTrainee.full_name} />

            <ResultFormDialog
            isOpen={isResultDialogOpen}
            onClose={() => setIsResultDialogOpen(false)}
            traineeId={selectedTrainee.id}
            traineeName={selectedTrainee.full_name} />

            <MeasurementFormDialog
            isOpen={isMeasurementDialogOpen}
            onClose={() => setIsMeasurementDialogOpen(false)}
            traineeId={selectedTrainee.id}
            traineeName={selectedTrainee.full_name} />

          </>
        }

        {/* Session Type Selection Dialog */}
        <Dialog open={isSessionTypeOpen} onOpenChange={setIsSessionTypeOpen}>
          <DialogContent className="w-[90vw] max-w-xs bg-white rounded-2xl p-4" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-center text-lg font-black mb-4">בחר סוג אימון לצפייה</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3">
              <Button
                onClick={() => {navigate(createPageUrl("Sessions") + "?type=אישי");setIsSessionTypeOpen(false);}}
                className="h-12 bg-[#FFF3E0] hover:bg-orange-100 text-[#FF6F20] border border-[#FF6F20] rounded-xl flex items-center justify-center gap-2">

                <UserCheck className="w-5 h-5" /> <span className="font-bold">אימון אישי</span>
              </Button>
              <Button
                onClick={() => {navigate(createPageUrl("Sessions") + "?type=קבוצתי");setIsSessionTypeOpen(false);}}
                className="h-12 bg-[#E8F5E9] hover:bg-green-100 text-[#4CAF50] border border-[#4CAF50] rounded-xl flex items-center justify-center gap-2">

                <Users className="w-5 h-5" /> <span className="font-bold">אימון קבוצתי</span>
              </Button>
              <Button
                onClick={() => {navigate(createPageUrl("Sessions") + "?type=אונליין");setIsSessionTypeOpen(false);}}
                className="h-12 bg-[#F3E5F5] hover:bg-purple-100 text-[#9C27B0] border border-[#9C27B0] rounded-xl flex items-center justify-center gap-2">

                <Video className="w-5 h-5" /> <span className="font-bold">אימון אונליין</span>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </ProtectedCoachPage>);

}