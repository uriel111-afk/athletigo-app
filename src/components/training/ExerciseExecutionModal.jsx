import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Check, X, Clock, Repeat, Scale, Activity,
  Video, Zap, Layers, RotateCcw, GripVertical,
  Footprints, Maximize2, Dumbbell, Timer, User, Loader2
} from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────────
const formatTime = (val) => {
  if (!val) return "";
  if (typeof val === "string" && val.includes(":")) return val;
  const seconds = parseInt(val);
  if (isNaN(seconds)) return val;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
};
const getSubExercises = (ex) => {
  // PlanBuilder writes the "רשימת תרגילים" param to ex.children;
  // some installs use ex.exercise_list; older formats put it inside
  // tabata_data.sub_exercises / .blocks. Accept all four shapes so
  // the sub-exercise list always renders regardless of where it
  // ended up in the row.
  const fromChildren     = asArray(ex.children);
  if (fromChildren.length)     return fromChildren;
  const fromList         = asArray(ex.exercise_list);
  if (fromList.length)         return fromList;
  if (ex.tabata_data) {
    try {
      const parsed = typeof ex.tabata_data === "string" ? JSON.parse(ex.tabata_data) : ex.tabata_data;
      if (parsed.sub_exercises?.length > 0) return parsed.sub_exercises;
      if (parsed.blocks) {
        const subs = [];
        parsed.blocks.forEach((block) => {
          (block.block_exercises || []).forEach((be) => {
            subs.push({ exercise_name: be.name, ...block });
          });
        });
        if (subs.length > 0) return subs;
      }
    } catch {}
  }
  // Legacy format
  const legacy = ex.tabata_exercises || ex.combo_exercises || ex.superset_exercises || ex.exercises || ex.sub_exercises;
  if (Array.isArray(legacy) && legacy.length > 0) return legacy;
  return [];
};

const isContainer = (ex) => {
  return ["טבטה", "סופרסט", "קומבו"].includes(ex.mode) || getSubExercises(ex).length > 0;
};

const buildSubChips = (sub) => {
  const chips = [];
  if (sub.sets && sub.sets !== "0") chips.push(`${sub.sets} סטים`);
  if (sub.reps && sub.reps !== "0") chips.push(`${sub.reps} חזרות`);
  const wt = sub.work_time ? formatTime(sub.work_time) : null;
  if (wt && wt !== "00:00") chips.push(`עבודה: ${wt}`);
  const rt = sub.rest_time ? formatTime(sub.rest_time) : null;
  if (rt && rt !== "00:00") chips.push(`מנוחה: ${rt}`);
  if (sub.weight && sub.weight !== "0") chips.push(`${sub.weight} ק"ג`);
  if (sub.rpe && sub.rpe !== "0") chips.push(`RPE ${sub.rpe}`);
  return chips;
};

// ── Sub-components ──────────────────────────────────────────────────

const MetricItem = ({ icon: Icon, label, value, subLabel }) => {
  if (!value || value === "0" || value === "00:00") return null;
  return (
    <div className="flex flex-col items-center justify-center p-3 bg-gray-50 rounded-xl border border-gray-100 text-center h-full">
      <Icon className="w-5 h-5 text-gray-400 mb-1.5" />
      <span className="text-lg font-black text-gray-900 leading-none">{value}</span>
      <span className="text-[10px] font-bold text-gray-500 mt-1">{label}</span>
      {subLabel && <span className="text-[9px] text-gray-400">{subLabel}</span>}
    </div>
  );
};

const DetailRow = ({ icon: Icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
      <Icon className="w-4 h-4 text-[#FF6F20] mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-xs font-bold text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm font-medium text-gray-800 leading-relaxed whitespace-pre-wrap">{value}</p>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════

export default function ExerciseExecutionModal({ isOpen, onClose, exercise, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    actual_result: "", actual_weight: "", actual_reps: "",
    rpe: 0, trainee_feedback: "", completed: false,
  });
  const [subCompleted, setSubCompleted] = useState({});

  useEffect(() => {
    if (exercise) {
      setFormData({
        actual_result: exercise.actual_result || "",
        actual_weight: exercise.actual_weight || "",
        actual_reps: exercise.actual_reps || "",
        rpe: exercise.rpe || 0,
        trainee_feedback: exercise.trainee_feedback || "",
        completed: exercise.completed || false,
      });
      // Initialize sub-exercise completion state
      const subs = getSubExercises(exercise);
      const completed = {};
      subs.forEach((_, i) => { completed[i] = false; });
      setSubCompleted(completed);
    }
  }, [exercise, isOpen]);

  if (!exercise) return null;

  const containerMode = isContainer(exercise);
  const subExercises = getSubExercises(exercise);
  const subCount = subExercises.length;
  const subDoneCount = Object.values(subCompleted).filter(Boolean).length;
  const allSubsDone = subCount > 0 && subDoneCount === subCount;
  const progress = subCount > 0 ? Math.round((subDoneCount / subCount) * 100) : 0;

  const toggleSub = (i) => {
    setSubCompleted((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  const handleSave = () => {
    onSave({ ...formData, completed: true });
  };

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] md:w-full max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0 bg-white rounded-2xl" dir="rtl">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="p-5 pb-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-black text-gray-900 leading-tight">{exercise.exercise_name || exercise.name || "תרגיל"}</h2>
              {containerMode && (
                <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF6F20] text-white">
                  {exercise.mode === "טבטה" ? "טבטה" : "רשימה"} ({subCount})
                </span>
              )}
              {exercise.weight_type && exercise.weight_type !== "bodyweight" && (
                <p className="text-xs font-bold text-gray-400 mt-1">
                  {exercise.weight_type} {exercise.equipment ? `• ${exercise.equipment}` : ""}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress bar for container exercises */}
          {containerMode && subCount > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-500">{subDoneCount}/{subCount} הושלמו</span>
                <span className="text-[10px] font-bold text-[#FF6F20]">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#FF6F20] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="p-5 space-y-5">

          {/* ── Description ────────────────────────────────────── */}
          {exercise.description && (
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <p className="text-sm text-blue-800 leading-relaxed">{exercise.description}</p>
            </div>
          )}

          {/* ── Metrics Grid (for single exercises) ─────────── */}
          {!containerMode && (
            <div className="grid grid-cols-3 gap-2">
              <MetricItem icon={Layers} label="סטים" value={exercise.sets} />
              <MetricItem icon={Repeat} label="חזרות" value={exercise.reps} />
              <MetricItem icon={Scale} label="משקל" value={exercise.weight} subLabel="ק״ג" />
              <MetricItem icon={Clock} label="עבודה" value={formatTime(exercise.work_time)} />
              <MetricItem icon={RotateCcw} label="סבבים" value={exercise.rounds} />
              <MetricItem icon={Timer} label="מנוחה" value={formatTime(exercise.rest_time)} />
            </div>
          )}

          {/* ── Sub-Exercises (for container exercises) ──────── */}
          {containerMode && subExercises.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#FF6F20]" />
                {exercise.mode === "טבטה" ? "תרגילי טבטה" : "תתי-תרגילים"}
              </h3>
              <div className="space-y-1.5">
                {subExercises.map((sub, i) => {
                  const done = subCompleted[i];
                  const chips = buildSubChips(sub);
                  return (
                    <button key={sub.id || i} onClick={() => toggleSub(i)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-right
                        ${done
                          ? "bg-green-50 border-green-200"
                          : "bg-gray-50 border-gray-100 hover:border-gray-200"}`}>
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                        ${done ? "bg-green-500 border-green-500" : "bg-white border-gray-300"}`}>
                        {done && <Check size={14} className="text-white" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-bold leading-tight truncate ${done ? "text-green-700 line-through" : "text-gray-900"}`}>
                          {sub.exercise_name || sub.name || `תרגיל ${i + 1}`}
                        </div>
                        {chips.length > 0 && (
                          <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                            {chips.join(" · ")}
                          </div>
                        )}
                      </div>
                      <span className="w-5 h-5 rounded-full bg-[#FF6F20] text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                    </button>
                  );
                })}
              </div>

              {allSubsDone && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-green-700">כל תתי-התרגילים הושלמו!</p>
                </div>
              )}
            </div>
          )}

          {/* ── Parent metrics for container ────────────────── */}
          {containerMode && (
            <div className="grid grid-cols-3 gap-2">
              <MetricItem icon={RotateCcw} label="סבבים" value={exercise.rounds} />
              <MetricItem icon={Clock} label="עבודה" value={formatTime(exercise.work_time)} />
              <MetricItem icon={Timer} label="מנוחה" value={formatTime(exercise.rest_time)} />
            </div>
          )}

          {/* ── Details ─────────────────────────────────────── */}
          <div className="space-y-1">
            <DetailRow icon={User} label="מנח גוף" value={exercise.body_position} />
            <DetailRow icon={GripVertical} label="אחיזה" value={exercise.grip} />
            <DetailRow icon={Maximize2} label="טווח תנועה" value={exercise.range_of_motion} />
            <DetailRow icon={Activity} label="טמפו" value={exercise.tempo} />
            <DetailRow icon={Zap} label="דגשים" value={exercise.coach_notes || exercise.cues} />
          </div>

          {/* ── Video ───────────────────────────────────────── */}
          {exercise.video_url && (
            <a href={exercise.video_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-all shadow-lg">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Video className="w-4 h-4" />
              </div>
              <p className="text-sm font-bold">צפה בסרטון הדגמה</p>
            </a>
          )}

          <div className="h-px bg-gray-100 w-full" />

          {/* ── Performance Log ──────────────────────────────── */}
          <div className="space-y-4">
            <h3 className="font-bold text-base text-gray-900">יומן ביצוע</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">משקל בפועל (ק״ג)</Label>
                <Input type="number" placeholder="0" className="bg-gray-50 border-gray-200 text-center font-bold h-11"
                  value={formData.actual_weight} onChange={(e) => setFormData({ ...formData, actual_weight: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">חזרות / זמן שבוצעו</Label>
                <Input placeholder="—" className="bg-gray-50 border-gray-200 text-center font-bold h-11"
                  value={formData.actual_result} onChange={(e) => setFormData({ ...formData, actual_result: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs text-gray-500">דרגת קושי (RPE)</Label>
                <span className="text-xs font-bold text-[#FF6F20]">{formData.rpe || "-"}/10</span>
              </div>
              <div className="flex gap-1 justify-between bg-gray-50 p-2 rounded-xl border border-gray-100">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                  <button key={val} onClick={() => setFormData({ ...formData, rpe: val })}
                    className={`w-7 h-8 rounded flex items-center justify-center text-sm font-bold transition-all
                      ${formData.rpe === val ? "bg-[#FF6F20] text-white shadow-md scale-110" : "text-gray-400 hover:bg-gray-200"}`}>
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">הערות אישיות</Label>
              <Textarea placeholder="איך הרגיש? כאבים? הצלחות?"
                className="bg-gray-50 border-gray-200 min-h-[80px] resize-none text-sm"
                value={formData.trainee_feedback} onChange={(e) => setFormData({ ...formData, trainee_feedback: e.target.value })} />
            </div>
          </div>
        </div>

        {/* ── Save Button ──────────────────────────────────────── */}
        <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0 z-10">
          <Button onClick={handleSave} disabled={isLoading}
            className="w-full h-12 rounded-xl bg-[#FF6F20] hover:bg-[#e65b12] text-white font-bold text-base shadow-lg">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5 ml-2" /> שמור וסיים תרגיל</>}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
