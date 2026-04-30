import React from "react";
import { motion } from "framer-motion";
import {
  Check, Edit2, Trash2, Zap, Layers, Clock, Dumbbell, Activity,
  Repeat, Hash, Timer, Weight, ArrowLeftRight, GripVertical,
  Footprints, Maximize2, User, Info, Video, PauseCircle
} from "lucide-react";
import { notifyExerciseCompleted } from "@/functions/notificationTriggers";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

// ── Helpers ─────────────────────────────────────────────────────────────

const PARAM_ICON = {
  sets: Hash, reps: Repeat, work_time: Clock, rest_time: Timer,
  rounds: Hash, rpe: Zap, weight_type: Weight, weight: Weight,
  tempo: Activity, rest_between_sets: Timer, rest_between_exercises: PauseCircle,
  leg_position: Footprints, body_position: User, equipment: Dumbbell,
  static_hold_time: PauseCircle, description: Info, side: ArrowLeftRight,
  range_of_motion: Maximize2, grip: GripVertical, video_url: Video,
};

const fmtTime = (v) => {
  if (!v && v !== 0) return null;
  if (typeof v === "string" && v.includes(":")) {
    const [m, s] = v.split(":").map(Number);
    const total = (m || 0) * 60 + (s || 0);
    if (total === 0) return null;
    if (total % 60 === 0) return `${total / 60} דק׳`;
    return total < 60 ? `${total} שנ׳` : `${m}:${String(s).padStart(2, "0")}`;
  }
  const n = parseInt(v);
  if (isNaN(n) || n === 0) return null;
  if (n % 60 === 0) return `${n / 60} דק׳`;
  return n < 60 ? `${n} שנ׳` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

/**
 * Build display chips: { field, icon, label, value }
 */
const buildChips = (ex) => {
  const chips = [];
  const push = (field, label, value) => {
    if (value) chips.push({ field, icon: PARAM_ICON[field], label, value });
  };

  if (ex.sets && ex.sets !== "0") push("sets", "סטים", ex.sets);
  if (ex.reps && ex.reps !== "0") push("reps", "חזרות", ex.reps);
  if (ex.rounds && ex.rounds !== "0") push("rounds", "סבבים", ex.rounds);

  const wt = fmtTime(ex.work_time);
  if (wt) push("work_time", "עבודה", wt);
  const rt = fmtTime(ex.rest_time);
  if (rt) push("rest_time", "מנוחה", rt);
  const rbs = fmtTime(ex.rest_between_sets);
  if (rbs) push("rest_between_sets", "מנ׳ סטים", rbs);
  const rbe = fmtTime(ex.rest_between_exercises);
  if (rbe) push("rest_between_exercises", "מנ׳ תרגילים", rbe);
  const sh = fmtTime(ex.static_hold_time);
  if (sh) push("static_hold_time", "החזקה", sh);

  if (ex.weight && ex.weight !== "0") push("weight", "משקל", `${ex.weight} ק"ג`);
  if (ex.weight_type && ex.weight_type !== "bodyweight") push("weight_type", "עומס", ex.weight_type);
  if (ex.rpe && ex.rpe !== "0") push("rpe", "RPE", ex.rpe);
  if (ex.tempo) {
    // Expand "3-1-2-0" → "שלילי 3" · "החזקה למטה 1" · "חיובי 2" · "החזקה למעלה 0"
    const parts = String(ex.tempo).split('-').map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const labels = ['שלילי', 'החזקה למטה', 'חיובי', 'החזקה למעלה'];
      const tempoDisplay = parts.map((p, i) => `${labels[i] || ''} ${p}"`).join(' · ');
      push("tempo", "טמפו", tempoDisplay);
    } else {
      push("tempo", "טמפו", ex.tempo);
    }
  }

  // Tabata-mode container surfaces the work/rest/rounds embedded in
  // tabata_data. Without this the trainee sees only the "טבטה" badge
  // and a sub-exercise list with no actual timing.
  if (ex.mode === 'טבטה' && ex.tabata_data) {
    let tabata = ex.tabata_data;
    if (typeof tabata === 'string') {
      try { tabata = JSON.parse(tabata); } catch { tabata = null; }
    }
    if (tabata && typeof tabata === 'object') {
      const work = tabata.work_time ?? tabata.work_sec;
      const rest = tabata.rest_time ?? tabata.rest_sec;
      const rounds = tabata.rounds;
      if (work) push("work_time", "טבטה: עבודה", `${work}"`);
      if (rest) push("rest_time", "טבטה: מנוחה", `${rest}"`);
      if (rounds) push("rounds", "טבטה: סבבים", rounds);
    }
  }

  if (ex.body_position) push("body_position", "מנח גוף", ex.body_position);
  if (ex.leg_position) push("leg_position", "רגליים", ex.leg_position);
  if (ex.side && ex.side !== "דו־צדדי") push("side", "צד", ex.side);
  if (ex.grip) push("grip", "אחיזה", ex.grip);
  if (ex.equipment) push("equipment", "ציוד", ex.equipment);
  if (ex.range_of_motion && ex.range_of_motion !== "מלא") push("range_of_motion", "טווח", ex.range_of_motion);

  return chips;
};

// Parse the sub-exercise list from any of the three column shapes
// the codebase uses interchangeably:
//   • ex.children      — canonical column per CLAUDE.md (PlanBuilder
//                         saves the "רשימת תרגילים" param here)
//   • ex.exercise_list — alternate alias some installs use
//   • ex.sub_exercises — legacy direct array column
//   • ex.tabata_data.sub_exercises / .blocks — embedded inside the
//                         tabata config blob (older format)
// Each shape may be a parsed array or a JSON string. Normalize.
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
  // ParamWidgets ListBuilder hands back items shaped { name, sets,
  // reps, time, weight }. Map onto a stable display shape so the
  // UI doesn't have to know which column it came from.
  const fromChildren     = asArray(ex.children);
  if (fromChildren.length)     return fromChildren;
  const fromList         = asArray(ex.exercise_list);
  if (fromList.length)         return fromList;
  const fromSubExercises = asArray(ex.sub_exercises);
  if (fromSubExercises.length) return fromSubExercises;
  if (!ex.tabata_data) return [];
  try {
    const parsed = typeof ex.tabata_data === "string" ? JSON.parse(ex.tabata_data) : ex.tabata_data;
    if (parsed.sub_exercises) return parsed.sub_exercises;
    if (parsed.blocks) {
      const subs = [];
      parsed.blocks.forEach((block) => {
        (block.block_exercises || []).forEach((be) => {
          subs.push({ exercise_name: be.name, ...block });
        });
      });
      return subs;
    }
  } catch {}
  return [];
};

const isContainerExercise = (ex) => {
  return ["טבטה", "סופרסט", "קומבו"].includes(ex.mode) && getSubExercises(ex).length > 0;
};

// Tempo display: expand "3-1-2-0" → "שלילי 3 · החזקה למטה 1 ·
// חיובי 2 · החזקה למעלה 0". Single-segment values pass through.
function formatTempo(val) {
  if (!val) return null;
  const parts = String(val).split('-').map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return String(val);
  const labels = ['שלילי', 'החזקה למטה', 'חיובי', 'החזקה למעלה'];
  return parts.map((p, i) => `${labels[i] || ''} ${p}"`).join(' · ');
}

// Trainee view: 4 logical groups so a busy plan reads as a structured
// recipe instead of a 20-chip blob. Each group renders its own header
// + chip row; empty groups are skipped.
const PARAM_GROUPS = [
  {
    title: 'עומס',
    params: [
      { key: 'sets', label: 'סטים' },
      { key: 'reps', label: 'חזרות' },
      { key: 'rounds', label: 'סבבים' },
      { key: 'weight', label: 'משקל', suffix: ' ק"ג' },
      { key: 'weight_type', label: 'סוג משקל' },
      { key: 'rpe', label: 'RPE' },
    ],
  },
  {
    title: 'זמנים',
    params: [
      { key: 'work_time', label: 'זמן עבודה', suffix: '"' },
      { key: 'rest_time', label: 'זמן מנוחה', suffix: '"' },
      { key: 'rest_between_sets', label: 'מנוחה בין סטים', suffix: '"' },
      { key: 'rest_between_exercises', label: 'מנוחה בין תרגילים', suffix: '"' },
      { key: 'static_hold_time', label: 'החזקה סטטית', suffix: '"' },
    ],
  },
  {
    title: 'טכניקה',
    params: [
      { key: 'tempo', label: 'טמפו', format: formatTempo },
      { key: 'body_position', label: 'מנח גוף' },
      { key: 'leg_position', label: 'מנח רגליים' },
      { key: 'side', label: 'צד' },
      { key: 'grip', label: 'אחיזה' },
      { key: 'range_of_motion', label: 'טווח תנועה' },
    ],
  },
  {
    title: 'ציוד ומדיה',
    params: [
      { key: 'equipment', label: 'ציוד' },
      { key: 'video_url', label: 'וידאו', isLink: true },
    ],
  },
];

const isParamFilled = (val) => {
  if (val == null || val === '' || val === 'לא רלוונטי') return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'string' && val.trim() === '') return false;
  return true;
};

const formatParamValue = (val) => {
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
};

const getContainerLabel = (ex) => {
  if (ex.mode === "טבטה") return "טבטה";
  if (ex.mode === "סופרסט") return "רשימה";
  if (ex.mode === "קומבו") return "קומבו";
  return "מיכל";
};

// ── Component ────────────────────────────────────────────────────────

export default function ExerciseCard({
  exercise, index = 0, onToggleComplete, onRowClick, onEdit, onDelete,
  onMove, isFirst = false, isLast = false, onDuplicate,
  onOpenExecution, showEditButton = false, isCoach = false,
  sectionColor = "#FF6F20", plan,
}) {
  const queryClient = useQueryClient();
  if (!exercise) return null;

  const handleToggleComplete = async (e) => {
    e.stopPropagation();
    if (onToggleComplete) onToggleComplete(exercise);
    if (!isCoach && !exercise.completed && plan?.created_by) {
      try {
        const currentUser = await base44.auth.me();
        if (currentUser?.id) {
          await notifyExerciseCompleted({
            coachId: plan.created_by, traineeName: currentUser.full_name,
            traineeId: currentUser.id, exerciseName: exercise.exercise_name || exercise.name || "תרגיל",
          });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      } catch {}
    }
  };

  const handleEdit = (e) => { e.stopPropagation(); onEdit ? onEdit() : onRowClick?.(); };
  const handleDelete = (e) => { e.stopPropagation(); onDelete?.(); };

  const chips = buildChips(exercise);
  const notes = exercise.description || exercise.coach_notes || exercise.notes;
  const isContainer = isContainerExercise(exercise);
  const subExercises = isContainer ? getSubExercises(exercise) : [];

  // ── COACH VIEW ──────────────────────────────────────────────────────
  if (isCoach || showEditButton) {
    return (
      <motion.div layout
        className="w-full rounded-2xl overflow-hidden transition-all"
        style={{ backgroundColor: "#FAFAFA", border: "1.5px solid #ede9e3", borderRight: `3px solid ${exercise.completed ? "#4CAF50" : "#FF6F20"}` }}>

        <div className="p-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FFF7ED" }}>
                {isContainer ? <Layers size={14} className="text-[#FF6F20]" /> : <Dumbbell size={14} className="text-[#FF6F20]" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-gray-900 leading-tight truncate">
                  {exercise.exercise_name || exercise.name || "תרגיל"}
                </h3>
                {isContainer && (
                  <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF6F20] text-white">
                    {getContainerLabel(exercise)} ({subExercises.length})
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onMove && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(-1); }}
                    disabled={isFirst}
                    title="העלה תרגיל"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:bg-orange-50 transition-colors disabled:opacity-30 disabled:cursor-default text-xs leading-none"
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(1); }}
                    disabled={isLast}
                    title="הורד תרגיל"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:bg-orange-50 transition-colors disabled:opacity-30 disabled:cursor-default text-xs leading-none"
                  >
                    ↓
                  </button>
                </>
              )}
              <button onClick={handleEdit} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:bg-orange-50 transition-colors" title="ערוך">
                <Edit2 size={13} />
              </button>
              {onDuplicate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                  title="שכפל תרגיל"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:bg-orange-50 transition-colors text-xs leading-none"
                >
                  📋
                </button>
              )}
              <button onClick={handleDelete} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="מחק">
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Param chips with icons */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {chips.map((chip, i) => {
                const Icon = chip.icon;
                return (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">
                    {Icon && <Icon size={10} className="text-[#FF6F20] flex-shrink-0" />}
                    <span className="text-gray-400">{chip.label}:</span>
                    <span className="font-bold">{chip.value}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Sub-exercises for container */}
          {isContainer && subExercises.length > 0 && (
            <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-2 mb-2">
              <div className="space-y-1">
                {subExercises.map((sub, i) => {
                  const subChips = buildChips(sub);
                  return (
                    <div key={sub.id || i} className="flex items-start gap-2 bg-white rounded-lg px-2 py-1.5 border border-orange-100/50">
                      <span className="w-5 h-5 rounded-full bg-[#FF6F20] text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-gray-800 truncate">{sub.exercise_name || sub.name || "תת-תרגיל"}</div>
                        {subChips.length > 0 && (
                          <div className="text-[9px] text-gray-400 truncate mt-0.5">
                            {subChips.map((c) => `${c.label}: ${c.value}`).join(" · ")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No params */}
          {chips.length === 0 && !isContainer && (
            <p className="text-[11px] text-gray-400 italic mb-1">אין פרמטרים</p>
          )}

          {/* Notes */}
          {notes && (
            <p className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-100 pt-1.5 mt-1">
              <Info size={10} className="inline mr-1 text-gray-400" />
              {notes}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // ── TRAINEE VIEW ────────────────────────────────────────────────────
  return (
    <motion.div layout
      className="w-full rounded-[14px] mb-3 overflow-hidden transition-all"
      style={{ backgroundColor: "#F7F6F3", border: "1.5px solid #ede9e3", borderRight: `3px solid ${exercise.completed ? "#4CAF50" : "#FF6F20"}` }}>

      <div className="p-4">
        {/* Name + RPE */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {isContainer && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF6F20] text-white flex-shrink-0">
                {getContainerLabel(exercise)}
              </span>
            )}
            <h3 className="text-[15px] font-black text-gray-900 leading-snug truncate" style={{ fontFamily: "Barlow, sans-serif" }}>
              {exercise.exercise_name || exercise.name || "תרגיל"}
            </h3>
          </div>
          {exercise.rpe && (
            <div className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-bold flex-shrink-0">
              RPE {exercise.rpe}
            </div>
          )}
        </div>

        {/* Grouped params — 4 logical groups (עומס / זמנים / טכניקה /
            ציוד ומדיה). Each group skipped when empty. Replaces the
            single-row chip blob to give the trainee a structured
            recipe instead of a wall of pills. */}
        {PARAM_GROUPS.map(group => {
          const activeParams = group.params.filter(p => isParamFilled(exercise[p.key]));
          if (activeParams.length === 0) return null;
          return (
            <div key={group.title} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontWeight: 500 }}>
                {group.title}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {activeParams.map(p => {
                  const raw = exercise[p.key];
                  const formatted = p.format ? p.format(raw) : formatParamValue(raw);
                  if (!formatted) return null;
                  if (p.isLink) {
                    return (
                      <span
                        key={p.key}
                        onClick={() => window.open(raw, '_blank')}
                        style={{
                          padding: '4px 10px', borderRadius: 999, fontSize: 12,
                          background: '#EFF6FF', color: '#3B82F6',
                          border: '1px solid #BFDBFE',
                          cursor: 'pointer', fontWeight: 500,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ▶ {p.label}
                      </span>
                    );
                  }
                  return (
                    <span key={p.key} style={{
                      padding: '4px 10px', borderRadius: 999,
                      fontSize: 12, background: '#FFF5EE', color: '#FF6F20',
                      border: '1px solid #FFD9C2', fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}>
                      <span style={{ opacity: 0.7 }}>{p.label}:</span>{' '}
                      <span style={{ fontWeight: 700 }}>{formatted}{p.suffix || ''}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Sub-exercises for trainee */}
        {isContainer && subExercises.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-2 mb-3 space-y-1">
            {subExercises.map((sub, i) => (
              <div key={sub.id || i} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-[#FF6F20] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span className="font-bold text-gray-800 text-xs">{sub.exercise_name || sub.name || "תת-תרגיל"}</span>
              </div>
            ))}
          </div>
        )}

        {/* Complete button */}
        <div className="flex items-center justify-end">
          <button onClick={handleToggleComplete}
            className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
              exercise.completed ? "bg-green-500 border-green-500" : "bg-white border-gray-300"}`}>
            {exercise.completed && <Check size={16} className="text-white" strokeWidth={3} />}
          </button>
        </div>

        {/* Coach notes — single channel: description / notes /
            coach_notes (whichever the row carries). 💡 prefix flags
            the card as guidance vs raw params. */}
        {notes && (
          <div style={{
            marginTop: 8, padding: 12,
            background: '#FFF9F0',
            borderRadius: 10,
            fontSize: 13,
            color: '#555',
            lineHeight: 1.6,
          }}>
            💡 {notes}
          </div>
        )}
      </div>
    </motion.div>
  );
}
