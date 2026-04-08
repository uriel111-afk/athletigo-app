import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Check, Edit2, Info, ChevronDown, Trash2,
  Dumbbell, Clock, Repeat, RotateCcw, Scale, Activity,
  PauseCircle, Layers, Settings,
  Maximize2, AlignLeft, Video, Zap, GitMerge,
  User, Footprints, GripVertical
} from "lucide-react";
import { notifyExerciseCompleted } from "@/functions/notificationTriggers";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  sectionColor = '#FF6F20', 
  plan 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const queryClient = useQueryClient();

  if (!exercise) return null;

  // ... Handlers ...
  const handleToggleComplete = async (e) => {
    e.stopPropagation();
    if (onToggleComplete) onToggleComplete(exercise);
    
    if (!isCoach && !exercise.completed && plan?.created_by) {
      try {
        const currentUser = await base44.auth.me();
        if (currentUser && currentUser.id) {
          await notifyExerciseCompleted({
            coachId: plan.created_by,
            traineeName: currentUser.full_name,
            traineeId: currentUser.id,
            exerciseName: exercise.exercise_name
          });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      } catch (error) {
        console.error('[ExerciseCard] Error notifying coach:', error);
      }
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete();
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    if (onEdit) onEdit();
    else if (onRowClick) onRowClick();
  };

  // ... Formatters ...
  const formatTime = (val) => {
    if (!val) return null;
    if (typeof val === 'string' && val.includes(':')) return val;
    const seconds = parseInt(val);
    if (isNaN(seconds)) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getModeIcon = () => {
    const mode = exercise.mode;
    if (mode === "חזרות") return Dumbbell;
    if (mode === "זמן") return Clock;
    if (mode === "טבטה") return Zap;
    if (mode === "קומבו") return GitMerge;
    if (mode === "סופרסט") return Layers;
    if (mode === "מותאם אישי") return Settings;
    return Activity;
  };
  const ModeIcon = getModeIcon();

  const getBorderColor = () => {
    if (exercise.completed) return '#4CAF50';
    const cycle = index % 3;
    if (cycle === 0) return 'rgba(255, 111, 32, 0.4)';
    if (cycle === 1) return '#E5E7EB';
    return '#D1D5DB';
  };
  const borderColor = getBorderColor();

  // Prepare display values (supporting Tabata's first block for chips)
  const displayExercise = { ...exercise };
  if (['טבטה', 'Tabata'].includes(exercise.mode)) {
      let blocks = [];
      if (exercise.tabataData) {
          try { blocks = JSON.parse(exercise.tabataData).blocks || []; } catch(e) {}
      } 
      
      if (blocks.length === 0 && exercise.tabata_blocks && Array.isArray(exercise.tabata_blocks)) {
          blocks = exercise.tabata_blocks;
      }
      
      if (blocks.length > 0) {
          const b = blocks[0];
          // Map first block stats to root fields for the chips to render
          displayExercise.work_time = b.work_time;
          displayExercise.rest_time = b.rest_time;
          displayExercise.rounds = b.rounds;
          displayExercise.sets = b.sets;
          // IMPORTANT: Map tabata-specific keys to generic keys used by MetricItem
          displayExercise.rest_between_sets = b.rest_between_rounds; 
          // (Since 'tabata_rest_between_sets' is checked in the JSX, but 'rest_between_sets' is more generic)
          displayExercise.tabata_rest_between_sets = b.rest_between_rounds;
      } else {
          // Fallback if no blocks but legacy data exists
          if (!displayExercise.rounds) displayExercise.rounds = displayExercise.tabata_rounds;
          if (!displayExercise.sets) displayExercise.sets = displayExercise.tabata_sets;
          if (!displayExercise.rest_between_sets) displayExercise.rest_between_sets = displayExercise.tabata_rest_between_sets;
      }
  }

  // Helper to generate Tabata preview on the fly if missing (fallback for existing data)
  const getTabataPreview = () => {
    if (exercise.tabataPreview) return exercise.tabataPreview;
    
    // Try to parse from tabataData or tabata_blocks
    let blocks = [];
    if (exercise.tabataData) {
       try { blocks = JSON.parse(exercise.tabataData).blocks || []; } catch(e) {}
    } 
    
    if (blocks.length === 0 && exercise.tabata_blocks && Array.isArray(exercise.tabata_blocks)) {
       blocks = exercise.tabata_blocks;
    }

    if (blocks.length > 0) {
        if (blocks.length === 1) {
            const b = blocks[0];
            const items = (b.block_exercises || b.items || []);
            const displayEx = items.slice(0, 3).map(ex => ex.name || ex).join(" • ") + (items.length > 3 ? ` (+${items.length - 3})` : "");
            return `עבודה: ${b.work_time}ש׳ | מנוחה: ${b.rest_time}ש׳ | סבבים: ${b.rounds} | בין סבבים: ${b.rest_between_rounds}ש׳ | סטים: ${b.sets}\nתרגילים: ${displayEx}`;
        }
        // Multiple blocks
        let summary = blocks.slice(0, 2).map((b, idx) => {
            const name = b.name || `בלוק ${idx + 1}`;
            const items = (b.block_exercises || b.items || []);
            const exList = items.slice(0, 3).map(ex => ex.name || ex).join(" • ");
            const remaining = items.length > 3 ? "…" : "";
            return `${name}: עבודה ${b.work_time}ש׳/מנוחה ${b.rest_time}ש׳ | סבבים ${b.rounds} | סטים ${b.sets} | ${exList}${remaining}`;
        }).join("\n");
        if (blocks.length > 2) summary += "\n…";
        return summary;
    }
    
    // Fallback: Flat legacy fields
    if (['טבטה', 'Tabata'].includes(exercise.mode) && (exercise.work_time || exercise.rest_time)) {
        const items = exercise.tabata_exercises || [];
        const displayEx = items.slice(0, 3).map(ex => ex.name).join(" • ") + (items.length > 3 ? "…" : "");
        const work = exercise.work_time || 0;
        const rest = exercise.rest_time || 0;
        const rounds = exercise.rounds || 8;
        const sets = exercise.sets || exercise.tabata_sets || 1;
        const between = exercise.rest_between_rounds || exercise.tabata_rest_between_sets || 60;
        
        return `עבודה: ${work}ש׳ | מנוחה: ${rest}ש׳ | סבבים: ${rounds} | בין סבבים: ${between}ש׳ | סטים: ${sets}\nתרגילים: ${displayEx}`;
    }

    return exercise.tabataSummaryClosed || "לא הוגדרו ערכי טבטה";
  };

  const subExercises = 
    (exercise.tabata_exercises && exercise.tabata_exercises.length > 0) ? exercise.tabata_exercises :
    (exercise.combo_exercises && exercise.combo_exercises.length > 0) ? exercise.combo_exercises :
    (exercise.superset_exercises && exercise.superset_exercises.length > 0) ? exercise.superset_exercises :
    (exercise.exercises && exercise.exercises.length > 0) ? exercise.exercises : 
    null;

  const MetricItem = ({ icon: Icon, label, value, subLabel }) => {
    if (!value || value === '0' || value === '00:00') return null;
    return (
      <div className="flex flex-col items-center justify-center p-3 bg-gray-50 rounded-xl border border-gray-100 text-center h-full">
        <Icon className="w-4 h-4 text-gray-400 mb-1" />
        <span className="text-base font-black text-gray-900 leading-none">{value}</span>
        <span className="text-[10px] font-bold text-gray-500 mt-1 uppercase">{label}</span>
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

  return (
    <motion.div 
      layout
      className="w-full rounded-[14px] mb-3 overflow-hidden transition-all"
      style={{ 
        backgroundColor: '#F7F6F3',
        border: '1.5px solid #ede9e3',
        borderRight: `3px solid ${exercise.completed ? '#4CAF50' : '#FF6F20'}`
      }}
    >
      {/* Exercise Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-black text-gray-900 leading-snug" style={{ fontFamily: 'Barlow, sans-serif' }}>
            {exercise.exercise_name}
          </h3>
          {exercise.rpe && (
            <div className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-bold">
              RPE {exercise.rpe}
            </div>
          )}
        </div>

        {/* Parameters Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {displayExercise.sets && (
            <div className="bg-white px-3 py-2 rounded-full border border-gray-200">
              <span className="text-[16px] font-black text-gray-900" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {displayExercise.sets}
              </span>
              <span className="text-xs text-gray-500 ml-1">סטים</span>
            </div>
          )}
          {displayExercise.reps_or_time && (
            <div className="bg-white px-3 py-2 rounded-full border border-gray-200">
              <span className="text-[16px] font-black text-gray-900" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {displayExercise.reps_or_time}
              </span>
              <span className="text-xs text-gray-500 ml-1">חזרות</span>
            </div>
          )}
          {displayExercise.weight && displayExercise.weight !== '0' && (
            <div className="bg-white px-3 py-2 rounded-full border border-gray-200">
              <span className="text-[16px] font-black text-gray-900" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {displayExercise.weight}
              </span>
              <span className="text-xs text-gray-500 ml-1">ק"ג</span>
            </div>
          )}
          {displayExercise.work_time && (
            <div className="bg-white px-3 py-2 rounded-full border border-gray-200">
              <span className="text-[16px] font-black text-gray-900" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {formatTime(displayExercise.work_time)}
              </span>
              <span className="text-xs text-gray-500 ml-1">עבודה</span>
            </div>
          )}
        </div>

        {/* Counter Row */}
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
              exercise.completed ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
            }`}
          >
            {exercise.completed && <Check size={16} className="text-white" strokeWidth={3} />}
          </button>
        </div>

        {/* Coach Note */}
        {(exercise.coach_notes || exercise.notes) && (
          <div className="bg-white p-3 rounded-lg border-r-4 border-orange-400">
            <p className="text-sm text-gray-700 leading-relaxed">
              {exercise.coach_notes || exercise.notes}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
