import React, { useState, useEffect } from "react";
import { ChevronDown, Plus, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { bulkUpsertProgress } from "@/lib/traineeProgressApi";
import ExerciseCard from "./ExerciseCard";
import SectionRatingPopup from "./SectionRatingPopup";
import { getSectionType } from "@/lib/sectionTypes";
import { getSectionColor } from "@/lib/plansApi";
import { useLongPress } from "@/lib/useLongPress";

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
  onRenameSection,
  onRenameExercise,
  setLogs = {},
  onSetLogChange,
  onSetToggleDone,
  showEditButtons = false,
  isCoach = false,
  plan,
  traineeProgressByExercise = {},
}) {
  const [expanded, setExpanded] = useState(!showEditButtons);
  const [showRating, setShowRating] = useState(false);
  const [sectionRated, setSectionRated] = useState(false);
  const [renamingSection, setRenamingSection] = useState(false);
  const longPressRename = useLongPress(() => {
    if (showEditButtons && onRenameSection) setRenamingSection(true);
  });

  // Local mirror of the section coach-notes textarea — keeps typing
  // responsive without writing to Supabase on every keystroke. Saved
  // on blur via supabase.update against training_sections. Re-syncs
  // whenever the parent passes a new section row in.
  const [coachNotes, setCoachNotes] = useState(section?.coach_notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  useEffect(() => {
    setCoachNotes(section?.coach_notes || "");
  }, [section?.id, section?.coach_notes]);

  const saveSectionNotes = async (next) => {
    if (!section?.id) return;
    if ((next || "") === (section?.coach_notes || "")) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('training_sections')
        .update({ coach_notes: next || null })
        .eq('id', section.id);
      if (error) {
        console.warn('[SectionCard] coach_notes save failed:', error.message);
        toast.error('שמירת הערה נכשלה');
      }
    } catch (e) {
      console.warn('[SectionCard] coach_notes threw:', e?.message);
    } finally {
      setSavingNotes(false);
    }
  };

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
  // ALWAYS index-based — section.color from the DB is intentionally
  // ignored so a plan's color rhythm stays uniform regardless of
  // any legacy color override that might have been written to the
  // row. Returns a flat hex string (with optional alpha suffix).
  const sectionColor = getSectionColor(index);
  const isTraineeView = !showEditButtons;
  const style = isTraineeView
    ? {
        bg: '#FFFEFC',
        text: sectionColor,
        subText: sectionColor,
        border: sectionColor,
        iconBg: '#FFFFFF',
        chevron: sectionColor,
        accent: sectionColor,
      }
    : {
        bg: '#FFFFFF',
        text: '#111827',
        subText: '#6B7280',
        border: '#E5E7EB',
        iconBg: sType.bgColor,
        chevron: '#9CA3AF',
        accent: sectionColor,
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
            borderRight: `3px solid ${style.accent}`,
          }}
    >
      <div
        className="w-full p-4 cursor-pointer transition-colors hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
              style={{ backgroundColor: style.iconBg }}
            >
              {section.icon || '📌'}
            </div>
            <div className="flex-1 min-w-0">
              {renamingSection ? (
                <input
                  autoFocus
                  defaultValue={section.section_name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    setRenamingSection(false);
                    if (next && next !== section.section_name) {
                      onRenameSection?.(section.id, next);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.target.blur();
                    if (e.key === 'Escape') {
                      e.target.value = section.section_name;
                      e.target.blur();
                    }
                  }}
                  style={{
                    fontSize: isTraineeView ? 22 : 18,
                    fontWeight: 700,
                    color: '#1a1a1a',
                    fontFamily: 'Barlow, sans-serif',
                    border: 'none',
                    borderBottom: '2px solid #FF6F20',
                    background: 'transparent',
                    outline: 'none',
                    width: '100%',
                    padding: '2px 0',
                    direction: 'rtl',
                  }}
                />
              ) : (
                <h3
                  {...(showEditButtons ? longPressRename : {})}
                  className="leading-tight truncate"
                  style={{
                    fontSize: isTraineeView ? 22 : 18,
                    fontWeight: 700,
                    color: isTraineeView ? '#1a1a1a' : style.text,
                    fontFamily: 'Barlow, sans-serif',
                    cursor: showEditButtons ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                >
                  {section.section_name}
                </h3>
              )}
              {/* Subtitle: only the exercise count + a "הושלם" tag
                  when relevant. The category text was dropped because
                  coaches often name sections after their category,
                  which made the line read as a duplicate of the title.
                  Count restyled to 15px / 700 / brand orange so the
                  number reads at a glance. */}
              <div
                style={{
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                <span style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#FF6F20',
                  fontFamily: 'Barlow Condensed, sans-serif',
                }}>
                  {exercises.length} תרגילים
                </span>
                {section.completed && (
                  <span className="text-green-500 font-bold" style={{ fontSize: 12 }}>
                    הושלם
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-1 flex-shrink-0">
            {showEditButtons && (
              <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                {onMoveSection && (
                  <>
                    <Button onClick={() => onMoveSection(-1)} disabled={isFirstSection} size="icon" variant="ghost" title="העלה סקשן" className="h-7 w-7 rounded-full hover:bg-gray-100 disabled:opacity-30" style={{ color: style.subText }}>↑</Button>
                    <Button onClick={() => onMoveSection(1)} disabled={isLastSection} size="icon" variant="ghost" title="הורד סקשן" className="h-7 w-7 rounded-full hover:bg-gray-100 disabled:opacity-30" style={{ color: style.subText }}>↓</Button>
                  </>
                )}
                <Button onClick={() => onEditSection(section)} size="icon" variant="ghost" className="h-7 w-7 rounded-full hover:bg-gray-100" style={{ color: style.subText }}><Edit2 size={14} /></Button>
                {onDuplicateSection && (
                  <Button onClick={() => onDuplicateSection(section)} size="icon" variant="ghost" title="שכפל סקשן" className="h-7 w-7 rounded-full hover:bg-gray-100 text-sm leading-none" style={{ color: style.subText }}>📋</Button>
                )}
                <Button onClick={() => onDeleteSection(section.id)} size="icon" variant="ghost" className="h-7 w-7 rounded-full hover:bg-red-50 hover:text-red-500" style={{ color: style.subText }}><Trash2 size={14} /></Button>
              </div>
            )}
            <div className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} style={{ color: style.chevron }}>
              <ChevronDown size={24} />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="px-3 pb-4 pt-3 bg-white border-t" style={{ borderColor: style.border }}>

              {/* Coach notes — coach-edit mode only. Lives ABOVE the
                  exercise list so the rationale/dגשים for the section
                  reads first, before the prescribed exercises. Saves
                  on blur to training_sections.coach_notes; local state
                  keeps typing snappy. */}
              {showEditButtons && (
                <div style={{
                  paddingBottom: 12,
                  marginBottom: 12,
                  borderBottom: '1px solid #F0E4D0',
                }}>
                  <div style={{
                    fontSize: 12, color: '#888',
                    marginBottom: 6, fontWeight: 600,
                    direction: 'rtl', textAlign: 'right',
                  }}>
                    💬 הערת מאמן לסקשן
                    {savingNotes && (
                      <span style={{ marginRight: 8, fontSize: 11, color: '#FF6F20' }}>
                        שומר...
                      </span>
                    )}
                  </div>
                  <textarea
                    value={coachNotes}
                    onChange={(e) => setCoachNotes(e.target.value)}
                    onBlur={(e) => saveSectionNotes(e.target.value)}
                    placeholder="הוסף הערה לסקשן זה..."
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #F0E4D0',
                      borderRadius: 8,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      direction: 'rtl',
                      resize: 'none',
                      boxSizing: 'border-box',
                      background: '#FAFAFA',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {exercises.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200 mb-3">
                  אין תרגילים בסקשן זה
                </div>
              ) : (
                <div className="space-y-3 mb-4">
                  {exercises.filter(Boolean).map((exercise) => (
                    <ExerciseCard
                      key={exercise.id || Math.random()}
                      exercise={exercise}
                      onToggleComplete={onToggleComplete}
                      onEdit={() => onEditExercise(exercise)}
                      onDelete={() => onDeleteExercise(exercise.id)}
                      onRename={onRenameExercise}
                      canEdit={showEditButtons}
                      isCoach={isCoach}
                      plan={plan}
                      traineeProgress={traineeProgressByExercise[exercise.id]}
                      setLog={setLogs[exercise.id]}
                      onSetLogChange={onSetLogChange}
                      onSetToggleDone={onSetToggleDone}
                    />
                  ))}
                </div>
              )}
              {onAddExercise && showEditButtons && (
                <div className="pt-3 border-t border-gray-100">
                  <Button onClick={onAddExercise} variant="ghost" className="w-full h-12 border border-dashed border-gray-300 rounded-xl text-gray-500 hover:text-[#FF6F20] hover:border-[#FF6F20] hover:bg-orange-50 transition-all text-sm font-bold">
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
          onSubmit={async (challenge, control, note) => {
            try {
              const sectionExercises = (exercises || []).filter(e => e && e.training_section_id === section.id);
              const traineeId = (await base44.auth.me())?.id || null;
              const planId = plan?.id || null;
              await Promise.all(
                sectionExercises.map(ex =>
                  base44.entities.Exercise.update(ex.id, {
                    control_rating: control,
                    difficulty_rating: challenge,
                  })
                )
              );
              if (note && traineeId) {
                await bulkUpsertProgress(
                  sectionExercises.map(ex => ({
                    trainee_id: traineeId,
                    exercise_id: ex.id,
                    plan_id: planId,
                    feedback: note,
                  }))
                );
              }
              toast.success('הדירוג נשמר');
            } catch (err) {
              console.warn('[SectionCard] rating save failed:', err?.message);
              toast.error('שגיאה בשמירה, נסה שוב');
            } finally {
              setSectionRated(true);
              setShowRating(false);
            }
          }}
        />
      )}
    </div>
  );
}
