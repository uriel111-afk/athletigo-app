import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { formatTime } from "@/lib/formatTime";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Copy, Check, X, Target, Calendar, User, Loader2, Award, Settings } from "lucide-react";
import WorkoutProgressBar from "./WorkoutProgressBar";
import SectionForm from "../workout/SectionForm";
import ModernExerciseForm from "../workout/ModernExerciseForm";
import SectionCard from "./SectionCard";
import { usePreviousSetData } from "@/hooks/usePreviousSetData";
import ExerciseExecutionModal from "./ExerciseExecutionModal";
import ExerciseExecution from "@/components/ExerciseExecution";
import { toast } from "sonner";
import { notifyExerciseUpdated, notifyPlanUpdated } from "@/functions/notificationTriggers";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createDuplicatedExecution, readSectionRating } from "@/lib/workoutExecutionApi";

// End-of-workout multi-select chips. Stored verbatim into
// workout_executions.feedback_chips (TEXT[]).
const FEEDBACK_OPTIONS = [
  'האימון היה מושלם 💯',
  'צריך להגביר עצימות 🔥',
  'היה קשה מדי 😤',
  'אהבתי את התרגילים ❤️',
  'צריך יותר מנוחה 😴',
  'הרגשתי חזק 💪',
  'היה קצר מדי ⏱',
  'בדיוק בשבילי 🎯',
];

// Defensive parser for array-shaped fields. The codebase has at least
// three persisted shapes in the wild for goal_focus / weekly_days:
//   1. real text[] arrays         — ["כוח", "סבולת"]
//   2. comma-separated TEXT       — "כוח, סבולת"
//   3. JSON-stringified-twice TEXT — "[\"כוח\"]" or items that are
//      themselves stringified JSON like ["\"\\\"כוח\\\"\""]
// This function unwraps each shape recursively into a clean array of
// trimmed strings. Always returns an array.
function parseArrayField(field) {
  const stripQuotes = (s) => String(s).replace(/^[\[\"\\\s]+|[\]\"\\\s]+$/g, '').trim();
  if (field == null || field === '') return [];
  if (Array.isArray(field)) {
    return field
      .map((item) => {
        if (item == null) return '';
        if (typeof item === 'string') {
          try {
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed)) return parseArrayField(parsed);
            if (typeof parsed === 'string') return stripQuotes(parsed);
            return stripQuotes(String(parsed));
          } catch {
            return stripQuotes(item);
          }
        }
        return String(item);
      })
      .flat()
      .map(stripQuotes)
      .filter(Boolean);
  }
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      if (Array.isArray(parsed)) return parseArrayField(parsed);
      if (typeof parsed === 'string') return [stripQuotes(parsed)];
      return [stripQuotes(String(parsed))];
    } catch {
      return field.split(/[,،]/).map(stripQuotes).filter(Boolean);
    }
  }
  return [];
}

// Coach-only inline editor for plan metadata. Mounts as a bottom-sheet
// over a translucent backdrop. Closes on backdrop tap. The save button
// hands the new payload back to the parent via onSave; the parent
// owns the supabase write + cache invalidation.
function PlanMetadataEditor({ plan, onSave, onClose, onDelete }) {
  const initial = plan || {};
  // Both fields can land in any of the three legacy shapes; the
  // shared parseArrayField helper unwraps them into a clean array.
  const initFocus = parseArrayField(initial.goal_focus);
  const initDays = parseArrayField(initial.weekly_days);

  const [goalFocus, setGoalFocus] = useState(initFocus);
  const [weeklyDays, setWeeklyDays] = useState(initDays);
  const [difficultyLevel, setDifficultyLevel] = useState(initial.difficulty_level || '');
  const [durationWeeks, setDurationWeeks] = useState(
    Number.isFinite(Number(initial.duration_weeks)) && Number(initial.duration_weeks) > 0
      ? Number(initial.duration_weeks) : 4
  );
  const [startDate, setStartDate] = useState(initial.start_date || '');
  const [description, setDescription] = useState(initial.description || '');

  // Emoji card options matched to the dashboard's PlanFormDialog so
  // both surfaces feel like the same product. Same labels too — when
  // a plan was created there and then edited here, selections stay
  // selected.
  const FOCUS_OPTS = [
    { label: 'כוח',     emoji: '💪' },
    { label: 'סבולת',   emoji: '🏃' },
    { label: 'גמישות',  emoji: '🧘' },
    { label: 'טכניקה',  emoji: '🎯' },
    { label: 'שיא',     emoji: '🏆' },
    { label: 'מיומנות', emoji: '⚡' },
    { label: 'כושר',    emoji: '⚡' },
    { label: 'שיקום',   emoji: '🩷' },
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

        {/* Goal focus — emoji card grid (matches PlanFormDialog) */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>מוקדי אימון</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}>
            {FOCUS_OPTS.map((opt) => {
              const sel = goalFocus.includes(opt.label);
              return (
                <button key={opt.label} type="button"
                  onClick={() => setGoalFocus((prev) =>
                    prev.includes(opt.label) ? prev.filter((x) => x !== opt.label) : [...prev, opt.label])}
                  style={{
                    padding: '16px 12px',
                    borderRadius: 16,
                    border: sel ? '2px solid #FF6F20' : '1px solid #E5E7EB',
                    background: sel ? '#FFF5EE' : 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                  }}>
                  <span style={{ fontSize: 32, lineHeight: 1 }}>{opt.emoji}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: sel ? '#FF6F20' : '#374151',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}>{opt.label}</span>
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

        {onDelete && (
          <button type="button" onClick={onDelete}
            style={{
              width: '100%', padding: '12px', marginTop: 12,
              background: 'white',
              border: '1px solid #FCA5A5',
              borderRadius: 12,
              color: '#DC2626',
              fontWeight: 700, fontSize: 14,
              cursor: 'pointer',
            }}>
            🗑️ מחק את התוכנית
          </button>
        )}
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

  // Resolve metadata fields through parseArrayField, which unwraps all
  // three shapes the codebase persists (real arrays, comma-separated
  // strings, double-JSON-encoded strings). Legacy aliases checked too:
  // focus_areas / training_days / level / weeks.
  const goalFocusItems =
    parseArrayField(plan?.goal_focus).length > 0
      ? parseArrayField(plan?.goal_focus)
      : parseArrayField(plan?.focus_areas);
  const weeklyDaysItems =
    parseArrayField(plan?.weekly_days).length > 0
      ? parseArrayField(plan?.weekly_days)
      : parseArrayField(plan?.training_days);
  const headerGoalFocus = goalFocusItems.length > 0 ? goalFocusItems : null;
  const headerWeeklyDays = weeklyDaysItems.length > 0 ? weeklyDaysItems : null;
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
  // One ExerciseCard at a time across the whole workout. Held at the
  // workout-level so opening a card inside section A collapses any
  // already-open card in section B. null = nothing expanded.
  const [expandedExerciseId, setExpandedExerciseId] = useState(null);

  const sectionFormRef = useRef(null); // tracks latest section form data without stale closure issues
  const [showSectionFeedbackDialog, setShowSectionFeedbackDialog] = useState(false);
  // Section feedback captures TWO 1-10 sliders (control = how
  // in-control the trainee felt, challenge = how hard it was) plus a
  // free-text notes field. As of step 1 of the progress rewrite, the
  // FULL object `{ control, challenge, avg, notes }` is persisted into
  // workout_executions.section_ratings JSONB — not just the avg.
  // Readers go through readSectionRating() so legacy number-shaped
  // rows still surface the avg chip with null splits and empty notes.
  const [sectionFeedbackData, setSectionFeedbackData] = useState({
    sectionId: null, sectionName: "",
    control: 7, challenge: 7, notes: "",
  });
  const [sectionRatings, setSectionRatings] = useState({});
  // Active workout_executions row id for this trainee+plan+today. When
  // null we INSERT on first save and capture the id; when set we UPDATE
  // in place. Keeps a single row per (trainee, plan, calendar day) so
  // re-opening an in-progress workout doesn't fork the execution into
  // duplicates on the graph.
  const [currentExecutionId, setCurrentExecutionId] = useState(null);

  // Per-set previous-performance + personal-record map for the trainee
  // view. Keyed by exercise.id → setIdx. Excludes the current execution
  // so a half-filled session never shows itself as "previous". Empty
  // in coach mode (canEdit=true → hook receives null plan/trainee and
  // returns {}).
  const previousSetData = usePreviousSetData(
    !canEdit ? plan?.id : null,
    !canEdit ? (plan?.assigned_to || plan?.created_by) : null,
    currentExecutionId,
  );
  // Ref (not state) — checkAndTriggerPopups reads this synchronously
  // to decide whether to fire the section feedback dialog. State
  // would batch the add through React's update queue and a fast
  // double-tap could slip a duplicate fire through the window. Nothing
  // renders based on this set, so a ref is the right shape.
  const ratedSectionsRef = useRef(new Set());
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  // Plan header card open/closed. Tap on the title row toggles it.
  // Starts COLLAPSED — the metadata (chips, days, stats) is hidden
  // by default; the trainee/coach taps the title row to expand for
  // a quick overview. Progress now lives in a sticky bar at the
  // viewport bottom (not inside the card), so the card stays compact
  // by default but progress is always visible.
  const [headerCollapsed, setHeaderCollapsed] = useState(true);
  const celebrationFiredRef = useRef(false);
  // Per-set logs for the trainee execution flow.
  // Shape: { [exerciseId]: { [setIndex]: { reps_completed, done } } }
  // Persisted to exercise_set_logs at workout-finish time.
  const [setLogs, setSetLogs] = useState({});
  // Per-drill-per-set marks for list-variant exercises (כל דריל בכל סט
  // נסמן בנפרד). Local state only — NOT persisted to DB in this phase
  // (exercise_set_logs has no drill_index column). The aggregate
  // exercise.completed flag is still derived from "all drills × all
  // sets marked" so the section-feedback popup fires correctly.
  // Shape: { [exerciseId]: { [setIndex]: { [drillIndex]: true } } }
  const [drillSetLogs, setDrillSetLogs] = useState({});
  // End-of-workout multi-select feedback chips + free-text. Saved to
  // workout_executions.feedback_chips / .notes.
  const [feedbackChips, setFeedbackChips] = useState([]);
  const [feedbackText, setFeedbackText] = useState('');
  // Guard: gates the section/summary popups + the celebration overlay
  // so they only fire after the trainee has actually toggled at least
  // one exercise in this session. Prevents the popup-on-mount bug
  // when entering an already-completed plan from a prior run.
  const hasInteractedRef = useRef(false);
  
  // Execution Modal State
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [executionExercise, setExecutionExercise] = useState(null);

  const queryClient = useQueryClient();

  // Reset all popup-related refs/state when the plan switches under us
  // (the parent may reuse the same instance with a different plan).
  // Without this, hasInteractedRef from a prior plan would let the
  // section/summary popups fire on the new plan's mount.
  React.useEffect(() => {
    hasInteractedRef.current = false;
    celebrationFiredRef.current = false;
    ratedSectionsRef.current = new Set();
    setSectionRatings({});
    setCurrentExecutionId(null);
    setShowSectionFeedbackDialog(false);
    setShowSummaryDialog(false);
    setShowCelebration(false);
  }, [plan?.id]);

  // Load today's active workout_executions row (if any) for this
  // trainee+plan. Pre-fills sectionRatings + ratedSectionsRef so the
  // section-feedback popup never re-fires on a section that was
  // already scored, and persistExecution becomes an UPDATE instead
  // of an INSERT. Trainee-only — coach editing doesn't write
  // executions. Calendar-day window (>= today 00:00 local) means a
  // second workout the next day starts a fresh execution row.
  React.useEffect(() => {
    if (canEdit) return;
    if (!plan?.id) return;
    const traineeId = plan.assigned_to || plan.created_by;
    if (!traineeId) return;

    const loadActiveExecution = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('workout_executions')
        .select('id, section_ratings, executed_at')
        .eq('plan_id', plan.id)
        .eq('trainee_id', traineeId)
        .gte('executed_at', todayStart.toISOString())
        .order('executed_at', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('[UPB] active execution load failed:', error.message);
        return;
      }

      if (data && data.length > 0) {
        const exec = data[0];
        const rawRatings = exec.section_ratings || {};
        // Normalize either shape to the object form so every later
        // reader (popup pre-fill, avg compute, SectionCard chip) can
        // assume a consistent {control, challenge, avg, notes} entry.
        const ratings = {};
        for (const sid of Object.keys(rawRatings)) {
          ratings[sid] = readSectionRating(rawRatings[sid]);
        }
        setCurrentExecutionId(exec.id);
        setSectionRatings(ratings);
        ratedSectionsRef.current = new Set(Object.keys(ratings));

        // Resume per-set state from the persisted exercise_set_logs
        // rows attached to this execution. Lets the trainee close the
        // tab mid-workout and re-open without losing what they ticked.
        try {
          const { data: setLogRows, error: logsErr } = await supabase
            .from('exercise_set_logs')
            .select('exercise_id, set_number, reps_completed, time_completed, completed')
            .eq('execution_id', exec.id);
          if (!logsErr && Array.isArray(setLogRows) && setLogRows.length > 0) {
            const restored = {};
            for (const row of setLogRows) {
              const idx = Math.max(0, (Number(row.set_number) || 1) - 1);
              if (!restored[row.exercise_id]) restored[row.exercise_id] = {};
              restored[row.exercise_id][idx] = {
                reps_completed: row.reps_completed,
                time_completed: row.time_completed,
                done: !!row.completed,
              };
            }
            setSetLogs(restored);
          }
        } catch (e) {
          console.warn('[UPB] set-log resume failed:', e?.message);
        }
      }
    };

    loadActiveExecution();
  }, [plan?.id, canEdit, plan?.assigned_to, plan?.created_by]);

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
        return rows;
      } catch (e) {
        console.warn('[UPB] sections query with order failed, retrying without sort:', e?.message);
        try {
          const data = await base44.entities.TrainingSection.filter({ training_plan_id: plan.id });
          const sorted = data.sort((a, b) => (a.order || 0) - (b.order || 0));
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
        return rows;
      } catch (e) {
        console.warn('[UPB] exercises query with order failed, retrying without sort:', e?.message);
        try {
          const data = await base44.entities.Exercise.filter({ training_plan_id: plan.id });
          const sorted = data.sort((a, b) => (a.order || 0) - (b.order || 0));
          return sorted;
        } catch (err) {
          console.error('[UPB] exercises retry FAILED:', err?.message);
          return [];
        }
      }
    },
    enabled: !!plan.id
  });

  // Real count of past workout_executions for this plan — drives the
  // "ביצועים" stat in the header card. Distinct from the legacy
  // exercises.filter(e=>e.completed) derivation, which only counted
  // exercises ticked in the current run. Best-effort; falls back to 0.
  const { data: executionsData } = useQuery({
    queryKey: ['execution-count', plan?.id],
    queryFn: async () => {
      if (!plan?.id) return [];
      const { data, error } = await supabase
        .from('workout_executions')
        .select('id')
        .eq('plan_id', plan.id);
      if (error) {
        console.warn('[UPB] execution-count query failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!plan?.id,
  });
  const executionCount = executionsData?.length || 0;

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
    // Guard 1: trainee must have actively interacted in this session.
    if (!hasInteractedRef.current) return;
    // Guard 2: at least one exercise must actually be completed (belt
    // and suspenders against any state path that flips the ref but
    // leaves no completed rows).
    if (!exercises.some((e) => e && e.completed)) return;

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
    if (isSectionComplete && !ratedSectionsRef.current.has(sectionId)) {
      const section = sections.find((s) => s.id === sectionId);
      if (section) {
        // Mark immediately — synchronous ref add closes the
        // double-fire window before the dialog even renders.
        ratedSectionsRef.current.add(sectionId);
        // Re-edit flow: when the trainee un-toggled an exercise and
        // re-completed the section, the old rating is still in
        // sectionRatings. Pre-fill the sliders + notes with the prior
        // values so they edit their previous answer instead of
        // restarting from 7/7. Legacy rows only carry an avg (split is
        // null) — fall back to the avg for both sliders in that case.
        const existing = readSectionRating(sectionRatings[section.id]);
        const fallback = existing.avg != null ? existing.avg : 7;
        setSectionFeedbackData({
          sectionId: section.id,
          sectionName: section.section_name,
          control: existing.control != null ? existing.control : fallback,
          challenge: existing.challenge != null ? existing.challenge : fallback,
          notes: existing.notes || "",
        });
        setShowSectionFeedbackDialog(true);

        if (!section.completed) {
          updateSectionMutation.mutate({ id: sectionId, data: { completed: true } });
        }
      }
      return; // STOP HERE.
    }

    // Only check global completion here if we DID NOT just finish a section (e.g. updating single exercise not in section, or section already completed)
    // The Section Feedback Dialog will handle checking global completion on close.
    if (!isSectionComplete || ratedSectionsRef.current.has(sectionId)) {
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
    const ratingValues = Object.values(effectiveRatings)
      .map((v) => readSectionRating(v).avg)
      .filter((v) => v != null);
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

    // Per-set completion %, falling back to per-exercise when no
    // set logs were tracked. Mirrors saveWorkoutExecution's calc so
    // the popup and the persisted row agree.
    let pctTotalSets = 0;
    let pctDoneSets = 0;
    for (const ex of currentExercisesList) {
      if (!ex) continue;
      const n = Math.max(1, parseInt(ex.sets, 10) || 1);
      pctTotalSets += n;
      const log = setLogs[ex.id] || {};
      for (let i = 0; i < n; i++) if (log[i]?.done) pctDoneSets++;
    }
    const completionPct = pctTotalSets > 0
      ? Math.round((pctDoneSets / pctTotalSets) * 100)
      : (currentExercisesList.length > 0
          ? Math.round((completed.length / currentExercisesList.length) * 100)
          : 0);

    setSummaryData({
      averageRating,
      completionPct,
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
    // Same guard as checkAndTriggerPopups — never auto-fire on mount,
    // even when every exercise on the row is marked completed from a
    // previous session. Trainee must tap something this session for
    // the celebration to count.
    if (!hasInteractedRef.current) return;
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
    // Mark interaction so popups + celebration can fire from now on.
    hasInteractedRef.current = true;

    // 2. Trigger Popup Checks (only if turning ON)
    if (newCompletedState) {
      checkAndTriggerPopups(exercise.id, true);
    } else {
      // Un-completing an exercise — if its section was already rated,
      // drop the rated-guard so re-completing the section re-opens
      // the feedback popup. The prior rating stays in sectionRatings
      // and pre-fills the sliders (see checkAndTriggerPopups).
      const sectionId = exercise.training_section_id;
      if (sectionId && ratedSectionsRef.current.has(sectionId)) {
        ratedSectionsRef.current.delete(sectionId);
        console.log('[handleToggleComplete] cleared rated-guard for section:', sectionId);
      }
    }

    // 3. Mutate DB
    await updateExerciseMutation.mutateAsync({
      id: exercise.id,
      data: { completed: newCompletedState }
    });
  };

  // Per-set logging helpers. Local state only — persisted in
  // saveWorkoutExecution to exercise_set_logs once the trainee finishes.
  const updateSetLog = React.useCallback((exId, setIdx, field, value) => {
    setSetLogs((prev) => ({
      ...prev,
      [exId]: {
        ...(prev[exId] || {}),
        [setIdx]: { ...((prev[exId] || {})[setIdx] || {}), [field]: value },
      },
    }));
  }, []);

  // Toggle a single set's done flag. When the toggle flips the LAST
  // remaining set into done, the exercise as a whole becomes
  // completed — that triggers the existing section-feedback /
  // workout-summary popups via handleToggleComplete.
  const toggleSetDone = React.useCallback((exercise, setIdx) => {
    const exId = exercise.id;
    const totalSets = Math.max(1, parseInt(exercise.sets, 10) || 1);
    const current = setLogs[exId] || {};
    const cur = current[setIdx] || {};
    const nextDone = !cur.done;
    const nextLogs = {
      ...current,
      [setIdx]: { ...cur, done: nextDone },
    };
    setSetLogs((prev) => ({ ...prev, [exId]: nextLogs }));

    // Did this toggle just complete the exercise? (every set done)
    let doneCount = 0;
    for (let i = 0; i < totalSets; i++) {
      if (nextLogs[i]?.done) doneCount++;
    }
    const exerciseFullyDone = doneCount === totalSets;

    if (exerciseFullyDone && !exercise.completed) {
      handleToggleComplete(exercise);
    } else if (!exerciseFullyDone && exercise.completed) {
      // Untoggling a set when the exercise was already complete
      // un-marks the exercise too.
      handleToggleComplete(exercise);
    }
  }, [setLogs, handleToggleComplete]);

  // List-variant per-drill-per-set toggle. Maintains drillSetLogs and
  // — like toggleSetDone — flips exercise.completed when every (drill,
  // set) cell is checked, or when un-checking one drops the exercise
  // back below the threshold after it was complete. The completion
  // computation runs against the next state (not the React state we
  // just queued) so the flip happens in the same tick as the toggle.
  const toggleDrillSetDone = React.useCallback((exercise, setIdx, drillIdx, totalDrills, totalSets) => {
    const exId = exercise.id;
    const exLogs = drillSetLogs[exId] || {};
    const sLogs = exLogs[setIdx] || {};
    const wasDone = !!sLogs[drillIdx];

    const nextSetLogs = { ...sLogs };
    if (wasDone) delete nextSetLogs[drillIdx];
    else nextSetLogs[drillIdx] = true;

    const nextExLogs = { ...exLogs, [setIdx]: nextSetLogs };

    let allDone = true;
    outer:
    for (let s = 0; s < totalSets; s++) {
      for (let d = 0; d < totalDrills; d++) {
        if (!nextExLogs[s]?.[d]) { allDone = false; break outer; }
      }
    }

    setDrillSetLogs((prev) => ({ ...prev, [exId]: nextExLogs }));

    if (allDone && !exercise.completed) {
      handleToggleComplete(exercise);
    } else if (!allDone && exercise.completed) {
      handleToggleComplete(exercise);
    }
  }, [drillSetLogs, handleToggleComplete]);

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
      
      return `עבודה: ${formatTime(b.work_time)} | מנוחה: ${formatTime(b.rest_time)} | סבבים: ${b.rounds} | בין סבבים: ${formatTime(b.rest_between_rounds)} | סטים: ${b.sets}\nתרגילים: ${displayEx}`;
    }

    // Multiple blocks - Show up to 2
    let summary = blocks.slice(0, 2).map((b, idx) => {
      const name = b.name || `בלוק ${idx + 1}`;
      const items = (b.block_exercises || []);
      const exList = items.slice(0, 3).map(ex => ex.name).join(" • ");
      const remaining = items.length > 3 ? "…" : "";
      return `${name}: עבודה ${formatTime(b.work_time)}/מנוחה ${formatTime(b.rest_time)} | סבבים ${b.rounds} | סטים ${b.sets} | ${exList}${remaining}`;
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

    if (subExercises.length > 0 || exerciseData.mode === "טבטה") {
      // Container exercise — serialize sub-exercises to tabata_data.
      // Tabata also gets clock_settings duplicated into the JSONB
      // alongside the existing direct columns (work_time/rest_time/
      // rounds/sets). Reads in ExerciseCard trainee prefer the JSONB
      // copy and fall back to columns, so writes here cover both
      // legacy rows (column-only) and the new canonical shape.
      // rest_between_sets has no DB column, so the JSONB is its only
      // home — that's the main reason this block exists.
      const containerType = exerciseData.mode === "טבטה" ? "tabata" : "list";
      const tdPayload = {
        container_type: containerType,
        sub_exercises: subExercises,
      };
      if (exerciseData.mode === "טבטה") {
        const toInt = (v) => {
          if (v == null || v === '') return null;
          const n = parseInt(v, 10);
          return Number.isFinite(n) ? n : null;
        };
        tdPayload.clock_settings = {
          work_seconds:      toInt(exerciseData.work_time),
          rest_seconds:      toInt(exerciseData.rest_time),
          rounds:            toInt(exerciseData.rounds),
          sets:              toInt(exerciseData.sets),
          rest_between_sets: toInt(exerciseData.rest_between_sets),
        };
      }
      tabataData = JSON.stringify(tdPayload);
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

  // Single source of truth for writing to workout_executions. Branches
  // on currentExecutionId: present → UPDATE in place; absent → INSERT
  // and capture the new id for subsequent writes. self_rating is
  // re-derived from the ratings being persisted (not from state) so
  // callers that hold the just-computed map don't race the setState.
  const persistExecution = React.useCallback(async (nextSectionRatings, finalFields = null) => {
    const traineeId = plan.assigned_to || plan.created_by;
    if (!traineeId) {
      console.warn('[persistExecution] no trainee id on plan');
      return null;
    }

    const ratingValues = Object.values(nextSectionRatings || {})
      .map((v) => readSectionRating(v).avg)
      .filter((v) => v != null);
    const avg = ratingValues.length > 0
      ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) * 10) / 10
      : null;

    const payload = {
      trainee_id: traineeId,
      workout_template_id: plan.id,
      plan_id: plan.id,
      self_rating: avg,
      section_ratings: nextSectionRatings || {},
    };
    if (finalFields) Object.assign(payload, finalFields);

    console.log('[persistExecution] payload:', payload, 'currentExecutionId:', currentExecutionId);

    if (currentExecutionId) {
      const { data, error } = await supabase
        .from('workout_executions')
        .update(payload)
        .eq('id', currentExecutionId)
        .select()
        .single();
      console.log('[persistExecution] UPDATE result:', { data, error });
      if (error) {
        console.error('[persistExecution] UPDATE FAILED:', error);
        toast.error('שמירה נכשלה: ' + (error.message || 'נסה שוב'));
        return null;
      }
      return data;
    } else {
      payload.executed_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('workout_executions')
        .insert(payload)
        .select()
        .single();
      console.log('[persistExecution] INSERT result:', { data, error });
      if (error) {
        console.error('[persistExecution] INSERT FAILED:', error);
        toast.error('שמירה נכשלה: ' + (error.message || 'נסה שוב'));
        return null;
      }
      setCurrentExecutionId(data.id);
      return data;
    }
  }, [plan?.assigned_to, plan?.created_by, plan?.id, currentExecutionId]);

  const saveWorkoutExecution = async () => {
    try {
      const traineeId = plan.assigned_to || plan.created_by;
      if (!traineeId) {
        console.warn('[saveWorkoutExecution] no trainee id on plan');
        return null;
      }

      // Per-set completion gives a more accurate completion %, falling
      // back to per-exercise when no set logs exist (e.g. coach
      // toggled the legacy checkbox flow).
      let totalSets = 0;
      let doneSets = 0;
      for (const ex of exercises) {
        if (!ex) continue;
        const n = Math.max(1, parseInt(ex.sets, 10) || 1);
        totalSets += n;
        const log = setLogs[ex.id] || {};
        for (let i = 0; i < n; i++) {
          if (log[i]?.done) doneSets++;
        }
      }
      const completionPct = totalSets > 0
        ? Math.round((doneSets / totalSets) * 100)
        : (exercises.length > 0
            ? Math.round((exercises.filter(e => e && e.completed).length / exercises.length) * 100)
            : 0);

      // Per-exercise execution summary — derived from the same in-memory
      // setLogs + exercises arrays the completion calc above just used,
      // so no extra DB read. Written as JSONB on the same workout_executions
      // row via the existing single UPDATE/INSERT. Exercises the trainee
      // never touched (no set entries at all) are skipped so the JSONB
      // stays compact. Read it back via readExerciseSummary(). Step 2
      // plumbing — no UI surfaces this yet.
      const exerciseSummaries = {};
      for (const exercise of exercises) {
        if (!exercise || !exercise.id) continue;
        const logs = setLogs[exercise.id] || {};
        const setEntries = Object.values(logs).filter(Boolean);
        if (setEntries.length === 0) continue;
        const doneSetsExc = setEntries.filter((s) => s.done).length;
        const plannedSets = Number(exercise.sets) || null;
        const plannedReps = Number(exercise.reps) || null;
        const totalRepsDone = setEntries.reduce(
          (sum, s) => sum + (Number(s.reps_completed) || 0),
          0,
        );
        const totalRepsTarget = (plannedSets != null && plannedReps != null)
          ? plannedSets * plannedReps
          : null;
        const diffs = setEntries
          .map((s) => Number(s.difficulty))
          .filter((n) => !Number.isNaN(n) && n > 0);
        const avgDifficulty = diffs.length
          ? parseFloat((diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1))
          : null;
        let excCompletionPct = null;
        if (totalRepsTarget) {
          excCompletionPct = Math.min(100, Math.round((totalRepsDone / totalRepsTarget) * 100));
        } else if (plannedSets) {
          excCompletionPct = Math.round((doneSetsExc / plannedSets) * 100);
        }
        exerciseSummaries[exercise.id] = {
          planned_sets: plannedSets,
          done_sets: doneSetsExc,
          planned_reps: plannedReps,
          total_reps_done: totalRepsDone,
          total_reps_target: totalRepsTarget,
          completion_pct: excCompletionPct,
          avg_difficulty: avgDifficulty,
        };
      }

      const execRow = await persistExecution(sectionRatings, {
        completion_percent: completionPct,
        notes: feedbackText || null,
        feedback_chips: feedbackChips.length > 0 ? feedbackChips : null,
        exercise_summaries: exerciseSummaries,
      });

      if (!execRow) {
        return null;
      }

      const avg = execRow.self_rating;

      // Re-finishing the same workout (UPDATE path) — wipe the prior
      // set logs for this execution so the fresh INSERT below doesn't
      // duplicate them. Best-effort: a failure here only risks duplicate
      // rows on the analytics side, not a broken save.
      const { error: clearErr } = await supabase
        .from('exercise_set_logs')
        .delete()
        .eq('execution_id', execRow.id);
      if (clearErr) console.warn('[saveWorkoutExecution] prior set-log clear failed:', clearErr.message);

      // Persist per-set logs against the just-created execution.
      // Best-effort — if set logs fail to write, the execution row
      // still lands so the score chart updates.
      const setLogRows = [];
      for (const [exerciseId, sets] of Object.entries(setLogs)) {
        for (const [setIdxStr, log] of Object.entries(sets || {})) {
          if (!log) continue;
          const reps = log.reps_completed != null && log.reps_completed !== ''
            ? parseInt(log.reps_completed, 10)
            : null;
          const timeC = log.time_completed != null && log.time_completed !== ''
            ? parseInt(log.time_completed, 10)
            : null;
          const difficulty = log.difficulty != null && log.difficulty !== ''
            ? parseInt(log.difficulty, 10)
            : null;
          // Skip empty rows — nothing the trainee actually touched on
          // this set. time_completed counts as "touched" for time-based
          // exercises just like reps_completed does for reps-based ones.
          if (!log.done
              && (reps == null || Number.isNaN(reps))
              && (timeC == null || Number.isNaN(timeC))
              && difficulty == null) continue;
          setLogRows.push({
            execution_id: execRow.id,
            exercise_id: exerciseId,
            set_number: parseInt(setIdxStr, 10) + 1,
            reps_completed: Number.isFinite(reps) ? reps : null,
            time_completed: Number.isFinite(timeC) ? timeC : null,
            completed: !!log.done,
            difficulty_rating: Number.isFinite(difficulty) ? difficulty : null,
          });
        }
      }
      if (setLogRows.length > 0) {
        const { error: logErr } = await supabase
          .from('exercise_set_logs')
          .insert(setLogRows);
        if (logErr) console.warn('[saveWorkoutExecution] set logs failed:', logErr.message);
      }

      // Best-effort auto-PR + goal sync. Errors here never block the
      // happy path — the execution row is already saved.
      try {
        await checkAndUpdateRecords(execRow.id, traineeId);
      } catch (e) {
        console.warn('[saveWorkoutExecution] auto-PR check threw:', e?.message);
      }

      // Belt-and-suspenders cache invalidation so the improvement
      // graph (in WorkoutFolderDetail / Progress) updates the moment
      // the save lands, even if the trainee doesn't navigate back
      // through the parent's onWorkoutFinished hook.
      try {
        queryClient.invalidateQueries({ queryKey: ['workouts-executions'] });
        queryClient.invalidateQueries({ queryKey: ['workout-executions', plan.id] });
        queryClient.invalidateQueries({ queryKey: ['executions', plan.id] });
        queryClient.invalidateQueries({ queryKey: ['execution-count', plan.id] });
      } catch {}

      if (avg != null) toast.success(`✅ הציון ${avg} נשמר`);
      return execRow;
    } catch (err) {
      console.warn('[saveWorkoutExecution]', err);
      return null;
    }
  };

  // Silent autosave — every change to setLogs starts a 3s timer; if
  // another change lands the timer resets, so the save fires once
  // the trainee pauses. Trainee-only (canEdit=false): the coach is
  // read-only here and never mutates set logs. We deliberately skip
  // the first render where setLogs is still {} so we don't INSERT a
  // blank workout_executions row before the trainee has touched
  // anything. Using a ref to hold the latest saveWorkoutExecution
  // closure avoids re-firing the effect on every render just because
  // the function identity changed.
  const saveExecRef = React.useRef(null);
  saveExecRef.current = saveWorkoutExecution;
  React.useEffect(() => {
    if (canEdit) return;
    if (!plan?.id) return;
    const traineeId = plan.assigned_to || plan.created_by;
    if (!traineeId) return;
    if (!setLogs || Object.keys(setLogs).length === 0) return;
    const t = setTimeout(() => {
      const fn = saveExecRef.current;
      if (typeof fn === 'function') {
        fn();
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [setLogs, canEdit, plan?.id, plan?.assigned_to, plan?.created_by]);

  // After a workout finishes, walk every set log on this execution,
  // pick the best reps_completed per exercise, and compare against the
  // trainee's existing personal_records. If new max > current best
  // → insert a fresh personal_records row (preserving history) +
  // pulse a 🏆 toast + cascade to the goal-progress sync below.
  //
  // Writes to personal_records (existing table) — NOT a new "records"
  // table. The schema uses name TEXT (not exercise_id FK) so we look
  // up exercise.exercise_name from the exercises rows in one batch.
  const checkAndUpdateRecords = async (executionId, traineeId) => {
    if (!executionId || !traineeId) return;

    const { data: rawLogs, error: logsErr } = await supabase
      .from('exercise_set_logs')
      .select('exercise_id, reps_completed, completed')
      .eq('execution_id', executionId);
    if (logsErr) {
      console.warn('[checkAndUpdateRecords] set logs query failed:', logsErr.message);
      return;
    }
    if (!rawLogs?.length) return;

    // Best reps per exercise (only completed sets count toward PRs).
    const maxByExercise = {};
    for (const log of rawLogs) {
      if (!log?.exercise_id) continue;
      const reps = parseInt(log.reps_completed, 10);
      if (!Number.isFinite(reps) || reps <= 0) continue;
      if (!maxByExercise[log.exercise_id] || reps > maxByExercise[log.exercise_id]) {
        maxByExercise[log.exercise_id] = reps;
      }
    }
    const exerciseIds = Object.keys(maxByExercise);
    if (exerciseIds.length === 0) return;

    // Resolve exercise names in one round-trip.
    const { data: exRows, error: exErr } = await supabase
      .from('exercises')
      .select('id, exercise_name, name')
      .in('id', exerciseIds);
    if (exErr) {
      console.warn('[checkAndUpdateRecords] exercises lookup failed:', exErr.message);
      return;
    }
    const nameById = {};
    for (const ex of (exRows || [])) {
      nameById[ex.id] = ex.exercise_name || ex.name || null;
    }

    for (const exerciseId of exerciseIds) {
      const exerciseName = nameById[exerciseId];
      const maxReps = maxByExercise[exerciseId];
      if (!exerciseName || !Number.isFinite(maxReps)) continue;

      // Current best for this trainee+exercise. personal_records keeps
      // every PR row, so order desc + limit 1 gives the latest top.
      const { data: existing, error: prErr } = await supabase
        .from('personal_records')
        .select('value')
        .eq('trainee_id', traineeId)
        .eq('name', exerciseName)
        .order('value', { ascending: false })
        .limit(1);
      if (prErr) {
        console.warn(`[checkAndUpdateRecords] personal_records lookup failed for ${exerciseName}:`, prErr.message);
        continue;
      }
      const currentBest = Number(existing?.[0]?.value) || 0;
      if (maxReps <= currentBest) continue;

      // New PR — insert (don't upsert; history rows feed the chart).
      const { error: insErr } = await supabase.from('personal_records').insert({
        trainee_id: traineeId,
        record_type: 'workout',
        name: exerciseName,
        unit: 'חזרות',
        value: maxReps,
        date: new Date().toISOString().slice(0, 10),
        created_by_role: isCoach ? 'coach' : 'trainee',
        created_by_user_id: traineeId,
      });
      if (insErr) {
        console.warn(`[checkAndUpdateRecords] PR insert failed for ${exerciseName}:`, insErr.message);
        continue;
      }
      toast.success(`🏆 שיא חדש! ${exerciseName}: ${maxReps} חזרות`);

      // Cascade to any reps/skill goal that links this exercise.
      try {
        await syncGoalsFromPR(traineeId, exerciseId, exerciseName, maxReps);
      } catch (e) {
        console.warn('[checkAndUpdateRecords] goal sync threw:', e?.message);
      }
    }
  };

  // Update goals whose linked_exercise_id matches the PR's exercise OR
  // whose title/exercise_name matches the exercise name. Skips goals
  // with auto_update=false so coaches can opt a goal out. Pushes a new
  // measurement entry, bumps current_value, flips status to הושג when
  // newValue >= target_value.
  const syncGoalsFromPR = async (traineeId, exerciseId, exerciseName, newValue) => {
    const { data: goals } = await supabase
      .from('goals')
      .select('*')
      .eq('trainee_id', traineeId)
      .eq('status', 'פעיל')
      .in('goal_type', ['reps', 'skill']);
    if (!goals?.length) return;

    const matches = goals.filter((g) => {
      if (g.auto_update === false) return false;
      if (g.linked_exercise_id && g.linked_exercise_id === exerciseId) return true;
      const title = (g.title || g.goal_name || '').toLowerCase();
      const link = (g.exercise_name || '').toLowerCase();
      const tag = (exerciseName || '').toLowerCase();
      if (link && link === tag) return true;
      if (title && tag && title.includes(tag)) return true;
      return false;
    });

    for (const goal of matches) {
      const currentVal = Number(goal.current_value) || 0;
      if (newValue <= currentVal) continue;
      const measurements = (() => {
        const raw = goal.measurements;
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string' && raw) {
          try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
        }
        return [];
      })();
      measurements.push({
        date: new Date().toISOString(),
        value: newValue,
        note: 'עדכון אוטומטי מאימון',
      });
      const target = Number(goal.target_value);
      const becameDone = Number.isFinite(target) && target > 0 && newValue >= target;
      const update = {
        current_value: newValue,
        measurements: JSON.stringify(measurements),
      };
      if (becameDone) {
        update.status = 'הושג';
        update.completed_at = new Date().toISOString();
      }
      const { error } = await supabase.from('goals').update(update).eq('id', goal.id);
      if (error) {
        console.warn(`[syncGoalsFromPR] goal update failed for ${goal.id}:`, error.message);
        continue;
      }
      if (becameDone) {
        toast.success(`🎉 השגת את היעד: ${goal.title || goal.goal_name || 'יעד'}!`);
      }
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

  // Coach-only: rename the plan inline. Updates plan_name + title
  // (kept in sync per existing convention) then invalidates plan
  // caches so the new name shows up everywhere.
  const savePlanName = async () => {
    const next = (tempPlanName || '').trim();
    if (!next) {
      toast.error('שם התוכנית לא יכול להיות ריק');
      return;
    }
    if (next === plan.plan_name) {
      setEditingPlanName(false);
      return;
    }
    try {
      const { error } = await supabase
        .from('training_plans')
        .update({ plan_name: next, title: next })
        .eq('id', plan.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-plan-details'] });
      toast.success('שם התוכנית עודכן ✅');
      setEditingPlanName(false);
    } catch (e) {
      console.error('[UPB] rename plan failed:', e);
      toast.error('שמירה נכשלה: ' + (e?.message || 'נסה שוב'));
    }
  };

  // Coach-only: hard-delete the plan and everything keyed to it.
  // Confirmed via window.confirm because the action is irreversible.
  // Order matters: child rows first so foreign keys don't block the
  // final plan delete.
  const handleDeletePlan = async () => {
    if (!plan?.id) return;
    if (!window.confirm(`למחוק את התוכנית "${plan.plan_name || ''}" לצמיתות? לא ניתן לשחזר.`)) return;
    try {
      await supabase.from('exercises').delete().eq('training_plan_id', plan.id);
      await supabase.from('training_sections').delete().eq('training_plan_id', plan.id);
      await supabase.from('workout_executions').delete().eq('plan_id', plan.id);
      const { error } = await supabase.from('training_plans').delete().eq('id', plan.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-plan-details'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-executions'] });
      toast.success('התוכנית נמחקה ✅');
      if (onBack) onBack();
    } catch (e) {
      console.error('[UPB] delete plan failed:', e);
      toast.error('מחיקה נכשלה: ' + (e?.message || 'נסה שוב'));
    }
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
    // Bottom padding is the height of the fixed "סיים אימון" footer
    // bar (~110-130px including safe-area-inset-bottom on notched
    // devices). 140px on mobile + 160px on desktop keeps the last
    // section above it. Trainee-only — coach view doesn't render
    // the bar but the padding is harmless there.
    <div
      dir="rtl"
      className="w-full"
      style={{
        // Trainee bottom space: 140px for the "סיים אימון" footer +
        // safe-area. Coach bottom space: 130px to clear the new sticky
        // progress bar (~60px) above the global bottom nav (~70px).
        // Both add var(--timer-bar-height, 0px) so an active timer
        // pushes the page up correspondingly.
        paddingBottom: !canEdit
          ? 'calc(200px + env(safe-area-inset-bottom) + var(--timer-bar-height, 0px))'
          : 'calc(130px + var(--timer-bar-height, 0px))',
      }}
    >
      {canEdit && showMetadataEditor && (
        <PlanMetadataEditor
          plan={plan}
          onSave={handleSaveMetadata}
          onClose={() => setShowMetadataEditor(false)}
          onDelete={() => {
            setShowMetadataEditor(false);
            handleDeletePlan();
          }}
        />
      )}
      {/* Plan Header Card — clean white surface with a thin orange
          stripe at the top. Replaces the previous full-orange banner
          plus the duplicate trainee info card; everything (goals,
          weekly days, progress, stats) renders in one calm container.
          Plan name editing routes through the metadata editor only;
          the inline rename + ✓/✕ flow was dropped. */}
      <div style={{
        background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF5EE 100%)',
        border: '1px solid rgba(255,111,32,0.1)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 28px rgba(255,111,32,0.08)',
        direction: 'rtl',
        margin: '0 16px 16px',
      }}>
        <div style={{ height: 5, background: 'linear-gradient(90deg, #FF8B47, #FF6F20)' }} />

        {/* Title row — clickable to toggle the card open/closed.
            ערוך button stops propagation so it doesn't collapse the
            card while opening the metadata editor. The chevron sits
            beside the button and reflects current state. */}
        <div
          onClick={() => setHeaderCollapsed((v) => !v)}
          role="button"
          tabIndex={0}
          aria-expanded={!headerCollapsed}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setHeaderCollapsed((v) => !v);
            }
          }}
          style={{ padding: '20px 20px 14px', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 12 }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: 32,
              fontWeight: 700,
              color: '#1a1a1a',
              lineHeight: 1.15,
              letterSpacing: '-0.5px',
              flex: 1,
              minWidth: 0,
              wordBreak: 'break-word',
            }}>
              {plan?.plan_name || 'תכנית אימון'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {/* DOM order gear → chevron. Under RTL flex the last DOM
                  child sits at the visual leftmost edge of the row, so
                  the chevron hugs the card's left margin and the gear
                  sits next to it (toward the title). Gear's onClick
                  uses stopPropagation so it opens the metadata editor
                  without ALSO toggling the header's collapse state. */}
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowMetadataEditor(true); }}
                  aria-label="ערוך תוכנית"
                  title="ערוך תוכנית"
                  style={{
                    width: 32, height: 32,
                    background: 'transparent',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <Settings size={18} />
                </button>
              )}
              <span aria-hidden style={{ fontSize: 12, color: '#ccc' }}>
                {headerCollapsed ? '▼' : '▲'}
              </span>
            </div>
          </div>
          {!headerCollapsed && (
            <>
              {plan?.description && (
                <p style={{
                  margin: '6px 0 0',
                  fontSize: 15,
                  color: '#888',
                  fontFamily: 'Barlow, sans-serif',
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                  paddingBottom: 4,
                }}>
                  {plan.description}
                </p>
              )}
            </>
          )}
        </div>

        {!headerCollapsed && goalFocusItems.length > 0 && (
          <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {goalFocusItems.map((tag, i) => (
              <span key={i} style={{
                background: '#FFF0E4',
                color: '#FF6F20',
                padding: '6px 14px',
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'Barlow, sans-serif',
              }}>{tag}</span>
            ))}
          </div>
        )}

        {!headerCollapsed && weeklyDaysItems.length > 0 && (
          <div style={{ padding: '0 20px 16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#888', fontWeight: 600, letterSpacing: '0.3px', fontFamily: 'Barlow, sans-serif' }}>
              ימי אימון
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {['א','ב','ג','ד','ה','ו','ש'].map((day, idx) => {
                const isActive = weeklyDaysItems.some((d) => {
                  const map = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6, 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5, 'ש': 6 };
                  return (map[d] ?? -1) === idx;
                });
                return (
                  <div key={idx} style={{
                    flex: 1, maxWidth: 44, height: 44, borderRadius: '50%',
                    background: isActive ? '#FF6F20' : '#F5EDDB',
                    color: isActive ? 'white' : '#C4B79E',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, fontWeight: isActive ? 700 : 500,
                    fontFamily: 'Barlow Condensed, sans-serif', flexShrink: 0,
                  }}>{day}</div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom stats — תרגילים / סקשנים / ביצועים. Hidden when
            the card is collapsed; shown by default. "ביצועים" comes
            from the execution-count useQuery hoisted near the other
            top-level queries. */}
        {!headerCollapsed && (
          <div style={{ display: 'flex', padding: '16px 20px', borderTop: '1px solid #F0E4D0', background: '#FFFCF8' }}>
            {[
              { value: exercises.length, label: 'תרגילים' },
              { value: sections.length, label: 'סקשנים' },
              { value: executionCount, label: 'ביצועים' },
            ].map((stat, i, arr) => (
              <React.Fragment key={stat.label}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#1a1a1a', fontFamily: 'Barlow Condensed, sans-serif', lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: 15, color: '#888', marginTop: 6, fontWeight: 600, fontFamily: 'Barlow, sans-serif' }}>{stat.label}</div>
                </div>
                {i < arr.length - 1 && <div style={{ width: 1, background: '#F0E4D0' }} />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Progress bar removed from here — moved to a sticky bar at
          the viewport bottom (see end of this return). */}

      <div className="max-w-7xl mx-auto w-full" style={{ padding: canEdit ? '12px 16px' : '8px' }}>

        {canEdit &&
        <div className="mb-4 md:mb-6 w-full flex gap-2">
            <Button onClick={(e) => {
            e.stopPropagation();
            setEditingSection(null);
            setShowSectionDialog(true);
          }}
          className="flex-1 sm:flex-none font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, #FF8B47 0%, #FF6F20 100%)',
            color: '#fff',
            border: 'none',
            padding: '14px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            boxShadow: '0 4px 12px rgba(255,111,32,0.3), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}>
              <Plus className="w-4 h-4 md:w-5 md:h-5 ml-1 md:ml-2" />
              הוסף סקשן חדש
            </Button>
          </div>
        }

        <div className={`w-full ${canEdit ? 'space-y-3 md:space-y-6 mb-20 md:mb-24' : 'space-y-2 mb-24'}`}>
          {sections.filter(Boolean).map((section, index) => {
            const sectionExercises = getExercisesBySection(section.id);
            return (
              <SectionCard
                key={section.id}
                index={index}
                section={section}
                sectionRating={sectionRatings[section.id] ?? null}
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
                onRenameSection={(sectionId, newName) => {
                  updateSectionMutation.mutate({ id: sectionId, data: { section_name: newName } });
                }}
                onRenameExercise={(exerciseId, newName) => {
                  updateExerciseMutation.mutate({ id: exerciseId, data: { exercise_name: newName } });
                }}
                showEditButtons={canEdit}
                isCoach={isCoach}
                plan={plan}
                setLogs={setLogs}
                onSetLogChange={updateSetLog}
                onSetToggleDone={toggleSetDone}
                drillSetLogs={drillSetLogs}
                onDrillSetToggleDone={toggleDrillSetDone}
                expandedExerciseId={expandedExerciseId}
                setExpandedExerciseId={setExpandedExerciseId}
                previousSetDataByExercise={previousSetData}
                onToggleTrackingMode={(s) => {
                  const next = (s?.tracking_mode || 'full') === 'full' ? 'display' : 'full';
                  updateSectionMutation.mutate({ id: s.id, data: { tracking_mode: next } });
                }}
                onMarkSectionDoneDisplay={async (s) => {
                  // Display-only "done" path. Bulk-mark every
                  // exercise in this section + the section itself
                  // as completed, then skip the rating popup.
                  // ratedSectionsRef guard prevents the per-exercise
                  // checkAndTriggerPopups flow from re-opening the
                  // popup if a later state shake re-evaluates.
                  ratedSectionsRef.current.add(s.id);
                  const sectionExercises = exercises.filter(
                    (e) => e.training_section_id === s.id
                  );
                  for (const ex of sectionExercises) {
                    if (!ex.completed) {
                      try {
                        await updateExerciseMutation.mutateAsync({
                          id: ex.id, data: { completed: true },
                        });
                      } catch (e) {
                        console.warn('[markSectionDoneDisplay] exercise update failed:', e?.message);
                      }
                    }
                  }
                  if (!s.completed) {
                    try {
                      await updateSectionMutation.mutateAsync({
                        id: s.id, data: { completed: true },
                      });
                    } catch (e) {
                      console.warn('[markSectionDoneDisplay] section update failed:', e?.message);
                    }
                  }
                  toast.success(`סקשן "${s.section_name}" סומן`);
                  // If this completion brings the whole workout to
                  // 100%, trigger the workout-summary popup the same
                  // way the per-exercise path does.
                  const updated = exercises.map((e) =>
                    e.training_section_id === s.id ? { ...e, completed: true } : e
                  );
                  if (updated.length > 0 && updated.every((e) => e.completed)) {
                    setTimeout(() => showWorkoutSummary(updated), 700);
                  }
                }}
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
            hasInteractedRef.current = true;
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
            hasInteractedRef.current = true;
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
                      textAlign: 'center', padding: '16px 20px',
                      background: 'rgba(255,111,32,0.12)', borderRadius: 16,
                      border: '2px solid #FF6F20', marginBottom: 12
                    }}>
                      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                        ציון
                      </div>
                      <div style={{ fontSize: 48, fontWeight: 700, color: '#FF6F20', lineHeight: 1 }}>
                        {summaryData.averageRating != null ? summaryData.averageRating.toFixed(1) : '—'}
                        <span style={{ fontSize: 18, color: '#bbb', fontWeight: 600 }}>/10</span>
                      </div>
                      {summaryData.completionPct != null && (
                        <div style={{ fontSize: 13, color: '#bbb', marginTop: 6 }}>
                          השלמה: {summaryData.completionPct}%
                        </div>
                      )}
                    </div>

                    {/* Multi-select feedback chips. Selection is local to
                        the dialog and persisted into
                        workout_executions.feedback_chips on save. */}
                    <div style={{ direction: 'rtl' }}>
                      <div style={{ fontSize: 12, color: '#bbb', marginBottom: 6, textAlign: 'right' }}>
                        איך הרגשת באימון?
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' }}>
                        {FEEDBACK_OPTIONS.map((opt) => {
                          const sel = feedbackChips.includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setFeedbackChips((prev) =>
                                prev.includes(opt)
                                  ? prev.filter((c) => c !== opt)
                                  : [...prev, opt]
                              )}
                              style={{
                                padding: '6px 12px', borderRadius: 999,
                                fontSize: 12, fontWeight: 600,
                                border: sel ? 'none' : '1px solid #3a3a3a',
                                background: sel ? '#FF6F20' : 'transparent',
                                color: sel ? 'white' : '#ddd',
                                cursor: 'pointer',
                              }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="הוסף הערה חופשית..."
                      className="min-h-[60px] text-sm bg-[#252525] text-white border-[#3a3a3a] resize-none"
                      dir="rtl"
                    />

                    <div className="flex flex-col gap-2 pt-2">
                      <Button
                        onClick={async () => {
                          // Save → close → navigate back (the executions
                          // list view) so the trainee can see their fresh
                          // result land in the chart + folder.
                          try { await saveWorkoutExecution(); } catch (e) { console.warn(e); }
                          try { await saveWorkoutHistory(true); } catch (e) { console.warn(e); }
                          if (plan.created_by) {
                            try {
                              await base44.entities.Notification.create({
                                user_id: plan.created_by,
                                type: 'workout_completion',
                                title: 'אימון הושלם בהצלחה! 🏆',
                                message: `המתאמן ${plan.assigned_to_name || 'המתאמן'} השלים את אימון "${plan.plan_name}"`,
                                is_read: false,
                              });
                            } catch (e) { console.error(e); }
                          }
                          setShowSummaryDialog(false);
                          if (onBack) onBack();
                        }}
                        className="w-full h-12 rounded-xl font-bold text-white shadow-lg hover:shadow-xl transition-all"
                        style={{ backgroundColor: '#FF6F20' }}>
                        👁 צפה בתוצאות
                      </Button>
                      <Button
                        onClick={async () => {
                          // Save the current execution, then queue a fresh
                          // duplicated row so the trainee can re-run the
                          // same workout next session. Both writes are
                          // best-effort.
                          try { await saveWorkoutExecution(); } catch (e) { console.warn(e); }
                          try { await saveWorkoutHistory(true); } catch (e) { console.warn(e); }
                          const traineeId = plan.assigned_to || plan.created_by;
                          if (traineeId && plan.id) {
                            try {
                              await createDuplicatedExecution({
                                planId: plan.id,
                                traineeId,
                                note: 'שוכפל מתוך פופ-אפ סיום',
                              });
                            } catch (e) { console.warn('[duplicate-on-finish]', e); }
                          }
                          setShowSummaryDialog(false);
                          if (onBack) onBack();
                        }}
                        variant="outline"
                        className="w-full h-12 rounded-xl font-bold border-[#3a3a3a] text-gray-200 bg-transparent hover:bg-gray-800 hover:text-white">
                        📋 שכפל לשיפור
                      </Button>
                      <button
                        type="button"
                        onClick={() => setShowSummaryDialog(false)}
                        className="w-full text-gray-500 text-xs font-bold hover:text-gray-300 transition-colors mt-1"
                      >
                        חזור לאימון
                      </button>
                    </div>
                </div>
          }
        </DialogContent>
      </Dialog>

      {/* Section Feedback Dialog */}
      <Dialog open={showSectionFeedbackDialog} onOpenChange={(open) => {
        if (!open) {
          setShowSectionFeedbackDialog(false);
          // Mirror what the previous custom X did before it was
          // removed: clear the current-section ref so the next
          // section's popup opens with fresh state.
          setCurrentSection(null);
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
            // Intentionally NO zIndex override here. The shadcn Dialog
            // primitive renders DialogOverlay at z-[11000] and the
            // content's default inline zIndex is 11001 (see
            // src/components/ui/dialog.jsx). A previous override of
            // zIndex: 1000 here put the content BELOW the overlay,
            // so the 60%-opacity black backdrop painted on top of the
            // sliders/X/buttons and ate every tap. Let the primitive's
            // default win — content above overlay, fully interactive.
            pointerEvents: 'auto',
          }}>

          {/* Close X removed — shadcn's <DialogContent> already renders
              its own corner close button which triggers onOpenChange,
              which runs the same close + re-check flow above. */}

          <DialogHeader>
            <DialogTitle className="text-lg font-black text-center">סיימת סקשן! 🎯</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-2 rounded-lg text-center" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
              <p className="text-base font-black" style={{ color: '#FF6F20' }}>{sectionFeedbackData.sectionName}</p>
            </div>

            <div style={{ marginBottom: 16, direction: 'rtl' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                כמה שליטה הרגשת? 💪
              </div>
              <input
                type="range" min="1" max="10" step="0.5"
                value={sectionFeedbackData.control}
                onChange={(e) => setSectionFeedbackData({ ...sectionFeedbackData, control: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#FF6F20' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginTop: 4 }}>
                <span>מינימלית</span>
                <span style={{ fontSize: 24, fontWeight: 900, color: '#FF6F20' }}>
                  {Number(sectionFeedbackData.control).toFixed(1)}
                </span>
                <span>מלאה</span>
              </div>
            </div>

            <div style={{ marginBottom: 12, direction: 'rtl' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                כמה זה אתגר אותך? 🔥
              </div>
              <input
                type="range" min="1" max="10" step="0.5"
                value={sectionFeedbackData.challenge}
                onChange={(e) => setSectionFeedbackData({ ...sectionFeedbackData, challenge: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#FF6F20' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginTop: 4 }}>
                <span>קל מאוד</span>
                <span style={{ fontSize: 24, fontWeight: 900, color: '#FF6F20' }}>
                  {Number(sectionFeedbackData.challenge).toFixed(1)}
                </span>
                <span>קשה מאוד</span>
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
              {/* Continue button — always active. If the trainee never
                  moved the slider the default rating still saves, but
                  rating is conceptually optional: the X / ביטול paths
                  store nothing and progression is unblocked. */}
              <Button
                onClick={async () => {
                  const control = Number(sectionFeedbackData.control || 0);
                  const challenge = Number(sectionFeedbackData.challenge || 0);
                  // Round to 1 decimal at the section level so the
                  // workout-level average (Math.round(sum/n * 10) / 10)
                  // doesn't compound a long float into a misleading
                  // figure on the graph tooltip.
                  const sectionAvg = parseFloat(((control + challenge) / 2).toFixed(1));
                  const notes = sectionFeedbackData.notes || '';
                  // Persist the full object — avg stays for back-compat
                  // and the existing chip reader; control/challenge/notes
                  // unlock later steps without another schema change.
                  const newRatings = {
                    ...sectionRatings,
                    [sectionFeedbackData.sectionId]: {
                      control, challenge, avg: sectionAvg, notes,
                    },
                  };

                  // Write to DB BEFORE closing the popup so a network
                  // failure leaves the trainee inside the dialog with
                  // their input intact rather than silently dropping
                  // the rating. persistExecution surfaces its own
                  // toast on error.
                  const saved = await persistExecution(newRatings);
                  if (!saved) return;

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
                המשך
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Sticky progress bar — viewport-bottom, sits ABOVE the
          global bottom nav and (for trainees) above the "סיים אימון"
          footer too. Visible whenever the plan has at least one
          exercise. Bottom offset accounts for the trainee footer
          (~140px including safe-area) OR just the global nav (~70px)
          for coach view, plus any active timer-bar height. */}
      {exercisesTotal > 0 && (
        <div style={{
          position: 'fixed',
          bottom: !canEdit
            ? 'calc(140px + env(safe-area-inset-bottom) + var(--timer-bar-height, 0px))'
            : 'calc(70px + var(--timer-bar-height, 0px))',
          left: 0, right: 0,
          background: '#FFFFFF',
          borderTop: '1px solid #F0E4D0',
          padding: '10px 16px',
          zIndex: 50,
          direction: 'rtl',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}>
            <span style={{
              fontSize: 11, color: '#6b7280', fontWeight: 500,
              letterSpacing: '0.3px',
            }}>התקדמות</span>
            <span style={{
              fontSize: 12, color: '#FF6F20', fontWeight: 700,
            }}>{Math.round(progressPct || 0)}%</span>
          </div>
          <div style={{
            height: 4,
            background: '#F5EEE0',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.max(2, Math.round(progressPct || 0))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #FF8B47, #FF6F20)',
              borderRadius: 2,
              boxShadow: '0 0 6px rgba(255,111,32,0.35)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Finish Button — trainee-only. Standalone bottom-fixed button
          on a transparent container; the duplicate progress bar that
          used to live here was removed (the header progress bar at
          line ~1873 is the single source of truth). bg-black wrapper
          dropped per design feedback — orange-on-white reads cleanly
          and matches the brand. */}
      {!canEdit && (
        <div style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          padding: '8px',
          paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
          // Soft cream — matches the app's primary surface so the
          // fixed strip reads as page chrome rather than a separate
          // dark dock. Top fade hint keeps content underneath from
          // looking abruptly cut.
          background: '#FFF9F0',
          boxShadow: '0 -6px 12px rgba(0,0,0,0.04)',
          zIndex: 50,
        }}>
          <button
            type="button"
            onClick={() => {
              const completedExercises = exercises.filter(e => e.completed);
              if (completedExercises.length > 0) {
                showWorkoutSummary(exercises);
              } else {
                toast.error("יש להשלים לפחות תרגיל אחד לפני סיום האימון");
              }
            }}
            style={{
              width: '100%',
              background: '#FF6F20',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(255,111,32,0.28)',
            }}
          >
            סיים אימון
          </button>
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
      
  
