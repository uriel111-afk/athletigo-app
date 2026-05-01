import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Copy, Check, X, Target, Calendar, User, Loader2, Award } from "lucide-react";
import WorkoutProgressBar from "./WorkoutProgressBar";
import SectionForm from "../workout/SectionForm";
import ModernExerciseForm from "../workout/ModernExerciseForm";
import SectionCard from "./SectionCard";
import ExerciseExecutionModal from "./ExerciseExecutionModal";
import ExerciseExecution from "@/components/ExerciseExecution";
import { toast } from "sonner";
import { getTraineeProgressForPlan, bulkUpsertProgress } from "@/lib/traineeProgressApi";
import { notifyExerciseUpdated, notifyPlanUpdated } from "@/functions/notificationTriggers";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function UnifiedPlanBuilder({ plan, isCoach = false, canEdit = false, onBack }) {
  const [showEditBuilder, setShowEditBuilder] = useState(false);
  const [showSectionDialog, setShowSectionDialog] = useState(false);
  const [showExerciseDialog, setShowExerciseDialog] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [editingExercise, setEditingExercise] = useState(null);
  const [currentSection, setCurrentSection] = useState(null);
  const [editingPlanName, setEditingPlanName] = useState(false);
  const [tempPlanName, setTempPlanName] = useState(plan.plan_name || "");
  const sectionFormRef = useRef(null);
  const [showSectionFeedbackDialog, setShowSectionFeedbackDialog] = useState(false);
  const [sectionFeedbackData, setSectionFeedbackData] = useState({ sectionId: null, sectionName: "", control_rating: 5, difficulty_rating: 5, notes: "" });
  const [completedSections, setCompletedSections] = useState(new Set());
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationFiredRef = useRef(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [executionExercise, setExecutionExercise] = useState(null);

  const queryClient = useQueryClient();

  React.useEffect(() => {
    console.log('[UPB] mount — plan id:', plan?.id, 'name:', plan?.plan_name || plan?.name);
  }, [plan?.id]);

  React.useEffect(() => {
    if (!plan?.id) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['training-sections', plan.id] });
      queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
    };
    window.addEventListener('tab-changed', handler);
    return () => window.removeEventListener('tab-changed', handler);
  }, [plan?.id, queryClient]);

  const { data: sections = [], isLoading: sectionsLoading, error: sectionsError } = useQuery({
    queryKey: ['training-sections', plan.id],
    queryFn: async () => {
      try {
        const rows = await base44.entities.TrainingSection.filter({ training_plan_id: plan.id }, 'order');
        return rows;
      } catch (e) {
        try {
          const data = await base44.entities.TrainingSection.filter({ training_plan_id: plan.id });
          return data.sort((a, b) => (a.order || 0) - (b.order || 0));
        } catch (err) {
          return [];
        }
      }
    },
    enabled: !!plan.id
  });

  const { data: exercises = [], isLoading: exercisesLoading, error: exercisesError } = useQuery({
    queryKey: ['exercises', plan.id],
    queryFn: async () => {
      try {
        const rows = await base44.entities.Exercise.filter({ training_plan_id: plan.id }, 'order');
        return rows;
      } catch (e) {
        try {
          const data = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
          return data.sort((a, b) => (a.order || 0) - (b.order || 0));
        } catch (err) {
          return [];
        }
      }
    },
    enabled: !!plan.id
  });

  const { data: traineeProgress = [] } = useQuery({
    queryKey: ['trainee-progress', plan.id],
    queryFn: async () => {
      try {
        const me = await base44.auth.me();
        if (!me?.id) return [];
        return await getTraineeProgressForPlan(me.id, plan.id);
      } catch (e) {
        return [];
      }
    },
    enabled: !!plan.id && !canEdit,
  });

  const traineeProgressByExercise = React.useMemo(() => {
    const map = {};
    for (const row of traineeProgress || []) map[row.exercise_id] = row;
    return map;
  }, [traineeProgress]);

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TrainingPlan.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      toast.success("✅ עודכן");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const createSectionMutation = useMutation({
    mutationFn: (data) => base44.entities.TrainingSection.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sections', plan.id] });
      setShowSectionDialog(false);
      toast.success("✅ סקשן נוסף");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const updateSectionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TrainingSection.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sections', plan.id] });
      setShowSectionDialog(false);
      setEditingSection(null);
      toast.success("✅ עודכן");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (sectionId) => {
      const sectionExercises = exercises.filter((e) => e.training_section_id === sectionId);
      for (const exercise of sectionExercises) {
        await base44.entities.Exercise.delete(exercise.id);
      }
      await base44.entities.TrainingSection.delete(sectionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sections', plan.id] });
      queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
      toast.success("✅ נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const duplicateSectionMutation = useMutation({
    mutationFn: async (originalSection) => {
      if (!originalSection) return;
      const maxOrder = Math.max(0, ...sections.map((s) => Number(s.order) || 0));
      const { id: _omitId, created_at: _omitCa, ...sectionFields } = originalSection;
      const newSection = await base44.entities.TrainingSection.create({
        ...sectionFields,
        name: (originalSection.name || 'סקשן') + ' (עותק)',
        order: maxOrder + 1,
      });
      const originalExercises = exercises.filter((e) => e.training_section_id === originalSection.id);
      for (const ex of originalExercises) {
        const { id: _exId, created_at: _exCa, training_section_id: _ts, ...exFields } = ex;
        await base44.entities.Exercise.create({
          ...exFields,
          training_section_id: newSection.id,
        });
      }
      return newSection;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sections', plan.id] });
      queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
      toast.success('✅ סקשן שוכפל');
    },
    onError: (err) => toast.error('❌ שגיאה: ' + (err?.message || 'נסה שוב')),
  });

  const moveSectionMutation = useMutation({
    mutationFn: async ({ section, direction }) => {
      const sorted = [...sections].filter(Boolean).sort((a, b) => (a.order || 0) - (b.order || 0));
      const idx = sorted.findIndex((s) => s.id === section.id);
      const targetIdx = idx + direction;
      if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[targetIdx];
      await Promise.all([
        base44.entities.TrainingSection.update(a.id, { order: b.order || 0 }),
        base44.entities.TrainingSection.update(b.id, { order: a.order || 0 }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sections', plan.id] });
    },
    onError: (err) => toast.error('❌ שגיאה: ' + (err?.message || 'נסה שוב')),
  });

  const moveExerciseMutation = useMutation({
    mutationFn: async ({ exercise, direction }) => {
      const same = exercises.filter((e) => e && e.training_section_id === exercise.training_section_id).sort((a, b) => (a.order || 0) - (b.order || 0));
      const idx = same.findIndex((e) => e.id === exercise.id);
      const targetIdx = idx + direction;
      if (idx < 0 || targetIdx < 0 || targetIdx >= same.length) return;
      const a = same[idx];
      const b = same[targetIdx];
      await Promise.all([
        base44.entities.Exercise.update(a.id, { order: b.order || 0 }),
        base44.entities.Exercise.update(b.id, { order: a.order || 0 }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
    },
    onError: (err) => toast.error('❌ שגיאה: ' + (err?.message || 'נסה שוב')),
  });

  const duplicateExerciseMutation = useMutation({
    mutationFn: async (originalExercise) => {
      if (!originalExercise) return;
      const { id: _exId, created_at: _exCa, ...exFields } = originalExercise;
      const same = exercises.filter((e) => e && e.training_section_id === originalExercise.training_section_id);
      const maxOrder = Math.max(0, ...same.map((e) => Number(e.order) || 0));
      return await base44.entities.Exercise.create({
        ...exFields,
        order: maxOrder + 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
      toast.success('✅ תרגיל שוכפל');
    },
    onError: (err) => toast.error('❌ שגיאה: ' + (err?.message || 'נסה שוב')),
  });

  const prepareExerciseData = (formData) => {
    const data = { ...formData };
    Object.keys(data).forEach((key) => {
      if (typeof data[key] === 'string' && data[key] === "") {
        data[key] = null;
      }
    });
    return data;
  };

  const createExerciseMutation = useMutation({
    mutationFn: (data) => base44.entities.Exercise.create(prepareExerciseData(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
      setShowExerciseDialog(false);
      toast.success("✅ תרגיל נוסף");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const updateExerciseMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Exercise.update(id, prepareExerciseData(data)),
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
      if (showExerciseDialog) {
        setShowExerciseDialog(false);
        setEditingExercise(null);
        toast.success("התרגיל עודכן בהצלחה");
      }
    },
    onError: (error) => {
      toast.error("שגיאה בעדכון התוכנית — נסה שוב");
    }
  });

  const deleteExerciseMutation = useMutation({
    mutationFn: (id) => base44.entities.Exercise.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
      toast.success("✅ נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });
  const getExercisesBySection = React.useCallback((sectionId) => {
    return exercises.filter((e) => e && e.training_section_id === sectionId).sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [exercises]);

  useEffect(() => {
    if (plan && exercises.length > 0) {
      const total = exercises.length;
      const completed = exercises.filter(e => e.completed).length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      const topExercises = exercises.slice(0, 5).map(e => `• ${e.exercise_name || e.name || 'תרגיל'}`).join('\n');
      const previewText = total > 5 ? `${topExercises}\n+ עוד ${total - 5}` : topExercises;
      if (plan.progress_percentage !== progress || plan.exercises_count !== total) {
        const timer = setTimeout(() => {
          base44.entities.TrainingPlan.update(plan.id, {
            progress_percentage: progress,
            exercises_count: total,
            preview_text: previewText
          }).catch(console.error);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [exercises, plan]);

  useEffect(() => {
    if (canEdit) return;
    if (!exercises || exercises.length === 0) return;
    const allDone = exercises.every(e => e.completed);
    if (allDone && !celebrationFiredRef.current) {
      celebrationFiredRef.current = true;
      setShowCelebration(true);
    }
    if (!allDone) celebrationFiredRef.current = false;
  }, [exercises, canEdit]);

  const exercisesTotal = exercises?.length ?? 0;
  const exercisesDone = exercises?.filter(e => e.completed).length ?? 0;
  const progressPct = exercisesTotal > 0 ? Math.round((exercisesDone / exercisesTotal) * 100) : 0;

  const checkAndTriggerPopups = (toggledExerciseId, isCompleted) => {
    if (!isCompleted) return;
    const validExercises = exercises.filter(Boolean);
    const updatedExercises = validExercises.map((e) => e.id === toggledExerciseId ? { ...e, completed: true } : e);
    const toggledExercise = updatedExercises.find((e) => e.id === toggledExerciseId);
    if (!toggledExercise) return;
    const sectionId = toggledExercise.training_section_id;
    const sectionExercises = updatedExercises.filter((e) => e.training_section_id === sectionId);
    const isSectionComplete = sectionExercises.length > 0 && sectionExercises.every((e) => e.completed);

    if (isSectionComplete && !completedSections.has(sectionId)) {
      const section = sections.find((s) => s.id === sectionId);
      if (section) {
        setSectionFeedbackData({
          sectionId: section.id,
          sectionName: section.section_name,
          control_rating: 5,
          difficulty_rating: 5,
          notes: ""
        });
        setShowSectionFeedbackDialog(true);
        if (!section.completed) {
          updateSectionMutation.mutate({ id: sectionId, data: { completed: true } });
        }
        setCompletedSections((prev) => new Set([...prev, sectionId]));
      }
      return;
    }

    if (!isSectionComplete || completedSections.has(sectionId)) {
      const allExercisesComplete = updatedExercises.length > 0 && updatedExercises.every((e) => e.completed);
      if (allExercisesComplete) {
        setTimeout(() => showWorkoutSummary(updatedExercises), 700);
      }
    }
  };

  const showWorkoutSummary = (currentExercisesList) => {
    const completed = currentExercisesList.filter((e) => e.completed);
    const totalExercises = completed.length;
    const totalSets = completed.reduce((acc, e) => acc + (parseInt(e.sets) || parseInt(e.rounds) || 0), 0);
    const parseTime = (t) => {
      if (!t) return 0;
      if (typeof t === 'string' && t.includes(':')) {
        const [m, s] = t.split(':').map(Number);
        return (m || 0) * 60 + (s || 0);
      }
      return parseInt(t) || 0;
    };
    const totalWorkSeconds = completed.reduce((acc, e) => acc + parseTime(e.work_time), 0);
    const totalRestSeconds = completed.reduce((acc, e) => acc + parseTime(e.rest_time), 0);
    const formatTimeStat = (secs) => {
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };
    const rpeValues = completed.map((e) => parseInt(e.rpe)).filter((v) => !isNaN(v) && v > 0);
    const avgRPE = rpeValues.length > 0 ? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1) : "-";
    const ratings = currentExercisesList.map((e) => ({ c: e.control_rating || 5, d: e.difficulty_rating || 5 }));
    const avgControl = ratings.length > 0 ? Math.round(ratings.reduce((acc, curr) => acc + curr.c, 0) / ratings.length * 10) / 10 : 5;
    const avgDifficulty = ratings.length > 0 ? Math.round(ratings.reduce((acc, curr) => acc + curr.d, 0) / ratings.length * 10) / 10 : 5;
    const messages = [
      "מעולה! האימון הושלם.",
      "יפה מאוד! סיימת את כל הסקשנים.",
      "עבודה חזקה!",
      "כל הכבוד!",
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    setSummaryData({
      avgControl, avgDifficulty, totalExercises, totalSets,
      totalWorkTime: formatTimeStat(totalWorkSeconds),
      totalRestTime: formatTimeStat(totalRestSeconds),
      avgRPE,
      message: `${randomMessage} שליטה ממוצעת: ${avgControl}, קושי ממוצע: ${avgDifficulty}.`
    });
    setShowSummaryDialog(true);
  };

  const handleToggleComplete = async (exercise) => {
    const newCompletedState = !exercise.completed;
    if (newCompletedState) {
      checkAndTriggerPopups(exercise.id, true);
    }
    await updateExerciseMutation.mutateAsync({
      id: exercise.id,
      data: { completed: newCompletedState }
    });
  };

  const handleSaveSection = async (sectionData) => {
    if (!sectionData || !sectionData.section_name) {
      toast.error("נא למלא שם סקשן");
      return;
    }
    const order = editingSection?.order || sections.length + 1;
    const data = {
      ...sectionData,
      training_plan_id: plan.id,
      order,
      category: sectionData.category || "חימום",
      description: sectionData.description || null,
      color_theme: sectionData.color_theme || null,
      icon: sectionData.icon || null
    };
    if (editingSection?.id) {
      await updateSectionMutation.mutateAsync({ id: editingSection.id, data });
    } else {
      await createSectionMutation.mutateAsync(data);
    }
  };

  const handleSaveExercise = async (exerciseData) => {
    if (!exerciseData?.exercise_name?.trim()) {
      toast.error("שם התרגיל חסר");
      return;
    }
    if (!currentSection?.id) {
      toast.error("יש לבחור סקציה לפני הוספת תרגיל");
      return;
    }
    if (!plan?.id) {
      toast.error("יש לשמור את התוכנית קודם");
      return;
    }

    let tabataPreview = null;
    let tabataData = null;
    const subExercises = exerciseData.sub_exercises || [];

    if (subExercises.length > 0) {
      const containerType = exerciseData.mode === "טבטה" ? "tabata" : "list";
      tabataData = JSON.stringify({ container_type: containerType, sub_exercises: subExercises });
      tabataPreview = subExercises.map((s) => s.exercise_name || "תת-תרגיל").join(" • ");
    }

    const sectionExercises = getExercisesBySection(currentSection.id);
    const order = editingExercise?.order || sectionExercises.length + 1;
    const data = {
      mode: exerciseData.mode || "חזרות",
      weight_type: exerciseData.weight_type || "bodyweight",
      ...exerciseData,
      name: exerciseData.exercise_name || exerciseData.name || "תרגיל",
      tabata_preview: tabataPreview,
      tabata_data: tabataData,
      training_plan_id: plan.id,
      training_section_id: currentSection.id,
      order,
      completed: editingExercise?.completed || false,
    };
    delete data.sub_exercises;
    delete data.tabataPreview;
    delete data.tabataData;
    delete data.tabata_blocks;

    try {
      if (editingExercise?.id) {
        await updateExerciseMutation.mutateAsync({ id: editingExercise.id, data });
      } else {
        await createExerciseMutation.mutateAsync(data);
      }
    } catch (error) {
      toast.error("שגיאה בשמירה: " + (error?.message || 'נסה שוב'));
    }
  };

  const saveWorkoutHistory = async (shouldUpdatePlanStatus = false) => {
    try {
      const completedCount = exercises.filter((e) => e && e.completed).length;
      const totalCount = exercises.length;
      const ratings = exercises.map((e) => ({ c: e.control_rating || 5, d: e.difficulty_rating || 5 }));
      const avgControl = Math.round(ratings.reduce((acc, curr) => acc + curr.c, 0) / (ratings.length || 1) * 10) / 10;
      const avgDifficulty = Math.round(ratings.reduce((acc, curr) => acc + curr.d, 0) / (ratings.length || 1) * 10) / 10;
      await base44.entities.WorkoutHistory.create({
        userId: plan.assigned_to || plan.created_by,
        planId: plan.id,
        planName: plan.plan_name,
        date: new Date().toISOString(),
        mastery_avg: avgControl,
        difficulty_avg: avgDifficulty,
        notes: `הושלמו ${completedCount} מתוך ${totalCount} תרגילים`
      });
      if (shouldUpdatePlanStatus && !plan.is_template) {
        await base44.entities.TrainingPlan.update(plan.id, { status: 'הושלמה' });
      }
      toast.success("🎉 האימון נשמר!");
      if (onBack) onBack();
    } catch (error) {
      toast.error("שגיאה בשמירת האימון");
    }
  };

  if (plan?.id && (sectionsLoading || exercisesLoading)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, direction: 'rtl' }}>
        <div style={{ fontSize: 14, color: '#888' }}>טוען תוכנית...</div>
      </div>
    );
  
  return (
    <div className="w-full pb-16 md:pb-24" dir="rtl">
      <div className="mb-6" style={{ backgroundColor: '#FF6F20', padding: '20px', borderRadius: '0 0 24px 24px' }}>
        <div className="flex items-center justify-center mb-4">
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {plan.plan_name}
          </h1>
        </div>

        {((Array.isArray(plan.goal_focus) && plan.goal_focus.length > 0) || (Array.isArray(plan.weekly_days) && plan.weekly_days.length > 0)) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
            {(plan.goal_focus || []).map(f => (
              <span key={`f-${f}`} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.18)', color: 'white' }}>{f}</span>
            ))}
            {(plan.weekly_days || []).map(d => (
              <span key={`d-${d}`} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.28)', color: 'white' }}>{d}</span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-white/20 rounded-lg p-3 text-center">
            <div className="text-lg font-black text-white">{exercises.filter(e => e.completed).length}</div>
            <div className="text-xs text-white/80 uppercase font-bold">ביצועים</div>
          </div>
          <div className="bg-white/20 rounded-lg p-3 text-center">
            <div className="text-lg font-black text-white">{sections.length}</div>
            <div className="text-xs text-white/80 uppercase font-bold">סקשנים</div>
          </div>
          <div className="bg-white/20 rounded-lg p-3 text-center">
            <div className="text-lg font-black text-white">{exercises.length}</div>
            <div className="text-xs text-white/80 uppercase font-bold">תרגילים</div>
          </div>
          <div className="bg-white/20 rounded-lg p-3 text-center">
            <div className="text-lg font-black text-white">{exercises.length > 0 ? Math.round((exercises.filter(e => e.completed).length / exercises.length) * 100) : 0}%</div>
            <div className="text-xs text-white/80 uppercase font-bold">הושלם</div>
          </div>
        </div>

        <div className="bg-white/20 rounded-full h-2 overflow-hidden">
          <div className="h-full bg-white transition-all duration-500" style={{ width: `${exercises.length > 0 ? (exercises.filter(e => e.completed).length / exercises.length) * 100 : 0}%` }}></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full" style={{ padding: '12px 16px' }}>
        {canEdit && (
          <div className="mb-4 md:mb-6 w-full flex gap-2">
            <Button onClick={(e) => { e.stopPropagation(); setEditingSection(null); setShowSectionDialog(true); }} className="flex-1 sm:flex-none rounded-xl py-3 md:py-4 font-bold text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
              <Plus className="w-4 h-4 md:w-5 md:h-5 ml-1 md:ml-2" />
              הוסף סקשן חדש
            </Button>
          </div>
        )}

        <div className="space-y-3 md:space-y-6 mb-20 md:mb-24 w-full">
          {sections.filter(Boolean).map((section, index) => {
            const sectionExercises = getExercisesBySection(section.id);
            return (
              <SectionCard
                key={section.id}
                index={index}
                section={section}
                exercises={sectionExercises}
                onToggleComplete={handleToggleComplete}
                onEditExercise={(exercise) => {
                  setEditingExercise(exercise);
                  setCurrentSection(section);
                  setShowExerciseDialog(true);
                }}
                onAddExercise={() => {
                  setCurrentSection(section);
                  setEditingExercise({ mode: "חזרות", exercise_name: "", weight_type: "bodyweight", completed: false });
                  setShowExerciseDialog(true);
                }}
                onEditSection={(sectionToEdit) => { setEditingSection(sectionToEdit); setShowSectionDialog(true); }}
                onDeleteSection={(sectionId) => { if (confirm('למחוק סקשן זה?')) deleteSectionMutation.mutate(sectionId); }}
                onDuplicateSection={(s) => duplicateSectionMutation.mutate(s)}
                onMoveSection={(direction) => moveSectionMutation.mutate({ section, direction })}
                isFirstSection={index === 0}
                isLastSection={index === sections.filter(Boolean).length - 1}
                onMoveExercise={(exercise, direction) => moveExerciseMutation.mutate({ exercise, direction })}
                onDuplicateExercise={(exercise) => duplicateExerciseMutation.mutate(exercise)}
                onDeleteExercise={(exerciseId) => { if (confirm('למחוק תרגיל זה?')) deleteExerciseMutation.mutate(exerciseId); }}
                showEditButtons={canEdit}
                isCoach={isCoach}
                plan={plan}
                traineeProgressByExercise={traineeProgressByExercise}
              />
            );
          })}
        </div>
      </div>

      <Dialog open={showSectionDialog} onOpenChange={(open) => { if (!open) { setShowSectionDialog(false); setEditingSection(null); } }}>
        <DialogContent className="w-[95vw] md:w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{editingSection ? '✏️ ערוך סקשן' : '➕ סקשן חדש'}</DialogTitle>
          </DialogHeader>
          <SectionForm
            section={editingSection || { category: "חימום", section_name: "", description: "" }}
            onChange={(data) => {
              const merged = { ...editingSection, ...data };
              setEditingSection(merged);
              sectionFormRef.current = merged;
            }}
          />
          <div className="flex gap-3 pt-4">
            <Button onClick={() => { setShowSectionDialog(false); setEditingSection(null); sectionFormRef.current = null; }} variant="outline" className="flex-1 rounded-xl py-6 font-bold">ביטול</Button>
            <Button
              onClick={async () => {
                const formData = sectionFormRef.current || editingSection || {};
                if (!formData.section_name) { toast.error("נא למלא שם סקשן"); return; }
                await handleSaveSection(formData);
              }}
              disabled={createSectionMutation.isPending || updateSectionMutation.isPending}
              className="flex-1 rounded-xl py-6 font-bold text-white text-lg"
              style={{ backgroundColor: '#FF6F20' }}
            >
              {createSectionMutation.isPending || updateSectionMutation.isPending ? <><Loader2 className="w-5 h-5 ml-2 animate-spin" />שומר...</> : editingSection ? 'עדכן סקשן' : 'צור סקשן'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showExerciseDialog} onOpenChange={(open) => { if (!open) { setShowExerciseDialog(false); setEditingExercise(null); setCurrentSection(null); } }}>
        <DialogContent className="w-[95vw] md:w-full max-w-2xl h-[90vh] md:h-auto md:max-h-[85vh] flex flex-col p-0 gap-0 bg-white overflow-hidden" style={{ borderRadius: '20px' }}>
          <div className="p-6 pb-4 border-b border-gray-50 bg-white z-20">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black text-gray-900">{editingExercise ? '✏️ ערוך תרגיל' : '➕ תרגיל חדש'}</DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto p-6 pt-2">
            <ModernExerciseForm
              exercise={editingExercise || { mode: "חזרות", exercise_name: "", weight_type: "bodyweight" }}
              onChange={(data) => setEditingExercise({ ...editingExercise, ...data })}
            />
          </div>
          <div className="p-4 bg-white z-20 border-t">
            <Button
              onClick={async () => {
                const formData = editingExercise || {};
                if (!formData.exercise_name) { toast.error("נא למלא שם תרגיל"); return; }
                await handleSaveExercise(formData);
              }}
              disabled={createExerciseMutation.isPending || updateExerciseMutation.isPending}
              className="w-full rounded-xl h-[56px] font-black text-white text-lg"
              style={{ backgroundColor: '#FF6F20' }}
            >
              {createExerciseMutation.isPending || updateExerciseMutation.isPending ? <><Loader2 className="w-5 h-5 ml-2 animate-spin" />שומר...</> : editingExercise ? 'עדכן תרגיל' : 'שמור תרגיל'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {!canEdit && (
        <div className="fixed bottom-0 left-0 right-0 bg-black p-4 z-50">
          {exercisesTotal > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ height: 6, width: '100%', background: '#FFE5D0', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: '#FF6F20', transition: 'width 0.25s ease' }} />
              </div>
              <div style={{ color: '#FFE5D0', fontSize: 11, fontWeight: 600, marginTop: 4, textAlign: 'center' }}>
                {exercisesDone} / {exercisesTotal} · {progressPct}%
              </div>
            </div>
          )}
          <Button
            className="w-full h-12 font-bold text-lg"
            style={{ backgroundColor: 'black', color: '#FF6F20', border: '2px solid #FF6F20' }}
            onClick={() => {
              const completedExercises = exercises.filter(e => e.completed);
              if (completedExercises.length > 0) {
                showWorkoutSummary(exercises);
              } else {
                toast.error("יש להשלים לפחות תרגיל אחד לפני סיום האימון");
              }
            }}
          >
            סיים אימון
          </Button>
        </div>
      )}

      <Dialog open={showCelebration} onOpenChange={(o) => { if (!o) setShowCelebration(false); }}>
        <DialogContent className="max-w-sm" style={{ background: '#FFF9F0', border: '2px solid #FF6F20', borderRadius: 16 }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#FF6F20', fontWeight: 800, fontSize: 20, textAlign: 'center' }}>
              כל הכבוד! סיימת את התוכנית 💪
            </DialogTitle>
          </DialogHeader>
          <div dir="rtl" style={{ textAlign: 'center', padding: '8px 0 16px', color: '#1a1a1a', fontSize: 14 }}>
            סימנת את כל התרגילים. המשך כך באימון הבא.
          </div>
          <button onClick={() => setShowCelebration(false)} style={{ width: '100%', padding: 12, background: '#FF6F20', color: '#FFFFFF', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            סגור
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
  
