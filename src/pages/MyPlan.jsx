import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Target, Loader2, User, CheckCircle, Trash2, Plus, ChevronDown, Copy, FolderPlus, ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import UnifiedPlanBuilder from "../components/training/UnifiedPlanBuilder";
import PlanFormDialog from "../components/training/PlanFormDialog";
import { toast } from "sonner";
import { FOCUS_LABELS } from "@/lib/sectionTypes";
import PageLoader from "@/components/PageLoader";
import PermGate from "@/components/PermGate";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

// Extracted Component for performance and safety
const PlanCard = ({ plan, isMine, exercises, improvementData, scoreData, onSelect, onDuplicate, onDelete }) => {
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
            <div className="flex flex-wrap gap-1 mb-1">
              {(Array.isArray(plan.goal_focus) ? plan.goal_focus : []).map(k => (
                <span key={k} style={{ padding:'3px 8px', borderRadius:9999, background:'#FFF9F0', color:'#FF6F20', border:'1px solid #FFD0A0', fontSize:11, fontWeight:600 }}>
                  {FOCUS_LABELS[k] || k}
                </span>
              ))}
            </div>
            
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

        {/* Execution badges — best_score + execution_count from the
            new plan-execution columns. Conditional renders so plans
            that haven't been executed yet stay clean. */}
        {(plan.best_score != null || (plan.execution_count || 0) > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {plan.best_score != null && (
              <span style={{
                background: '#FFF5EE', color: '#FF6F20',
                border: '1px solid #FFD9C2',
                padding: '3px 10px', borderRadius: 999,
                fontSize: 12, fontWeight: 700,
              }}>
                ⭐ שיא: {Number(plan.best_score).toFixed(1)}
              </span>
            )}
            {(plan.execution_count || 0) > 0 && (
              <span style={{
                background: '#F3F4F6', color: '#4B5563',
                border: '1px solid #E5E7EB',
                padding: '3px 10px', borderRadius: 999,
                fontSize: 12, fontWeight: 600,
              }}>
                {plan.execution_count} ביצוע{plan.execution_count > 1 ? 'ים' : ''}
              </span>
            )}
          </div>
        )}

        {/* Plan score + session comparison — derived from exercise_executions */}
        {scoreData && scoreData.sessions && scoreData.sessions.length > 0 && (
          <div className="pt-3 border-t border-[#E0E0E0] mt-3" onClick={(e) => e.stopPropagation()} style={{ direction: 'rtl' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: scoreData.sessions.length > 1 ? 10 : 0 }}>
              <span style={{ fontSize: 12, color: '#888' }}>ציון:</span>
              <span style={{
                fontSize: 14, fontWeight: 600,
                color: scoreData.overall >= 7 ? '#16a34a' : scoreData.overall >= 4 ? '#EAB308' : '#dc2626',
              }}>
                {scoreData.overall.toFixed(1)}/10
              </span>
              <span style={{ fontSize: 11, color: '#aaa', marginRight: 'auto' }}>
                {scoreData.sessions.length} ביצוע{scoreData.sessions.length > 1 ? 'ים' : ''}
              </span>
            </div>
            {scoreData.sessions.length > 1 && (
              <div style={{ background: 'white', borderRadius: 14, padding: 14, border: '1px solid #F0E4D0' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>📈 התקדמות</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
                  {scoreData.sessions.slice(-8).map((s, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{s.avg.toFixed(1)}</div>
                      <div style={{
                        height: `${(s.avg / 10) * 80}px`,
                        background: '#FF6F20',
                        borderRadius: '4px 4px 0 0',
                        margin: '4px auto',
                        width: '100%',
                      }} />
                      <div style={{ fontSize: 9, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {new Date(s.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function MyPlanInner() {
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

  const isCoach = user?.is_coach === true || user?.role === 'coach' || user?.role === 'admin';

  const { data: coach } = useQuery({
    queryKey: ['myplan-coach'],
    queryFn: async () => {
      try {
        const users = await base44.entities.User.list('-created_at', 1000);
        return users.find(u => u.is_coach === true || u.role === 'coach') || null;
      } catch {
        return null;
      }
    },
    enabled: !!user?.id && !isCoach,
    staleTime: 60000,
  });

  const canCreatePlans = !!coach?.allow_trainee_plans;

  const allTrainees = [];

  useEffect(() => {
    if (isCoach) {
      window.location.href = createPageUrl("PlanBuilder");
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
      console.log('[MyPlan] loading plans for trainee:', user.id);
      try {
        const directPlansPromise = base44.entities.TrainingPlan.filter({ assigned_to: user.id }, '-start_date').catch(() => []);
        const assignmentsPromise = base44.entities.TrainingPlanAssignment.filter({ trainee_id: user.id }).catch(() => []);
        const createdPlansPromise = base44.entities.TrainingPlan.filter({ created_by: user.id }, '-created_at').catch(() => []);

        const [directPlans, assignments, createdByMe] = await Promise.all([directPlansPromise, assignmentsPromise, createdPlansPromise]);
        console.log('[MyPlan] plans result:', {
          direct: directPlans?.length, assignments: assignments?.length, createdByMe: createdByMe?.length,
        });

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
        const dedup = Array.from(new Map(combined.filter(Boolean).map(item => [item.id, item])).values());
        // Hide soft-deleted plans (status='deleted' / deleted_at set)
        // so the coach removing a plan from their side immediately
        // disappears it from the trainee's view too.
        const visible = dedup.filter(p => p.status !== 'deleted' && !p.deleted_at);
        console.log('[MyPlan] plans visible:', visible.length, '/', dedup.length);
        return visible;
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

  // Per-exercise execution rows — populate the plan score badge and the
  // day-by-day progress chart. Each row is one completed exercise.
  const { data: executions = [] } = useQuery({
    queryKey: ['my-exercise-executions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.ExerciseExecution.filter({ trainee_id: user.id }, '-created_at');
      } catch { return []; }
    },
    enabled: !!user?.id,
    initialData: [],
  });

  // Group executions by plan + day. Each "session" = average mastery of
  // all exercises completed that day for that plan.
  const planScoreData = useMemo(() => {
    const byPlan = {};
    for (const ex of executions) {
      const pid = ex.plan_id;
      if (!pid) continue;
      const day = (ex.created_at || '').slice(0, 10);
      if (!day) continue;
      if (!byPlan[pid]) byPlan[pid] = {};
      if (!byPlan[pid][day]) byPlan[pid][day] = [];
      const m = Number(ex.mastery_rating) || 0;
      if (m > 0) byPlan[pid][day].push(m);
    }
    const result = {};
    for (const [pid, days] of Object.entries(byPlan)) {
      const sessions = Object.entries(days)
        .map(([date, arr]) => ({ date, avg: arr.reduce((a, b) => a + b, 0) / arr.length }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const overall = sessions.length
        ? sessions.reduce((a, s) => a + s.avg, 0) / sessions.length
        : 0;
      result[pid] = { sessions, overall };
    }
    return result;
  }, [executions]);

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
      const goalFocusArray = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0 ? planData.goal_focus : ['כוח'];
      const newPlan = await base44.entities.TrainingPlan.create({
        title: planData.plan_name,
        plan_name: planData.plan_name,
        assigned_to: user.id,
        assigned_to_name: user.full_name,
        created_by: user.id,
        created_by_name: user.full_name,
        goal_focus: goalFocusArray,
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
      // Soft-delete only — drop the destructive section/exercise
      // cascade so the row + its history can be recovered. The
      // trainee's MyPlan loader filters status='deleted' and the
      // coach's plan list does too, so the visual effect is the
      // same: plan disappears.
      await base44.entities.TrainingPlan.update(planId, {
        status: 'deleted',
        deleted_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      toast.success("🗑️ תוכנית נמחקה");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: async (originalPlan) => {
      // 1. Create new plan
      const newPlan = await base44.entities.TrainingPlan.create({
        title: `${originalPlan.plan_name} (עותק)`,
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
      return <PageLoader />;
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
      <div dir="rtl" className="min-h-screen bg-white pb-24">
        <div className="w-full mx-auto" style={{ padding: '12px 8px 24px', maxWidth: 'none' }}>
          <div className="mb-8 flex justify-between items-end">
            <div>
                <h1 className="text-4xl md:text-5xl font-black mb-3 text-black">התוכנית שלי</h1>
                <div className="w-16 h-1 rounded-full bg-[#FF6F20]" />
            </div>
            {canCreatePlans && (
              <Button onClick={() => setShowCreatePlan(true)} className="rounded-2xl px-6 py-4 font-bold text-white bg-[#FF6F20]">
                <Plus className="w-5 h-5 ml-2" /> תוכנית חדשה
              </Button>
            )}
          </div>

          <Tabs defaultValue="coach" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 h-auto p-1 bg-gray-100 rounded-xl">
              <TabsTrigger value="coach" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#FF6F20] font-bold">תוכניות מהמאמן</TabsTrigger>
              <TabsTrigger value="my_plans" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#FF6F20] font-bold">תוכניות שלי</TabsTrigger>
              {/* Removed: history + improvement tabs — cleaned for simplicity */}
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
                      scoreData={planScoreData[plan.id]}
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
                            scoreData={planScoreData[plan.id]}
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
                    scoreData={planScoreData[plan.id]}
                    onSelect={setSelectedPlan}
                    onDuplicate={(p) => duplicatePlanMutation.mutate(p)}
                    onDelete={handleDeletePlan}
                  />
                ))
              ) : (
                <div className="p-8 rounded-2xl text-center border-2 border-dashed border-gray-200">
                  <p className="text-gray-500 mb-3">לא יצרת תוכניות אישיות</p>
                  {canCreatePlans && (
                    <Button onClick={() => setShowCreatePlan(true)} variant="outline" className="font-bold">
                      <Plus className="w-4 h-4 ml-2" /> תוכנית חדשה
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {workoutHistory.length > 0 ? (
                <div className="space-y-3">
                  {workoutHistory.slice(0, 20).map((entry, index) => (
                    <div key={entry.id || index} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-800 flex items-center justify-center text-sm font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900">{entry.planName || 'אימון'}</h4>
                            <p className="text-sm text-gray-500">{new Date(entry.date).toLocaleDateString('he-IL')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-gray-900">שליטה: {entry.mastery_avg?.toFixed(1) || 'N/A'}</div>
                          <div className="text-sm font-bold text-gray-900">קושי: {entry.difficulty_avg?.toFixed(1) || 'N/A'}</div>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold">
                          הושלם
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl text-center border-2 border-dashed border-gray-200">
                  <p className="text-gray-500">אין היסטוריית אימונים עדיין</p>
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

export default function MyPlan() {
  return (
    <PermGate permission="view_training_plan" label="תוכנית אימון">
      <MyPlanInner />
    </PermGate>
  );
}