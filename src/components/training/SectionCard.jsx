import React, { useState, useEffect } from "react";
import { ChevronDown, Plus, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import ExerciseCard from "./ExerciseCard";
import { getSectionType } from "@/lib/sectionTypes";
import { getSectionColor } from "@/lib/plansApi";
import { useLongPress } from "@/lib/useLongPress";
import { readSectionRating } from "@/lib/workoutExecutionApi";

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
  drillSetLogs = {},
  onDrillSetToggleDone,
  sectionRating = null,
  showEditButtons = false,
  isCoach = false,
  plan,
  traineeProgressByExercise = {},
}) {
  const [expanded, setExpanded] = useState(!showEditButtons);
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

  if (!section) return null;

  const sType = getSectionType(section.category);
  // ALWAYS index-based — section.color from the DB is intentionally
  // ignored so a plan's color rhythm stays uniform regardless of
  // any legacy color override that might have been written to the
  // row. Returns a flat hex string (with optional alpha suffix).
  const sectionColor = getSectionColor(index);
  const isTraineeView = !showEditButtons;

  // ── Lined-page card (coach + trainee) ─────────────────────────────
  // Step A2: the lined-page block became the sole render path. Coach
  // gets extra controls — section-action icons on the row, an "ערוך"
  // button per exercise, and a "+ הוסף תרגיל" affordance at the bottom
  // of the expanded body — all wired to the existing handlers (same
  // ones the previous coach render used). The old coach render below
  // is no longer reachable but is left in place for safety; can be
  // removed in a follow-up once visual parity is confirmed.
  {
    const ratingObj = readSectionRating(sectionRating);
    // softTint converts a hex color (with or without an alpha suffix)
    // into a low-opacity rgba so the section row gets a faint wash of
    // the section's accent color without us hand-picking 10 pastels.
    const softTint = (hex, alpha = 0.1) => {
      if (typeof hex !== 'string') return 'rgba(255,248,239,1)';
      const base = hex.slice(0, 7);
      const r = parseInt(base.slice(1, 3), 16) || 0;
      const g = parseInt(base.slice(3, 5), 16) || 0;
      const b = parseInt(base.slice(5, 7), 16) || 0;
      return `rgba(${r},${g},${b},${alpha})`;
    };
    const accentColor = sectionColor;
    const sectionRowBg = softTint(accentColor, 0.1);
    const coachIconBtnStyle = {
      width: 28, height: 28, borderRadius: 6,
      border: 'none', background: 'transparent',
      color: '#8a7250', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 0, fontSize: 14, lineHeight: 1,
    };
    return (
      <div style={{
        background: '#FCFBF7',
        border: '0.5px solid #E5DFC9',
        borderRight: `4px solid ${accentColor}`,
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 8,
        direction: 'rtl',
      }}>
        {/* Thin white "page header" band with the brand-orange rule. */}
        <div style={{ background: '#FFFFFF', borderBottom: '3px solid #FF6F20', height: 6 }} aria-hidden />

        {/* Section row — clickable header. Bottom border only when
            collapsed; once expanded the row sits directly on top of
            the exercise list and the 2px line would create a hard
            seam against the first 1px exercise hairline. */}
        <div
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            background: sectionRowBg,
            borderBottom: expanded ? 'none' : '2px solid #E8DEC4',
            padding: '12px 36px 12px 16px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            {renamingSection && showEditButtons ? (
              <input
                autoFocus
                defaultValue={section.section_name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setRenamingSection(false);
                  if (next && next !== section.section_name && onRenameSection) {
                    onRenameSection(section.id, next);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.target.blur();
                  if (e.key === 'Escape') { e.target.value = section.section_name; e.target.blur(); }
                }}
                style={{
                  fontSize: 17, fontWeight: 500, color: '#1a1a1a',
                  fontFamily: "'Barlow', system-ui, sans-serif",
                  border: 'none',
                  borderBottom: '2px solid #FF6F20',
                  background: 'transparent',
                  outline: 'none',
                  padding: '2px 0',
                  direction: 'rtl',
                  flex: 1,
                  minWidth: 120,
                }}
              />
            ) : (
              <span
                {...(showEditButtons ? longPressRename : {})}
                style={{
                  fontSize: 17, fontWeight: 500, color: '#1a1a1a',
                  fontFamily: "'Barlow', system-ui, sans-serif",
                  lineHeight: 1.2,
                  wordBreak: 'break-word',
                }}
              >{section.section_name}</span>
            )}
            <span style={{ fontSize: 12, color: accentColor, fontWeight: 600 }}>
              · {exercises.length} תרגילים
            </span>
            {ratingObj.avg != null && (
              <span style={{
                marginInlineStart: 6,
                background: '#FFF5EE',
                border: '1px solid #FFE5D0',
                borderRadius: 999,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 700,
                color: '#FF6F20',
                whiteSpace: 'nowrap',
              }}>⭐ {Number(ratingObj.avg).toFixed(1)}/10</span>
            )}
            {section.completed && (
              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginInlineStart: 4 }}>
                הושלם
              </span>
            )}
          </div>
          {/* Coach controls — inline icon cluster reusing the existing
              SectionCard handlers (move/edit/duplicate/delete/rename).
              No new editor or backend code; each button just forwards
              to the prop already wired by UnifiedPlanBuilder. */}
          {showEditButtons && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
            >
              {onMoveSection && (
                <>
                  <button type="button" aria-label="העלה סקשן" title="העלה סקשן"
                    disabled={isFirstSection}
                    onClick={() => onMoveSection(-1)}
                    style={{ ...coachIconBtnStyle, opacity: isFirstSection ? 0.3 : 1 }}
                  >↑</button>
                  <button type="button" aria-label="הורד סקשן" title="הורד סקשן"
                    disabled={isLastSection}
                    onClick={() => onMoveSection(1)}
                    style={{ ...coachIconBtnStyle, opacity: isLastSection ? 0.3 : 1 }}
                  >↓</button>
                </>
              )}
              {onEditSection && (
                <button type="button" aria-label="ערוך סקשן" title="ערוך סקשן"
                  onClick={() => onEditSection(section)}
                  style={coachIconBtnStyle}
                ><Edit2 size={14} /></button>
              )}
              {onRenameSection && (
                <button type="button" aria-label="שנה שם סקשן" title="שנה שם סקשן"
                  onClick={() => setRenamingSection(true)}
                  style={coachIconBtnStyle}
                >✎</button>
              )}
              {onDuplicateSection && (
                <button type="button" aria-label="שכפל סקשן" title="שכפל סקשן"
                  onClick={() => onDuplicateSection(section)}
                  style={coachIconBtnStyle}
                >📋</button>
              )}
              {onDeleteSection && (
                <button type="button" aria-label="מחק סקשן" title="מחק סקשן"
                  onClick={() => onDeleteSection(section.id)}
                  style={{ ...coachIconBtnStyle, color: '#dc2626' }}
                ><Trash2 size={14} /></button>
              )}
            </div>
          )}
          <span aria-hidden style={{
            color: '#C9A24A',
            fontSize: 14,
            lineHeight: 1,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}>▼</span>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ position: 'relative' }}>
                {/* Vertical margin rule — the thin orange line you'd see
                    on a lined notebook page. Positioned 20px from the
                    right edge so it falls in the margin between page
                    border and the exercise content. */}
                <div style={{
                  position: 'absolute',
                  top: 0, bottom: 0,
                  right: 20,
                  width: 1,
                  background: '#E8A98C',
                  opacity: 0.4,
                  pointerEvents: 'none',
                }} aria-hidden />

                {exercises.length === 0 ? (
                  <div style={{ padding: '14px 16px', color: '#a8895a', fontSize: 13 }}>
                    אין תרגילים בסקשן זה
                  </div>
                ) : (
                  exercises.filter(Boolean).map((exercise, idx) => (
                    <ExerciseCard
                      key={exercise.id || Math.random()}
                      exercise={exercise}
                      exerciseIndex={idx + 1}
                      onToggleComplete={onToggleComplete}
                      onEdit={() => onEditExercise(exercise)}
                      onDelete={() => onDeleteExercise(exercise.id)}
                      onDuplicate={onDuplicateExercise ? () => onDuplicateExercise(exercise) : null}
                      onRename={onRenameExercise}
                      mode={showEditButtons ? 'coach' : 'trainee'}
                      canEdit={showEditButtons}
                      isCoach={isCoach}
                      plan={plan}
                      traineeProgress={traineeProgressByExercise[exercise.id]}
                      setLog={setLogs[exercise.id]}
                      onSetLogChange={onSetLogChange}
                      onSetToggleDone={onSetToggleDone}
                      drillSetLog={drillSetLogs[exercise.id]}
                      onDrillSetToggleDone={onDrillSetToggleDone}
                    />
                  ))
                )}

                {/* Coach: add-exercise affordance at the bottom of the
                    expanded body. Reuses onAddExercise verbatim. */}
                {showEditButtons && onAddExercise && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAddExercise(); }}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderTop: '1px dashed #E5DFC9',
                      padding: '12px 36px 12px 16px',
                      textAlign: 'right',
                      direction: 'rtl',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#FF6F20',
                      cursor: 'pointer',
                    }}
                  >
                    + הוסף תרגיל לסקשן
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
  // ── End lined-page card ───────────────────────────────────────────
  // The block below this point is the legacy coach render. It is no
  // longer reachable because the lined-page block above always returns.
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
            marginBottom: 6,
            borderRight: `4px solid ${style.accent}`,
          }
        : {
            backgroundColor: style.bg,
            border: `1px solid ${style.border}`,
            borderRight: `3px solid ${style.accent}`,
          }}
    >
      <div
        className={`w-full cursor-pointer transition-colors hover:bg-gray-50 ${isTraineeView ? '' : 'p-4'}`}
        style={isTraineeView ? { padding: '10px 12px' } : undefined}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
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
                    fontSize: isTraineeView ? 22 : 20,
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
                  className="leading-tight"
                  style={{
                    fontSize: isTraineeView ? 22 : 20,
                    fontWeight: 700,
                    color: isTraineeView ? '#1a1a1a' : style.text,
                    fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
                    cursor: showEditButtons ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    letterSpacing: '0.3px',
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
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#FF6F20',
                  fontFamily: 'Barlow Condensed, sans-serif',
                }}>
                  {exercises.length} תרגילים
                </span>
                {/* Saved section rating — trainee view only. Renders
                    once the trainee submits the section feedback
                    sliders so the score they gave is visible on the
                    closed card. readSectionRating tolerates both the
                    legacy number shape and the new object shape; the
                    chip always shows the .avg. */}
                {!showEditButtons && (() => {
                  const r = readSectionRating(sectionRating);
                  if (r.avg == null) return null;
                  return (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: '#FFF5EE', border: '1px solid #FFE5D0',
                      borderRadius: 999, padding: '3px 10px',
                      fontSize: 12, fontWeight: 700, color: '#FF6F20',
                    }}>
                      ⭐ {Number(r.avg).toFixed(1)}/10
                    </span>
                  );
                })()}
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
            <div className={`bg-white border-t ${isTraineeView ? '' : 'px-3 pb-4 pt-3'}`} style={{ borderColor: style.border, ...(isTraineeView ? { padding: '8px 10px 10px' } : {}) }}>

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
                      fontSize: 15,
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
                      onDuplicate={onDuplicateExercise ? () => onDuplicateExercise(exercise) : null}
                      onRename={onRenameExercise}
                      mode={showEditButtons ? 'coach' : 'trainee'}
                      canEdit={showEditButtons}
                      isCoach={isCoach}
                      plan={plan}
                      traineeProgress={traineeProgressByExercise[exercise.id]}
                      setLog={setLogs[exercise.id]}
                      onSetLogChange={onSetLogChange}
                      onSetToggleDone={onSetToggleDone}
                      drillSetLog={drillSetLogs[exercise.id]}
                      onDrillSetToggleDone={onDrillSetToggleDone}
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

    </div>
  );
}
