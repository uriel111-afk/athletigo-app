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
  const sectionFormRef = useRef(null); // tracks latest section form data without stale closure issues
  const [showSectionFeedbackDialog, setShowSectionFeedbackDialog] = useState(false);
  const [sectionFeedbackData, setSectionFeedbackData] = useState({ sectionId: null, sectionName: "", control_rating: 5, difficulty_rating: 5, notes: "" });
  const [completedSections, setCompletedSections] = useState(new Set());
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationFiredRef = useRef(false);
  
  // Execution Modal State
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [executionExercise, setExecutionExercise] = useState(null);

  const queryClient = useQueryClient();

  const { data: sections = [] } = useQuery({
    queryKey: ['training-sections', plan.id],
    queryFn: async () => {
      try {
        return await base44.entities.TrainingSection.filter({ training_plan_id: plan.id }, 'order');
      } catch (e) {
        console.warn('[UPB] sections query with order failed, retrying without sort:', e?.message);
        try {
          const data = await base44.entities.TrainingSection.filter({ training_plan_id: plan.id });
          return data.sort((a, b) => (a.order || 0) - (b.order || 0));
        } catch { return []; }
      }
    },
    initialData: [],
    enabled: !!plan.id
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises', plan.id],
    queryFn: async () => {
      try {
        return await base44.entities.Exercise.filter({ training_plan_id: plan.id }, 'order');
      } catch (e) {
        console.warn('[UPB] exercises query with order failed, retrying without sort:', e?.message);
        try {
          const data = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
          return data.sort((a, b) => (a.order || 0) - (b.order || 0));
        } catch { return []; }
      }
    },
    initialData: [],
    enabled: !!plan.id
  });

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
      // Only show toast for explicit form saves, not toggle
      if (showExerciseDialog) {
        setShowExerciseDialog(false);
        setEditingExercise(null);
        toast.success("התרגיל עודכן בהצלחה");
      }
    },
    onError: (error) => {
        console.error("Update failed", error);
        toast.error("שגיאה בעדכון התוכנית — נסה שוב");
    }
  });

  // --- Completion Logic ---

  const checkAndTriggerPopups = (toggledExerciseId, isCompleted) => {
    if (!isCompleted) return; // We don't trigger popups on uncheck

    // Create a virtual state of exercises including the one just toggled
    const validExercises = exercises.filter(Boolean);
    const updatedExercises = validExercises.map((e) =>
    e.id === toggledExerciseId ? { ...e, completed: true } : e
    );

    const toggledExercise = updatedExercises.find((e) => e.id === toggledExerciseId);
    if (!toggledExercise) return;

    const sectionId = toggledExercise.training_section_id;

    // Check if Section is Complete
    const sectionExercises = updatedExercises.filter((e) => e.training_section_id === sectionId);
    const isSectionComplete = sectionExercises.length > 0 && sectionExercises.every((e) => e.completed);

    // If Section Complete AND not handled this session
    if (isSectionComplete && !completedSections.has(sectionId)) {
      const section = sections.find((s) => s.id === sectionId);
      if (section) {
        // 1. Show Popup (Wait for user interaction before checking global completion)
        setSectionFeedbackData({
          sectionId: section.id,
          sectionName: section.section_name,
          control_rating: 5,
          difficulty_rating: 5,
          notes: ""
        });
        setShowSectionFeedbackDialog(true);

        // 2. Update Local State & DB
        if (!section.completed) {
          updateSectionMutation.mutate({ id: sectionId, data: { completed: true } });
        }
        setCompletedSections((prev) => new Set([...prev, sectionId]));
      }
      return; // STOP HERE. 
    }

    // Only check global completion here if we DID NOT just finish a section (e.g. updating single exercise not in section, or section already completed)
    // The Section Feedback Dialog will handle checking global completion on close.
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

    // Calculate Stats
    const totalSets = completed.reduce((acc, e) => acc + (parseInt(e.sets) || parseInt(e.rounds) || parseInt(e.tabata_sets) || parseInt(e.superset_rounds) || parseInt(e.combo_sets) || 0), 0);

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
    "מעולה! האימון הושלם. רמת השליטה והביצוע שלך במגמת שיפור.",
    "יפה מאוד! סיימת את כל הסקשנים בהצלחה.",
    "עבודה חזקה! המשמעת שלך מביאה תוצאות.",
    "כל הכבוד! עוד אימון נכנס ליומן ההיסטוריה.",
    "סיימת את האימון! הגוף שלך מתחזק מאימון לאימון."];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    setSummaryData({
      avgControl,
      avgDifficulty,
      totalExercises,
      totalSets,
      totalWorkTime: formatTimeStat(totalWorkSeconds),
      totalRestTime: formatTimeStat(totalRestSeconds),
      avgRPE,
      message: `מעולה! האימון הושלם. רמת השליטה הממוצעת שלך היא ${avgControl}, ורמת הקושי הממוצעת ${avgDifficulty}. ${randomMessage}`
    });
    setShowSummaryDialog(true);
  };

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

  // Update Plan Stats when exercises change or complete
  useEffect(() => {
    if (plan && exercises.length > 0) {
      const total = exercises.length;
      const completed = exercises.filter(e => e.completed).length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      
      // Generate preview text
      const topExercises = exercises
        .slice(0, 5)
        .map(e => `• ${e.exercise_name || e.name || 'תרגיל'}`)
        .join('\n');
      
      const previewText = total > 5 ? `${topExercises}\n+ עוד ${total - 5}` : topExercises;

      if (plan.progress_percentage !== progress || plan.exercises_count !== total) {
         // Debounced update to avoid spamming DB
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

  // Trainee-only: celebrate the transition to 100%. Ref flag ensures the
  // modal fires only once per mount, so re-ticking after 100% (or loading
  // an already-complete plan) doesn't retrigger.
  useEffect(() => {
    if (canEdit) return;                 // coach side: no celebration
    if (!exercises || exercises.length === 0) return;
    const allDone = exercises.every(e => e.completed);
    if (allDone && !celebrationFiredRef.current) {
      celebrationFiredRef.current = true;
      setShowCelebration(true);
    }
    if (!allDone) celebrationFiredRef.current = false;
  }, [exercises, canEdit]);

  // Progress for the bottom bar (trainee view only)
  const exercisesTotal = exercises?.length ?? 0;
  const exercisesDone = exercises?.filter(e => e.completed).length ?? 0;
  const progressPct = exercisesTotal > 0 ? Math.round((exercisesDone / exercisesTotal) * 100) : 0;

  const handleToggleComplete = async (exercise) => {
    // 1. Optimistic / Immediate Logic
    const newCompletedState = !exercise.completed;

    // 2. Trigger Popup Checks (only if turning ON)
    if (newCompletedState) {
      checkAndTriggerPopups(exercise.id, true);
    }

    // 3. Mutate DB
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

  // --- SUMMARY GENERATOR ---
  const generateTabataSummary = (blocks) => {
    if (!blocks || blocks.length === 0) return "לא הוגדרו ערכי טבטה";

    if (blocks.length === 1) {
      const b = blocks[0];
      const exList = (b.block_exercises || []).map(ex => ex.name).join(" • ");
      const remaining = (b.block_exercises || []).length > 3 ? "…" : "";
      // Show up to 3 items then truncate
      const items = (b.block_exercises || []);
      const displayEx = items.slice(0, 3).map(ex => ex.name).join(" • ") + (items.length > 3 ? ` (+${items.length - 3})` : "");
      
      return `עבודה: ${b.work_time}ש׳ | מנוחה: ${b.rest_time}ש׳ | סבבים: ${b.rounds} | בין סבבים: ${b.rest_between_rounds}ש׳ | סטים: ${b.sets}\nתרגילים: ${displayEx}`;
    }

    // Multiple blocks - Show up to 2
    let summary = blocks.slice(0, 2).map((b, idx) => {
      const name = b.name || `בלוק ${idx + 1}`;
      const items = (b.block_exercises || []);
      const exList = items.slice(0, 3).map(ex => ex.name).join(" • ");
      const remaining = items.length > 3 ? "…" : "";
      return `${name}: עבודה ${b.work_time}ש׳/מנוחה ${b.rest_time}ש׳ | סבבים ${b.rounds} | סטים ${b.sets} | ${exList}${remaining}`;
    }).join("\n");

    if (blocks.length > 2) {
       summary += "\n…";
    }
    return summary;
  };

  const handleSaveExercise = async (exerciseData) => {
    // Explicit per-field validation with distinct error messages so
    // the user knows exactly what's missing instead of seeing one
    // generic "fill in name" toast for unrelated errors.
    if (!exerciseData?.exercise_name?.trim()) {
      console.warn('[UnifiedPlanBuilder] handleSaveExercise: exercise_name missing');
      toast.error("שם התרגיל חסר");
      return;
    }
    if (!currentSection?.id) {
      console.error('[UnifiedPlanBuilder] handleSaveExercise: currentSection.id missing', { currentSection });
      toast.error("יש לבחור סקציה לפני הוספת תרגיל");
      return;
    }
    if (!plan?.id) {
      console.error('[UnifiedPlanBuilder] handleSaveExercise: plan.id missing', { plan });
      toast.error("יש לשמור את התוכנית קודם");
      return;
    }

    // ── Sub-exercises / Container logic ─────────────────────────────
    let tabataPreview = null;
    let tabataData = null;
    const subExercises = exerciseData.sub_exercises || [];

    if (subExercises.length > 0) {
      // Container exercise — serialize sub-exercises to tabata_data
      const containerType = exerciseData.mode === "טבטה" ? "tabata" : "list";
      tabataData = JSON.stringify({
        container_type: containerType,
        sub_exercises: subExercises,
      });
      tabataPreview = subExercises
        .map((s) => s.exercise_name || "תת-תרגיל")
        .join(" • ");
    } else if (exerciseData.mode === "טבטה" && exerciseData.tabata_blocks?.length > 0) {
      // Legacy tabata blocks (backward compat)
      const blocks = exerciseData.tabata_blocks;
      tabataPreview = generateTabataSummary(blocks);
      tabataData = JSON.stringify({ blocks });
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
    // Clean up fields that don't exist as DB columns
    delete data.sub_exercises;
    delete data.tabataPreview;
    delete data.tabataData;
    delete data.tabata_blocks;

    try {
      if (editingExercise?.id) {
        await updateExerciseMutation.mutateAsync({ id: editingExercise.id, data });
        toast.success("עודכן בהצלחה");
      } else {
        await createExerciseMutation.mutateAsync(data);
        toast.success("נוצר בהצלחה");
      }
    } catch (error) {
      // Surface the actual error text so the user (and us) can tell
      // a schema mismatch from a network failure from an RLS denial.
      console.error("[UnifiedPlanBuilder] handleSaveExercise failed:", error, { data });
      const msg = error?.message || error?.error?.message || error?.body?.message || 'נסה שוב';
      toast.error("שגיאה בשמירה: " + msg);
    }
  };

  const saveWorkoutHistory = async (shouldUpdatePlanStatus = false) => {
    try {
      const completedCount = exercises.filter((e) => e && e.completed).length;
      const totalCount = exercises.length;

      const currentDate = new Date().toISOString();

      const ratings = exercises.map((e) => ({ c: e.control_rating || 5, d: e.difficulty_rating || 5 }));
      const avgControl = Math.round(ratings.reduce((acc, curr) => acc + curr.c, 0) / (ratings.length || 1) * 10) / 10;
      const avgDifficulty = Math.round(ratings.reduce((acc, curr) => acc + curr.d, 0) / (ratings.length || 1) * 10) / 10;

      await base44.entities.WorkoutHistory.create({
        userId: plan.assigned_to || plan.created_by,
        planId: plan.id,
        planName: plan.plan_name,
        date: currentDate,
        mastery_avg: avgControl,
        difficulty_avg: avgDifficulty,
        notes: `הושלמו ${completedCount} מתוך ${totalCount} תרגילים`
      });

      if (shouldUpdatePlanStatus && !plan.is_template) {
        await base44.entities.TrainingPlan.update(plan.id, { status: 'הושלמה' });
      }

      toast.success("🎉 האימון נשמר ביומן ההיסטוריה!");
      if (onBack) onBack();
    } catch (error) {
      console.error("Error saving workout log:", error);
      toast.error("שגיאה בשמירת האימון");
    }
  };

  const handleFinishWorkout = async () => {
    if (!confirm('האם ברצונך לסיים את האימון ולשמור אותו ביומן ההיסטוריה?')) return;
    await saveWorkoutHistory();
  };

  return (
    <div className="w-full pb-16 md:pb-24" dir="rtl">
      {/* PLAN HEADER */}
      <div className="mb-6" style={{ backgroundColor: '#FF6F20', padding: '20px', borderRadius: '0 0 24px 24px' }}>
        <div className="flex items-center justify-center mb-4">
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {plan.plan_name}
          </h1>
        </div>
        
        {/* Stat Chips */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-white/20 rounded-lg p-3 text-center">
            <div className="text-lg font-black text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {exercises.filter(e => e.completed).length}
            </div>
            <div className="text-xs text-white/80 uppercase font-bold">ביצועים</div>
          </div>
          <div className="bg-white/20 rounded-lg p-3 text-center">
            <div className="text-lg font-black text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {sections.length}
            </div>
            <div className="text-xs text-white/80 uppercase font-bold">סקשנים</div>
          </div>
          <div className="bg-white/20 rounded-lg p-3 text-center">
            <div className="text-lg font-black text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {exercises.length}
            </div>
            <div className="text-xs text-white/80 uppercase font-bold">תרגילים</div>
          </div>
          <div className="bg-white/20 rounded-lg p-3 text-center">
            <div className="text-lg font-black text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {exercises.length > 0 ? Math.round((exercises.filter(e => e.completed).length / exercises.length) * 100) : 0}%
            </div>
            <div className="text-xs text-white/80 uppercase font-bold">הושלם</div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="bg-white/20 rounded-full h-2 overflow-hidden">
          <div 
            className="h-full bg-white transition-all duration-500"
            style={{ width: `${exercises.length > 0 ? (exercises.filter(e => e.completed).length / exercises.length) * 100 : 0}%` }}
          ></div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto w-full" style={{ padding: '12px 16px' }}>

        {canEdit &&
        <div className="mb-4 md:mb-6 w-full flex gap-2">
            <Button onClick={(e) => {
            e.stopPropagation();
            setEditingSection(null);
            setShowSectionDialog(true);
          }}
          className="flex-1 sm:flex-none rounded-xl py-3 md:py-4 font-bold text-white text-sm md:text-base"
          style={{ backgroundColor: '#FF6F20' }}>
              <Plus className="w-4 h-4 md:w-5 md:h-5 ml-1 md:ml-2" />
              הוסף סקשן חדש
            </Button>
          </div>
        }

        <div className="space-y-3 md:space-y-6 mb-20 md:mb-24 w-full">
          {sections.filter(Boolean).map((section, index) => {
            const sectionExercises = getExercisesBySection(section.id);
            console.log('[UPB] rendering section:', section.id, 'exercises:', sectionExercises?.length);
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
                onEditSection={(sectionToEdit) => {
                  setEditingSection(sectionToEdit);
                  setShowSectionDialog(true);
                }}
                onDeleteSection={(sectionId) => {
                  if (confirm('למחוק סקשן זה?')) deleteSectionMutation.mutate(sectionId);
                }}
                onDeleteExercise={(exerciseId) => {
                  if (confirm('למחוק תרגיל זה?')) deleteExerciseMutation.mutate(exerciseId);
                }}
                showEditButtons={canEdit}
                isCoach={isCoach}
                plan={plan} 
                onOpenExecution={(ex) => {
                  setExecutionExercise(ex);
                  setShowExecutionModal(true);
                }}
              />);
          })}
        </div>

        {/* Save/Finish Button for Coach - Removed as requested */}

        {/* Finish Button for Trainee - Removed as requested */}
      </div>

      {/* Section Dialog */}
      <Dialog open={showSectionDialog} onOpenChange={(open) => {
        if (!open) {
          setShowSectionDialog(false);
          setEditingSection(null);
        }
      }}>
        <DialogContent className="w-[95vw] md:w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{editingSection ? '✏️ ערוך סקשן' : '➕ סקשן חדש'}</DialogTitle>
          </DialogHeader>
          <SectionForm
            section={editingSection || { category: "חימום", section_name: "", description: "" }}
            onChange={(data) => {
              const merged = { ...editingSection, ...data };
              setEditingSection(merged);
              sectionFormRef.current = merged;
            }} />

          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => {
                setShowSectionDialog(false);
                setEditingSection(null);
                sectionFormRef.current = null;
              }}
              variant="outline"
              className="flex-1 rounded-xl py-6 font-bold">
              ביטול
            </Button>
            <Button
              onClick={async () => {
                // Use ref to get the absolute latest form data (avoids stale closure)
                const formData = sectionFormRef.current || editingSection || {};
                if (!formData.section_name) {
                  toast.error("נא למלא שם סקשן");
                  return;
                }
                await handleSaveSection(formData);
              }}
              disabled={createSectionMutation.isPending || updateSectionMutation.isPending}
              className="flex-1 rounded-xl py-6 font-bold text-white text-lg" style={{ backgroundColor: '#FF6F20' }}>
              {createSectionMutation.isPending || updateSectionMutation.isPending ?
              <><Loader2 className="w-5 h-5 ml-2 animate-spin" />שומר...</> :
              editingSection ?
              'עדכן סקשן' :

              'צור סקשן'
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Execution surface — coaches log actual performance numbers via
          the existing modal; trainees see the full-screen reflection
          screen that also persists a row to exercise_executions for
          plan scoring. */}
      {isCoach ? (
        <ExerciseExecutionModal
          isOpen={showExecutionModal}
          onClose={() => {
            setShowExecutionModal(false);
            setExecutionExercise(null);
          }}
          exercise={executionExercise}
          onSave={async (data) => {
            await updateExerciseMutation.mutateAsync({ id: executionExercise.id, data });
            setShowExecutionModal(false);
            setExecutionExercise(null);
            toast.success("✅ בוצע");
            checkAndTriggerPopups(executionExercise.id, true);
          }}
          isLoading={updateExerciseMutation.isPending}
        />
      ) : (
        <ExerciseExecution
          isOpen={showExecutionModal}
          onClose={() => {
            setShowExecutionModal(false);
            setExecutionExercise(null);
          }}
          exercise={executionExercise}
          planId={plan.id}
          traineeId={plan.assigned_to || null}
          onCompletedExercise={async (ex) => {
            await updateExerciseMutation.mutateAsync({ id: ex.id, data: { completed: true } });
            checkAndTriggerPopups(ex.id, true);
          }}
        />
      )}

      {/* Exercise Dialog - Sticky Footer Layout */}
      <Dialog open={showExerciseDialog} onOpenChange={(open) => {
        if (!open) {
          setShowExerciseDialog(false);
          setEditingExercise(null);
          setCurrentSection(null);
        }
      }}>
        <DialogContent className="w-[95vw] md:w-full max-w-2xl h-[90vh] md:h-auto md:max-h-[85vh] flex flex-col p-0 gap-0 bg-white overflow-hidden" style={{ borderRadius: '20px' }}>
          <div className="p-6 pb-4 border-b border-gray-50 bg-white z-20">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black text-gray-900">
                {editingExercise ? '✏️ ערוך תרגיל' : '➕ תרגיל חדש'}
              </DialogTitle>
            </DialogHeader>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 pt-2 scrollbar-hide">
            <ModernExerciseForm
              exercise={editingExercise || { mode: "חזרות", exercise_name: "", weight_type: "bodyweight" }}
              onChange={(data) => setEditingExercise({ ...editingExercise, ...data })} />

          </div>

          <div className="p-4 bg-white z-20 border-t border-[#E8E8E8]">
            <Button
              onClick={async () => {
                const formData = editingExercise || {};
                if (!formData.exercise_name) {
                  toast.error("נא למלא שם תרגיל");
                  return;
                }
                await handleSaveExercise(formData);
              }}
              disabled={createExerciseMutation.isPending || updateExerciseMutation.isPending}
              className="w-full rounded-xl h-[56px] font-black text-white text-lg shadow-xl hover:shadow-2xl hover:scale-[1.01] transition-all"
              style={{ backgroundColor: '#FF6F20' }}>

              {createExerciseMutation.isPending || updateExerciseMutation.isPending ?
              <><Loader2 className="w-5 h-5 ml-2 animate-spin" />שומר...</> :
              editingExercise ?
              'עדכן תרגיל' :

              'שמור תרגיל'
              }
            </Button>
            
            <button
              onClick={() => {
                setShowExerciseDialog(false);
                setEditingExercise(null);
                setCurrentSection(null);
              }}
              className="w-full mt-3 text-gray-400 text-sm font-bold hover:text-gray-600 transition-colors">

              ביטול וחזרה
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Summary Dialog */}
      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <DialogContent
          className="w-[90%] sm:max-w-[425px] bg-white p-6 text-center relative rounded-2xl border-none shadow-2xl z-[100] fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-h-[70vh] overflow-y-auto outline-none"
          dir="rtl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}>

            <button
            onClick={() => setShowSummaryDialog(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1">

                <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Award className="w-8 h-8 text-green-600" />
            </div>
            <DialogTitle className="text-2xl font-black mb-2 text-gray-900">אימון הושלם!</DialogTitle>
            
            {summaryData &&
          <div className="space-y-6">
                    <p className="text-lg text-gray-600 font-medium">
                        {summaryData.message}
                    </p>

                    {/* NEW STATS GRID */}
                    <div className="grid grid-cols-3 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <div className="text-center flex flex-col items-center justify-center">
                            <div className="text-xl font-black text-gray-800">{summaryData.totalExercises}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">תרגילים</div>
                        </div>
                        <div className="text-center flex flex-col items-center justify-center border-r border-gray-200 border-l">
                            <div className="text-xl font-black text-gray-800">{summaryData.totalSets}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">סטים</div>
                        </div>
                        <div className="text-center flex flex-col items-center justify-center">
                            <div className="text-xl font-black text-gray-800">{summaryData.avgRPE}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">RPE ממוצע</div>
                        </div>

                        <div className="col-span-3 border-t border-gray-200 my-1"></div>

                        <div className="text-center flex flex-col items-center justify-center">
                            <div className="text-lg font-bold text-gray-800">{summaryData.totalWorkTime}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">זמן עבודה</div>
                        </div>
                        <div className="col-span-2 text-center flex flex-col items-center justify-center border-r border-gray-200">
                            <div className="text-lg font-bold text-gray-800">{summaryData.totalRestTime}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">זמן מנוחה</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-center bg-orange-50 p-3 rounded-xl border border-orange-100">
                            <div className="text-2xl font-black text-[#FF6F20] mb-1">{summaryData.avgDifficulty}</div>
                            <div className="text-xs text-gray-500 font-bold">ממוצע קושי</div>
                        </div>
                        <div className="text-center bg-green-50 p-3 rounded-xl border border-green-100">
                            <div className="text-2xl font-black text-[#4CAF50] mb-1">{summaryData.avgControl}</div>
                            <div className="text-xs text-gray-500 font-bold">ממוצע שליטה</div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                onClick={() => setShowSummaryDialog(false)}
                variant="outline"
                className="flex-1 h-12 rounded-xl font-bold border-gray-200 text-gray-600 hover:bg-gray-50">

                            חזור לאימון
                        </Button>
                        <Button
                onClick={async () => {
                  await saveWorkoutHistory(true); // Auto-save and update status
                  setShowSummaryDialog(false);

                  // Notify Coach
                  if (plan.created_by) {
                    try {
                      await base44.entities.Notification.create({
                        user_id: plan.created_by,
                        type: 'workout_completion',
                        title: 'אימון הושלם בהצלחה! 🏆',
                        message: `המתאמן ${plan.assigned_to_name || 'המתאמן'} השלים את אימון "${plan.plan_name}"`,
                        is_read: false
                      });
                    } catch (e) {console.error(e);}
                  }
                }}
                className="flex-[2] h-12 rounded-xl font-bold text-white shadow-lg hover:shadow-xl transition-all"
                style={{ backgroundColor: '#FF6F20' }}>

                            סיום אימון
                        </Button>
                    </div>
                </div>
          }
        </DialogContent>
      </Dialog>

      {/* Section Feedback Dialog */}
      <Dialog open={showSectionFeedbackDialog} onOpenChange={(open) => {
        if (!open) {
          setShowSectionFeedbackDialog(false);
          setTimeout(async () => {
            const freshExercises = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
            const allExercisesComplete = freshExercises.every((e) => e.completed);
            if (allExercisesComplete) {
              showWorkoutSummary(freshExercises);
            }
          }, 500);
        } else {
          setShowSectionFeedbackDialog(true);
        }
      }}>
        <DialogContent
          className="w-[90%] sm:max-w-[425px] bg-white p-5 relative rounded-2xl border-none shadow-2xl z-[100] fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-h-[70vh] overflow-y-auto outline-none"
          dir="rtl"
          onInteractOutside={(e) => {}}>

          <button
            onClick={() => {
              setShowSectionFeedbackDialog(false);
              setTimeout(async () => {
                const freshExercises = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
                const allExercisesComplete = freshExercises.every((e) => e.completed);
                if (allExercisesComplete) {
                  showWorkoutSummary(freshExercises);
                }
              }, 500);
            }}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1">

              <X className="w-5 h-5" />
          </button>

          <DialogHeader>
            <DialogTitle className="text-lg font-black text-center">🎯 משוב על הסקשן</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-2 rounded-lg text-center" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
              <p className="text-base font-black" style={{ color: '#FF6F20' }}>{sectionFeedbackData.sectionName}</p>
            </div>
            <div>
              <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1 justify-center">
                <Target className="w-3 h-3" style={{ color: '#4CAF50' }} />שליטה (1-10)
              </Label>
              <div className="flex gap-1 justify-center">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) =>
                <button key={num} onClick={() => setSectionFeedbackData({ ...sectionFeedbackData, control_rating: num })}
                className="w-7 h-7 rounded-lg font-bold text-xs transition-all"
                style={{ backgroundColor: sectionFeedbackData.control_rating === num ? '#4CAF50' : '#F7F7F7', color: sectionFeedbackData.control_rating === num ? 'white' : '#000', border: sectionFeedbackData.control_rating === num ? '2px solid #4CAF50' : '1px solid #E6E6E6' }}>
                    {num}
                  </button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1 justify-center">
                <Award className="w-3 h-3" style={{ color: '#FF6F20' }} />קושי (1-10)
              </Label>
              <div className="flex gap-1 justify-center">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) =>
                <button key={num} onClick={() => setSectionFeedbackData({ ...sectionFeedbackData, difficulty_rating: num })}
                className="w-7 h-7 rounded-lg font-bold text-xs transition-all"
                style={{ backgroundColor: sectionFeedbackData.difficulty_rating === num ? '#FF6F20' : '#F7F7F7', color: sectionFeedbackData.difficulty_rating === num ? 'white' : '#000', border: sectionFeedbackData.difficulty_rating === num ? '2px solid #FF6F20' : '1px solid #E6E6E6' }}>
                    {num}
                  </button>
                )}
              </div>
              </div>
              <div>
              <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1 justify-center">
                <Edit2 className="w-3 h-3" style={{ color: '#7D7D7D' }} />הערות חופשיות
              </Label>
              <Textarea
                value={sectionFeedbackData.notes}
                onChange={(e) => setSectionFeedbackData({ ...sectionFeedbackData, notes: e.target.value })}
                placeholder="איך הרגיש הסקשן? משהו מיוחד?"
                className="text-xs min-h-[60px] resize-none text-center" />

              </div>
              <div className="flex gap-3 pt-2">
                <Button
                onClick={() => {
                  setShowSectionFeedbackDialog(false);
                  setTimeout(async () => {
                    const freshExercises = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
                    const allExercisesComplete = freshExercises.every((e) => e.completed);
                    if (allExercisesComplete) {
                      setTimeout(() => showWorkoutSummary(freshExercises), 700);
                    }
                  }, 500);
                }}
                variant="ghost"
                className="flex-1 text-gray-500 hover:bg-gray-50 h-12 rounded-xl font-bold">

                    ביטול
                </Button>
                <Button
                onClick={async () => {
                  // Save ratings to all exercises in the section
                  const sectionExercises = getExercisesBySection(sectionFeedbackData.sectionId);
                  const promises = sectionExercises.map((ex) =>
                  base44.entities.Exercise.update(ex.id, {
                    control_rating: sectionFeedbackData.control_rating,
                    difficulty_rating: sectionFeedbackData.difficulty_rating,
                    trainee_feedback: sectionFeedbackData.notes
                  })
                  );

                  try {
                    await Promise.all(promises);
                    await queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });

                    setShowSectionFeedbackDialog(false);
                    toast.success(`✅ סקשן "${sectionFeedbackData.sectionName}" הושלם!`);

                    setTimeout(async () => {
                      const freshExercises = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
                      const allExercisesComplete = freshExercises.every((e) => e.completed);

                      if (allExercisesComplete) {
                        showWorkoutSummary(freshExercises);
                      }
                    }, 500);

                  } catch (e) {
                    console.error("Error saving feedback", e);
                    setShowSectionFeedbackDialog(false);
                  }
                }}
                className="flex-[2] h-12 rounded-xl font-bold text-white shadow-lg hover:shadow-xl transition-all" style={{ backgroundColor: '#FF6F20' }}>
                <Check className="w-4 h-4 ml-1" />
                שמור סקשן
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Finish Button — only for trainees doing workout, not coaches editing */}
      {!canEdit && (
        <div className="fixed bottom-0 left-0 right-0 bg-black p-4 z-50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          {/* Thin progress bar: fill #FF6F20 on #FFE5D0 track */}
          {exercisesTotal > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                height: 6, width: '100%', background: '#FFE5D0',
                borderRadius: 999, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${progressPct}%`,
                  background: '#FF6F20', transition: 'width 0.25s ease',
                }} />
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

      {/* "כל הכבוד" — fires once when the trainee ticks the last exercise */}
      <Dialog open={showCelebration} onOpenChange={(o) => { if (!o) setShowCelebration(false); }}>
        <DialogContent
          className="max-w-sm"
          style={{ background: '#FFF9F0', border: '2px solid #FF6F20', borderRadius: 16 }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#FF6F20', fontWeight: 800, fontSize: 20, textAlign: 'center' }}>
              כל הכבוד! סיימת את התוכנית 💪
            </DialogTitle>
          </DialogHeader>
          <div dir="rtl" style={{ textAlign: 'center', padding: '8px 0 16px', color: '#1a1a1a', fontSize: 14 }}>
            סימנת את כל התרגילים. המשך כך באימון הבא.
          </div>
          <button
            onClick={() => setShowCelebration(false)}
            style={{
              width: '100%', padding: 12, background: '#FF6F20', color: '#FFFFFF',
              border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}>
            סגור
          </button>
        </DialogContent>
      </Dialog>
    </div>);

}