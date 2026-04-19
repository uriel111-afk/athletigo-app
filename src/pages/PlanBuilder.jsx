import { useState, useEffect, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Stepper, TimePicker, RpeScale, TempoPattern, ChipsMulti, ListBuilder, EQUIPMENT_OPTIONS } from "@/components/ParamWidgets";

const DEFAULT_SECTIONS = [
  { id: "warmup",      label: "חימום",    icon: "🔥", color: "#FF6F20" },
  { id: "stretching",  label: "מתיחות",   icon: "🧎", color: "#c084fc" },
  { id: "strength",    label: "כוח",      icon: "💪", color: "#1a1a1a" },
  { id: "flexibility", label: "גמישות",   icon: "🧘", color: "#16a34a" },
];

const EXTRA_SECTIONS = [
  { id: "skills",  label: "מיומנויות", icon: "🎯", color: "#d97706" },
  { id: "agility", label: "סקילס",     icon: "⚡", color: "#f59e0b" },
  { id: "cardio",  label: "קרדיו",     icon: "🏃", color: "#2563eb" },
  { id: "cooldown",label: "מותאם",     icon: "✨", color: "#9333ea" },
];

const SECTION_TYPES = [...DEFAULT_SECTIONS, ...EXTRA_SECTIONS];

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
  "ציוד נדרש":      { type: "chips" },
  "רשימת תרגילים":   { type: "list", placeholder: "שם התרגיל" },
  "מנח גוף":        { type: "text", placeholder: "למשל: עמידה, שכיבה..." },
  "דגשים":          { type: "textarea", placeholder: "דגשים לביצוע" },
  "צד":             { type: "select", options: ["ימין", "שמאל", "שני הצדדים", "לסירוגין"] },
  "טווח תנועה":      { type: "select", options: ["מלא", "חלקי", "חצי"] },
  "אחיזה":          { type: "select", options: ["רגילה", "רחבה", "צרה", "הפוכה", "נייטרלית"] },
  "וידאו":          { type: "url", placeholder: "https://..." },
};
const PARAM_TYPES = Object.keys(PARAM_SCHEMA);

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
      const defaults = await Promise.all(DEFAULT_SECTIONS.map(async (t, idx) => {
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
    const t = SECTION_TYPES.find(s => s.id === type);
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
    const sec = sections[sectionIndex];
    const payload = {
      training_section_id: sec.id,
      training_plan_id: planId,
      exercise_name: exerciseData.name,
      name: exerciseData.name,
      sets: exerciseData.params["סטים"] || null,
      reps: exerciseData.params["חזרות"] || null,
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
      description: exerciseData.params["דגשים"] || null,
      side: exerciseData.params["צד"] || null,
      range_of_motion: exerciseData.params["טווח תנועה"] || null,
      grip: exerciseData.params["אחיזה"] || null,
      video_url: exerciseData.params["וידאו"] || null,
      "order": sec.exercises.length,
      completed: false,
    };
    const { data, error } = await supabase.from("exercises").insert(payload).select().single();
    if (error) { console.error('[PlanBuilder] addExercise error:', error); alert('שגיאה בשמירת תרגיל: ' + error.message); return; }
    setSections(prev => prev.map((s, i) =>
      i === sectionIndex ? { ...s, exercises: [...s.exercises, data] } : s
    ));
    setEditingExercise(null);
  };

  const updateExercise = async (sectionIndex, exerciseIndex, exerciseData) => {
    const ex = sections[sectionIndex].exercises[exerciseIndex];
    const payload = {
      exercise_name: exerciseData.name,
      name: exerciseData.name,
      sets: exerciseData.params["סטים"] || null,
      reps: exerciseData.params["חזרות"] || null,
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
      description: exerciseData.params["דגשים"] || null,
      side: exerciseData.params["צד"] || null,
      range_of_motion: exerciseData.params["טווח תנועה"] || null,
      grip: exerciseData.params["אחיזה"] || null,
      video_url: exerciseData.params["וידאו"] || null,
    };
    const { error } = await supabase.from("exercises").update(payload).eq("id", ex.id);
    if (error) { console.error('[PlanBuilder] updateExercise error:', error); alert('שגיאה בעדכון: ' + error.message); return; }
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
    if (ex.description) p["דגשים"] = ex.description;
    if (ex.side) p["צד"] = ex.side;
    if (ex.range_of_motion) p["טווח תנועה"] = ex.range_of_motion;
    if (ex.grip) p["אחיזה"] = ex.grip;
    if (ex.video_url) p["וידאו"] = ex.video_url;
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
          <button onClick={() => { setStep(1); setPlanId(null); setPlanName(""); setFocusAreas([]); setWeeklyDays([]); setDescription(""); setSelectedTrainees([]); setSections([]); }}
            style={{ width: "100%", height: 50, background: "#FF6F20", color: "white", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
            + צור תוכנית נוספת
          </button>
          <button onClick={() => navigate("/activeplans")}
            style={{ width: "100%", height: 50, background: "white", color: "#1a1a1a", border: "1px solid #eee", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            צפה בכל התוכניות
          </button>
        </div>
      )}

      {/* Section type picker */}
      {addingSectionType && (
        <div onClick={() => setAddingSectionType(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4, textAlign: "center" }}>+ סקשן חדש</div>
            <div style={{ fontSize: 13, color: "#999", textAlign: "center", marginBottom: 16 }}>בחר סוג סקשן</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {EXTRA_SECTIONS.map(t => (
                <button key={t.id} onClick={() => addSection(t.id)} style={{ padding: "16px 8px", borderRadius: 12, border: "1.5px solid #eee", background: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 28 }}>{t.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{t.label}</span>
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
  const sectionColor = section.color || SECTION_TYPES.find(t => t.id === section.category)?.color || "#FF6F20";
  return (
    <div style={{ background: "white", borderRadius: 14, border: "1px solid #eee", borderRight: `3px solid ${sectionColor}`, marginBottom: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: section.exercises?.length > 0 ? "1px solid #f5f5f5" : "none", background: "#fafafa" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <div {...(dragHandleProps || {})} style={{ cursor: "grab", color: "#bbb", fontSize: 16, padding: "4px 2px", touchAction: "none" }}>⋮⋮</div>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: sectionColor, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{(sectionIndex ?? 0) + 1}</div>
          <span style={{ fontSize: 22 }}>{section.icon || "📋"}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{section.section_name || section.title}</div>
            <div style={{ fontSize: 12, color: "#999" }}>{section.exercises?.length || 0} תרגילים</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={onAddExercise} style={{ background: "#FFF0E8", color: "#FF6F20", border: "1px solid #FFD0A0", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ תרגיל</button>
          <button onClick={onDelete} style={{ background: "#fee2e2", border: "none", color: "#ef4444", fontSize: 13, width: 28, height: 28, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑</button>
        </div>
      </div>
      {section.exercises?.map((ex, ei) => (
        <div key={ex.id || ei} style={{ padding: "10px 14px", borderBottom: ei < section.exercises.length - 1 ? "1px solid #f5f5f5" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{ex.exercise_name || ex.name || "תרגיל"}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {ex.sets && <span style={{ background: "#f0f0f0", color: "#555", fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>סטים: {ex.sets}</span>}
              {ex.reps && <span style={{ background: "#f0f0f0", color: "#555", fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>חזרות: {ex.reps}</span>}
              {ex.work_time && <span style={{ background: "#f0f0f0", color: "#555", fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>עבודה: {ex.work_time}</span>}
              {ex.rest_time && <span style={{ background: "#f0f0f0", color: "#555", fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>מנוחה: {ex.rest_time}</span>}
              {ex.weight && <span style={{ background: "#f0f0f0", color: "#555", fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>משקל: {ex.weight}</span>}
              {ex.rpe && <span style={{ background: "#f0f0f0", color: "#555", fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>RPE: {ex.rpe}</span>}
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
    </div>
  );
}

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

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: 24, maxHeight: "90vh", overflowY: "auto", paddingBottom: "max(env(safe-area-inset-bottom),24px)" }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, textAlign: "center" }}>{data.isNew ? "תרגיל חדש" : "ערוך תרגיל"}</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>שם התרגיל</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="לדוגמה: סקוואט"
            style={{ width: "100%", padding: "12px 14px", fontSize: 16, border: "1.5px solid", borderColor: name ? "#FF6F20" : "#ddd", borderRadius: 10, boxSizing: "border-box", direction: "rtl", outline: "none" }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>פרמטרים</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {PARAM_TYPES.map(p => (
              <button key={p} onClick={() => toggleParam(p)}
                style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "1.5px solid", borderColor: selectedParams.includes(p) ? "#FF6F20" : "#eee", background: selectedParams.includes(p) ? "#FF6F20" : "white", color: selectedParams.includes(p) ? "white" : "#555", cursor: "pointer" }}>
                {p}
              </button>
            ))}
          </div>
          {selectedParams.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
              {selectedParams.map(p => {
                const schema = PARAM_SCHEMA[p] || { type: "text" };
                const val = params[p] || "";
                const set = (v) => setParams(prev => ({ ...prev, [p]: v }));
                return (
                  <div key={p}>
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
                      <ChipsMulti value={val} options={EQUIPMENT_OPTIONS} onChange={set} />
                    )}
                    {schema.type === "list" && (
                      <ListBuilder value={val} onChange={set} placeholder={schema.placeholder} />
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
              })}
            </div>
          )}
        </div>

        <button onClick={() => { if (!name.trim()) return; onSave({ name, params }); }} disabled={!name.trim()}
          style={{ width: "100%", height: 52, background: !name.trim() ? "#ccc" : "#FF6F20", color: "white", border: "none", borderRadius: 12, fontSize: 18, fontWeight: 900, cursor: "pointer", marginBottom: 10 }}>
          {data.isNew ? "הוסף תרגיל ✓" : "עדכן תרגיל ✓"}
        </button>
        <button onClick={onClose} style={{ width: "100%", padding: 10, background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer" }}>ביטול</button>
      </div>
    </div>
  );
}
