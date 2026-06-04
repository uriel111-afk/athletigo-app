import React, { useState, useEffect } from "react";
import { ChevronDown, Plus, Edit2, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import ExerciseCard from "./ExerciseCard";
import { getSectionType } from "@/lib/sectionTypes";
import { getSectionColor } from "@/lib/plansApi";
import { useLongPress } from "@/lib/useLongPress";
import { readSectionRating } from "@/lib/workoutExecutionApi";
import { useSmartBackHandler } from "@/hooks/useSmartBack";

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
  onSetValueChange,
  drillSetLogs = {},
  onDrillSetToggleDone,
  sectionRating = null,
  showEditButtons = false,
  isCoach = false,
  plan,
  traineeProgressByExercise = {},
  // Workout-wide expand coordination. When the parent passes these
  // in, this section's ExerciseCards become controlled and only one
  // card across the whole workout can be open at a time. Optional —
  // omit both and the cards self-manage as before.
  expandedExerciseId,
  setExpandedExerciseId,
  // Tracking-mode controls — provided by UnifiedPlanBuilder.
  // onToggleTrackingMode flips section.tracking_mode between 'full'
  // and 'display' via the existing section update mutation.
  // onMarkSectionDoneDisplay marks every exercise + the section as
  // completed in one shot for display-only sections (no rating popup).
  onToggleTrackingMode,
  onMarkSectionDoneDisplay,
  // Map: { [exerciseId]: { [setIdx]: { previous_reps, record_reps,
  // previous_time, record_time } } }. Optional — when absent each
  // ExerciseCard renders without the "קודם / שיא" indicators.
  previousSetDataByExercise = {},
}) {
  const [expanded, setExpanded] = useState(!showEditButtons);
  // Register the section's collapse as a smart-back close. Stack is
  // LIFO so any open ExerciseCard inside this section pops first;
  // only after the open exercise closes does another back press
  // collapse the section.
  useSmartBackHandler(expanded, () => setExpanded(false));
  const [renamingSection, setRenamingSection] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
    // Premium-Soft accent-tinted card chrome — derived from the same
    // accentColor so the outer border, drop-shadow halo, and header
    // gradient all share the section's brand hue (orange / blue /
    // green / etc.).
    const accentBorder = softTint(accentColor, 0.12);
    const accentShadow = softTint(accentColor, 0.07);
    const accentHeaderTintStrong = softTint(accentColor, 0.06);
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
        border: `1px solid ${accentBorder}`,
        borderRight: `4px solid ${accentColor}`,
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 8,
        direction: 'rtl',
        boxShadow: `0 2px 4px rgba(0,0,0,0.03), 0 14px 28px ${accentShadow}`,
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
            background: `linear-gradient(180deg, ${accentHeaderTintStrong} 0%, transparent 100%)`,
            borderBottom: expanded ? 'none' : '2px solid #E8DEC4',
            padding: '12px 36px 12px 10px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {/* Title area — NOT a flex:1 item. Takes its natural content
              width so the name can never be squeezed to zero by the
              outer row's coach-actions cluster. If everything still
              doesn't fit on a very narrow row, the chevron at the END
              of the outer flex line is the one that overflows, NOT
              the name. */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            minWidth: 0,
          }}>
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
                  fontSize: 18, fontWeight: 700, color: '#1a1a1a',
                  fontFamily: "'Rubik', system-ui, sans-serif",
                  border: 'none',
                  borderBottom: '2px solid #FF6F20',
                  background: 'transparent',
                  outline: 'none',
                  padding: '2px 0',
                  direction: 'rtl',
                  width: '160px',
                }}
              />
            ) : (
              // Section name: natural width via nowrap. No maxWidth tied
              // to the parent (that was the previous bug — when the
              // parent shrunk to 0 via flex math, maxWidth:100% became
              // 0% and overflow:hidden clipped everything to invisible).
              // The viewport-relative safety net `maxWidth: 60vw` only
              // truncates pathologically long names; short / medium
              // names render at their natural intrinsic width.
              <span
                {...(showEditButtons ? longPressRename : {})}
                style={{
                  fontFamily: "'Rubik', system-ui, sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#1a1a1a',
                  lineHeight: 1.2,
                  letterSpacing: '-0.3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '60vw',
                  display: 'inline-block',
                }}
                title={section.section_name}
              >{section.section_name}</span>
            )}
            <span style={{
              fontSize: 11, color: accentColor, fontWeight: 500,
              letterSpacing: '0.3px',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
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
                flexShrink: 0,
              }}>⭐ {Number(ratingObj.avg).toFixed(1)}/10</span>
            )}
            {section.completed && (
              <span style={{
                fontSize: 11, color: '#16a34a', fontWeight: 700,
                marginInlineStart: 4,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                הושלם
              </span>
            )}
          </div>
          {/* Actions cluster — gear + chevron grouped on the visual
              left (RTL "end") so the outer space-between layout puts
              the title cluster on the right and these controls hug
              the leftmost edge of the row. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* DOM order gear → chevron. Under RTL flex the last DOM
                child sits at the visual leftmost edge of the row, so
                the chevron hugs the section's left margin and the
                gear sits next to it (toward the title). */}
            {showEditButtons && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                aria-expanded={menuOpen}
                aria-label="עריכת סקשן"
                title="עריכת סקשן"
                style={{
                  width: 32, height: 32,
                  background: 'transparent',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <Settings size={18} />
              </button>
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
        </div>

        {/* Coach action menu — appears below the section row when the
            עריכה button is toggled. Each tile calls the existing
            handler wired by UnifiedPlanBuilder (no new editor / DB /
            handler code). 2-col grid; "מחק" gets the red-tinted tile. */}
        {showEditButtons && menuOpen && (() => {
          const itemBase = {
            background: '#FCFBF7',
            border: '1px solid #EFE9D8',
            borderRadius: 8,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#1a1a1a',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'right',
            direction: 'rtl',
            fontFamily: "'Rubik', system-ui, sans-serif",
            width: '100%',
            lineHeight: 1.2,
          };
          const dangerStyle = {
            ...itemBase,
            background: '#FCEBEB',
            border: '1px solid #F5C9C9',
            color: '#a32d2d',
          };
          const iconStyle = (danger) => ({
            color: danger ? '#a32d2d' : '#FF6F20',
            fontSize: 16,
            lineHeight: 1,
            flexShrink: 0,
            display: 'inline-block',
            minWidth: 18,
            textAlign: 'center',
          });
          const Item = ({ icon, label, onClick, danger, disabled }) => (
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); if (!disabled) { setMenuOpen(false); onClick(); } }}
              style={{
                ...(danger ? dangerStyle : itemBase),
                opacity: disabled ? 0.35 : 1,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              <span style={iconStyle(danger)} aria-hidden>{icon}</span>
              <span>{label}</span>
            </button>
          );
          return (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                padding: '12px 16px',
                background: '#FFFFFF',
                borderBottom: '1px solid #E8DEC4',
                direction: 'rtl',
              }}
            >
              {onEditSection && (
                <Item icon="✏" label="ערוך סקשן" onClick={() => onEditSection(section)} />
              )}
              {onRenameSection && (
                <Item icon="✎" label="שנה שם" onClick={() => setRenamingSection(true)} />
              )}
              {onDuplicateSection && (
                <Item icon="📋" label="שכפל" onClick={() => onDuplicateSection(section)} />
              )}
              {onMoveSection && (
                <Item icon="↑" label="הזז למעלה" disabled={isFirstSection} onClick={() => onMoveSection(-1)} />
              )}
              {onMoveSection && (
                <Item icon="↓" label="הזז למטה" disabled={isLastSection} onClick={() => onMoveSection(1)} />
              )}
              {/* Section tracking mode toggle. Shows current state as
                  a small pill on the right of the tile so the coach
                  can read it without opening anything else. */}
              {onToggleTrackingMode && (() => {
                const mode = section?.tracking_mode || 'full';
                const isFull = mode === 'full';
                const pillLabel = (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                    מעקב נתונים
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: isFull ? '#FF6F20' : '#E5E7EB',
                      color: isFull ? '#FFFFFF' : '#4b5563',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                    }}>
                      {isFull ? 'מלא' : 'תצוגה'}
                    </span>
                  </span>
                );
                return <Item icon="🎯" label={pillLabel} onClick={() => onToggleTrackingMode(section)} />;
              })()}
              {onDeleteSection && (
                <Item icon="🗑" label="מחק" danger onClick={() => onDeleteSection(section.id)} />
              )}
            </div>
          );
        })()}

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
                      onSetValueChange={onSetValueChange}
                      drillSetLog={drillSetLogs[exercise.id]}
                      onDrillSetToggleDone={onDrillSetToggleDone}
                      expanded={setExpandedExerciseId ? expandedExerciseId === exercise.id : undefined}
                      onToggleExpanded={setExpandedExerciseId
                        ? () => setExpandedExerciseId((prev) => prev === exercise.id ? null : exercise.id)
                        : undefined}
                      sectionTrackingMode={section?.tracking_mode || 'full'}
                      previousSetData={previousSetDataByExercise[exercise.id] || null}
                    />
                  ))
                )}

                {/* Display-mode "done" button — trainee view only,
                    only when this section is display-only AND not
                    yet completed. Skips the rating popup; the parent
                    handler bulk-marks every exercise + the section
                    as completed so the overall workout progress and
                    summary popup still trigger naturally. */}
                {!showEditButtons
                  && (section?.tracking_mode || 'full') === 'display'
                  && !section?.completed
                  && onMarkSectionDoneDisplay && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMarkSectionDoneDisplay(section); }}
                    style={{
                      width: '100%',
                      background: '#FF6F20',
                      color: 'white',
                      border: 'none',
                      borderRadius: 12,
                      padding: '14px 16px',
                      margin: '12px 0 4px',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      direction: 'rtl',
                      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                    }}
                  >
                    סיימתי את {section?.section_name || 'הסקשן'}
                  </button>
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
                      padding: '12px 36px 12px 10px',
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
                    fontFamily: 'Rubik, sans-serif',
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
                    fontFamily: "'Bebas Neue', sans-serif",
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
                  fontFamily: 'Bebas Neue, sans-serif',
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
                      onSetValueChange={onSetValueChange}
                      drillSetLog={drillSetLogs[exercise.id]}
                      onDrillSetToggleDone={onDrillSetToggleDone}
                      expanded={setExpandedExerciseId ? expandedExerciseId === exercise.id : undefined}
                      onToggleExpanded={setExpandedExerciseId
                        ? () => setExpandedExerciseId((prev) => prev === exercise.id ? null : exercise.id)
                        : undefined}
                      sectionTrackingMode={section?.tracking_mode || 'full'}
                      previousSetData={previousSetDataByExercise[exercise.id] || null}
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
