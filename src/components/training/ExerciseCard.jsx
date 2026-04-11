import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Check, Edit2, Trash2, Zap, GitMerge, Layers, Settings,
  Clock, Dumbbell, Activity
} from "lucide-react";
import { notifyExerciseCompleted } from "@/functions/notificationTriggers";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Format a time value (MM:SS string OR raw seconds number/string) to display */
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
 * Build an ordered list of summary "chips" from an exercise object.
 * Each chip is a short Hebrew string like "3 סטים", "10 חזרות", "RPE 7", etc.
 */
const buildChips = (ex) => {
  const chips = [];
  const push = (s) => { if (s) chips.push(s); };

  // Core metrics (always first)
  if (ex.sets && ex.sets !== "0") push(`${ex.sets} סטים`);
  if (ex.reps && ex.reps !== "0") push(`${ex.reps} חזרות`);
  if (ex.rounds && ex.rounds !== "0") push(`${ex.rounds} סבבים`);

  const wt = fmtTime(ex.work_time);
  if (wt) push(`עבודה: ${wt}`);
  const rt = fmtTime(ex.rest_time);
  if (rt) push(`מנוחה: ${rt}`);

  // Weight
  if (ex.weight && ex.weight !== "0") push(`${ex.weight} ק"ג`);
  if (ex.weight_type && ex.weight_type !== "bodyweight") push(ex.weight_type);

  // RPE
  if (ex.rpe && ex.rpe !== "0") push(`RPE ${ex.rpe}`);

  // Tempo
  if (ex.tempo) push(`טמפו: ${ex.tempo}`);

  // Mode-specific
  if (ex.superset_rounds && ex.superset_rounds !== "0") push(`${ex.superset_rounds} סבבים (סופרסט)`);
  if (ex.combo_sets && ex.combo_sets !== "0") push(`${ex.combo_sets} סטים (קומבו)`);

  return chips;
};

const getModeIcon = (mode) => {
  if (mode === "זמן") return Clock;
  if (mode === "טבטה") return Zap;
  if (mode === "קומבו") return GitMerge;
  if (mode === "סופרסט") return Layers;
  if (mode === "מותאם אישי") return Settings;
  return Dumbbell;
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ExerciseCard({
  exercise,
  index = 0,
  onToggleComplete,
  onRowClick,
  onEdit,
  onDelete,
  onOpenExecution,
  showEditButton = false,
  isCoach = false,
  sectionColor = "#FF6F20",
  plan,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const queryClient = useQueryClient();

  if (!exercise) return null;

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleToggleComplete = async (e) => {
    e.stopPropagation();
    if (onToggleComplete) onToggleComplete(exercise);
    if (!isCoach && !exercise.completed && plan?.created_by) {
      try {
        const currentUser = await base44.auth.me();
        if (currentUser?.id) {
          await notifyExerciseCompleted({
            coachId: plan.created_by,
            traineeName: currentUser.full_name,
            traineeId: currentUser.id,
            exerciseName: exercise.exercise_name,
          });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      } catch {}
    }
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    if (onEdit) onEdit();
    else if (onRowClick) onRowClick();
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete();
  };

  // ── Display values ───────────────────────────────────────────────────────
  const ModeIcon = getModeIcon(exercise.mode);
  const chips = buildChips(exercise);
  const notes = exercise.description || exercise.coach_notes || exercise.notes;
  const isTabata = ["טבטה", "Tabata"].includes(exercise.mode);
  const tabataPreview = exercise.tabata_preview || exercise.tabataPreview;

  const borderColor = exercise.completed
    ? "#4CAF50"
    : index % 3 === 0
    ? "rgba(255,111,32,0.5)"
    : "#E5E7EB";

  // ── Coach view — compact card with full parameter summary ────────────────
  if (isCoach || showEditButton) {
    return (
      <motion.div
        layout
        className="w-full rounded-2xl overflow-hidden transition-all"
        style={{
          backgroundColor: "#FAFAFA",
          border: "1.5px solid #ede9e3",
          borderRight: `3px solid ${exercise.completed ? "#4CAF50" : "#FF6F20"}`,
        }}
      >
        <div className="p-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#FFF7ED" }}
              >
                <ModeIcon size={14} className="text-[#FF6F20]" />
              </div>
              <h3 className="text-sm font-black text-gray-900 leading-tight truncate">
                {exercise.exercise_name || exercise.name || "תרגיל"}
              </h3>
            </div>

            {/* Edit + Delete */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleEdit}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:bg-orange-50 transition-colors"
                title="ערוך תרגיל"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={handleDelete}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="מחק תרגיל"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Parameter chips — show ALL filled params */}
          {isTabata && tabataPreview ? (
            <div className="text-[11px] text-gray-600 leading-relaxed bg-orange-50 rounded-lg px-2 py-1.5 border border-orange-100 whitespace-pre-line">
              {tabataPreview}
            </div>
          ) : chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip, i) => (
                <span
                  key={i}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic">אין פרמטרים</p>
          )}

          {/* Notes */}
          {notes && (
            <p className="mt-2 text-[11px] text-gray-500 leading-relaxed border-t border-gray-100 pt-1.5">
              💬 {notes}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Trainee view — full card with counter + complete button ──────────────
  return (
    <motion.div
      layout
      className="w-full rounded-[14px] mb-3 overflow-hidden transition-all"
      style={{
        backgroundColor: "#F7F6F3",
        border: "1.5px solid #ede9e3",
        borderRight: `3px solid ${exercise.completed ? "#4CAF50" : "#FF6F20"}`,
      }}
    >
      <div className="p-4">
        {/* Name + RPE */}
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-[15px] font-black text-gray-900 leading-snug"
            style={{ fontFamily: "Barlow, sans-serif" }}
          >
            {exercise.exercise_name || exercise.name}
          </h3>
          {exercise.rpe && (
            <div className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-bold">
              RPE {exercise.rpe}
            </div>
          )}
        </div>

        {/* Parameter pills */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {chips.slice(0, 4).map((chip, i) => (
              <div key={i} className="bg-white px-3 py-2 rounded-full border border-gray-200">
                <span
                  className="text-[15px] font-black text-gray-900"
                  style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                >
                  {chip.split(":")[1]?.trim() || chip.split(" ")[0]}
                </span>
                <span className="text-xs text-gray-500 mr-1">
                  {chip.includes(":") ? chip.split(":")[0].trim() : chip.split(" ").slice(1).join(" ")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Counter row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center">
              <span className="text-lg font-bold text-gray-600">-</span>
            </button>
            <span className="text-lg font-bold text-gray-900 mx-4">0</span>
            <button className="w-8 h-8 rounded-full bg-orange-500 hover:bg-orange-600 flex items-center justify-center">
              <span className="text-lg font-bold text-white">+</span>
            </button>
          </div>
          <button
            onClick={handleToggleComplete}
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
              exercise.completed
                ? "bg-green-500 border-green-500"
                : "bg-white border-gray-300"
            }`}
          >
            {exercise.completed && (
              <Check size={16} className="text-white" strokeWidth={3} />
            )}
          </button>
        </div>

        {/* Coach notes */}
        {notes && (
          <div className="bg-white p-3 rounded-lg border-r-4 border-orange-400">
            <p className="text-sm text-gray-700 leading-relaxed">{notes}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
