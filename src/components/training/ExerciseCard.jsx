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
      className={`
        w-full rounded-xl mb-3 overflow-hidden transition-all border shadow-sm hover:shadow-md
        ${exercise.completed ? 'border-green-100' : 'border-gray-100'}
      `}
      style={{ 
        borderLeft: `5px solid ${borderColor}`,
        backgroundColor: exercise.completed ? '#F0FDF4' : '#FFFFFF'
      }}
    >
      {/* === HEADER SECTION === */}
      <div 
        className="p-3 flex items-center gap-3 cursor-pointer relative touch-manipulation select-none"
        onClick={(e) => {
          if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
          setIsExpanded(!isExpanded);
        }}
      >
        <button
          onClick={handleToggleComplete}
          className={`
            mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 z-10 relative
            ${exercise.completed ? 'bg-green-500 border-green-500' : 'bg-white border-gray-200 hover:border-gray-300'}
          `}
        >
          {exercise.completed && <Check size={14} className="text-white" strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className={`
              text-lg font-bold text-gray-900 leading-snug break-words whitespace-normal
              ${exercise.completed ? 'line-through text-gray-400' : ''}
            `}>
              {exercise.exercise_name}
            </h3>
            <div className="text-gray-300 pt-1 flex-shrink-0">
               <ModeIcon size={18} />
            </div>
          </div>

          <div className={`text-xs leading-relaxed mt-1 space-y-1 ${exercise.completed ? 'text-gray-300' : 'text-gray-600'}`}>

            {/* Standard Summary (Chips) */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
                {(displayExercise.sets || displayExercise.tabata_sets || displayExercise.combo_sets) && (
                  <div className="flex items-center gap-1" title="סטים">
                     <Layers size={10} /> <span>{displayExercise.sets || displayExercise.tabata_sets || displayExercise.combo_sets}</span>
                  </div>
                )}
                {displayExercise.reps_or_time && (
                  <div className="flex items-center gap-1" title="חזרות/זמן">
                     <Repeat size={10} /> <span>{displayExercise.reps_or_time}</span>
                  </div>
                )}
                {displayExercise.weight && displayExercise.weight !== '0' && (
                  <div className="flex items-center gap-1" title="משקל">
                     <Scale size={10} /> <span>{displayExercise.weight} ק"ג</span>
                  </div>
                )}
                {displayExercise.work_time && (
                  <div className="flex items-center gap-1" title="זמן עבודה">
                     <Activity size={10} /> <span>{formatTime(displayExercise.work_time)}</span>
                  </div>
                )}
                {(displayExercise.rest_time || displayExercise.tabata_rest) && (
                  <div className="flex items-center gap-1" title="מנוחה">
                     <Clock size={10} /> <span>{formatTime(displayExercise.rest_time || displayExercise.tabata_rest)}</span>
                  </div>
                )}
                {(displayExercise.rounds || displayExercise.superset_rounds) && (
                   <div className="flex items-center gap-1" title="סבבים">
                      <RotateCcw size={10} /> <span>{displayExercise.rounds || displayExercise.superset_rounds}</span>
                   </div>
                )}
                {displayExercise.static_hold_time && (
                   <div className="flex items-center gap-1" title="החזקה סטטית">
                      <PauseCircle size={10} /> <span>{formatTime(displayExercise.static_hold_time)}</span>
                   </div>
                )}
                {displayExercise.tempo && <span>• טמפו: {displayExercise.tempo}</span>}
                {displayExercise.rpe && <span>• RPE: {displayExercise.rpe}</span>}
                {displayExercise.side && <span>• צד: {displayExercise.side}</span>}
                {displayExercise.weight_type && displayExercise.weight_type !== 'bodyweight' && !displayExercise.weight && (
                   <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                      {displayExercise.weight_type}
                   </span>
                )}
                {(displayExercise.rest_between_exercises || displayExercise.tabata_rest_between_exercises) && 
                    <span>• מנ' בין תרגילים: {formatTime(displayExercise.rest_between_exercises || displayExercise.tabata_rest_between_exercises)}</span>}
                {(displayExercise.rest_between_sets || displayExercise.tabata_rest_between_sets || displayExercise.combo_rest_between_sets || displayExercise.superset_rest_between_rounds) && 
                    <span>• מנ' בין סטים: {formatTime(displayExercise.rest_between_sets || displayExercise.tabata_rest_between_sets || displayExercise.combo_rest_between_sets || displayExercise.superset_rest_between_rounds)}</span>}
            </div>

            {/* Tabata Summary (Collapsed View) */}
            {['טבטה', 'Tabata'].includes(exercise.mode) && (
               <div className="mt-1.5 p-2 bg-orange-50/60 rounded-lg border border-orange-100/50">
                  <p className="text-xs text-gray-800 font-medium leading-relaxed whitespace-pre-line">
                     {getTabataPreview()}
                  </p>
               </div>
            )}

            {/* Non-Tabata Sub-Exercises */}
            {exercise.mode !== 'טבטה' && subExercises && subExercises.length > 0 && (
              <div className="mt-1.5 p-1.5 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-[10px] text-gray-500">
                      רשימת תרגילים ({subExercises.length} פריטים):
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowListModal(true);
                    }}
                  >
                    פתח רשימה <Maximize2 className="w-3 h-3 mr-1" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {subExercises.slice(0, 3).map((sub, i) => (
                      <span key={i} className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                        {sub.name} 
                        <span className="font-bold text-gray-900">
                            {(sub.valueType === 'time' || sub.measurement === 'time') ? formatTime(sub.value) : sub.value}
                        </span>
                      </span>
                    ))}
                    {subExercises.length > 3 && <span className="text-[10px] text-gray-400">+{subExercises.length - 3} נוספים...</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-gray-300">
           <ChevronDown size={20} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* === EXPANDED CONTENT === */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-50 bg-white"
          >
            <div className="p-4 space-y-5">
              
              {exercise.description && (
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <p className="text-sm text-blue-800 leading-relaxed">{exercise.description}</p>
                </div>
              )}

              {/* Dynamic Parameters Rendering */}
              {(() => {
                const data = [];
                const push = (label, value, icon, isWide = false) => {
                    if (value && value !== '0' && value !== '00:00' && value !== '00') {
                        data.push({ label, value, icon, isWide });
                    }
                };

                // Metrics
                push("סטים", exercise.sets || exercise.tabata_sets || exercise.combo_sets || exercise.superset_sets, Layers);
                push(exercise.mode === 'זמן' ? "זמן" : "חזרות", exercise.reps_or_time, exercise.mode === 'זמן' ? Clock : Repeat);
                push("משקל", exercise.weight ? `${exercise.weight} ק"ג` : null, Scale);
                push("סוג עומס", (exercise.weight_type && exercise.weight_type !== 'bodyweight') ? exercise.weight_type : null, Scale);
                push("זמן עבודה", formatTime(exercise.work_time), Clock);
                push("סבבים", exercise.rounds || exercise.superset_rounds || exercise.combo_rounds, RotateCcw);
                
                // Rests
                push("מנוחה", formatTime(exercise.rest_time || exercise.tabata_rest), Activity);
                push("מנ' בין תרגילים", formatTime(exercise.rest_between_exercises || exercise.superset_rest_between_exercises || exercise.combo_rest_between_exercises), PauseCircle);
                push("מנ' בין סטים", formatTime(exercise.rest_between_sets || exercise.tabata_rest_between_sets || exercise.combo_rest_between_sets || exercise.superset_rest_between_sets || exercise.superset_rest_between_rounds), PauseCircle);
                push("החזקה סטטית", formatTime(exercise.static_hold_time), PauseCircle);
                push("טמפו", exercise.tempo, Activity);
                push("RPE", exercise.rpe, Zap);

                // Text Fields (Wide)
                push("מנח גוף", exercise.body_position, User, true);
                push("מנח רגליים", exercise.leg_position, Footprints, true);
                push("אחיזה", exercise.grip, GripVertical, true);
                push("טווח תנועה", exercise.range_of_motion, Maximize2, true);
                push("צד", exercise.side, AlignLeft, true);
                push("ציוד", exercise.equipment, Dumbbell, true);
                push("דגשים", exercise.cues, Info, true);
                push("הערות", exercise.coach_notes || exercise.notes, Info, true);

                // Custom Fields
                if (exercise.custom_fields && Array.isArray(exercise.custom_fields)) {
                    exercise.custom_fields.forEach(f => {
                        if (f.label && f.value) push(f.label, f.value, Settings, true);
                    });
                }

                const metrics = data.filter(d => !d.isWide);
                const details = data.filter(d => d.isWide);

                // --- TABATA EXPANDED RENDERER ---
                if (exercise.mode === 'טבטה') {
                   // Priority: 1. Denormalized tabataData 2. Legacy tabata_blocks
                   let blocks = [];
                   try {
                     if (exercise.tabataData) {
                       const parsed = JSON.parse(exercise.tabataData);
                       blocks = parsed.blocks || [];
                     } else {
                       blocks = exercise.tabata_blocks || [];
                     }
                   } catch (e) {
                     console.error("Failed to parse tabataData", e);
                     blocks = exercise.tabata_blocks || [];
                   }

                   return (
                      <div className="space-y-4">
                         {/* Debug Section (Temporary) */}
                         <div className="text-[10px] bg-gray-100 p-2 rounded text-gray-500 font-mono border border-dashed border-gray-300 break-all" dir="ltr">
                            <strong>RAW DATA:</strong><br/>
                            {exercise.tabataData || "No tabataData"}
                         </div>
                         
                         {blocks.length === 0 && (
                            <div className="text-center p-4 bg-gray-50 rounded text-gray-400 text-sm">
                               לא הוגדר טבטה עדיין
                            </div>
                         )}

                         {blocks.map((block, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                               {/* Block Header */}
                               <div className="bg-white p-3 border-b border-gray-100">
                                  <h4 className="text-sm font-black text-gray-900 mb-2">{block.name || `בלוק טבטה ${idx + 1}`}</h4>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                     <MetricItem icon={Clock} label="עבודה" value={`${block.work_time}ש׳`} />
                                     <MetricItem icon={PauseCircle} label="מנוחה" value={`${block.rest_time}ש׳`} />
                                     <MetricItem icon={RotateCcw} label="סבבים" value={block.rounds} />
                                     <MetricItem icon={Activity} label="בין סבבים" value={`${block.rest_between_rounds}ש׳`} />
                                     <MetricItem icon={Layers} label="סטים" value={block.sets} />
                                  </div>
                               </div>
                               
                               {block.notes && (
                                  <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 flex items-start gap-2">
                                     <Info size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                                     <p className="text-xs text-blue-800 leading-snug">{block.notes}</p>
                                  </div>
                               )}

                               <div className="p-3 space-y-1.5">
                                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">תרגילי טבטה</div>
                                  {(block.block_exercises || block.items || []).map((ex, exIdx) => (
                                     <div key={exIdx} className="flex items-center gap-2 bg-white p-2 rounded border border-gray-100">
                                        <span className="w-5 h-5 rounded-full bg-orange-100 text-[#FF6F20] text-[10px] font-bold flex items-center justify-center">{exIdx + 1}</span>
                                        <span className="text-xs font-bold text-gray-800">{ex.name || ex}</span>
                                     </div>
                                  ))}
                                  {(!block.block_exercises && !block.items) || (block.block_exercises?.length === 0 && block.items?.length === 0) && (
                                     <div className="text-xs text-gray-400 italic text-center py-2">אין תרגילים בבלוק זה</div>
                                  )}
                               </div>
                            </div>
                         ))}
                         
                         {details.length > 0 && (
                            <div className="space-y-1 mt-4 pt-4 border-t border-gray-100">
                               {details.map((d, idx) => (
                                  <DetailRow key={idx} icon={d.icon} label={d.label} value={d.value} />
                               ))}
                            </div>
                         )}
                      </div>
                   );
                }

                return (
                  <>
                    {metrics.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {metrics.map((m, idx) => (
                          <MetricItem key={idx} icon={m.icon} label={m.label} value={m.value} />
                        ))}
                      </div>
                    )}

                    {subExercises && subExercises.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase">רשימת תרגילים</h4>
                        <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                          {subExercises.map((sub, i) => (
                            <div key={i} className="p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div className="flex gap-2 items-start flex-1 min-w-0">
                                <span className="text-blue-500 font-bold text-xs mt-0.5">{i+1}.</span>
                                <span className="text-sm font-bold text-gray-800 break-words whitespace-normal leading-tight">{sub.name}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 flex-shrink-0 mt-1 sm:mt-0">
                                  {sub.weight && (
                                      <span className="text-xs bg-white text-gray-600 px-2 py-0.5 rounded border border-gray-200 font-bold flex items-center gap-1">
                                          <Scale size={10} /> {sub.weight} ק"ג
                                      </span>
                                  )}
                                  {sub.value && (
                                    <span className="text-xs bg-white text-gray-600 px-2 py-0.5 rounded border border-gray-200 font-medium flex items-center gap-1">
                                      {(sub.valueType === 'time' || sub.measurement === 'time' || sub.type === 'time') ? <Clock size={10} /> : <Repeat size={10} />}
                                      {(sub.valueType === 'time' || sub.measurement === 'time' || sub.type === 'time') ? formatTime(sub.value) : `${sub.value}`}
                                    </span>
                                  )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {details.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {details.map((d, idx) => (
                          <DetailRow key={idx} icon={d.icon} label={d.label} value={d.value} />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {exercise.video_url && (
                 <a 
                   href={exercise.video_url} 
                   target="_blank" 
                   rel="noreferrer"
                   className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition-colors shadow-sm"
                 >
                   <Video size={16} />
                   צפה בסרטון הדגמה
                 </a>
              )}

              {(exercise.actual_result || exercise.trainee_feedback || exercise.rpe) && (
                <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 mt-2">
                  <h4 className="text-xs font-bold text-orange-600 mb-2">📝 דיווח ביצוע</h4>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {exercise.actual_result && (
                      <div><span className="text-xs text-gray-500">תוצאה:</span> <span className="font-bold text-gray-900">{exercise.actual_result}</span></div>
                    )}
                    {exercise.rpe && (
                      <div><span className="text-xs text-gray-500">RPE:</span> <span className="font-bold text-gray-900">{exercise.rpe}/10</span></div>
                    )}
                  </div>
                  {exercise.trainee_feedback && (
                    <p className="text-sm text-gray-800 italic">"{exercise.trainee_feedback}"</p>
                  )}
                </div>
              )}

              {showEditButton && (
                <div className="flex gap-3 pt-2 mt-2 border-t border-gray-100">
                  <Button 
                    onClick={handleEdit} 
                    variant="outline" 
                    className="flex-1 h-9 text-xs font-bold border-gray-200 hover:bg-gray-50 text-gray-600"
                  >
                    <Edit2 size={12} className="ml-1.5" /> ערוך תרגיל
                  </Button>
                  <Button 
                    onClick={handleDelete} 
                    variant="outline" 
                    className="h-9 w-9 p-0 text-red-500 border-red-100 hover:bg-red-50 hover:border-red-200"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}

              {!isCoach && onOpenExecution && (
                <div className="pt-3 mt-2 border-t border-gray-100">
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenExecution(exercise);
                    }}
                    className="w-full h-10 font-bold shadow-md hover:shadow-lg transition-all"
                    style={{ backgroundColor: '#FF6F20', color: 'white' }}
                  >
                    <Edit2 className="w-4 h-4 ml-2" />
                    דווח ביצוע / ערוך
                  </Button>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showListModal} onOpenChange={setShowListModal}>
        <DialogContent className="w-[95vw] md:w-full max-w-lg max-h-[80vh] overflow-y-auto bg-white rounded-2xl p-0 gap-0" dir="rtl">
          <DialogHeader className="p-4 border-b border-gray-100 sticky top-0 bg-white z-50">
            <DialogTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-500" />
              רשימת תרגילים מלאה
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-4 space-y-3">
            {subExercises && subExercises.map((sub, i) => (
              <div key={i} className="p-3 flex justify-between items-center bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="text-sm font-bold text-gray-800 break-words whitespace-normal">{sub.name}</span>
                </div>
                <div className="text-xs font-medium text-gray-600 flex gap-2 flex-shrink-0">
                  {(sub.measurement === 'time' || sub.type === 'time') ? formatTime(sub.value) : `${sub.value} חזרות`}
                  {sub.weight && <span className="text-gray-400">|</span>}
                  {sub.weight && <span>{sub.weight} ק"ג</span>}
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-4 border-t border-gray-100 bg-gray-50 sticky bottom-0 z-50">
            <Button 
              className="w-full font-bold h-12 rounded-xl" 
              onClick={() => setShowListModal(false)}
            >
              סגור
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}