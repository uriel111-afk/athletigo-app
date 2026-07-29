import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import ExerciseCard from "./ExerciseCard";
import { getSectionType } from "@/lib/sectionTypes";
import { getSectionColor } from "@/lib/plansApi";
import { getSectionTheme, SECTION_PALETTE } from "@/lib/sectionTheme";
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
  const [colorSheetOpen, setColorSheetOpen] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
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

  // Colour is saved BY SECTION NAME, not by row: choosing a colour for
  // "חימום" paints every חימום this coach owns, in every plan, so a
  // warm-up looks the same wherever the trainee meets it. Falls back to
  // this single row when the section carries no coach_id.
  const saveSectionColor = async (key) => {
    if (!section?.id) return;
    setSavingColor(true);
    try {
      let q = supabase.from('training_sections').update({ color_theme: key });
      q = (section.section_name && section.coach_id)
        ? q.eq('section_name', section.section_name).eq('coach_id', section.coach_id)
        : q.eq('id', section.id);
      const { data, error } = await q.select('id');
      if (error) {
        console.warn('[SectionCard] colour save failed:', error.message);
        toast.error('שמירת הצבע נכשלה');
        return;
      }
      const n = (data || []).length;
      toast.success(n > 1 ? `הצבע הוחל על ${n} מקטעים בשם הזה` : 'הצבע נשמר');
      setColorSheetOpen(false);
    } finally {
      setSavingColor(false);
    }
  };

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
  // The sole render path. Coach gets extra controls — a section-action
  // menu on the row, an "ערוך" affordance per exercise, and
  // "+ הוסף תרגיל" at the bottom of the expanded body — all wired to
  // the handlers UnifiedPlanBuilder passes down.
  //
  // A legacy coach render used to sit below this one, made unreachable
  // by a bare `{ … return }` block wrapped around everything above it.
  // Both the wrapper and the 287 dead lines were removed; this is now
  // a plain component body with one return.
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
  // Per-section theme. Everything below is derived from one base hex;
  // brand orange is never a section colour (it marks the active card).
  const theme = getSectionTheme(section?.color_theme, index);
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
      // Recessed tray in the section's own colour. Inset shadows only —
      // the section reads as carved into the page, so the exercise
      // cards can float above it.
      background: theme.tray,
      border: 'none',
      borderRadius: expanded ? 18 : 16,
      overflow: 'hidden',
      marginBottom: 8,
      direction: 'rtl',
      boxShadow: expanded
        ? `inset 3px 3px 8px ${theme.trayShadow}, inset -2px -2px 6px rgba(255,255,255,0.85)`
        : `inset 2px 2px 6px ${theme.trayShadow}, inset -2px -2px 6px rgba(255,255,255,0.85)`,
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
          justifyContent: 'flex-start',
          gap: 10,
          background: `linear-gradient(180deg, ${accentHeaderTintStrong} 0%, transparent 100%)`,
          borderBottom: expanded ? 'none' : '2px solid #E8DEC4',
          // Symmetric padding. Was '12px 36px 12px 10px' to make room
          // for the left-hand gear + chevron cluster; both are gone.
          padding: '12px 14px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Everything anchors to the RTL start (visual right) and wraps
            rather than truncating. justifyContent:flex-start keeps the
            cluster hugging the right edge with no left-side controls to
            balance against. */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
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
            // Section name wraps to as many lines as it needs. No
            // nowrap / overflow / ellipsis and no maxWidth — a long
            // name grows the header instead of being cut off.
            <span
              {...(showEditButtons ? longPressRename : {})}
              style={{
                fontFamily: "'Rubik', system-ui, sans-serif",
                fontSize: 18,
                fontWeight: 600,
                color: theme.titleText,
                lineHeight: 1.25,
                letterSpacing: '-0.2px',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
            >{section.section_name}</span>
          )}
          <span style={{
            fontSize: 11, color: theme.subText, fontWeight: 500,
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
          {/* Settings sits INSIDE the right-hand cluster, immediately
              after the count — not in a left-edge actions group. The
              chevron is gone entirely: tapping the header row is what
              collapses the section. */}
          {showEditButtons && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              aria-expanded={menuOpen}
              aria-label="עריכת סקשן"
              title="עריכת סקשן"
              style={{
                width: 28, height: 28,
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                flexShrink: 0,
                marginInlineStart: 2,
              }}
            >
              <Settings size={18} />
            </button>
          )}
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
            <Item icon="🎨" label="צבע המקטע" onClick={() => setColorSheetOpen(true)} />
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
                    sectionTheme={theme}
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

      {/* Section colour sheet — opened from the existing gear menu. */}
      {colorSheetOpen && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setColorSheetOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(20,14,8,0.42)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420, background: '#FFFFFF',
              borderRadius: '18px 18px 0 0',
              padding: '16px 16px calc(16px + env(safe-area-inset-bottom,0px))',
              fontFamily: "'Rubik', system-ui, sans-serif",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a' }}>צבע המקטע</div>

            {/* Live preview: the tray, with one sample card floating in it. */}
            <div style={{
              background: theme.tray,
              borderRadius: 18,
              boxShadow: `inset 3px 3px 8px ${theme.trayShadow}, inset -2px -2px 6px rgba(255,255,255,0.85)`,
              padding: 12, marginTop: 12,
            }}>
              <div style={{
                fontSize: 15, fontWeight: 600, color: theme.titleText,
                letterSpacing: '-0.2px', marginBottom: 8,
              }}>{section.section_name || 'מקטע'}</div>
              <div style={{
                background: '#FFFFFF', borderRadius: 13, border: 'none',
                boxShadow: `0 3px 8px ${theme.cardShadow}, 0 1px 2px rgba(150,120,80,0.10)`,
                padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 9, background: theme.badge,
                  color: '#FFFFFF', fontSize: 12, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>1</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>תרגיל לדוגמה</span>
              </div>
            </div>

            {/* Eight 40x40 swatches; the selected one is ringed. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              {SECTION_PALETTE.map((sw) => {
                const on = (section?.color_theme || SECTION_PALETTE[index % SECTION_PALETTE.length].key) === sw.key;
                return (
                  <button
                    key={sw.key}
                    type="button"
                    disabled={savingColor}
                    onClick={() => saveSectionColor(sw.key)}
                    aria-label={sw.label}
                    title={sw.label}
                    style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: sw.base, cursor: 'pointer', padding: 0,
                      border: on ? '2px solid #FFFFFF' : 'none',
                      boxShadow: on
                        ? `0 0 0 3px ${sw.base}, 0 2px 6px rgba(0,0,0,0.18)`
                        : '0 2px 6px rgba(0,0,0,0.12)',
                    }}
                  />
                );
              })}
            </div>

            <div style={{ fontSize: 13, color: '#8A7E6D', marginTop: 14, lineHeight: 1.6 }}>
              הכתום שמור לתרגיל הפעיל
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
