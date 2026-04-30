import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Plus, Edit2, Trash2, Dumbbell, Target, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import ExerciseCard from "./ExerciseCard";
import SectionRatingPopup from "./SectionRatingPopup";
import { getSectionType } from "@/lib/sectionTypes";
import { getSectionColor } from "@/lib/plansApi";

export default function SectionCard({
  section,
  exercises = [],
  index = 0,
  onToggleComplete, 
  onEditExercise, 
  onAddExercise, 
  onEditSection,
  onDeleteSection,
  onDuplicateSection,
  onMoveSection,
  isFirstSection = false,
  isLastSection = false,
  onMoveExercise,
  onDuplicateExercise,
  onDeleteExercise,
  onOpenExecution,
  showEditButtons = false,
  isCoach = false,
  plan
}) {
  const [expanded, setExpanded] = useState(!showEditButtons);
  const [showRating, setShowRating] = useState(false);
  const [sectionRated, setSectionRated] = useState(false);

  const completedCount = exercises.filter(e => e && e.completed).length;
  const totalCount = exercises.length;

  // Auto-open the rating popup the moment all exercises in the section
  // flip to completed. Trainee-view only — coaches editing the plan
  // shouldn't see the rating modal. sectionRated guards a re-open if
  // the trainee toggles one off and back on within the same session.
  useEffect(() => {
    if (showEditButtons) return;
    if (!exercises || exercises.length === 0) return;
    const allDone = exercises.every(ex => ex && ex.completed);
    if (allDone && !showRating && !sectionRated) {
      setShowRating(true);
    }
  }, [exercises, showEditButtons, showRating, sectionRated]);

  if (!section) return null;

  const sType = getSectionType(section.category);
  // Trainee view: palette-by-order via getSectionColor(index). DB
  // section.color (when set) overrides for an explicit per-section
  // hue. Coach view keeps sectionType-driven colours so warmup vs
  // strength stay visually intent-coded for editing.
  const traineePalette = getSectionColor(index);
  const isTraineeView = !showEditButtons;
  const style = isTraineeView
    ? {
        bg:      section.color ? '#FFFEFC' : traineePalette.bg,
        text:    section.color || traineePalette.text,
        subText: section.color || traineePalette.text,
        border:  section.color || traineePalette.border,
        iconBg:  '#FFFFFF',
        chevron: section.color || traineePalette.text,
        accent:  section.color || traineePalette.border,
      }
    : {
        bg:      '#FFFFFF',
        text:    '#111827',
        subText: '#6B7280',
        border:  '#E5E7EB',
        iconBg:  sType.bgColor,
        chevron: '#9CA3AF',
        accent:  sType.color,
      };

  return (
    <div
      className={isTraineeView ? "overflow-hidden transition-all relative" : "rounded-3xl overflow-hidden transition-all shadow-sm hover:shadow-md mb-5 relative"}
      style={isTraineeView
        ? {
            backgroundColor: style.bg,
            borderRadius: 14,
            marginBottom: 10,
            borderRight: `4px solid ${style.accent}`,
          }
        : {
            backgroundColor: style.bg,
            border: `1px solid ${style.border}`,
            borderLeft: `3px solid ${style.accent}`,
          }}
    >
      {/* Section Header (Clickable) */}
      <div 
        className="w-full p-4 cursor-pointer transition-colors hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          
          {/* Left Side: Icon + Title */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
              style={{ backgroundColor: style.iconBg }}
            >
              {section.icon || '📌'}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-black leading-tight truncate" style={{ color: style.text, fontFamily: 'Barlow, sans-serif' }}>
                {section.section_name}
              </h3>
              <div className="flex items-center gap-2 mt-1 text-xs font-medium" style={{ color: style.subText }}>
                <span>{section.category || 'כללי'}</span>
                <span className="opacity-50">•</span>
                <span>{exercises.length} תרגילים</span>
                {section.completed && (
                  <>
                    <span className="opacity-50">•</span>
                    <span className="text-green-500 font-bold">הושלם</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Side: Actions */}
          <div className="flex items-center gap-3 pl-1 flex-shrink-0">
            {/* Edit Buttons (Coach only) */}
            {showEditButtons && (
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                {onMoveSection && (
                  <>
                    <Button
                      onClick={() => onMoveSection(-1)}
                      disabled={isFirstSection}
                      size="icon"
                      variant="ghost"
                      title="העלה סקשן"
                      className="h-8 w-8 rounded-full hover:bg-gray-100 disabled:opacity-30"
                      style={{ color: style.subText }}
                    >
                      ↑
                    </Button>
                    <Button
                      onClick={() => onMoveSection(1)}
                      disabled={isLastSection}
                      size="icon"
                      variant="ghost"
                      title="הורד סקשן"
                      className="h-8 w-8 rounded-full hover:bg-gray-100 disabled:opacity-30"
                      style={{ color: style.subText }}
                    >
                      ↓
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => onEditSection(section)}
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-gray-100"
                  style={{ color: style.subText }}
                >
                  <Edit2 size={16} />
                </Button>
                {onDuplicateSection && (
                  <Button
                    onClick={() => onDuplicateSection(section)}
                    size="icon"
                    variant="ghost"
                    title="שכפל סקשן"
                    className="h-8 w-8 rounded-full hover:bg-gray-100 text-base leading-none"
                    style={{ color: style.subText }}
                  >
                    📋
                  </Button>
                )}
                <Button
                  onClick={() => onDeleteSection(section.id)}
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-red-50 hover:text-red-500"
                  style={{ color: style.subText }}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            )}

            {/* Chevron */}
            <div 
              className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
              style={{ color: style.chevron }}
            >
              <ChevronDown size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Exercises List (Collapsible) */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 pb-4 pt-3 bg-white border-t" style={{ borderColor: style.border }}>
              
              {exercises.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200 mb-3">
                  אין תרגילים בסקשן זה
                </div>
              ) : (
                <div className="space-y-3 mb-4">
                  {exercises.filter(Boolean).map((exercise, idx, arr) => (
                    <ExerciseCard
                    key={exercise.id || Math.random()}
                    index={idx}
                    exercise={exercise}
                    onToggleComplete={onToggleComplete}
                    onRowClick={() => onEditExercise(exercise)}
                    onEdit={() => onEditExercise(exercise)}
                    onDelete={() => onDeleteExercise(exercise.id)}
                    onMove={onMoveExercise ? (dir) => onMoveExercise(exercise, dir) : undefined}
                    isFirst={idx === 0}
                    isLast={idx === arr.length - 1}
                    onDuplicate={onDuplicateExercise ? () => onDuplicateExercise(exercise) : undefined}
                    onOpenExecution={onOpenExecution}
                    showEditButton={showEditButtons}
                    isCoach={isCoach}
                    sectionColor={style.accent}
                    plan={plan}
                    />
                  ))}
                </div>
              )}

              {onAddExercise && showEditButtons && (
                <div className="pt-3 border-t border-gray-100">
                  <Button
                    onClick={onAddExercise}
                    variant="ghost"
                    className="w-full h-12 border border-dashed border-gray-300 rounded-xl text-gray-500 hover:text-[#FF6F20] hover:border-[#FF6F20] hover:bg-orange-50 transition-all text-sm font-bold"
                  >
                    <Plus className="w-4 h-4 ml-2" />
                    הוסף תרגיל לסקשן
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showRating && (
        <SectionRatingPopup
          sectionName={section.section_name || section.title || 'הסקשן'}
          onSubmit={(_challenge, _control, _note) => {
            // TODO: persist via planExecutionApi.submitSectionRating
            // once the parent threads workout_execution_id down.
            setSectionRated(true);
            setShowRating(false);
          }}
        />
      )}
    </div>
  );
}