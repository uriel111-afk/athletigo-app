import React, { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Edit2, Trash2, Dumbbell, Target, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import ExerciseCard from "./ExerciseCard";

export default function SectionCard({ 
  section, 
  exercises, 
  index = 0,
  onToggleComplete, 
  onEditExercise, 
  onAddExercise, 
  onEditSection, 
  onDeleteSection, 
  onDeleteExercise, 
  onOpenExecution,
  showEditButtons = false, 
  isCoach = false, 
  plan 
}) {
  const [expanded, setExpanded] = useState(false);

  const completedCount = exercises.filter(e => e && e.completed).length;
  const totalCount = exercises.length;
  
  // Brand Palette Cycling (Light & Clean)
  const getSectionStyle = () => {
    const isEven = index % 2 === 0;
    
    return {
      bg: '#FFFFFF',
      text: '#111827',
      subText: '#6B7280',
      border: '#E5E7EB',
      iconBg: '#FFF7ED',
      chevron: '#9CA3AF',
      accent: '#FF6F20'
    };
  };

  if (!section) return null;
  const style = getSectionStyle();

  return (
    <div
      className="rounded-3xl overflow-hidden transition-all shadow-sm hover:shadow-md mb-5 relative"
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        borderLeft: `3px solid ${style.accent}`
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
                <Button
                  onClick={() => onEditSection(section)}
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-gray-100"
                  style={{ color: style.subText }}
                >
                  <Edit2 size={16} />
                </Button>
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
                  {exercises.filter(Boolean).map((exercise, idx) => (
                    <ExerciseCard
                    key={exercise.id || Math.random()} 
                    index={idx}
                    exercise={exercise}
                    onToggleComplete={onToggleComplete}
                    onRowClick={() => onEditExercise(exercise)} 
                    onEdit={() => onEditExercise(exercise)}     
                    onDelete={() => onDeleteExercise(exercise.id)} 
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
    </div>
  );
}