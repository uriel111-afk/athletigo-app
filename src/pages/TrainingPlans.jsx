import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useProgramStats } from "../components/hooks/useProgramStats";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import { invalidateDashboard } from "@/components/utils/queryKeys";
import { Button } from "@/components/ui/button";
import PageLoader from "@/components/PageLoader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardList, Plus, Edit2, Trash2, Copy, Play, Users, Calendar as CalendarIcon, Target, CheckCircle, Loader2, User, UserPlus, FolderPlus, Folder, Search, Filter, ChevronDown, XCircle } from "lucide-react";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import PlanFormDialog from "../components/training/PlanFormDialog";
import SeriesFormDialog from "../components/training/SeriesFormDialog";
import UnifiedPlanBuilder from "../components/training/UnifiedPlanBuilder";
import WorkoutProgressBar from "../components/training/WorkoutProgressBar";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { notifyPlanCreated } from "@/functions/notificationTriggers";
import TraineePlanGroup from "../components/training/TraineePlanGroup";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { he } from "date-fns/locale";

const COLOR_THEMES = {
  warm_orange: { headerBar: '#FF6F20', background: '#FFF8F3', labels: '#FF6F20', defaultIcon: '🔥', category: 'חימום' },
  mobility_black: { headerBar: '#000000', background: '#F7F7F7', labels: '#000000', defaultIcon: '🔄', category: 'תנועתיות' },
  strength_gray: { headerBar: '#4D4D4D', background: '#F0F0F0', labels: '#4D4D4D', defaultIcon: '💪', category: 'כוח' },
  flexibility_light: { headerBar: '#7D7D7D', background: '#FAFAFA', labels: '#7D7D7D', defaultIcon: '🧘', category: 'גמישות' },
  custom_white: { headerBar: '#FFFFFF', background: '#FFFFFF', labels: '#000000', defaultIcon: '✨', category: 'אחר' }
};

export default function TrainingPlans() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlPlanId = urlParams.get('planId');
  
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTrainee, setFilterTrainee] = useState("all");
  const [viewMode, setViewMode] = useState(urlParams.get('view') || "active"); // 'active', 'templates', 'all'
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [showSharePlanDialog, setShowSharePlanDialog] = useState(false);
  const [sharingPlan, setSharingPlan] = useState(null);
  const [selectedShareTrainees, setSelectedShareTrainees] = useState([]);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [editingSeries, setEditingSeries] = useState(null);
  
  // New Filters State
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate, setFilterDate] = useState({ from: undefined, to: undefined });

  const queryClient = useQueryClient();

  const { data: allSeries = [] } = useQuery({
    queryKey: ['program-series'],
    queryFn: async () => {
      try {
        return await base44.entities.ProgramSeries.list();
      } catch {
        return [];
      }
    },
    initialData: []
  });

  // Optimization: Removed global sections/exercises fetch
  const sections = [];
  const exercises = [];
  const getPlanSections = (planId) => [];
  
  // Mutations for Series
  const createSeriesMutation = useMutation({
    mutationFn: async (data) => {
        const res = await base44.entities.ProgramSeries.create({
            ...data,
            created_by: coach.id,
            created_by_name: coach.full_name
        });
        return res;
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['program-series'] });
        setShowSeriesDialog(false);
        toast.success("✅ סדרה נוצרה בהצלחה");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const updateSeriesMutation = useMutation({
    mutationFn: async ({ id, data }) => {
        return await base44.entities.ProgramSeries.update(id, data);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['program-series'] });
        setShowSeriesDialog(false);
        setEditingSeries(null);
        toast.success("✅ סדרה עודכנה");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const { data: coach, isLoading: coachLoading } = useQuery({ 
    queryKey: ['current-coach'], 
    queryFn: async () => {
      try {
        const user = await base44.auth.me();
        // Redirect trainee to MyPlan
        if (user && !user.is_coach && user.role !== 'coach' && user.role !== 'admin') {
            window.location.href = createPageUrl("MyPlan");
            return null;
        }
        return user;
      } catch (error) {
        console.error("[TrainingPlans] Error loading coach:", error);
        return null;
      }
    }
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees-list'],
    queryFn: async () => { 
      try { 
        // Fetch all potential trainees (users and trainees roles)
        const users = await base44.entities.User.list('-created_at', 1000);
        return users.filter(u => (u.role === 'user' || u.role === 'trainee') && !u.is_coach && u.role !== 'admin');
      } catch { 
        return []; 
      } 
    },
    initialData: [],
    refetchInterval: 30000
  });

  const { plans, isLoading: plansLoading } = useProgramStats();

  useEffect(() => {
    if (urlPlanId && plans.length > 0 && !selectedPlan) {
      const planFromUrl = plans.find(p => p.id === urlPlanId);
      if (planFromUrl) {
        setSelectedPlan(planFromUrl);
        window.history.replaceState({}, '', createPageUrl("TrainingPlans"));
      }
    }
  }, [urlPlanId, plans, selectedPlan]);

  const createPlanMutation = useMutation({
    mutationFn: async ({ planData, selectedTrainees }) => {
      if (!coach || !coach.id) {
        throw new Error("פרטי מאמן חסרים");
      }

      const plansToCreate = [];
      const goalFocusArray = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0
        ? planData.goal_focus
        : ['כוח'];

      if (selectedTrainees && selectedTrainees.length > 0) {
        for (const traineeId of selectedTrainees) {
          const trainee = trainees.find(t => t.id === traineeId);
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
              is_template: false,
              series_id: planData.series_id || null
            });
          }
        }
      } else {
        plansToCreate.push({
          title: planData.plan_name,
          plan_name: planData.plan_name,
          assigned_to: null,
          assigned_to_name: null,
          created_by: coach.id,
          created_by_name: coach.full_name,
          goal_focus: goalFocusArray,
          description: planData.description || "",
          start_date: new Date().toISOString().split('T')[0],
          status: "פעילה",
          is_template: false,
          series_id: planData.series_id || null
        });
      }

      const results = [];
      for (const plan of plansToCreate) {
        console.log("Sending to training_plans:", plan);
        const result = await base44.entities.TrainingPlan.create(plan);
        results.push(result);
        
        // Send notification to trainee
        if (plan.assigned_to) {
          try {
            await base44.entities.Notification.create({
              user_id: plan.assigned_to,
              type: 'training_plan',
              title: 'תוכנית אימון חדשה 🎯',
              message: `המאמן ${coach.full_name} יצר לך תוכנית חדשה: "${plan.plan_name}"`,
              is_read: false
            });
          } catch (error) {
            console.error('[TrainingPlans] Error creating notification:', error);
          }
        }
      }
      return results;
    },
    onSuccess: async (createdPlans) => {
      await queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      invalidateDashboard(queryClient);
      setShowPlanDialog(false);
      setEditingPlan(null);

      if (createdPlans && createdPlans.length > 0) {
        setSelectedPlan(createdPlans[0]);
        toast.success(`✅ תוכנית נוצרה בהצלחה! בונה עכשיו...`);
      }
    },
    onError: (error) => {
      console.error("[TrainingPlans] Create plan error:", error);
      toast.error("⚠️ שגיאה ביצירת התוכנית: " + (error.message || "נסה שוב"));
    }
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data, originalPlan }) => {
      // Strip fields that don't exist in training_plans table
      const { weekly_days, coach_id, created_date, training_days, difficulty, ...safeData } = data;
      // Keep title in sync with plan_name
      if (safeData.plan_name) safeData.title = safeData.plan_name;
      console.log("Sending to training_plans (update):", safeData);
      const updated = await base44.entities.TrainingPlan.update(id, safeData);
      
      // Send notification to trainee if plan was updated
      if (originalPlan?.assigned_to) {
        try {
          await base44.entities.Notification.create({
            user_id: originalPlan.assigned_to,
            type: 'training_plan',
            title: 'תוכנית עודכנה ✏️',
            message: `התוכנית "${data.plan_name || originalPlan.plan_name}" עודכנה על ידי המאמן`,
            is_read: false
          });
        } catch (error) {
          console.error('[TrainingPlans] Error creating update notification:', error);
        }
      }
      
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      invalidateDashboard(queryClient);
      setShowPlanDialog(false);
      setEditingPlan(null);
      toast.success("✅ תוכנית עודכנה בהצלחה!");
    },
    onError: (error) => {
      console.error("[TrainingPlans] Update plan error:", error);
      toast.error("⚠️ שגיאה בעדכון התוכנית. נסה שוב.");
    }
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (planId) => {
      // Soft-delete: status='deleted' + deleted_at=now. Trainees see
      // the change immediately because MyPlan filters out deleted
      // plans, and we don't lose the row + its exercise history.
      // The previous version cascade-DELETED sections + exercises
      // too, which was destructive and made the coach's "ביטול
      // טעות" impossible — we intentionally drop that cascade.
      await base44.entities.TrainingPlan.update(planId, {
        status: 'deleted',
        deleted_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['training-sections'] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      // Trainee-side query key — keeps MyPlan in sync the moment
      // the coach soft-deletes the plan.
      queryClient.invalidateQueries({ queryKey: ['training-plans', { side: 'trainee' }] });
      invalidateDashboard(queryClient);
      setSelectedPlan(null);
      toast.success("✅ נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });





  const duplicatePlanMutation = useMutation({
    mutationFn: async ({ originalPlan }) => {
      if (!coach || !coach.id) throw new Error("Coach information not available.");

      const newPlan = await base44.entities.TrainingPlan.create({
        title: originalPlan.plan_name + " (העתק)",
        plan_name: originalPlan.plan_name + " (העתק)",
        assigned_to: originalPlan.assigned_to,
        assigned_to_name: originalPlan.assigned_to_name,
        created_by: coach.id,
        created_by_name: coach.full_name || "המאמן",
        goal_focus: originalPlan.goal_focus,
        description: originalPlan.description,
        start_date: new Date().toISOString().split('T')[0],
        status: "פעילה",
        is_template: false
      });

      const allSections = await base44.entities.TrainingSection.filter({ training_plan_id: originalPlan.id }, 'order');
      const allExercises = await base44.entities.Exercise.filter({ training_plan_id: originalPlan.id });
      
      for (const originalSection of allSections) {
        const newSection = await base44.entities.TrainingSection.create({
          training_plan_id: newPlan.id,
          section_name: originalSection.section_name,
          category: originalSection.category,
          description: originalSection.description,
          color_theme: originalSection.color_theme,
          icon: originalSection.icon,
          order: originalSection.order
        });

        const sectionExercises = allExercises.filter(e => e.training_section_id === originalSection.id).sort((a, b) => (a.order || 0) - (b.order || 0));
        
        for (const originalExercise of sectionExercises) {
          await base44.entities.Exercise.create({
            ...originalExercise,
            id: undefined,
            training_plan_id: newPlan.id,
            training_section_id: newSection.id,
            completed: false,
            trainee_media_urls: []
          });
        }
      }

      return newPlan;
    },
    onSuccess: (newPlanResult) => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      invalidateDashboard(queryClient);
      setSelectedPlan(newPlanResult);
      toast.success("✅ תוכנית שוכפלה בהצלחה");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const sharePlanToMultipleMutation = useMutation({
    mutationFn: async ({ originalPlan, traineeIds }) => {
      if (!coach || !coach.id) throw new Error("פרטי מאמן חסרים");

      const allSections = await base44.entities.TrainingSection.filter({ training_plan_id: originalPlan.id }, 'order');
      const allExercises = await base44.entities.Exercise.filter({ training_plan_id: originalPlan.id });
      const createdPlans = [];

      for (const traineeId of traineeIds) {
        const trainee = trainees.find(t => t.id === traineeId);
        if (!trainee) continue;

        const newPlan = await base44.entities.TrainingPlan.create({
          title: originalPlan.plan_name,
          plan_name: originalPlan.plan_name,
          assigned_to: trainee.id,
          assigned_to_name: trainee.full_name,
          created_by: coach.id,
          created_by_name: coach.full_name || "המאמן",
          goal_focus: originalPlan.goal_focus,
          description: originalPlan.description,
          start_date: new Date().toISOString().split('T')[0],
          status: "פעילה",
          is_template: false
        });

        for (const originalSection of allSections) {
          const newSection = await base44.entities.TrainingSection.create({
            training_plan_id: newPlan.id,
            section_name: originalSection.section_name,
            category: originalSection.category,
            description: originalSection.description,
            color_theme: originalSection.color_theme,
            icon: originalSection.icon,
            order: originalSection.order
          });

          const sectionExercises = allExercises.filter(e => e.training_section_id === originalSection.id).sort((a, b) => (a.order || 0) - (b.order || 0));
          
          for (const originalExercise of sectionExercises) {
            await base44.entities.Exercise.create({
              ...originalExercise,
              id: undefined,
              training_plan_id: newPlan.id,
              training_section_id: newSection.id,
              completed: false,
              trainee_media_urls: []
            });
          }
        }

        // Send notification
        try {
          await base44.entities.Notification.create({
            user_id: trainee.id,
            type: 'training_plan',
            title: 'תוכנית אימון חדשה 🎯',
            message: `המאמן ${coach.full_name} שיתף איתך תוכנית: "${newPlan.plan_name}"`,
            is_read: false
          });
        } catch (error) {
          console.error('[TrainingPlans] Error creating notification:', error);
        }

        createdPlans.push(newPlan);
      }

      return createdPlans;
    },
    onSuccess: (createdPlans) => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      invalidateDashboard(queryClient);
      setShowSharePlanDialog(false);
      setSelectedShareTrainees([]);
      setSharingPlan(null);
      toast.success(`✅ התוכנית שותפה בהצלחה ל-${createdPlans.length} מתאמנים`);
    },
    onError: (error) => {
      console.error("[TrainingPlans] Share plan error:", error);
      toast.error("⚠️ שגיאה בשיתוף התוכנית. נסה שוב.");
    }
  });



  const handleDuplicatePlan = async (plan) => {
    await duplicatePlanMutation.mutateAsync({ originalPlan: plan });
  };

  const filteredPlans = plans.filter(plan => {
    // 1. Text Search (Name, Trainee, Tags/Goal Focus)
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      plan.plan_name?.toLowerCase().includes(searchLower) ||
      plan.assigned_to_name?.toLowerCase().includes(searchLower) ||
      (Array.isArray(plan.goal_focus) ? plan.goal_focus.join(' ') : (plan.goal_focus || '')).toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;

    // 2. View Mode (Legacy)
    // We keep viewMode to maintain the quick tabs behavior
    if (viewMode === 'active' && plan.status !== 'פעילה') return false;
    if (viewMode === 'templates' && !plan.is_template) return false;

    // 3. Dropdown Status Filter (New)
    if (filterStatus !== 'all') {
       const statusMap = { 
         'active': 'פעילה', 
         'draft': 'טיוטה', 
         'archived': 'ארכיון', 
         'completed': 'הושלמה',
         'template': 'template'
       };
       
       if (filterStatus === 'template') {
          if (!plan.is_template) return false;
       } else {
          const mappedStatus = statusMap[filterStatus] || filterStatus;
          if (plan.status !== mappedStatus) return false;
       }
    }

    // 4. Trainee Filter
    if (filterTrainee !== "all" && plan.assigned_to !== filterTrainee) return false;

    // 5. Date Range Filter
    if (filterDate?.from) {
       const pDate = new Date(plan.created_at);
       if (pDate < filterDate.from) return false;
    }
    if (filterDate?.to) {
       const pDate = new Date(plan.created_at);
       // Add 1 day to include the end date fully
       const endDate = new Date(filterDate.to);
       endDate.setHours(23, 59, 59);
       if (pDate > endDate) return false;
    }
    
    return true;
  });

  // Counters include everything relevant to that status, ignoring template flag for the count to be accurate to DB
  const activePlans = plans.filter(p => p.status === 'פעילה');
  const completedPlans = plans.filter(p => p.status === 'הושלמה');
  const draftPlans = plans.filter(p => p.status === 'טיוטה');

  // Page-level loading gate — wait for the coach row AND the plans
  // list before rendering. plansLoading is initial-load only (won't
  // flash on realtime invalidates), so the page stays put after first
  // paint even when the coach edits a plan elsewhere.
  if (coachLoading || !coach || plansLoading) {
    return <PageLoader fullHeight />;
  }

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen pb-16 md:pb-24 w-full overflow-x-hidden overflow-y-auto" style={{ backgroundColor: '#FFFFFF', maxWidth: '100vw', WebkitOverflowScrolling: 'touch' }} dir="rtl">
{/* WorkoutProgressBar is rendered inside UnifiedPlanBuilder */}
        
        <div className="max-w-7xl mx-auto w-full" style={{ padding: '12px 16px', maxWidth: '100%' }}>
          {!selectedPlan ? (
            <div className="w-full">
              {/* Sticky Header & Filters */}
              <div className="sticky top-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-gray-100 -mx-4 px-4 py-4 mb-6 shadow-sm">
                  <div className="max-w-7xl mx-auto w-full flex flex-col gap-4">
                      {/* Top Row: Title & Primary Actions */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                              <h1 className="text-2xl md:text-3xl font-black text-gray-900">תוכניות אימון</h1>
                              <p className="text-sm text-gray-500 font-medium">ניהול תוכניות ומעקב למתאמנים</p>
                          </div>
                          <div className="flex gap-2">
                              <Button
                                onClick={() => {
                                  setEditingPlan(null);
                                  setSelectedShareTrainees([]);
                                  setShowPlanDialog(true);
                                }}
                                className="rounded-xl font-bold bg-[#FF6F20] hover:bg-[#e65b12] text-white shadow-md h-10"
                              >
                                <Plus className="w-4 h-4 ml-2" /> תוכנית חדשה
                              </Button>
                               <Button
                                onClick={() => {
                                  setEditingSeries(null);
                                  setShowSeriesDialog(true);
                                }}
                                variant="outline"
                                className="rounded-xl font-bold text-[#FF6F20] border-[#FF6F20] hover:bg-orange-50 h-10"
                              >
                                <FolderPlus className="w-4 h-4 ml-2" /> סדרה חדשה
                              </Button>
                          </div>
                      </div>

                      {/* Filter Row */}
                      <div className="flex flex-col md:flex-row gap-3">
                          <div className="relative flex-1">
                              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              <Input 
                                  placeholder="חפש תוכנית, מתאמן או תגית..." 
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  className="pr-9 h-10 bg-gray-50 border-gray-200 focus:bg-white transition-all rounded-xl"
                              />
                          </div>

                          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                               {/* Trainee Filter */}
                               <Select value={filterTrainee} onValueChange={setFilterTrainee}>
                                  <SelectTrigger className="h-10 min-w-[140px] rounded-xl border-gray-200 bg-white">
                                     <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4 text-gray-500" />
                                        <span className="truncate">{filterTrainee === 'all' ? 'כל המתאמנים' : trainees.find(t => t.id === filterTrainee)?.full_name || 'מתאמן'}</span>
                                     </div>
                                  </SelectTrigger>
                                  <SelectContent>
                                     <SelectItem value="all">כל המתאמנים</SelectItem>
                                     {trainees.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                                  </SelectContent>
                               </Select>

                               {/* Status Filter */}
                               <Select value={filterStatus} onValueChange={setFilterStatus}>
                                  <SelectTrigger className="h-10 min-w-[130px] rounded-xl border-gray-200 bg-white">
                                     <div className="flex items-center gap-2">
                                        <Filter className="w-4 h-4 text-gray-500" />
                                        <SelectValue placeholder="סטטוס" />
                                     </div>
                                  </SelectTrigger>
                                  <SelectContent>
                                     <SelectItem value="all">הכל</SelectItem>
                                     <SelectItem value="active">פעילה</SelectItem>
                                     <SelectItem value="draft">טיוטה</SelectItem>
                                     <SelectItem value="completed">הושלמה</SelectItem>
                                     <SelectItem value="template">תבנית</SelectItem>
                                     <SelectItem value="archived">ארכיון</SelectItem>
                                  </SelectContent>
                               </Select>

                               {/* Date Filter Popover */}
                               <Popover>
                                  <PopoverTrigger asChild>
                                     <Button variant="outline" className={cn("h-10 justify-start text-left font-normal rounded-xl border-gray-200", !filterDate?.from && "text-muted-foreground")}>
                                       <CalendarIcon className="w-4 h-4 ml-2 text-gray-500" />
                                       {filterDate?.from ? (
                                         filterDate.to ? (
                                           <>{format(filterDate.from, "dd/MM", { locale: he })} - {format(filterDate.to, "dd/MM", { locale: he })}</>
                                         ) : (
                                           format(filterDate.from, "dd/MM", { locale: he })
                                         )
                                       ) : (
                                         <span>תאריך</span>
                                       )}
                                     </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                     <Calendar
                                       initialFocus
                                       mode="range"
                                       defaultMonth={filterDate?.from}
                                       selected={filterDate}
                                       onSelect={setFilterDate}
                                       numberOfMonths={1}
                                       locale={he}
                                     />
                                  </PopoverContent>
                               </Popover>

                               {(filterTrainee !== 'all' || filterStatus !== 'all' || filterDate.from || searchTerm) && (
                                  <Button 
                                     variant="ghost" 
                                     size="icon" 
                                     onClick={() => {
                                         setFilterTrainee('all');
                                         setFilterStatus('all');
                                         setFilterDate({ from: undefined, to: undefined });
                                         setSearchTerm('');
                                     }}
                                     className="h-10 w-10 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-500"
                                     title="נקה פילטרים"
                                  >
                                     <XCircle className="w-5 h-5" />
                                  </Button>
                               )}
                          </div>
                      </div>
                  </div>
              </div>

              {/* Content Area */}
              <div className="max-w-7xl mx-auto w-full space-y-6">
                  {filteredPlans.length === 0 ? (
                       <div className="flex flex-col items-center justify-center py-20 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                              <ClipboardList className="w-10 h-10 text-gray-300" />
                          </div>
                          <h3 className="text-lg font-bold text-gray-900">לא נמצאו תוכניות</h3>
                          <p className="text-gray-500 max-w-xs mx-auto mt-1">נסה לשנות את סינון החיפוש או צור תוכנית חדשה</p>
                       </div>
                  ) : (
                      <>
                       {Object.entries(
                          filteredPlans.reduce((groups, plan) => {
                             // Group Logic
                             const key = plan.is_template ? ' תבניות מערכת' : (plan.assigned_to_name || 'תוכניות ללא שיוך');
                             if (!groups[key]) groups[key] = [];
                             groups[key].push(plan);
                             return groups;
                          }, {})
                       ).sort((a, b) => {
                          if (a[0].includes('תבניות')) return -1; 
                          if (b[0].includes('תבניות')) return 1;
                          return a[0].localeCompare(b[0]);
                       }).map(([groupName, groupPlans]) => (
                          <TraineePlanGroup 
                          key={groupName}
                          traineeName={groupName}
                          plans={groupPlans}
                          exercises={exercises}
                          seriesList={allSeries.filter(s => {
                               if (groupName.includes('תבניות')) return s.is_template;
                               return s.assigned_to_name === groupName;
                          })}
                          isTemplateGroup={groupName.includes('תבניות')}
                          actions={{
                             onSelect: setSelectedPlan,
                             onEdit: (p) => { setEditingPlan(p); setShowPlanDialog(true); },
                             onDuplicate: handleDuplicatePlan,
                             onShare: (p) => { setSharingPlan(p); setShowSharePlanDialog(true); },
                             onDelete: (p) => { setDeletingPlan(p); setShowDeleteDialog(true); },
                             onSeriesEdit: (s) => { setEditingSeries(s); setShowSeriesDialog(true); }
                          }}
                          />
                       ))}
                      </>
                  )}
              </div>
              </div>
          ) : (
            <UnifiedPlanBuilder
              plan={selectedPlan}
              isCoach={true}
              canEdit={true}
              onBack={() => setSelectedPlan(null)}
            />
          )}
        </div>

        {/* Plan Dialog */}
        <PlanFormDialog
          isOpen={showPlanDialog}
          onClose={() => {
            setShowPlanDialog(false);
            setEditingPlan(null);
          }}
          onSubmit={(data) => {
            if (editingPlan) {
              const goalFocusArray = Array.isArray(data.planData.goal_focus) && data.planData.goal_focus.length > 0
                ? data.planData.goal_focus
                : ['כוח'];
              updatePlanMutation.mutate({
                id: editingPlan.id,
                data: { ...data.planData, goal_focus: goalFocusArray },
                originalPlan: editingPlan
              });
            } else {
              createPlanMutation.mutate(data);
            }
          }}
          trainees={trainees}
          editingPlan={editingPlan ? {
            ...editingPlan,
            goal_focus: Array.isArray(editingPlan.goal_focus) ? editingPlan.goal_focus : (editingPlan.goal_focus ? editingPlan.goal_focus.split(', ').filter(Boolean) : [])
          } : null}
          isLoading={createPlanMutation.isPending || updatePlanMutation.isPending}
        />



        {/* Share Plan Dialog */}
        <Dialog open={showSharePlanDialog} onOpenChange={setShowSharePlanDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl md:text-2xl font-black mb-2" style={{ color: '#000000' }}>
                👥 שתף תוכנית למתאמנים
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              {sharingPlan && (
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
                  <p className="text-sm font-bold mb-1" style={{ color: '#FF6F20' }}>תוכנית לשיתוף:</p>
                  <p className="text-lg font-black" style={{ color: '#000000' }}>{sharingPlan.plan_name}</p>
                </div>
              )}

              <div className="p-4 rounded-xl" style={{ backgroundColor: '#E3F2FD', border: '2px solid #2196F3' }}>
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-bold flex items-center gap-2">
                    <UserPlus className="w-5 h-5" style={{ color: '#2196F3' }} />
                    בחר מתאמנים לשיתוף
                  </Label>
                  <Button
                    type="button"
                    onClick={() => {
                      const availableTrainees = trainees.filter(t => t.id !== sharingPlan?.assigned_to);
                      if (selectedShareTrainees.length === availableTrainees.length) {
                        setSelectedShareTrainees([]);
                      } else {
                        setSelectedShareTrainees(availableTrainees.map(t => t.id));
                      }
                    }}
                    variant="ghost"
                    className="text-xs md:text-sm"
                    style={{ color: '#2196F3' }}
                  >
                    {selectedShareTrainees.length === trainees.filter(t => t.id !== sharingPlan?.assigned_to).length ? 'בטל הכל' : 'בחר הכל'}
                  </Button>
                </div>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {trainees.filter(t => t.id !== sharingPlan?.assigned_to).map(trainee => (
                    <div key={trainee.id} className="flex items-center gap-3 p-2 md:p-3 rounded-lg hover:bg-white transition-colors">
                      <Checkbox
                        id={`share-trainee-${trainee.id}`}
                        checked={selectedShareTrainees.includes(trainee.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedShareTrainees([...selectedShareTrainees, trainee.id]);
                          } else {
                            setSelectedShareTrainees(selectedShareTrainees.filter(id => id !== trainee.id));
                          }
                        }}
                      />
                      <label
                        htmlFor={`share-trainee-${trainee.id}`}
                        className="flex-1 flex items-center gap-2 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs" style={{ backgroundColor: '#2196F3', color: 'white' }}>
                          {trainee.full_name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs md:text-sm truncate" style={{ color: '#000' }}>{trainee.full_name}</p>
                          <p className="text-[10px] md:text-xs truncate" style={{ color: '#7D7D7D' }}>{trainee.email}</p>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
                
                {selectedShareTrainees.length > 0 && (
                  <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '2px solid #2196F3' }}>
                    <p className="text-xs md:text-sm font-bold text-center" style={{ color: '#2196F3' }}>
                      <UserPlus className="w-4 h-4 inline ml-1" />
                      נבחרו {selectedShareTrainees.length} מתאמנים
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t" style={{ borderColor: '#E0E0E0' }}>
                <Button
                  onClick={() => {
                    setShowSharePlanDialog(false);
                    setSelectedShareTrainees([]);
                    setSharingPlan(null);
                  }}
                  variant="outline"
                  className="flex-1 rounded-xl py-4 md:py-6 font-bold text-sm md:text-base"
                >
                  ביטול
                </Button>
                <Button
                  onClick={() => {
                    if (selectedShareTrainees.length === 0) {
                      toast.error("נא לבחור לפחות מתאמן אחד");
                      return;
                    }
                    sharePlanToMultipleMutation.mutate({
                      originalPlan: sharingPlan,
                      traineeIds: selectedShareTrainees
                    });
                  }}
                  disabled={selectedShareTrainees.length === 0 || sharePlanToMultipleMutation.isPending}
                  className="flex-1 rounded-xl py-4 md:py-6 font-bold text-white text-sm md:text-base"
                  style={{ backgroundColor: '#2196F3' }}
                >
                  {sharePlanToMultipleMutation.isPending ? (
                    <><Loader2 className="w-5 h-5 ml-2 animate-spin" />משתף...</>
                  ) : (
                    <><Users className="w-5 h-5 ml-2" />שתף ל-{selectedShareTrainees.length} מתאמנים</>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Plan Confirmation Dialog */}
        <SeriesFormDialog 
            isOpen={showSeriesDialog}
            onClose={() => {
                setShowSeriesDialog(false);
                setEditingSeries(null);
            }}
            onSubmit={(data) => {
                if (editingSeries) {
                    updateSeriesMutation.mutate({ id: editingSeries.id, data });
                } else {
                    createSeriesMutation.mutate(data);
                }
            }}
            initialData={editingSeries}
            trainees={trainees}
            isLoading={createSeriesMutation.isPending || updateSeriesMutation.isPending}
        />

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl md:text-2xl font-black flex items-center gap-3" style={{ color: '#000000' }}>
                <Trash2 className="w-7 h-7" style={{ color: '#f44336' }} />
                מחק תוכנית אימון
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="p-5 rounded-xl" style={{ backgroundColor: '#FFEBEE', border: '2px solid #f44336' }}>
                <p className="text-base font-bold mb-3" style={{ color: '#000000' }}>
                  ⚠️ האם אתה בטוח?
                </p>
                {deletingPlan && (
                  <div className="p-3 rounded-lg mb-3" style={{ backgroundColor: '#FFFFFF' }}>
                    <p className="text-base font-black mb-1" style={{ color: '#000000' }}>
                      {deletingPlan.plan_name}
                    </p>
                    <p className="text-sm" style={{ color: '#7D7D7D' }}>
                      👤 {deletingPlan.assigned_to_name || 'ללא מתאמן'}
                    </p>
                    <p className="text-sm" style={{ color: '#7D7D7D' }}>
                      🎯 {deletingPlan.goal_focus}
                    </p>
                    <p className="text-xs mt-2" style={{ color: '#7D7D7D' }}>
                      📋 {getPlanSections(deletingPlan.id).length} סקשנים
                    </p>
                  </div>
                )}
                <p className="text-sm font-bold" style={{ color: '#f44336' }}>
                  מחיקת התוכנית תמחק גם את כל הסקשנים והתרגילים שלה
                </p>
                <p className="text-xs mt-2" style={{ color: '#7D7D7D' }}>
                  פעולה זו אינה ניתנת לביטול
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setDeletingPlan(null);
                  }}
                  variant="outline"
                  className="flex-1 rounded-xl py-5 font-bold text-base"
                  style={{ border: '2px solid #E0E0E0', color: '#000000' }}
                >
                  ביטול
                </Button>
                <Button
                  onClick={async () => {
                    if (deletingPlan) {
                      await deletePlanMutation.mutateAsync(deletingPlan.id);
                      setShowDeleteDialog(false);
                      setDeletingPlan(null);
                    }
                  }}
                  disabled={deletePlanMutation.isPending}
                  className="flex-1 rounded-xl py-5 font-bold text-white text-base"
                  style={{ backgroundColor: '#f44336' }}
                >
                  {deletePlanMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                      מוחק...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5 ml-2" />
                      כן, מחק תוכנית
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
    </ProtectedCoachPage>
  );
}