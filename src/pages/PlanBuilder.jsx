import { useState, useEffect, useContext, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Stepper, TimePicker, RpeScale, TempoPattern, ChipsMulti, ListBuilder, Tabata, TABATA_DEFAULTS, EQUIPMENT_OPTIONS } from "@/components/ParamWidgets";
import { SECTION_TYPES, getSectionType, normalizeSectionType } from "@/lib/sectionTypes";
import CollapsibleSection from "@/components/CollapsibleSection";
import { toast } from "sonner";

// First 4 are auto-created for new plans
const DEFAULT_SECTION_IDS = ["warmup", "mobility", "strength", "flexibility"];

const PARAM_SCHEMA = {
  "סטים":           { type: "stepper", min: 1, max: 20, placeholder: "3" },
  "חזרות":          { type: "stepper", min: 1, max: 100, placeholder: "10" },
  "סבבים":          { type: "stepper", min: 1, max: 30, placeholder: "3" },
  "משקל (ק״ג)":     { type: "stepper", min: 0, max: 500, placeholder: "20", unit: 'ק"ג' },
  "החזקה סטטית":    { type: "stepper", min: 0, max: 300, placeholder: "20", unit: "שנ'" },
  "מנ׳ בין סטים":   { type: "stepper", min: 0, max: 600, placeholder: "90", unit: "שנ'" },
  "מנ׳ בין תרגילים": { type: "stepper", min: 0, max: 600, placeholder: "120", unit: "שנ'" },
  "זמן עבודה":      { type: "time" },
  "זמן מנוחה":      { type: "time" },
  "RPE (קושי)":     { type: "rpe" },
  "טמפו":           { type: "tempo" },
  "ציוד נדרש":      { type: "chips", allowCustom: true },
  "רמת קושי":       { type: "select", options: ["קל", "בינוני", "מתקדם", "אתגרי"] },
  "טבטה":           { type: "tabata" },
  "רשימת תרגילים":   { type: "list", placeholder: "שם התרגיל" },
  "מנח גוף":        { type: "text", placeholder: "למשל: עמידה, שכיבה..." },
  "דגשים":          { type: "textarea", placeholder: "דגשים לביצוע" },
  "צד":             { type: "select", options: ["ימין", "שמאל", "שני הצדדים", "לסירוגין"] },
  "טווח תנועה":      { type: "select", options: ["מלא", "חלקי", "חצי"] },
  "אחיזה":          { type: "select", options: ["רגילה", "רחבה", "צרה", "הפוכה", "נייטרלית"] },
  "וידאו":          { type: "url", placeholder: "https://..." },
};
const PARAM_TYPES = Object.keys(PARAM_SCHEMA);

// Tabata helpers — DB column is `tabata_data` (TEXT/JSON). `tabata_config`
// is an older/wrong name that some rows still carry; read both, write only
// `tabata_data`. Matches UnifiedPlanBuilder.handleSaveExercise and
// ExerciseExecution.jsx which parses JSON strings back out.
function parseTabata(val) {
  if (!val) return null;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return null; }
  }
  return null;
}
function serializeTabata(val) {
  if (!val || typeof val !== "object" || Object.keys(val).length === 0) return null;
  try { return JSON.stringify(val); } catch { return null; }
}
function tabataPreview(t) {
  if (!t) return null;
  const w = t.work_sec ?? 20, r = t.rest_sec ?? 10;
  const n = Array.isArray(t.exercises) ? t.exercises.length : 1;
  return `${w}s/${r}s × ${n || 1}`;
}

const FOCUS_AREAS = [
  { id: "strength",    label: "כוח",      icon: "💪" },
  { id: "flexibility", label: "גמישות",   icon: "🧘" },
  { id: "technique",   label: "טכניקה",   icon: "🎯" },
  { id: "endurance",   label: "סבולת",    icon: "🏃" },
  { id: "balance",     label: "מיומנות",  icon: "⚡" },
  { id: "rehab",       label: "שיקום",    icon: "❤️" },
  { id: "performance", label: "כושר",     icon: "🏆" },
  { id: "peak",        label: "שיא",      icon: "🔥" },
];

const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];

// Format a work_time / rest_time value (stored as a string of total seconds,
// e.g. "180", "45", "90") back into the unit the coach most likely meant:
//   120  → "2 דקות"    (exact minute multiples display as minutes)
//   150  → "2:30 דקות" (mixed displays as M:SS)
//    45  → "45 שניות"  (under a minute stays in seconds)
// Anything we can't parse falls through to the raw string.
function formatWorkTime(value) {
  if (value === null || value === undefined || value === "") return "";
  const total = parseInt(value, 10);
  if (!Number.isFinite(total)) return String(value);
  if (total < 60) return `${total} שניות`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (secs === 0) return `${mins} דקות`;
  return `${mins}:${String(secs).padStart(2, "0")} דקות`;
}

export default function PlanBuilder() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const editPlanId = params.get("planId");

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [trainees, setTrainees] = useState([]);
  const [planId, setPlanId] = useState(editPlanId);

  const [selectedTrainees, setSelectedTrainees] = useState([]);
  const [planName, setPlanName] = useState("");
  const [focusAreas, setFocusAreas] = useState([]);
  const [weeklyDays, setWeeklyDays] = useState([]);
  const [description, setDescription] = useState("");

  const [sections, setSections] = useState([]);
  const [addingSectionType, setAddingSectionType] = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);

  // ── Draft persistence ────────────────────────────────────────────
  // Saves the step-1 form so an accidental refresh doesn't wipe it.
  // Cleared once planId is set (first DB save) or on full reset.
  const DRAFT_KEY = 'plan_builder_draft';
  const draftHydratedRef = useRef(false);
  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    if (editPlanId) return; // edit mode loads from DB, not draft
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d?.planName) setPlanName(d.planName);
      if (Array.isArray(d?.focusAreas)) setFocusAreas(d.focusAreas);
      if (Array.isArray(d?.weeklyDays)) setWeeklyDays(d.weeklyDays);
      if (typeof d?.description === 'string') setDescription(d.description);
      if (Array.isArray(d?.selectedTrainees)) setSelectedTrainees(d.selectedTrainees);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (planId) { try { localStorage.removeItem(DRAFT_KEY); } catch {}; return; }
    const draft = { planName, focusAreas, weeklyDays, description, selectedTrainees };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
  }, [planId, planName, focusAreas, weeklyDays, description, selectedTrainees]);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("users").select("id, full_name, email, role, is_coach")
      .then(({ data }) => {
        const t = (data || []).filter(u => u.id !== user.id && u.role !== 'admin' && !u.is_coach && u.role !== 'coach');
        setTrainees(t);
      });
    if (editPlanId) loadExistingPlan(editPlanId);
  }, [user?.id]);

  const loadExistingPlan = async (id) => {
    const { data: plan } = await supabase.from("training_plans").select("*").eq("id", id).single();
    if (!plan) return;
    setPlanName(plan.plan_name || plan.title || "");
    setFocusAreas(plan.goal_focus || []);
    setWeeklyDays(plan.weekly_days || []);
    setDescription(plan.description || "");
    if (plan.assigned_to) setSelectedTrainees([plan.assigned_to]);

    const { data: secs } = await supabase.from("training_sections")
      .select("*").eq("training_plan_id", id).order("order");

    const sectionsWithExercises = await Promise.all((secs || []).map(async sec => {
      const { data: exs } = await supabase.from("exercises")
        .select("*").eq("training_section_id", sec.id).order("order");
      return { ...sec, exercises: exs || [] };
    }));
    setSections(sectionsWithExercises);
    setStep(2);
  };

  const savePlanDetails = async () => {
    if (!planName.trim()) return;
    setSaving(true);

    const payload = {
      plan_name: planName,
      title: planName,
      goal_focus: focusAreas,
      weekly_days: weeklyDays,
      description,
      status: "פעילה",
      created_by: user.id,
      created_by_name: user.full_name,
      assigned_to: selectedTrainees[0] || null,
      assigned_to_name: trainees.find(t => t.id === selectedTrainees[0])?.full_name || null,
      updated_at: new Date().toISOString(),
    };

    let pid = planId;
    if (!pid) {
      const { data } = await supabase.from("training_plans")
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select().single();
      pid = data?.id;
      setPlanId(pid);
    } else {
      await supabase.from("training_plans").update(payload).eq("id", pid);
    }

    setSaving(false);

    // Auto-create 4 default sections on fresh plan
    if (!editPlanId && sections.length === 0 && pid) {
      const defaults = await Promise.all(DEFAULT_SECTION_IDS.map(id => getSectionType(id)).map(async (t, idx) => {
        const { data } = await supabase.from("training_sections").insert({
          training_plan_id: pid,
          section_name: t.label,
          category: t.id,
          icon: t.icon,
          "order": idx,
        }).select().single();
        return { ...data, exercises: [] };
      }));
      setSections(defaults);
    }
    setStep(2);
  };

  const addSection = async (type) => {
    const t = getSectionType(type);
    const newSec = {
      training_plan_id: planId,
      section_name: t.label,
      category: type,
      icon: t.icon,
      "order": sections.length,
    };
    const { data } = await supabase.from("training_sections").insert(newSec).select().single();
    setSections(prev => [...prev, { ...data, exercises: [] }]);
    setAddingSectionType(false);
  };

  const deleteSection = async (idx) => {
    const sec = sections[idx];
    if (!window.confirm(`למחוק את הסקשן "${sec.section_name || sec.title}"?`)) return;
    await supabase.from("exercises").delete().eq("training_section_id", sec.id);
    await supabase.from("training_sections").delete().eq("id", sec.id);
    setSections(prev => prev.filter((_, i) => i !== idx));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sections.findIndex(s => s.id === active.id);
    const newIdx = sections.findIndex(s => s.id === over.id);
    const newOrder = arrayMove(sections, oldIdx, newIdx);
    setSections(newOrder);
    Promise.all(newOrder.map((sec, idx) =>
      supabase.from("training_sections").update({ "order": idx }).eq("id", sec.id)
    ));
  };

  const addExercise = async (sectionIndex, exerciseData) => {
    // Explicit validation with visible Hebrew toast (was: silent return)
    if (!exerciseData?.name?.trim()) {
      console.warn('[PlanBuilder] addExercise: name missing');
      toast.error('שם התרגיל חסר');
      return;
    }
    const sec = sections[sectionIndex];
    if (!sec?.id) {
      console.error('[PlanBuilder] addExercise: section.id missing — section likely not saved yet', { sectionIndex, sec });
      toast.error('יש לשמור את הסקציה לפני הוספת תרגילים');
      return;
    }
    if (!planId) {
      console.error('[PlanBuilder] addExercise: planId missing — plan likely not saved yet');
      toast.error('יש לשמור את התוכנית קודם');
      return;
    }
    // Difficulty is stored as a prefix in description until/unless
    // a dedicated difficulty_level column is added to the schema.
    const difficulty = exerciseData.params["רמת קושי"];
    const baseNotes = exerciseData.params["דגשים"] || '';
    const description = difficulty
      ? `[קושי: ${difficulty}]${baseNotes ? '\n' + baseNotes : ''}`
      : (baseNotes || null);
    const payload = {
      training_section_id: sec.id,
      training_plan_id: planId,
      exercise_name: exerciseData.name,
      name: exerciseData.name,
      sets: exerciseData.params["סטים"] || null,
      reps: exerciseData.params["חזרות"] || null,
      rounds: exerciseData.params["סבבים"] || null,
      work_time: exerciseData.params["זמן עבודה"] || null,
      rest_time: exerciseData.params["זמן מנוחה"] || null,
      weight: exerciseData.params["משקל (ק״ג)"] || null,
      rpe: exerciseData.params["RPE (קושי)"] || null,
      tempo: exerciseData.params["טמפו"] || null,
      rest_between_sets: exerciseData.params["מנ׳ בין סטים"] || null,
      rest_between_exercises: exerciseData.params["מנ׳ בין תרגילים"] || null,
      body_position: exerciseData.params["מנח גוף"] || null,
      equipment: exerciseData.params["ציוד נדרש"] || null,
      static_hold_time: exerciseData.params["החזקה סטטית"] || null,
      description,
      side: exerciseData.params["צד"] || null,
      range_of_motion: exerciseData.params["טווח תנועה"] || null,
      grip: exerciseData.params["אחיזה"] || null,
      video_url: exerciseData.params["וידאו"] || null,
      tabata_data: serializeTabata(exerciseData.params["טבטה"]),
      tabata_preview: tabataPreview(exerciseData.params["טבטה"]),
      children: exerciseData.params["רשימת תרגילים"] || null,
      "order": sec.exercises.length,
      completed: false,
    };
    console.log('[PlanBuilder] addExercise SAVE PAYLOAD:', payload);
    try {
      const { data, error } = await supabase.from("exercises").insert(payload).select().single();
      console.log('[PlanBuilder] addExercise SAVE RESULT:', data, error);
      if (error) {
        console.error('[PlanBuilder] addExercise supabase error:', error, { payload });
        toast.error('שגיאה בשמירת תרגיל: ' + (error.message || 'נסה שוב'));
        return;
      }
      setSections(prev => prev.map((s, i) =>
        i === sectionIndex ? { ...s, exercises: [...s.exercises, data] } : s
      ));
      setEditingExercise(null);
      toast.success('התרגיל נוסף');
    } catch (err) {
      console.error('[PlanBuilder] addExercise unexpected:', err);
      toast.error('שגיאה לא צפויה: ' + (err?.message || 'נסה שוב'));
    }
  };

  const updateExercise = async (sectionIndex, exerciseIndex, exerciseData) => {
    const ex = sections[sectionIndex].exercises[exerciseIndex];
    const difficulty = exerciseData.params["רמת קושי"];
    const baseNotes = exerciseData.params["דגשים"] || '';
    const description = difficulty
      ? `[קושי: ${difficulty}]${baseNotes ? '\n' + baseNotes : ''}`
      : (baseNotes || null);
    const payload = {
      exercise_name: exerciseData.name,
      name: exerciseData.name,
      sets: exerciseData.params["סטים"] || null,
      reps: exerciseData.params["חזרות"] || null,
      rounds: exerciseData.params["סבבים"] || null,
      work_time: exerciseData.params["זמן עבודה"] || null,
      rest_time: exerciseData.params["זמן מנוחה"] || null,
      weight: exerciseData.params["משקל (ק״ג)"] || null,
      rpe: exerciseData.params["RPE (קושי)"] || null,
      tempo: exerciseData.params["טמפו"] || null,
      rest_between_sets: exerciseData.params["מנ׳ בין סטים"] || null,
      rest_between_exercises: exerciseData.params["מנ׳ בין תרגילים"] || null,
      body_position: exerciseData.params["מנח גוף"] || null,
      equipment: exerciseData.params["ציוד נדרש"] || null,
      static_hold_time: exerciseData.params["החזקה סטטית"] || null,
      description,
      side: exerciseData.params["צד"] || null,
      range_of_motion: exerciseData.params["טווח תנועה"] || null,
      grip: exerciseData.params["אחיזה"] || null,
      video_url: exerciseData.params["וידאו"] || null,
      tabata_data: serializeTabata(exerciseData.params["טבטה"]),
      tabata_preview: tabataPreview(exerciseData.params["טבטה"]),
      children: exerciseData.params["רשימת תרגילים"] || null,
    };
    if (!ex?.id) {
      console.error('[PlanBuilder] updateExercise: ex.id missing', { sectionIndex, exerciseIndex });
      toast.error('לא נמצא תרגיל לעדכון');
      return;
    }
    if (!exerciseData?.name?.trim()) {
      toast.error('שם התרגיל חסר');
      return;
    }
    console.log('[PlanBuilder] updateExercise SAVE PAYLOAD:', { id: ex.id, ...payload });
    let error;
    try {
      const res = await supabase.from("exercises").update(payload).eq("id", ex.id).select();
      console.log('[PlanBuilder] updateExercise SAVE RESULT:', res.data, res.error);
      error = res.error;
    } catch (err) {
      console.error('[PlanBuilder] updateExercise unexpected:', err);
      toast.error('שגיאה לא צפויה: ' + (err?.message || 'נסה שוב'));
      return;
    }
    if (error) {
      console.error('[PlanBuilder] updateExercise supabase error:', error, { payload });
      toast.error('שגיאה בעדכון: ' + (error.message || 'נסה שוב'));
      return;
    }
    toast.success('התרגיל עודכן');
    setSections(prev => prev.map((s, si) =>
      si === sectionIndex ? {
        ...s,
        exercises: s.exercises.map((e, ei) =>
          ei === exerciseIndex ? { ...e, ...payload, name: exerciseData.name } : e
        )
      } : s
    ));
    setEditingExercise(null);
  };

  const deleteExercise = async (sectionIndex, exerciseIndex) => {
    const ex = sections[sectionIndex].exercises[exerciseIndex];
    await supabase.from("exercises").delete().eq("id", ex.id);
    setSections(prev => prev.map((s, si) =>
      si === sectionIndex ? { ...s, exercises: s.exercises.filter((_, ei) => ei !== exerciseIndex) } : s
    ));
  };

  const finishPlan = async () => {
    for (const tid of selectedTrainees) {
      try {
        await supabase.from("notifications").insert({
          user_id: tid,
          type: "plan_created",
          title: "תוכנית אימון חדשה 🎯",
          message: `המאמן ${user.full_name} הקצה לך תוכנית: ${planName}`,
          created_at: new Date().toISOString(),
          is_read: false,
        });
      } catch (e) { console.warn("Notification insert failed:", e); }
    }
    window.dispatchEvent(new CustomEvent('data-changed'));
    setStep(3);
  };

  // Helper to build params object from exercise DB fields
  const exerciseToParams = (ex) => {
    if (!ex) return {};
    const p = {};
    if (ex.sets) p["סטים"] = ex.sets;
    if (ex.reps) p["חזרות"] = ex.reps;
    if (ex.rounds) p["סבבים"] = ex.rounds;
    if (ex.work_time) p["זמן עבודה"] = ex.work_time;
    if (ex.rest_time) p["זמן מנוחה"] = ex.rest_time;
    if (ex.weight) p["משקל (ק״ג)"] = ex.weight;
    if (ex.rpe) p["RPE (קושי)"] = ex.rpe;
    if (ex.tempo) p["טמפו"] = ex.tempo;
    if (ex.rest_between_sets) p["מנ׳ בין סטים"] = ex.rest_between_sets;
    if (ex.rest_between_exercises) p["מנ׳ בין תרגילים"] = ex.rest_between_exercises;
    if (ex.body_position) p["מנח גוף"] = ex.body_position;
    if (ex.equipment) p["ציוד נדרש"] = ex.equipment;
    if (ex.static_hold_time) p["החזקה סטטית"] = ex.static_hold_time;
    if (ex.description) {
      // Difficulty is encoded as a "[קושי: X]" prefix in the
      // description field — split it back out on read so the
      // chip selector stays in sync. See add/updateExercise.
      const m = String(ex.description).match(/^\[קושי:\s*([^\]]+)\]\s*\n?([\s\S]*)$/);
      if (m) {
        p["רמת קושי"] = m[1].trim();
        if (m[2]) p["דגשים"] = m[2].trim();
      } else {
        p["דגשים"] = ex.description;
      }
    }
    if (ex.side) p["צד"] = ex.side;
    if (ex.range_of_motion) p["טווח תנועה"] = ex.range_of_motion;
    if (ex.grip) p["אחיזה"] = ex.grip;
    if (ex.video_url) p["וידאו"] = ex.video_url;
    const tab = parseTabata(ex.tabata_data) || parseTabata(ex.tabata_config);
    if (tab) p["טבטה"] = tab;
    if (ex.children) p["רשימת תרגילים"] = ex.children;
    return p;
  };

  return (
    <ErrorBoundary>
    <div style={{ direction: "rtl", minHeight: "100%", background: "#f5f5f5" }}>

      {/* STEP 1 */}
      {step === 1 && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 80px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#666" }}>←</button>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{editPlanId ? "עריכת תוכנית" : "תוכנית חדשה"}</div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>בחירת מתאמנים</div>
            <div style={{ maxHeight: "40vh", minHeight: 120, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {trainees.map(t => (
              <div key={t.id} onClick={() => setSelectedTrainees(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: selectedTrainees.includes(t.id) ? "#FFF0E8" : "white", borderRadius: 10, border: selectedTrainees.includes(t.id) ? "2px solid #FF6F20" : "1px solid #eee", marginBottom: 8, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: selectedTrainees.includes(t.id) ? "#FF6F20" : "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: selectedTrainees.includes(t.id) ? "white" : "#666" }}>
                    {(t.full_name || t.email || "?")[0].toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600 }}>{t.full_name || t.email}</span>
                </div>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: selectedTrainees.includes(t.id) ? "#FF6F20" : "white", border: "2px solid", borderColor: selectedTrainees.includes(t.id) ? "#FF6F20" : "#ddd", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 13 }}>
                  {selectedTrainees.includes(t.id) ? "✓" : ""}
                </div>
              </div>
            ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>שם התוכנית</div>
            <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="לדוגמה: כוח מתפרץ - שלב א'"
              style={{ width: "100%", padding: "12px 14px", fontSize: 16, border: "1.5px solid", borderColor: planName ? "#FF6F20" : "#ddd", borderRadius: 10, boxSizing: "border-box", direction: "rtl", outline: "none" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>מוקדי האימון</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {FOCUS_AREAS.map(f => (
                <button key={f.id} onClick={() => setFocusAreas(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                  style={{ padding: "10px 4px", borderRadius: 10, border: "1.5px solid", borderColor: focusAreas.includes(f.id) ? "#FF6F20" : "#eee", background: focusAreas.includes(f.id) ? "#1a1a1a" : "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 20 }}>{f.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: focusAreas.includes(f.id) ? "white" : "#555" }}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>ימי אימון בשבוע</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DAYS.map(d => (
                <button key={d} onClick={() => setWeeklyDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                  style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "1.5px solid", borderColor: weeklyDays.includes(d) ? "#FF6F20" : "#ddd", background: weeklyDays.includes(d) ? "#FF6F20" : "white", color: weeklyDays.includes(d) ? "white" : "#333", cursor: "pointer" }}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>תיאור והנחיות</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="פרט כאן את מטרות התוכנית..." rows={4}
              style={{ width: "100%", padding: "12px 14px", fontSize: 14, border: "1.5px solid #ddd", borderRadius: 10, boxSizing: "border-box", resize: "none", fontFamily: "inherit", direction: "rtl", outline: "none" }} />
          </div>

          <button onClick={savePlanDetails} disabled={!planName.trim() || saving}
            style={{ width: "100%", height: 54, background: !planName.trim() ? "#ccc" : "#1a1a1a", color: "white", border: "none", borderRadius: 12, fontSize: 18, fontWeight: 900, cursor: "pointer" }}>
            {saving ? "שומר..." : "שמור תוכנית"}
          </button>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 80 }}>
          <div style={{ background: "#FF6F20", padding: "16px 16px 20px", borderRadius: "0 0 20px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => setStep(1)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: "6px 12px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>✏️ עריכה</button>
              <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>{planName}</div>
              <div style={{ width: 60 }} />
            </div>
          </div>

          <div style={{ padding: 16 }}>
            <button onClick={(e) => { e.stopPropagation(); setAddingSectionType(true); }}
              style={{ width: "100%", height: 50, background: "#FF6F20", color: "white", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 900, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              + הוסף סקשן חדש
            </button>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {sections.map((sec, si) => (
                  <SortableSectionBlock key={sec.id} section={sec} sectionIndex={si}
                    onDelete={() => deleteSection(si)}
                    onAddExercise={() => setEditingExercise({ sectionIndex: si, isNew: true, name: "", params: {} })}
                    onEditExercise={(ei) => setEditingExercise({ sectionIndex: si, exerciseIndex: ei, name: sec.exercises[ei]?.exercise_name || sec.exercises[ei]?.name || "", params: exerciseToParams(sec.exercises[ei]) })}
                    onDeleteExercise={(ei) => deleteExercise(si, ei)} />
                ))}
              </SortableContext>
            </DndContext>

            {sections.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 20px", background: "white", borderRadius: 14, border: "1px dashed #ddd" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏋️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#666" }}>לחץ "+ הוסף סקשן חדש" כדי להתחיל</div>
              </div>
            )}

            {sections.length > 0 && (
              <button onClick={finishPlan} style={{ width: "100%", height: 52, marginTop: 16, background: "#1a1a1a", color: "white", border: "none", borderRadius: 12, fontSize: 17, fontWeight: 900, cursor: "pointer" }}>
                סיים בניית תוכנית ✓
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "60px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>התוכנית נשמרה!</div>
          <div style={{ fontSize: 15, color: "#666", marginBottom: 32 }}>
            {planName}{selectedTrainees.length > 0 && ` שויכה ל${trainees.find(t => t.id === selectedTrainees[0])?.full_name}`}
          </div>
          <button onClick={() => { setStep(1); setPlanId(null); setPlanName(""); setFocusAreas([]); setWeeklyDays([]); setDescription(""); setSelectedTrainees([]); setSections([]); try { localStorage.removeItem(DRAFT_KEY); } catch {} }}
            style={{ width: "100%", height: 50, background: "#FF6F20", color: "white", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
            + צור תוכנית נוספת
          </button>
          {planId && (
            <button onClick={() => navigate("/activeplans?planId=" + planId)}
              style={{ width: "100%", height: 50, background: "white", color: "#FF6F20", border: "1px solid #FF6F20", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
              צפה בתוכנית
            </button>
          )}
          <button onClick={() => navigate("/activeplans")}
            style={{ width: "100%", height: 50, background: "white", color: "#1a1a1a", border: "1px solid #eee", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            צפה בכל התוכניות
          </button>
        </div>
      )}

      {/* Section type picker */}
      {addingSectionType && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setAddingSectionType(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4, textAlign: "center" }}>+ סקשן חדש</div>
            <div style={{ fontSize: 13, color: "#999", textAlign: "center", marginBottom: 16 }}>בחר סוג סקשן</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {SECTION_TYPES.map(t => (
                <button key={t.id} onClick={() => addSection(t.id)}
                  style={{ padding: "16px 8px", borderRadius: 14, border: "2px solid #eee", background: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all 0.15s" }}
                  onMouseDown={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = t.bgColor; }}
                  onMouseUp={e => { e.currentTarget.style.borderColor = "#eee"; e.currentTarget.style.background = "white"; }}>
                  <span style={{ fontSize: 32 }}>{t.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setAddingSectionType(false)} style={{ width: "100%", marginTop: 14, padding: 12, background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer" }}>ביטול</button>
          </div>
        </div>
      )}

      {/* Exercise editor */}
      {editingExercise && (
        <ExerciseEditor data={editingExercise}
          onSave={(data) => { if (editingExercise.isNew) addExercise(editingExercise.sectionIndex, data); else updateExercise(editingExercise.sectionIndex, editingExercise.exerciseIndex, data); }}
          onClose={() => setEditingExercise(null)} />
      )}
    </div>
    </ErrorBoundary>
  );
}

function SortableSectionBlock(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.section.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 999 : 'auto' }}>
      <SectionBlock {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function SectionBlock({ section, sectionIndex, onDelete, onAddExercise, onEditExercise, onDeleteExercise, dragHandleProps }) {
  const type = getSectionType(section.category);
  const sectionColor = section.color || type.color;
  return (
    <CollapsibleSection section={section} mode="edit" defaultOpen={true}>
      {/* Edit toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "6px 12px 0", direction: "rtl" }}>
        <div {...(dragHandleProps || {})} style={{ cursor: "grab", color: "#bbb", fontSize: 16, padding: "4px 2px", touchAction: "none", marginLeft: "auto" }}>⋮⋮</div>
        <button onClick={onAddExercise} style={{ background: "#FFF0E8", color: "#FF6F20", border: "1px solid #FFD0A0", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ תרגיל</button>
        <button onClick={onDelete} style={{ background: "#fee2e2", border: "none", color: "#ef4444", fontSize: 13, width: 28, height: 28, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑</button>
      </div>
      {section.exercises?.map((ex, ei) => (
        <div key={ex.id || ei} style={{ padding: "10px 14px", borderBottom: ei < section.exercises.length - 1 ? "1px solid #f5f5f5" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{ex.exercise_name || ex.name || "תרגיל"}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {ex.sets && <span style={{ background: "#FFF0E4", color: "#FF6F20", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 600 }}>{ex.sets} סטים</span>}
              {ex.reps && <span style={{ background: "#FFF0E4", color: "#FF6F20", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 600 }}>{ex.reps} חזרות</span>}
              {ex.weight && <span style={{ background: "#F3E8FF", color: "#7F47B5", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 600 }}>🏋 {ex.weight} ק״ג</span>}
              {ex.work_time && <span style={{ background: "#E8F5E9", color: "#16a34a", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 600 }}>💪 {formatWorkTime(ex.work_time)}</span>}
              {ex.rest_time && <span style={{ background: "#E8F5E9", color: "#16a34a", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 600 }}>😮‍💨 {formatWorkTime(ex.rest_time)}</span>}
              {(ex.tabata_data || ex.tabata_config) && <span style={{ background: "#E8F5E9", color: "#16a34a", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 600 }}>⏱ טבטה</span>}
              {ex.equipment && (Array.isArray(ex.equipment) ? ex.equipment.length > 0 : true) && <span style={{ background: "#F3F4F6", color: "#888", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 600 }}>🛠 {Array.isArray(ex.equipment) ? ex.equipment.join(', ') : ex.equipment}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onEditExercise(ei)} style={{ background: "none", border: "none", color: "#999", fontSize: 16, cursor: "pointer" }}>✏️</button>
            <button onClick={() => onDeleteExercise(ei)} style={{ background: "none", border: "none", color: "#ddd", fontSize: 16, cursor: "pointer" }}>🗑</button>
          </div>
        </div>
      ))}
      {section.exercises?.length === 0 && (
        <div style={{ padding: 14, textAlign: "center", fontSize: 13, color: "#bbb" }}>אין תרגילים בסקשן זה</div>
      )}
    </CollapsibleSection>
  );
}

// Param categories — schema keys preserved exactly so PARAM_SCHEMA
// lookups & DB params keys remain identical. Only the visual grouping
// changes here.
const PARAM_CATEGORIES = [
  {
    label: "מספרים וכמויות",
    params: ["סטים", "חזרות", "סבבים", "משקל (ק״ג)"],
  },
  {
    label: "זמנים ומנוחה",
    params: ["זמן עבודה", "זמן מנוחה", "החזקה סטטית", "מנ׳ בין סטים", "מנ׳ בין תרגילים"],
  },
  {
    label: "טכניקה ופרטים",
    params: ["RPE (קושי)", "רמת קושי", "טמפו", "ציוד נדרש", "דגשים", "צד", "טווח תנועה", "אחיזה", "מנח גוף", "וידאו"],
  },
  {
    label: "מבנה מתקדם",
    params: ["טבטה", "רשימת תרגילים"],
  },
];

function ExerciseEditor({ data, onSave, onClose }) {
  const [name, setName] = useState(data.name || "");
  const [params, setParams] = useState(data.params || {});
  const [selectedParams, setSelectedParams] = useState(Object.keys(data.params || {}));

  const toggleParam = (p) => {
    if (selectedParams.includes(p)) {
      setSelectedParams(prev => prev.filter(x => x !== p));
      setParams(prev => { const n = { ...prev }; delete n[p]; return n; });
    } else {
      setSelectedParams(prev => [...prev, p]);
    }
  };

  const renderChip = (paramId) => {
    const isSelected = selectedParams.includes(paramId);
    return (
      <div
        key={paramId}
        onClick={() => toggleParam(paramId)}
        style={{
          padding: "8px 14px",
          borderRadius: "24px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
          background: isSelected ? "#FF6F20" : "white",
          color: isSelected ? "white" : "#555",
          border: isSelected ? "1.5px solid #FF6F20" : "1.5px solid #E8E0D8",
          boxShadow: isSelected ? "0 2px 8px rgba(255,111,32,0.25)" : "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {paramId}
      </div>
    );
  };

  const renderWidget = (p) => {
    const schema = PARAM_SCHEMA[p] || { type: "text" };
    const val = params[p] || "";
    const set = (v) => setParams(prev => ({ ...prev, [p]: v }));
    return (
      <div key={p} style={{
        background: "#FFF9F0",
        borderRadius: "14px",
        padding: "12px 14px",
        marginBottom: "8px",
        border: "1px solid #F0E4D0",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 8 }}>{p}</div>
        {schema.type === "stepper" && (
          <Stepper value={val} onChange={set} min={schema.min} max={schema.max} unit={schema.unit} />
        )}
        {schema.type === "time" && (
          <TimePicker value={val} onChange={set} />
        )}
        {schema.type === "rpe" && (
          <RpeScale value={val} onChange={set} />
        )}
        {schema.type === "tempo" && (
          <TempoPattern value={val} onChange={set} />
        )}
        {schema.type === "chips" && (
          <ChipsMulti value={val} options={EQUIPMENT_OPTIONS} onChange={set} allowCustom={!!schema.allowCustom} />
        )}
        {schema.type === "list" && (
          <ListBuilder value={val} onChange={set} placeholder={schema.placeholder} />
        )}
        {schema.type === "tabata" && (
          <Tabata value={val || TABATA_DEFAULTS} onChange={set} />
        )}
        {schema.type === "select" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {schema.options.map(opt => (
              <button key={opt} onClick={() => set(val === opt ? "" : opt)}
                style={{ padding: "8px 14px", borderRadius: 9999, border: `1.5px solid ${val === opt ? "#FF6F20" : "#eee"}`, background: val === opt ? "#FF6F20" : "white", color: val === opt ? "white" : "#555", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {opt}
              </button>
            ))}
          </div>
        )}
        {schema.type === "textarea" && (
          <textarea value={val} onChange={e => set(e.target.value)} placeholder={schema.placeholder} rows={3}
            style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: "1.5px solid #ddd", borderRadius: 12, boxSizing: "border-box", resize: "none", fontFamily: "inherit", direction: "rtl", outline: "none" }} />
        )}
        {(schema.type === "text" || schema.type === "url") && (
          <input type={schema.type === "url" ? "url" : "text"} value={val} onChange={e => set(e.target.value)} placeholder={schema.placeholder || "..."}
            style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: "1.5px solid", borderColor: val ? "#FF6F20" : "#ddd", borderRadius: 12, boxSizing: "border-box", direction: "rtl", outline: "none", background: val ? "#FFF0E8" : "white" }} />
        )}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 'var(--timer-bar-height, 0px)', background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#FFFFFF", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* A. Form header — icon + title + subtitle */}
        <div style={{
          flexShrink: 0,
          textAlign: "center",
          padding: "20px 16px 12px",
          direction: "rtl",
          borderBottom: "0.5px solid #F0E4D0",
        }}>
          <div style={{
            width: "50px", height: "50px",
            borderRadius: "16px",
            background: "#FFF0E4",
            display: "flex", alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 10px",
            fontSize: "24px",
          }}>{data.isNew ? "🏋️" : "✏️"}</div>
          <div style={{
            fontSize: "20px", fontWeight: 700,
            color: "#1a1a1a",
          }}>{data.isNew ? "תרגיל חדש" : "ערוך תרגיל"}</div>
          <div style={{
            fontSize: "12px", color: "#888",
            marginTop: "4px",
          }}>בחר שם ופרמטרים לתרגיל</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", minHeight: 0 }}>

          {/* B. Exercise name — prominent input */}
          <div style={{ padding: "16px 16px 12px", direction: "rtl" }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="שם התרגיל (לדוגמה: סקוואט)"
              style={{
                width: "100%", padding: "14px 16px",
                borderRadius: "16px",
                border: "2px solid #F0E4D0",
                fontSize: "16px", fontWeight: 600,
                direction: "rtl", textAlign: "right",
                background: "#FFF9F0",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* C. Categorized parameter chips */}
          <div style={{ padding: "0 16px", direction: "rtl" }}>
            {PARAM_CATEGORIES.map(cat => (
              <div key={cat.label}>
                <div style={{
                  fontSize: "13px", fontWeight: 600,
                  color: "#FF6F20", marginBottom: "8px",
                  display: "flex", alignItems: "center", gap: "6px",
                }}>
                  <div style={{
                    width: "3px", height: "14px",
                    borderRadius: "2px", background: "#FF6F20",
                  }} />
                  {cat.label}
                </div>
                <div style={{
                  display: "flex", flexWrap: "wrap",
                  gap: "6px", marginBottom: "16px",
                }}>
                  {cat.params.map(renderChip)}
                </div>
              </div>
            ))}
          </div>

          {/* E. Selected param widgets — wrapped in cream cards */}
          {selectedParams.length > 0 && (
            <div style={{ padding: "4px 16px 16px", direction: "rtl" }}>
              {selectedParams.map(renderWidget)}
            </div>
          )}
        </div>

        {/* F. Save button — gradient when active */}
        <div style={{
          flexShrink: 0,
          padding: "16px",
          borderTop: "0.5px solid #F0E4D0",
          background: "white",
          paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
        }}>
          <button
            onClick={() => {
              if (!name.trim()) { toast.error('יש להזין שם תרגיל'); return; }
              onSave({ name: name.trim(), params });
            }}
            style={{
              width: "100%", padding: "16px",
              borderRadius: "16px", border: "none",
              background: name?.trim()
                ? "linear-gradient(135deg, #FF6F20, #FF8F50)"
                : "#ddd",
              color: "white", fontSize: "17px",
              fontWeight: 700, cursor: "pointer",
              boxShadow: name?.trim()
                ? "0 4px 15px rgba(255,111,32,0.3)"
                : "none",
            }}
          >
            {data.isNew ? "✅ הוסף תרגיל" : "💾 עדכן תרגיל"}
          </button>
          <div
            onClick={onClose}
            style={{
              textAlign: "center", padding: "12px",
              color: "#888", fontSize: "14px",
              cursor: "pointer",
            }}
          >ביטול</div>
        </div>
      </div>
    </div>
  );
}
