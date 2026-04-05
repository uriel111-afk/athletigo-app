import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Target, Loader2, Dumbbell, Home, TrendingUp, User, CheckCircle, Trash2, Plus, ChevronDown, Copy, FolderPlus, ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import UnifiedPlanBuilder from "../components/training/UnifiedPlanBuilder";
import PlanFormDialog from "../components/training/PlanFormDialog";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

// Extracted Component for performance and safety
const PlanCard = ({ plan, isMine, exercises, improvementData, onSelect, onDuplicate, onDelete }) => {
  // Safe calculation of progress
  const planExercises = useMemo(() => 
    Array.isArray(exercises) ? exercises.filter(e => e.training_plan_id === plan.id) : []
  , [exercises, plan.id]);
  
  const completed = planExercises.filter(e => e.completed).length;
  const total = planExercises.length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Find parent group for stats
  const rootId = plan.parent_plan_id || plan.id;
  const history = improvementData?.[rootId] || [];
  const improvement = history.length > 1 ? {
    control: (history[history.length-1].stats.avgControl - history[history.length-2].stats.avgControl).toFixed(1),
    difficulty: (history[history.length-1].stats.avgDifficulty - history[history.length-2].stats.avgDifficulty).toFixed(1)
  } : null;

  return (
    <div className="rounded-2xl overflow-hidden transition-all bg-white border-2 border-[#E0E0E0] shadow-sm mb-4">
      <div className="p-5 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => onSelect(plan)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-black truncate text-black">{plan.plan_name}</h3>
              {plan.status === 'פעילה' && <span className="px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#4CAF50] text-xs font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> פעילה</span>}
            </div>
            <p className="text-sm text-[#7D7D7D] mb-1">🎯 {plan.goal_focus}</p>
            
            {/* Improvement Indicator */}
            {improvement && (
              <div className="flex gap-3 mt-2 text-xs font-bold">
                <span className={improvement.control >= 0 ? "text-green-600" : "text-red-500"}>
                  שליטה: {improvement.control > 0 ? '+' : ''}{improvement.control}
                </span>
                <span className={improvement.difficulty <= 0 ? "text-green-600" : "text-red-500"}>
                  קושי: {improvement.difficulty > 0 ? '+' : ''}{improvement.difficulty}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isMine && (
              <>
                <Button 
                  onClick={(e) => { e.stopPropagation(); onDuplicate(plan); }}
                  size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full text-blue-500 hover:text-blue-700" title="שכפל">
                  <Copy className="w-4 h-4" />
                </Button>
                <Button 
                  onClick={(e) => { e.stopPropagation(); onDelete(plan); }}
                  size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full text-red-500 hover:text-red-700" title="מחק">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
            {!isMine && (
               <Button 
                  onClick={(e) => { e.stopPropagation(); onDuplicate(plan); }}
                  size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full text-blue-500 hover:text-blue-700" title="שכפל">
                  <Copy className="w-4 h-4" />
                </Button>
            )}
            <ChevronDown className="w-6 h-6 text-[#FF6F20]" />
          </div>
        </div>

        {total > 0 && (
          <div className="pt-3 border-t border-[#E0E0E0]">
            <div className="flex justify-between text-xs mb-2 text-[#7D7D7D]">
              <span>{completed}/{total} תרגילים</span>
              <span className="font-bold text-[#FF6F20]">{progressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#E6E6E6] overflow-hidden">
              <div className="h-full bg-[#FF6F20] transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function MyPlan() {
  const [searchParams] = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null); // For drilling down
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [activeTab, setActiveTab] = useState("coach");

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['current-user-myplan'],
    queryFn: () => base44.auth.me(),
    retry: false
  });

  const isCoach = user?.isCoach || user?.role === 'admin';
  
  const allTrainees = [];

  useEffect(() => {
    if (isCoach) {
      window.location.href = createPageUrl("TrainingPlans");
    }
  }, [isCoach]);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreatePlan(true);
    }
  }, [searchParams]);

  const { data: allPlans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['training-plans', user?.id],
    queryFn: async () => {
      if (!user || isCoach) return [];
      try {
        const directPlansPromise = base44.entities.TrainingPlan.filter({ assigned_to: user.id }, '-start_date').catch(() => []);
        const assignmentsPromise = base44.entities.TrainingPlanAssignment.filter({ trainee_id: user.id }).catch(() => []);
        const createdPlansPromise = base44.entities.TrainingPlan.filter({ created_by: user.id }, '-created_at').catch(() => []);

        const [directPlans, assignments, createdByMe] = await Promise.all([directPlansPromise, assignmentsPromise, createdPlansPromise]);

        let sharedPlans = [];
        if (assignments && assignments.length > 0) {
          const planIds = assignments.map(a => a.plan_id).filter(Boolean);
          if (planIds.length > 0) {
            const sharedPlansPromises = planIds.map(id => base44.entities.TrainingPlan.filter({ id }).catch(() => []));
            const sharedPlansResults = await Promise.all(sharedPlansPromises);
            sharedPlans = sharedPlansResults.flat().filter(Boolean);
          }
        }

        const combined = [...(directPlans || []), ...(sharedPlans || []), ...(createdByMe || [])];
        return Array.from(new Map(combined.filter(Boolean).map(item => [item.id, item])).values());
      } catch (error) {
        console.error("[MyPlan] Critical error loading plans:", error);
        return [];
      }
    },
    enabled: !!user && !isCoach,
    initialData: []
  });

  const { data: allSeries = [], isLoading: seriesLoading } = useQuery({
    queryKey: ['program-series', user?.id],
    queryFn: async () => {
      if (!user || isCoach) return [];
      try {
        return await base44.entities.ProgramSeries.filter({ assigned_to: user.id });
      } catch (error) {
        return [];
      }
    },
    enabled: !!user && !isCoach,
    initialData: []
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => base44.entities.Exercise.list('-created_at', 2000),
    initialData: []
  });

  const { data: workoutHistory = [] } = useQuery({
    queryKey: ['my-workout-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return await base44.entities.WorkoutHistory.filter({ user_id: user.id }, '-date');
    },
    enabled: !!user?.id
  });

  const improvementData = useMemo(() => {
    const data = {};
    if (!workoutHistory || !allPlans) return data;
    
    const planMap = new Map(allPlans.map(p => [p.id, p]));

    workoutHistory.forEach(entry => {
        const pId = entry.planId; 
        if (!pId) return;
        
        const plan = planMap.get(pId);
        const rootId = plan ? (plan.parent_plan_id || plan.id) : pId;

        if (!data[rootId]) data[rootId] = [];
        data[rootId].push({
            date: entry.date,
            stats: {
                avgControl: entry.mastery_avg || 0,
                avgDifficulty: entry.difficulty_avg || 0
            }
        });
    });

    Object.keys(data).forEach(key => {
        data[key].sort((a, b) => new Date(a.date) - new Date(b.date));
    });

    return data;
  }, [workoutHistory, allPlans]);

  // Process history for charts
  const historyChartData = useMemo(() => {
    return workoutHistory.slice(0, 10).reverse().map((entry, i) => ({
      name: `אימון ${i+1}`,
      date: new Date(entry.date).toLocaleDateString('he-IL', {day: 'numeric', month: 'numeric'}),
      control: entry.mastery_avg,
      difficulty: entry.difficulty_avg,
      planName: entry.planName
    }));
  }, [workoutHistory]);

  const createPlanMutation = useMutation({
    mutationFn: async ({ planData }) => {
      const goalFocusString = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0 ? planData.goal_focus.join(', ') : 'כוח';
      const newPlan = await base44.entities.TrainingPlan.create({
        plan_name: planData.plan_name,
        assigned_to: user.id,
        assigned_to_name: user.full_name,
        created_by: user.id,
        created_by_name: user.full_name,
        goal_focus: goalFocusString,
        description: planData.description || "",
        start_date: new Date().toISOString().split('T')[0],
        status: "פעילה",
        is_template: false
      });
      if (user.created_by) {
          try {
              await base44.entities.Notification.create({
                  user_id: user.created_by,
                  type: 'training_plan',
                  title: 'תוכנית חדשה מאת מתאמן',
                  message: `המתאמן ${user.full_name} יצר תוכנית חדשה: ${newPlan.plan_name}`,
                  is_read: false
              });
          } catch (e) { console.error("Error notifying coach", e); }
      }
      return newPlan;
    },
    onSuccess: (createdPlan) => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      setShowCreatePlan(false);
      toast.success("✅ תוכנית נוצרה בהצלחה!");
      setSelectedPlan(createdPlan);
    },
    onError: () => toast.error("⚠️ שגיאה ביצירת תוכנית. נסה שוב.")
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (planId) => {
      const planSections = await base44.entities.TrainingSection.filter({ training_plan_id: planId }).catch(() => []);
      for (const section of planSections) {
        const sectionExercises = await base44.entities.Exercise.filter({ training_section_id: section.id }).catch(() => []);
        for (const exercise of sectionExercises) {
          await base44.entities.Exercise.delete(exercise.id).catch(() => {});
        }
        await base44.entities.TrainingSection.delete(section.id).catch(() => {});
      }
      await base44.entities.TrainingPlan.delete(planId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      toast.success("🗑️ תוכנית נמחקה");
    }
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: async (originalPlan) => {
      // 1. Create new plan
      const newPlan = await base44.entities.TrainingPlan.create({
        plan_name: `${originalPlan.plan_name} (עותק)`,
        assigned_to: user.id,
        assigned_to_name: user.full_name,
        created_by: user.id,
        created_by_name: user.full_name,
        goal_focus: originalPlan.goal_focus,
        description: originalPlan.description,
        start_date: new Date().toISOString().split('T')[0],
        status: "פעילה",
        is_template: false,
        parent_plan_id: originalPlan.parent_plan_id || originalPlan.id // Set lineage
      });

      // 2. Fetch original sections and exercises
      const originalSections = await base44.entities.TrainingSection.filter({ training_plan_id: originalPlan.id });
      const originalExercises = await base44.entities.Exercise.filter({ training_plan_id: originalPlan.id });

      // 3. Duplicate structure
      for (const section of originalSections) {
        const newSection = await base44.entities.TrainingSection.create({
          ...section,
          id: undefined,
          training_plan_id: newPlan.id
        });

        const sectionExercises = originalExercises.filter(e => e.training_section_id === section.id);
        for (const exercise of sectionExercises) {
          await base44.entities.Exercise.create({
            ...exercise,
            id: undefined,
            training_plan_id: newPlan.id,
            training_section_id: newSection.id,
            completed: false, // Reset progress
            actual_result: "",
            difficulty_rating: null,
            control_rating: null
          });
        }
      }
      return newPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast.success("✅ תוכנית שוכפלה בהצלחה");
    },
    onError: () => toast.error("שגיאה בשכפול התוכנית")
  });

  const handleDeletePlan = async (planToDelete) => {
    if (window.confirm(`למחוק את התוכנית "${planToDelete.plan_name}"?`)) {
      await deletePlanMutation.mutateAsync(planToDelete.id);
    }
  };

  if (!selectedPlan) {
    if (plansLoading) {
      return (
        <div dir="rtl" className="min-h-screen flex items-center justify-center bg-white">
          <Loader2 className="w-16 h-16 animate-spin text-[#FF6F20]" />
        </div>
      );
    }

    // Filter Plans & Series
    const coachSeries = allSeries.filter(s => s.created_by !== user?.id);
    const mySeries = allSeries.filter(s => s.created_by === user?.id);

    // Plans NOT in a series
    const coachStandalonePlans = allPlans.filter(p => p && p.created_by !== user?.id && !p.series_id);
    const myStandalonePlans = allPlans.filter(p => p && p.created_by === user?.id && !p.series_id);

    // Logic to get plans for a specific series
    const getSeriesPlans = (seriesId) => {
        return allPlans.filter(p => p.series_id === seriesId).sort((a, b) => (a.order_in_series || 0) - (b.order_in_series || 0));
    };

    return (
      <div dir="rtl" className="min-h-screen bg-white pb-32">
        <div className="max-w-4xl mx-auto p-6 md:p-12">
          <div className="mb-8 flex justify-between items-end">
            <div>
                <h1 className="text-4xl md:text-5xl font-black mb-3 text-black">התוכנית שלי</h1>
                <div className="w-16 h-1 rounded-full bg-[#FF6F20]" />
            </div>
            <Button onClick={() => setShowCreatePlan(true)} className="rounded-2xl px-6 py-4 font-bold text-white bg-[#FF6F20]">
                <Plus className="w-5 h-5 ml-2" /> תוכנית חדשה
            </Button>
          </div>

          <Tabs defaultValue="coach" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8 h-auto p-1 bg-gray-100 rounded-xl">
              <TabsTrigger value="coach" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#FF6F20] font-bold">תוכניות מהמאמן</TabsTrigger>
              <TabsTrigger value="my_plans" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#FF6F20] font-bold">תוכניות שלי</TabsTrigger>
              <TabsTrigger value="improvement" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#FF6F20] font-bold">מעקב שיפור</TabsTrigger>
            </TabsList>

            <TabsContent value="coach" className="space-y-4">
              {!selectedSeries ? (
                <>
                  {/* Series */}
                  {coachSeries.map(series => (
                    <SeriesCard 
                        key={series.id} 
                        series={series} 
                        plans={getSeriesPlans(series.id)} 
                        onClick={() => setSelectedSeries(series)} 
                    />
                  ))}
                  
                  {/* Standalone Plans */}
                  {coachStandalonePlans.map(plan => (
                    <PlanCard 
                      key={plan.id} 
                      plan={plan} 
                      isMine={false} 
                      exercises={exercises}
                      improvementData={improvementData}
                      onSelect={setSelectedPlan}
                      onDuplicate={(p) => duplicatePlanMutation.mutate(p)}
                      onDelete={handleDeletePlan}
                    />
                  ))}

                  {coachSeries.length === 0 && coachStandalonePlans.length === 0 && (
                    <div className="p-8 rounded-2xl text-center border-2 border-dashed border-gray-200">
                      <p className="text-gray-500">אין תוכניות מהמאמן כרגע</p>
                    </div>
                  )}
                </>
              ) : (
                <div>
                    <Button 
                        variant="ghost" 
                        onClick={() => setSelectedSeries(null)} 
                        className="mb-4 font-bold text-[#7D7D7D] p-0 hover:bg-transparent"
                    >
                        <ChevronRight className="w-5 h-5 ml-1" />
                        חזרה לתיקיות
                    </Button>
                    
                    <div className="mb-6">
                        <h2 className="text-2xl font-black mb-1">{selectedSeries.name}</h2>
                        <p className="text-gray-500 text-sm">{selectedSeries.description}</p>
                    </div>

                    <div className="space-y-4">
                        {getSeriesPlans(selectedSeries.id).map(plan => (
                          <PlanCard 
                            key={plan.id} 
                            plan={plan} 
                            isMine={false}
                            exercises={exercises}
                            improvementData={improvementData}
                            onSelect={setSelectedPlan}
                            onDuplicate={(p) => duplicatePlanMutation.mutate(p)}
                            onDelete={handleDeletePlan}
                          />
                        ))}
                        {getSeriesPlans(selectedSeries.id).length === 0 && (
                            <p className="text-center text-gray-400 py-4">אין תוכניות בסדרה זו</p>
                        )}
                    </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="my_plans" className="space-y-4">
              {/* Standalone only for My Plans for now, as user cannot create series in UI yet */}
              {myStandalonePlans.length > 0 ? (
                myStandalonePlans.map(plan => (
                  <PlanCard 
                    key={plan.id} 
                    plan={plan} 
                    isMine={true}
                    exercises={exercises}
                    improvementData={improvementData}
                    onSelect={setSelectedPlan}
                    onDuplicate={(p) => duplicatePlanMutation.mutate(p)}
                    onDelete={handleDeletePlan}
                  />
                ))
              ) : (
                <div className="p-8 rounded-2xl text-center border-2 border-dashed border-gray-200">
                  <p className="text-gray-500 mb-3">לא יצרת תוכניות אישיות</p>
                  <Button onClick={() => setShowCreatePlan(true)} variant="outline" className="font-bold">
                    <Plus className="w-4 h-4 ml-2" /> תוכנית חדשה
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="improvement" className="space-y-8">
              {historyChartData.length > 0 ? (
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-4 border-b pb-2">היסטוריית ביצועים כללית</h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" fontSize={12} />
                          <YAxis domain={[0, 10]} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="control" name="שליטה" stroke="#4CAF50" strokeWidth={2} />
                          <Line type="monotone" dataKey="difficulty" name="קושי" stroke="#FF6F20" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 text-center text-xs text-gray-500">
                      מציג את 10 האימונים האחרונים שבוצעו
                    </div>
                  </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  טרם בוצעו אימונים להצגת גרף התקדמות
                </div>
              )}
            </TabsContent>
          </Tabs>

          <PlanFormDialog
            isOpen={showCreatePlan}
            onClose={() => setShowCreatePlan(false)}
            onSubmit={(data) => createPlanMutation.mutate(data)}
            trainees={allTrainees}
            isLoading={createPlanMutation.isPending}
            hideTraineeSelection={true}
          />
        </div>

        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t z-50 shadow-lg border-[#E6E6E6]">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex justify-around items-center">
              <Link to={createPageUrl("TraineeHome")} className="flex flex-col items-center gap-1">
                <Home className="w-5 h-5 text-[#7D7D7D]" />
                <span className="text-xs font-medium text-[#7D7D7D]">דף הבית</span>
              </Link>
              <Link to={createPageUrl("MyPlan")} className="flex flex-col items-center gap-1">
                <Dumbbell className="w-5 h-5 text-[#FF6F20]" />
                <span className="text-xs font-bold text-[#FF6F20]">התוכנית שלי</span>
              </Link>
              <Link to={createPageUrl("Progress")} className="flex flex-col items-center gap-1">
                <TrendingUp className="w-5 h-5 text-[#7D7D7D]" />
                <span className="text-xs font-medium text-[#7D7D7D]">התקדמות</span>
              </Link>
              <Link to={createPageUrl("TraineeProfile")} className="flex flex-col items-center gap-1">
                <User className="w-5 h-5 text-[#7D7D7D]" />
                <span className="text-xs font-medium text-[#7D7D7D]">פרופיל</span>
              </Link>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <UnifiedPlanBuilder 
      plan={selectedPlan} 
      isCoach={false} 
      canEdit={selectedPlan?.created_by === user?.id} 
      onBack={() => setSelectedPlan(null)} 
    />
  );
}