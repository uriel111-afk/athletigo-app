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
      const goalFocusString = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0 ? planData.goal_focus.join(', ') : 'כוח';
      const plansToCreate = [];

      if (selectedTrainees && selectedTrainees.length > 0) {
        for (const traineeId of selectedTrainees) {
          const trainee = allTrainees.find((t) => t.id === traineeId);
          if (trainee) {
            plansToCreate.push({
              plan_name: planData.plan_name,
              assigned_to: trainee.id,
              assigned_to_name: trainee.full_name,
              created_by: coach.id,
              created_by_name: coach.full_name,
              goal_focus: goalFocusString,
              description: planData.description || "",
              start_date: new Date().toISOString().split('T')[0],
              status: "פעילה",
              is_template: false
            });
          }
        }
      } else {
        plansToCreate.push({
          plan_name: planData.plan_name,
          assigned_to: "",
          assigned_to_name: "",
          created_by: coach.id,
          created_by_name: coach.full_name,
          goal_focus: goalFocusString,
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLANS });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setIsPlanDialogOpen(false);
      toast.success("✅ תוכנית נוצרה בהצלחה!");
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
      <div className="h-[100dvh] bg-[#FAFAFA] flex flex-col overflow-hidden" dir="rtl">
        <div className="max-w-md mx-auto w-full px-4 py-2 pb-24 flex-1 flex flex-col h-full gap-2">
          
          {/* Header */}
          <div className="flex items-center justify-between shrink-0 px-1">
            <button
              onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
              className="flex items-center gap-1.5 text-gray-500 text-xs font-semibold bg-white border border-gray-200 px-3 py-2 rounded-xl min-h-[44px] hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              יציאה
            </button>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#FF6F20]" />
              <h1 className="text-lg font-black text-gray-900">דשבורד מאמן</h1>
            </div>
            <span className="text-[10px] text-gray-400 font-mono bg-white px-2 py-0.5 rounded-full border">
               {lastUpdated.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* BLOCK 1 - Quick Actions (Orange/Green/Purple) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 shrink-0 mb-2">
            <Button onClick={() => setIsLeadDialogOpen(true)} className="h-16 bg-[#FF6F20] hover:bg-[#e65b12] text-white border-none rounded-[16px] shadow-sm p-0 flex flex-col items-center justify-center gap-1">
              <UserPlus className="w-6 h-6" /> <span className="text-xs font-bold">הוסף ליד</span>
            </Button>
            <Button onClick={() => setIsAddTraineeOpen(true)} className="h-16 bg-[#4CAF50] hover:bg-[#43A047] text-white border-none rounded-[16px] shadow-sm p-0 flex flex-col items-center justify-center gap-1">
              <Plus className="w-6 h-6" /> <span className="text-xs font-bold">הוסף מתאמן</span>
            </Button>
            <Button onClick={() => setIsSessionDialogOpen(true)} className="h-16 bg-[#9C27B0] hover:bg-[#7B1FA2] text-white border-none rounded-[16px] shadow-sm p-0 flex flex-col items-center justify-center gap-1">
              <Calendar className="w-6 h-6" /> <span className="text-xs font-bold">קבע מפגש</span>
            </Button>
          </div>

          {/* BLOCK 2 - Performance & Goals (Gray/Yellow) */}
          <div className="mt-2 mb-2 grid grid-cols-2 md:grid-cols-5 gap-1.5 shrink-0">
            <Button onClick={() => setIsPlanDialogOpen(true)} className="h-16 bg-[#607D8B] hover:bg-[#546E7A] text-white border-none rounded-[12px] shadow-sm p-0 flex flex-col items-center justify-center gap-1">
              <ClipboardList className="w-6 h-6" />
              <span className="text-[10px] font-medium leading-none">תוכנית</span>
            </Button>
            <Button onClick={() => setIsBaselineDialogOpen(true)} className="h-16 bg-[#FFD700] hover:bg-[#FFC107] text-black border-none rounded-[12px] shadow-sm p-0 flex flex-col items-center justify-center gap-1">
              <Activity className="w-6 h-6" />
              <span className="text-[10px] font-medium leading-none">Baseline</span>
            </Button>
            <Button onClick={() => handleActionClick('result')} className="h-16 bg-[#FFD700] hover:bg-[#FFC107] text-black border-none rounded-[12px] shadow-sm p-0 flex flex-col items-center justify-center gap-1">
              <Award className="w-6 h-6" />
              <span className="text-[10px] font-medium leading-none">שיא</span>
            </Button>
            <Button onClick={() => handleActionClick('goal')} className="h-16 bg-[#FFD700] hover:bg-[#FFC107] text-black border-none rounded-[12px] shadow-sm p-0 flex flex-col items-center justify-center gap-1">
              <Target className="w-6 h-6" />
              <span className="text-[10px] font-medium leading-none">יעד</span>
            </Button>
            <Button onClick={() => handleActionClick('measurement')} className="h-16 bg-[#FFD700] hover:bg-[#FFC107] text-black border-none rounded-[12px] shadow-sm p-0 flex flex-col items-center justify-center gap-1">
              <Activity className="w-6 h-6" />
              <span className="text-[10px] font-medium leading-none">מדידה</span>
            </Button>
          </div>

          {/* BLOCK 3 - Management Navigation (White Cards) */}
          <div className="mt-2 mb-2 grid grid-cols-1 md:grid-cols-3 gap-2 shrink-0">
            <div onClick={() => navigate(createPageUrl("Sessions"))} className="bg-white h-14 rounded-[12px] border border-gray-200 flex flex-col items-center justify-center px-1 cursor-pointer hover:bg-gray-50 shadow-sm gap-0.5">
              <div className="flex items-center gap-1">
                <Dumbbell className="w-4 h-4 text-[#9C27B0]" />
                <span className="text-sm font-black text-[#9C27B0]">{monthlyCompletedSessionsCount}</span>
              </div>
              <span className="text-[10px] font-bold text-gray-600 text-center leading-tight">אימונים ומפגשים</span>
            </div>

            <div onClick={() => navigate(createPageUrl("TrainingPlans"))} className="bg-white h-14 rounded-[12px] border border-gray-200 flex flex-col items-center justify-center px-1 cursor-pointer hover:bg-gray-50 shadow-sm gap-0.5">
              <div className="flex items-center gap-1">
                <ClipboardList className="w-4 h-4 text-[#607D8B]" />
                <span className="text-sm font-black text-[#607D8B]">{activePlansCount}</span>
              </div>
              <span className="text-[10px] font-bold text-gray-600 text-center leading-tight">תוכניות פעילות</span>
            </div>

            <div onClick={() => navigate(createPageUrl("AllUsers"))} className="bg-white h-14 rounded-[12px] border border-gray-200 flex flex-col items-center justify-center px-1 cursor-pointer hover:bg-gray-50 shadow-sm gap-0.5">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4 text-[#212121]" />
                <span className="text-sm font-black text-[#212121]">{totalClientsCount}</span>
              </div>
              <span className="text-[10px] font-bold text-gray-600 text-center leading-tight">כל המשתמשים</span>
            </div>
          </div>

          {/* BLOCK 4 - Stats View (Compact Grid) */}
          <div className="my-1 grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 content-start">
            <div onClick={() => navigate(createPageUrl("AllUsers") + "?filter=active")} className="bg-white h-[85px] rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm hover:bg-green-50">
              <span className="text-2xl font-black text-[#4CAF50] leading-none mb-1">{activeClientsCount}</span>
              <span className="text-[10px] font-bold text-gray-500">לקוחות פעילים</span>
            </div>
            <div onClick={() => navigate(createPageUrl("Leads") + "?filter=new")} className="bg-white h-[85px] rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm hover:bg-yellow-50">
              <span className="text-2xl font-black text-[#FFC107] leading-none mb-1">{newLeadsCount}</span>
              <span className="text-[10px] font-bold text-gray-500">לידים חדשים</span>
            </div>
            
            <div onClick={() => navigate(createPageUrl("Sessions") + "?status=upcoming")} className="bg-white h-[85px] rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm hover:bg-purple-50">
              <span className="text-2xl font-black text-[#9C27B0] leading-none mb-1">{upcomingSessionsCount}</span>
              <span className="text-[10px] font-bold text-gray-500">מפגשים קרובים</span>
            </div>
            <div className="bg-white h-[85px] rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm">
              <span className="text-2xl font-black text-[#4CAF50] leading-none mb-1">{conversionRate}%</span>
              <span className="text-[10px] font-bold text-gray-500">שיעור המרה</span>
            </div>
            <div onClick={() => navigate(createPageUrl("FinancialOverview") + "?period=current_month")} className="col-span-2 bg-white h-[85px] rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm hover:bg-blue-50">
              <span className="text-xl font-black text-[#2196F3] leading-none mb-1">₪{(monthlyRevenue || 0).toLocaleString()}</span>
              <span className="text-[10px] font-bold text-gray-500">סה"כ הכנסות החודש</span>
            </div>
          </div>

          {/* BLOCK 5 - Detailed Revenue & Groups */}
          <div className="mb-2 grid grid-cols-1 md:grid-cols-3 gap-2 shrink-0">
             <div className="bg-white p-2 rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm">
                <span className="text-sm font-black text-[#FF6F20]">₪{revenueByType.personal.toLocaleString()}</span>
                <span className="text-[9px] font-bold text-gray-400 text-center">הכנסות אישי</span>
             </div>
             <div className="bg-white p-2 rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm">
                <span className="text-sm font-black text-[#2196F3]">₪{revenueByType.group.toLocaleString()}</span>
                <span className="text-[9px] font-bold text-gray-400 text-center">הכנסות קבוצה</span>
             </div>
             <div className="bg-white p-2 rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm">
                <span className="text-sm font-black text-[#9C27B0]">₪{revenueByType.online.toLocaleString()}</span>
                <span className="text-[9px] font-bold text-gray-400 text-center">הכנסות אונליין</span>
             </div>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2 shrink-0">
             <div className="bg-white h-[60px] rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm">
                <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span className="text-lg font-black text-blue-500">{groupTraineesCount}</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500">מתאמני קבוצות</span>
             </div>
             <div className="bg-white h-[60px] rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm">
                <div className="flex items-center gap-1">
                    <Activity className="w-4 h-4 text-red-500" />
                    <span className="text-lg font-black text-red-500">{renewalsCount}</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500">חידושים קרובים (30 יום)</span>
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