import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
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

// Coach-only inline editor for plan metadata. Mounts as a bottom-sheet
// over a translucent backdrop. Closes on backdrop tap. The save button
// hands the new payload back to the parent via onSave; the parent
// owns the supabase write + cache invalidation.
function PlanMetadataEditor({ plan, onSave, onClose }) {
  const initial = plan || {};
  const initFocus = Array.isArray(initial.goal_focus)
    ? initial.goal_focus
    : (typeof initial.goal_focus === 'string'
      ? initial.goal_focus.split(/[,،]/).map((s) => s.trim()).filter(Boolean)
      : []);
  const initDays = Array.isArray(initial.weekly_days)
    ? initial.weekly_days
    : (typeof initial.weekly_days === 'string'
      ? initial.weekly_days.split(/[,،]/).map((s) => s.trim()).filter(Boolean)
      : []);

  const [goalFocus, setGoalFocus] = useState(initFocus);
  const [weeklyDays, setWeeklyDays] = useState(initDays);
  const [difficultyLevel, setDifficultyLevel] = useState(initial.difficulty_level || '');
  const [durationWeeks, setDurationWeeks] = useState(
    Number.isFinite(Number(initial.duration_weeks)) && Number(initial.duration_weeks) > 0
      ? Number(initial.duration_weeks) : 4
  );
  const [startDate, setStartDate] = useState(initial.start_date || '');
  const [description, setDescription] = useState(initial.description || '');

  const FOCUS_OPTS = [
    'כוח', 'סיבולת', 'הרזיה', 'גמישות',
    'בניית שריר', 'שיפור יציבה', 'בריאות כללית', 'ספורט ספציפי',
  ];
  const DAY_OPTS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const DIFFICULTY_OPTS = ['מתחיל', 'בינוני', 'מתקדם', 'מקצועי'];

  const handleSubmit = () => {
    onSave({
      goal_focus: goalFocus,
      weekly_days: weeklyDays,
      difficulty_level: difficultyLevel || null,
      duration_weeks: Number.isFinite(durationWeeks) && durationWeeks > 0 ? durationWeeks : null,
      start_date: startDate || null,
      description,
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 9999,
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: 'white',
          borderRadius: '20px 20px 0 0',
          padding: '24px 20px',
          maxHeight: '85vh', overflowY: 'auto',
          direction: 'rtl',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>עריכת פרטי תוכנית</div>
          <button type="button" onClick={onClose}
                  style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {/* Goal focus */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>מוקדי אימון</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FOCUS_OPTS.map((opt) => {
              const sel = goalFocus.includes(opt);
              return (
                <button key={opt} type="button"
                  onClick={() => setGoalFocus((prev) =>
                    prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt])}
                  style={{
                    padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
                    background: sel ? '#FF6F20' : 'white',
                    color: sel ? 'white' : '#374151',
                    border: sel ? 'none' : '1px solid #E5E7EB',
                    fontWeight: sel ? 600 : 400,
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Weekly days */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>ימי ביצוע</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {DAY_OPTS.map((day) => {
              const sel = weeklyDays.includes(day);
              return (
                <button key={day} type="button"
                  onClick={() => setWeeklyDays((prev) =>
                    prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day])}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
                    fontSize: 14, fontWeight: 700,
                    background: sel ? '#FF6F20' : 'white',
                    color: sel ? 'white' : '#374151',
                    border: sel ? 'none' : '1px solid #E5E7EB',
                  }}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Difficulty */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>רמת קושי</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {DIFFICULTY_OPTS.map((opt) => {
              const sel = difficultyLevel === opt;
              return (
                <button key={opt} type="button"
                  onClick={() => setDifficultyLevel(sel ? '' : opt)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    background: sel ? '#FF6F20' : 'white',
                    color: sel ? 'white' : '#374151',
                    border: sel ? 'none' : '1px solid #E5E7EB',
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>משך התוכנית</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="number" min="1" max="52" value={durationWeeks}
              onChange={(e) => setDurationWeeks(parseInt(e.target.value, 10) || 1)}
              style={{
                width: 80, padding: '8px 12px', border: '1px solid #E5E7EB',
                borderRadius: 8, fontSize: 16, textAlign: 'center',
              }} />
            <span style={{ fontSize: 14, color: '#6B7280' }}>שבועות</span>
          </div>
        </div>

        {/* Start date */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>תאריך התחלה</div>
          <input type="date" value={startDate || ''}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px',
              border: '1px solid #E5E7EB', borderRadius: 8,
              fontSize: 14, boxSizing: 'border-box',
            }} />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>תיאור התוכנית</div>
          <textarea value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תאר את מטרת התוכנית..." rows={3}
            style={{
              width: '100%', padding: '10px 12px',
              border: '1px solid #E5E7EB', borderRadius: 8,
              fontSize: 14, fontFamily: 'inherit', direction: 'rtl',
              resize: 'vertical', boxSizing: 'border-box',
            }} />
        </div>

        <button type="button" onClick={handleSubmit}
          style={{
            width: '100%', padding: '14px', background: '#FF6F20',
            border: 'none', borderRadius: 12, color: 'white',
            fontWeight: 700, fontSize: 16, cursor: 'pointer',
          }}>
          שמור שינויים ✓
        </button>
      </div>
    </div>
  );
}

export default function UnifiedPlanBuilder({ plan, isCoach = false, canEdit = false, onBack }) {
  // Diagnostic — full plan object dump so we can see whatever shape
  // legacy rows actually have (alternate field names, base44-injected
  // metadata, etc.). Logs once per plan id change.
  useEffect(() => {
    if (plan) {
      // eslint-disable-next-line no-console
      console.log('[HEADER] full plan object:', JSON.stringify(plan, null, 2));
    }
  }, [plan?.id]);

  // Resolve metadata fields against possible legacy aliases AND legacy
  // shapes. The codebase has two writers: one stores TEXT[] arrays
  // (modern path), another stores comma-separated TEXT (legacy — see
  // TrainingPlans.jsx:805 fallback). The header has to accept both.
  const toList = (v) => {
    if (!v) return null;
    if (Array.isArray(v)) return v.filter(Boolean).length > 0 ? v.filter(Boolean) : null;
    if (typeof v === 'string') {
      const parts = v.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
      return parts.length > 0 ? parts : null;
    }
    return null;
  };
  const headerGoalFocus = toList(plan?.goal_focus) || toList(plan?.focus_areas);
  const headerWeeklyDays = toList(plan?.weekly_days) || toList(plan?.training_days);
  const headerDifficulty = plan?.difficulty_level || plan?.level || null;
  const headerWeeks = (() => {
    const raw = plan?.duration_weeks ?? plan?.weeks;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

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
  const [sectionFeedbackData, setSectionFeedbackData] = useState({ sectionId: null, sectionName: "", rating: 7, notes: "" });
  const [sectionRatings, setSectionRatings] = useState({});
  const [completedSections, setCompletedSections] = useState(new Set());
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationFiredRef = useRef(false);
  
  // Execution Modal State
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [executionExercise, setExecutionExercise] = useState(null);

  const queryClient = useQueryClient();

  // Identity log — fires on every mount with the plan id we received.
  // Lets the coach (with DevTools open) confirm whether the prop
  // actually carries an id when "ערוך תוכנית" is clicked.
  React.useEffect(() => {
    console.log('[UPB] mount — plan id:', plan?.id, 'name:', plan?.plan_name || plan?.name);
  }, [plan?.id]);

  // Refetch when the parent profile's tab changes — TraineeProfile
  // dispatches 'tab-changed' on every activeTab flip so users coming
  // back to the plans tab see fresh data instead of cached state.
  React.useEffect(() => {
    if (!plan?.id) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['training-sections', plan.id] });
      queryClient.invalidateQueries({ queryKey: ['exercises', plan.id] });
    };
    window.addEventListener('tab-changed', handler);
    return () => window.removeEventListener('tab-changed', handler);
  }, [plan?.id, queryClient]);

  // initialData removed so isLoading actually flips to true on first
  // fetch — with [] as initialData the query was treated as already
  // fulfilled and the editor flashed "0 sections, 0 exercises" before
  // the real data landed. The loading-gate below now catches this.
  const { data: sections = [], isLoading: sectionsLoading, error: sectionsError } = useQuery({
    queryKey: ['training-sections', plan.id],
    queryFn: async () => {
      try {
        const rows = await base44.entities.TrainingSection.filter({ training_plan_id: plan.id }, 'order');
        console.log('[UPB] sections query OK:', rows?.length, 'rows for plan', plan.id);
        return rows;
      } catch (e) {
        console.warn('[UPB] sections query with order failed, retrying without sort:', e?.message);
        try {
          const data = await base44.entities.TrainingSection.filter({ training_plan_id: plan.id });
          const sorted = data.sort((a, b) => (a.order || 0) - (b.order || 0));
          console.log('[UPB] sections retry OK:', sorted?.length, 'rows');
          return sorted;
        } catch (err) {
          console.error('[UPB] sections retry FAILED:', err?.message);
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
        console.log('[UPB] exercises query OK:', rows?.length, 'rows for plan', plan.id);
        return rows;
      } catch (e) {
        console.warn('[UPB] exercises query with order failed, retrying without sort:', e?.message);
        try {
          const data = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
          const sorted = data.sort((a, b) => (a.order || 0) - (b.order || 0));
          console.log('[UPB] exercises retry OK:', sorted?.length, 'rows');
          return sorted;
        } catch (err) {
          console.error('[UPB] exercises retry FAILED:', err?.message);
          return [];
        }
      }
    },
    enabled: !!plan.id
  });

  // Summary log on every data change — surfaces the query state at a
  // glance: how many sections / exercises landed, whether the queries
  // are still running, and whether either one errored. With these
  // logs in place, an "editor opens empty" report is one console paste
  // away from a diagnosis.
  React.useEffect(() => {
    console.log('[UPB] data state:', {
      planId: plan?.id,
      sectionsCount: sections?.length || 0,
      exercisesCount: exercises?.length || 0,
      sectionsLoading,
      exercisesLoading,
      sectionsError: sectionsError?.message,
      exercisesError: exercisesError?.message,
    });
  }, [plan?.id, sections, exercises, sectionsLoading, exercisesLoading, sectionsError, exercisesError]);

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

  // Duplicate a section and every exercise inside it. The clone lands
  // at the bottom of the order list — coaches reorder via drag-and-drop
  // (the existing dnd-kit handler in PlanBuilder.jsx). Exercises inside
  // the section copy verbatim minus id/created_at.
  const duplicateSectionMutation = useMutation({
    mutationFn: async (originalSection) => {
      if (!originalSection) return;
      const maxOrder = Math.max(0, ...sections.map((s) => Number(s.order) || 0));
      // 1) Create the new section row
      const { id: _omitId, created_at: _omitCa, ...sectionFields } = originalSection;
      const newSection = await base44.entities.TrainingSection.create({
        ...sectionFields,
        name: (originalSection.name || 'סקשן') + ' (עותק)',
        order: maxOrder + 1,
      });
      // 2) Clone every exercise that belonged to the original section
      const originalExercises = exercises.filter(
        (e) => e.training_section_id === originalSection.id
      );
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

  // Reorder helpers — swap the `order` value with an immediate
  // neighbor (one step up or down). Cheaper than rewriting every
  // sibling's order, and matches what the up/down arrow UX implies
  // (one nudge per click). Drag-and-drop reorder in PlanBuilder still
  // wins for big rearrangements.
  const moveSectionMutation = useMutation({
    mutationFn: async ({ section, direction }) => {
      const sorted = [...sections]
        .filter(Boolean)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
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
      const same = exercises
        .filter((e) => e && e.training_section_id === exercise.training_section_id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
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

  // Duplicate an exercise in place — clone lands at the bottom of its
  // section's order list so the coach sees it appear at the end and
  // can drag it into position. id/created_at stripped so the row is a
  // fresh insert, not an upsert.
  const duplicateExerciseMutation = useMutation({
    mutationFn: async (originalExercise) => {
      if (!originalExercise) return;
      const { id: _exId, created_at: _exCa, ...exFields } = originalExercise;
      const same = exercises.filter(
        (e) => e && e.training_section_id === originalExercise.training_section_id
      );
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
          rating: 7,
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

  const showWorkoutSummary = (currentExercisesList, ratingsMap) => {
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

    const effectiveRatings = ratingsMap || sectionRatings;
    const ratingValues = Object.values(effectiveRatings);
    const averageRating = ratingValues.length > 0
      ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) * 10) / 10
      : null;

    const messages = [
    "מעולה! האימון הושלם. רמת השליטה והביצוע שלך במגמת שיפור.",
    "יפה מאוד! סיימת את כל הסקשנים בהצלחה.",
    "עבודה חזקה! המשמעת שלך מביאה תוצאות.",
    "כל הכבוד! עוד אימון נכנס ליומן ההיסטוריה.",
    "סיימת את האימון! הגוף שלך מתחזק מאימון לאימון."];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    setSummaryData({
      averageRating,
      totalExercises,
      totalSets,
      totalWorkTime: formatTimeStat(totalWorkSeconds),
      totalRestTime: formatTimeStat(totalRestSeconds),
      avgRPE,
      message: averageRating != null
        ? `מעולה! האימון הושלם בציון ${averageRating}. ${randomMessage}`
        : `מעולה! האימון הושלם. ${randomMessage}`,
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

  const saveWorkoutExecution = async () => {
    try {
      const traineeId = plan.assigned_to || plan.created_by;
      if (!traineeId) {
        console.warn('[saveWorkoutExecution] no trainee id on plan');
        return;
      }

      const completedCount = exercises.filter((e) => e && e.completed).length;
      const completionPct = exercises.length > 0
        ? Math.round((completedCount / exercises.length) * 100)
        : 0;

      const ratingValues = Object.values(sectionRatings);
      const avg = ratingValues.length > 0
        ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) * 10) / 10
        : null;

      const { error } = await supabase
        .from('workout_executions')
        .insert({
          trainee_id: traineeId,
          workout_template_id: plan.id,
          plan_id: plan.id,
          executed_at: new Date().toISOString(),
          self_rating: avg,
          completion_percent: completionPct,
          section_ratings: sectionRatings,
          notes: null,
        });

      if (error) {
        console.warn('[saveWorkoutExecution] failed:', error.message);
        toast.error('שגיאה בשמירת הציון');
      } else if (avg != null) {
        toast.success(`✅ הציון ${avg} נשמר`);
      }
    } catch (err) {
      console.warn('[saveWorkoutExecution]', err);
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
      // Navigation back is owned by the caller (the "סיום אימון" button
      // handler) so we always navigate after the saves resolve, even
      // when one of them throws — see the workout-completion popup.
    } catch (error) {
      console.error("Error saving workout log:", error);
      toast.error("שגיאה בשמירת האימון");
    }
  };

  const handleFinishWorkout = async () => {
    if (!confirm('האם ברצונך לסיים את האימון ולשמור אותו ביומן ההיסטוריה?')) return;
    await saveWorkoutHistory();
  };

  // Coach-only: save plan metadata edits via direct supabase update +
  // invalidate every cache that touches training_plans so the orange
  // header re-renders with the fresh values on the next paint.
  const handleSaveMetadata = async (payload) => {
    try {
      const { error } = await supabase
        .from('training_plans')
        .update(payload)
        .eq('id', plan.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-plan-details'] });
      setShowMetadataEditor(false);
      toast.success('פרטי התוכנית עודכנו ✅');
    } catch (e) {
      console.error('[UPB] save metadata failed:', e);
      toast.error('שמירה נכשלה: ' + (e?.message || 'נסה שוב'));
    }
  };

  // Loading gate — prevents the "blank flash" where the editor renders
  // a 0-section / 0-exercise plan for ~200ms before the real data
  // lands. Per the project's loading-gate rule we use isLoading only
  // (never isFetching) so background refetches don't flicker the page.
  if (plan?.id && (sectionsLoading || exercisesLoading)) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 200,
        direction: 'rtl',
      }}>
        <div style={{ fontSize: 14, color: '#888' }}>טוען תוכנית...</div>
      </div>
    );
  }

  return (
    <div className="w-full pb-16 md:pb-24" dir="rtl">
      {canEdit && showMetadataEditor && (
        <PlanMetadataEditor
          plan={plan}
          onSave={handleSaveMetadata}
          onClose={() => setShowMetadataEditor(false)}
        />
      )}
      {/* PLAN HEADER */}
      <div className="mb-6" style={{ backgroundColor: '#FF6F20', padding: '20px', borderRadius: '0 0 24px 24px' }}>
        <div className="flex items-center justify-center mb-4">
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {plan.plan_name}
          </h1>
        </div>

        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setShowMetadataEditor(true)}
              style={{
                padding: '4px 12px', borderRadius: 999,
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.4)',
                color: 'white', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✏️ ערוך פרטי תוכנית
            </button>
          </div>
        )}

        {/* Metadata section — details row, goal_focus chips, weekly day
            chips, and description. Reads through legacy aliases so old
            plans (focus_areas / training_days / level / weeks) still
            populate the header. Same banner for coach and trainee. */}
        <div style={{ marginBottom: 12 }}>

          {/* Details row: days/week + duration + difficulty */}
          {(headerWeeklyDays || headerWeeks || headerDifficulty) && (
            <div style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.9)',
              textAlign: 'center',
              marginBottom: 8,
              fontWeight: 500,
            }}>
              {[
                headerWeeklyDays ? `${headerWeeklyDays.length} פעמים בשבוע` : null,
                headerWeeks ? `${headerWeeks} שבועות` : null,
                headerDifficulty || null,
              ].filter(Boolean).join(' · ')}
            </div>
          )}

          {/* Goal focus chips */}
          {headerGoalFocus && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              justifyContent: 'center',
              marginBottom: 8,
            }}>
              {headerGoalFocus.map((f, i) => (
                <span key={i} style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.22)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}>{f}</span>
              ))}
            </div>
          )}

          {/* Weekly days chips */}
          {headerWeeklyDays && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              justifyContent: 'center',
              marginBottom: 8,
            }}>
              {headerWeeklyDays.map((d, i) => (
                <span key={i} style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.15)',
                  color: 'white',
                }}>{d}</span>
              ))}
            </div>
          )}

          {/* Description */}
          {plan.description && (
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.7)',
              fontStyle: 'italic',
              textAlign: 'center',
              paddingInline: 20,
              lineHeight: 1.4,
            }}>
              {plan.description}
            </div>
          )}

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

      {/* Trainee-only info card under the orange banner — same data
          rendered in a calmer, more readable surface. Only mounts when
          there is actually data to show. */}
      {!canEdit && (
        (headerGoalFocus || headerWeeklyDays || headerDifficulty || headerWeeks || plan?.start_date)
      ) && (
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: '16px 20px',
          margin: '0 16px 16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          border: '1px solid #F0E4D0',
          direction: 'rtl',
        }}>
          {headerGoalFocus && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>🎯 מוקדי האימון</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {headerGoalFocus.map((f, i) => (
                  <span key={i} style={{
                    padding: '4px 12px', borderRadius: 999,
                    background: '#FFF5EE', color: '#FF6F20',
                    fontSize: 12, fontWeight: 600,
                    border: '1px solid #FFE5D0',
                  }}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {headerWeeklyDays && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>📅 ימי ביצוע</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {headerWeeklyDays.map((d, i) => (
                  <span key={i} style={{
                    minWidth: 32, height: 32, padding: '0 8px',
                    borderRadius: 999,
                    background: '#FF6F20', color: 'white',
                    fontSize: 13, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{d}</span>
                ))}
              </div>
            </div>
          )}

          {(headerDifficulty || headerWeeks || plan?.start_date) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {headerDifficulty && (
                <div>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>💪 רמת קושי</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{headerDifficulty}</div>
                </div>
              )}
              {headerWeeks && (
                <div>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>⏱ משך</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{headerWeeks} שבועות</div>
                </div>
              )}
              {plan?.start_date && (
                <div>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>📆 התחלה</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
                    {new Date(plan.start_date).toLocaleDateString('he-IL')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                onDuplicateSection={(s) => duplicateSectionMutation.mutate(s)}
                onMoveSection={(direction) => moveSectionMutation.mutate({ section, direction })}
                isFirstSection={index === 0}
                isLastSection={index === sections.filter(Boolean).length - 1}
                onMoveExercise={(exercise, direction) => moveExerciseMutation.mutate({ exercise, direction })}
                onDuplicateExercise={(exercise) => duplicateExerciseMutation.mutate(exercise)}
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
          className="w-[90%] sm:max-w-[425px] p-6 text-center relative rounded-2xl border-none shadow-2xl z-[100] outline-none text-white"
          style={{
            backgroundColor: '#1a1a1a',
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
          }}
          dir="rtl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}>

            <button
            onClick={() => setShowSummaryDialog(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-1">

                <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
                <Award className="w-8 h-8 text-green-400" />
            </div>
            <DialogTitle className="text-2xl font-black mb-2 text-white">סיימת את האימון! 🏆</DialogTitle>
            
            {summaryData &&
          <div className="space-y-6">
                    <p className="text-lg text-gray-300 font-medium">
                        {summaryData.message}
                    </p>

                    {/* NEW STATS GRID */}
                    <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl border" style={{ backgroundColor: '#252525', borderColor: '#333' }}>
                        <div className="text-center flex flex-col items-center justify-center">
                            <div className="text-xl font-black text-white">{summaryData.totalExercises}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase">תרגילים</div>
                        </div>
                        <div className="text-center flex flex-col items-center justify-center" style={{ borderRightWidth: 1, borderLeftWidth: 1, borderColor: '#3a3a3a', borderStyle: 'solid' }}>
                            <div className="text-xl font-black text-white">{summaryData.totalSets}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase">סטים</div>
                        </div>
                        <div className="text-center flex flex-col items-center justify-center">
                            <div className="text-xl font-black text-white">{summaryData.avgRPE}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase">RPE ממוצע</div>
                        </div>

                        <div className="col-span-3 my-1" style={{ borderTopWidth: 1, borderColor: '#3a3a3a', borderStyle: 'solid' }}></div>

                        <div className="text-center flex flex-col items-center justify-center">
                            <div className="text-lg font-bold text-white">{summaryData.totalWorkTime}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase">זמן עבודה</div>
                        </div>
                        <div className="col-span-2 text-center flex flex-col items-center justify-center" style={{ borderRightWidth: 1, borderColor: '#3a3a3a', borderStyle: 'solid' }}>
                            <div className="text-lg font-bold text-white">{summaryData.totalRestTime}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase">זמן מנוחה</div>
                        </div>
                    </div>

                    <div style={{
                      textAlign: 'center', padding: '20px',
                      background: 'rgba(255,111,32,0.12)', borderRadius: 16,
                      border: '2px solid #FF6F20', marginBottom: 16
                    }}>
                      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                        הציון שלך לאימון הזה
                      </div>
                      <div style={{ fontSize: 48, fontWeight: 700, color: '#FF6F20', lineHeight: 1 }}>
                        {summaryData.averageRating != null ? summaryData.averageRating.toFixed(1) : '—'}
                      </div>
                      <div style={{ fontSize: 13, color: '#bbb', marginTop: 4 }}>
                        מתוך 10
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                onClick={() => setShowSummaryDialog(false)}
                variant="outline"
                className="flex-1 h-12 rounded-xl font-bold border-gray-700 text-gray-200 bg-transparent hover:bg-gray-800 hover:text-white">

                            חזור לאימון
                        </Button>
                        <Button
                onClick={async () => {
                  // Try both saves; swallow errors so navigation still
                  // happens (the toast inside each save tells the user
                  // when one fails). Navigation back lets the parent's
                  // handleWorkoutFinished invalidate query caches so
                  // the improvement graph picks up the new point.
                  try { await saveWorkoutExecution(); } catch (e) { console.warn(e); }
                  try { await saveWorkoutHistory(true); } catch (e) { console.warn(e); }
                  setShowSummaryDialog(false);

                  // Notify Coach (best-effort, doesn't block navigation)
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

                  if (onBack) onBack();
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
          className="w-[90%] sm:max-w-[425px] bg-white p-5 relative rounded-2xl border-none shadow-2xl outline-none"
          dir="rtl"
          style={{
            position: 'fixed',
            left: '50%',
            top: 'auto',
            bottom: 'calc(env(safe-area-inset-bottom) + 100px)',
            transform: 'translateX(-50%)',
            maxHeight: 'calc(100vh - 200px)',
            overflowY: 'auto',
            zIndex: 200,
          }}
          onInteractOutside={(e) => e.preventDefault()}>

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
            <DialogTitle className="text-lg font-black text-center">סיימת סקשן! 🎯</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-2 rounded-lg text-center" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
              <p className="text-base font-black" style={{ color: '#FF6F20' }}>{sectionFeedbackData.sectionName}</p>
            </div>

            <div style={{ marginBottom: 20, direction: 'rtl' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                איך אתה מרגיש לגבי הסקשן הזה?
              </div>
              <div style={{
                fontSize: 36, fontWeight: 700, color: '#FF6F20',
                textAlign: 'center', marginBottom: 8
              }}>
                {Number(sectionFeedbackData.rating).toFixed(1)}
              </div>
              <input
                type="range"
                min="1" max="10" step="0.5"
                value={sectionFeedbackData.rating}
                onChange={(e) => setSectionFeedbackData({ ...sectionFeedbackData, rating: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#FF6F20' }}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, color: '#888', marginTop: 4
              }}>
                <span>קשה</span>
                <span>בסדר</span>
                <span>מעולה</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1 justify-center">
                <Edit2 className="w-3 h-3" style={{ color: '#7D7D7D' }} />הערות (אופציונלי)
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
                onClick={() => {
                  const newRatings = {
                    ...sectionRatings,
                    [sectionFeedbackData.sectionId]: sectionFeedbackData.rating,
                  };
                  setSectionRatings(newRatings);
                  setShowSectionFeedbackDialog(false);
                  toast.success(`✅ סקשן "${sectionFeedbackData.sectionName}" הושלם!`);

                  setTimeout(async () => {
                    const freshExercises = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
                    const allExercisesComplete = freshExercises.every((e) => e.completed);
                    if (allExercisesComplete) {
                      showWorkoutSummary(freshExercises, newRatings);
                    }
                  }, 500);
                }}
                className="flex-[2] h-12 rounded-xl font-bold text-white shadow-lg hover:shadow-xl transition-all" style={{ backgroundColor: '#FF6F20' }}>
                <Check className="w-4 h-4 ml-1" />
                שמור והמשך
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
              <div style={{
                color: '#FFE5D0',
                fontSize: 12,
                fontWeight: 700,
                marginTop: 4,
                textAlign: 'center',
                letterSpacing: 0.5,
              }}>
                {exercisesDone} / {exercisesTotal} תרגילים · {progressPct}% הושלם
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
      
  
