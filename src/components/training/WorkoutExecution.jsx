import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  markExerciseDone, unmarkExercise, submitSectionRating, completeWorkout,
  saveSetLog, getSetLogs, indexSetLogs,
} from '@/lib/workoutExecutionApi';

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';

function modeLabel(mode) {
  if (mode === 'seconds' || mode === 'time') return 'שניות';
  if (mode === 'kg' || mode === 'weight') return 'ק״ג';
  return 'חזרות';
}

function targetForMode(ex) {
  const mode = ex.mode;
  if (mode === 'seconds' || mode === 'time') return ex.work_time || ex.time || '';
  if (mode === 'kg' || mode === 'weight') return ex.weight || '';
  return ex.reps || '';
}

function valueFromLog(log, mode) {
  if (!log) return '';
  if (mode === 'seconds' || mode === 'time') return log.time_completed ?? '';
  if (mode === 'kg' || mode === 'weight') return log.weight_used ?? '';
  return log.reps_completed ?? '';
}

function ExerciseCard({
  exercise, sectionId, executionId, completed, savedNote, savedLogs,
  readOnly, onToggleComplete, onSavedSet, onSavedNote,
}) {
  const mode = exercise.mode || 'reps';
  const sets = Math.max(1, Number(exercise.sets) || 1);
  const target = targetForMode(exercise);
  const targetStr = target === '' || target == null ? '' : String(target);

  const [setValues, setSetValues] = useState(() => {
    const init = {};
    for (let i = 1; i <= sets; i += 1) {
      init[i] = valueFromLog(savedLogs?.[i], mode);
    }
    return init;
  });

  useEffect(() => {
    setSetValues((prev) => {
      const next = { ...prev };
      for (let i = 1; i <= sets; i += 1) {
        const fromLog = valueFromLog(savedLogs?.[i], mode);
        if (next[i] === '' || next[i] == null) next[i] = fromLog;
      }
      return next;
    });
  }, [savedLogs, sets, mode]);

  const [note, setNote] = useState(savedNote || '');
  useEffect(() => { setNote(savedNote || ''); }, [savedNote]);

  const persistSet = (setNumber) => {
    if (readOnly) return;
    const value = setValues[setNumber];
    saveSetLog(executionId, exercise.id, setNumber, mode, value)
      .then(() => onSavedSet && onSavedSet(exercise.id, setNumber, value))
      .catch((e) => toast.error('שמירת סט נכשלה: ' + (e?.message || '')));
  };

  const handleCheckbox = () => {
    if (readOnly) return;
    onToggleComplete(exercise.id, sectionId, !completed, note);
  };

  return (
    <div style={{
      background: 'white',
      border: '1px solid #EEE',
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      opacity: readOnly && completed ? 0.96 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button
          type="button"
          onClick={handleCheckbox}
          disabled={readOnly}
          aria-label="בוצע"
          style={{
            all: 'unset',
            cursor: readOnly ? 'default' : 'pointer',
            width: 26, height: 26, borderRadius: 8,
            border: `2px solid ${completed ? ORANGE : '#D0D0D0'}`,
            background: completed ? ORANGE : 'white',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
          }}
        >
          {completed && <Check className="w-4 h-4" style={{ color: 'white' }} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: DARK, marginBottom: 4 }}>
            {exercise.exercise_name || exercise.name || 'תרגיל'}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {sets} סטים × {targetStr || '?'} {modeLabel(mode)}
            {exercise.rest_time ? ` · מנוחה ${exercise.rest_time}''` : ''}
          </div>
          {exercise.coach_private_notes && (
            <div style={{
              fontSize: 12, color: '#555', fontStyle: 'italic',
              marginTop: 6, padding: '6px 8px',
              background: '#FFF8F3', borderRadius: 8,
              borderRight: `3px solid ${ORANGE}`,
            }}>
              {exercise.coach_private_notes}
            </div>
          )}
        </div>
      </div>

      {sets > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10,
          paddingTop: 10, borderTop: '1px dashed #EEE',
        }}>
          {Array.from({ length: sets }, (_, i) => i + 1).map((n) => (
            <label key={n} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <span style={{ fontSize: 10, color: '#888', fontWeight: 700 }}>
                סט {n}
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={setValues[n] ?? ''}
                placeholder={targetStr}
                disabled={readOnly}
                onChange={(e) => setSetValues((prev) => ({ ...prev, [n]: e.target.value }))}
                onBlur={() => persistSet(n)}
                style={{
                  width: 56, height: 36, textAlign: 'center',
                  border: `1px solid ${readOnly ? '#E5E5E5' : '#F0E4D0'}`,
                  borderRadius: 8, fontSize: 14, fontWeight: 700,
                  background: readOnly ? '#FAFAFA' : 'white',
                  color: DARK, outline: 'none',
                }}
              />
            </label>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <input
          type="text"
          placeholder="הערה לתרגיל..."
          value={note}
          disabled={readOnly}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onSavedNote && onSavedNote(exercise.id, sectionId, note)}
          style={{
            width: '100%', height: 36, padding: '0 10px',
            border: '1px solid #EEE', borderRadius: 8,
            fontSize: 13, background: readOnly ? '#FAFAFA' : 'white',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}

export default function WorkoutExecution({
  plan, execution, readOnly = false, onBack, onCompleted,
}) {
  // execution.exercise_executions / section_executions (when present from
  // a `*` join) seed initial completion + rating state. In active mode we
  // mutate locally and persist via the API as the trainee interacts.
  const initialDone = useMemo(() => {
    const m = {};
    for (const ee of execution?.exercise_executions || []) {
      if (ee.is_completed) m[ee.exercise_id] = ee;
    }
    return m;
  }, [execution]);

  const initialNotes = useMemo(() => {
    const m = {};
    for (const ee of execution?.exercise_executions || []) {
      if (ee.trainee_note) m[ee.exercise_id] = ee.trainee_note;
    }
    return m;
  }, [execution]);

  const initialSectionRatings = useMemo(() => {
    const m = {};
    for (const se of execution?.section_executions || []) {
      if (se.avg_score != null) m[se.section_id] = Number(se.avg_score);
    }
    return m;
  }, [execution]);

  const [done, setDone] = useState(initialDone);
  const [notes, setNotes] = useState(initialNotes);
  const [sectionRatings, setSectionRatings] = useState(initialSectionRatings);
  const [setLogIndex, setSetLogIndex] = useState({});
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [finishing, setFinishing] = useState(false);

  const [feedbackSection, setFeedbackSection] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(7);
  const [feedbackNote, setFeedbackNote] = useState('');

  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!execution?.id) { setLoadingLogs(false); return; }
    getSetLogs(execution.id)
      .then((logs) => { if (!cancelled) setSetLogIndex(indexSetLogs(logs)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingLogs(false); });
    return () => { cancelled = true; };
  }, [execution?.id]);

  const allExercises = useMemo(
    () => (plan?.sections || []).flatMap((s) => s.exercises || []),
    [plan]
  );
  const totalExercises = allExercises.length;
  const completedCount = Object.keys(done).length;

  const totalSets = useMemo(
    () => allExercises.reduce((sum, ex) => sum + (Number(ex.sets) || 0), 0),
    [allExercises]
  );

  const avgRating = useMemo(() => {
    const vals = Object.values(sectionRatings);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }, [sectionRatings]);

  const sectionAllDone = useCallback((section) => {
    const ids = (section.exercises || []).map((e) => e.id);
    if (!ids.length) return false;
    return ids.every((id) => !!done[id]);
  }, [done]);

  const allWorkoutDone = totalExercises > 0 && completedCount === totalExercises;

  const handleToggleComplete = useCallback(async (exerciseId, sectionId, nextChecked, currentNote) => {
    if (nextChecked) {
      try {
        await markExerciseDone(execution.id, sectionId, exerciseId, currentNote || null);
        setDone((p) => ({ ...p, [exerciseId]: { exercise_id: exerciseId, is_completed: true } }));
        // Open section feedback popup once the section is fully ticked,
        // unless we already have a rating for it.
        const section = (plan.sections || []).find((s) => s.id === sectionId);
        if (section) {
          const ids = (section.exercises || []).map((e) => e.id);
          const stillNeeded = ids.filter((id) => id !== exerciseId && !done[id]);
          if (stillNeeded.length === 0 && sectionRatings[sectionId] == null) {
            setFeedbackSection(section);
            setFeedbackRating(7);
            setFeedbackNote('');
          }
        }
      } catch (e) {
        toast.error('שמירה נכשלה: ' + (e?.message || ''));
      }
    } else {
      try {
        await unmarkExercise(execution.id, exerciseId);
        setDone((p) => {
          const n = { ...p }; delete n[exerciseId]; return n;
        });
      } catch (e) {
        toast.error('שמירה נכשלה: ' + (e?.message || ''));
      }
    }
  }, [execution?.id, plan, done, sectionRatings]);

  const handleSavedNote = useCallback(async (exerciseId, sectionId, note) => {
    setNotes((p) => ({ ...p, [exerciseId]: note }));
    if (!done[exerciseId]) return; // only persist when the row exists
    try {
      await markExerciseDone(execution.id, sectionId, exerciseId, note || null);
    } catch {
      // non-blocking
    }
  }, [execution?.id, done]);

  const handleSavedSet = useCallback((exerciseId, setNumber, value) => {
    setSetLogIndex((prev) => {
      const next = { ...prev };
      const ex = { ...(next[exerciseId] || {}) };
      ex[setNumber] = { ...(ex[setNumber] || {}), set_number: setNumber, _value: value };
      next[exerciseId] = ex;
      return next;
    });
  }, []);

  const saveSectionFeedback = async () => {
    if (!feedbackSection) return;
    try {
      // Both control and challenge get the same value — the new flow
      // collapses to a single 1–10 slider per section.
      await submitSectionRating(execution.id, feedbackSection.id, feedbackRating, feedbackRating);
      setSectionRatings((p) => ({ ...p, [feedbackSection.id]: feedbackRating }));
      toast.success(`✅ סקשן "${feedbackSection.section_name || ''}" הושלם`);
    } catch (e) {
      toast.error('שמירה נכשלה: ' + (e?.message || ''));
    } finally {
      setFeedbackSection(null);
    }
  };

  const handleFinishClick = () => setShowSummary(true);

  const handleConfirmFinish = async () => {
    setFinishing(true);
    try {
      await completeWorkout(execution.id, null);
      toast.success('האימון נשמר! 🏆');
      setShowSummary(false);
      onCompleted && onCompleted();
    } catch (e) {
      toast.error('שמירה נכשלה: ' + (e?.message || ''));
    } finally {
      setFinishing(false);
    }
  };

  const totalWorkSeconds = useMemo(() => {
    return allExercises.reduce((sum, ex) => {
      if (!done[ex.id]) return sum;
      const wt = Number(ex.work_time) || 0;
      const setsN = Number(ex.sets) || 1;
      return sum + wt * setsN;
    }, 0);
  }, [allExercises, done]);

  const formattedWorkTime = useMemo(() => {
    const m = Math.floor(totalWorkSeconds / 60).toString().padStart(2, '0');
    const s = (totalWorkSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [totalWorkSeconds]);

  return (
    <div dir="rtl" style={{ background: '#FAFAFA', minHeight: '100vh', paddingBottom: 100 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'white', borderBottom: '1px solid #EEE',
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button
          type="button"
          onClick={() => onBack && onBack()}
          style={{
            all: 'unset', cursor: 'pointer', padding: 6, borderRadius: 8,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="חזור"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 900, color: DARK,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {plan?.plan_name || plan?.title || 'אימון'}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            {readOnly ? 'תצוגה בלבד' : 'אימון בביצוע'}
            {' · '}{completedCount}/{totalExercises} תרגילים
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={handleFinishClick}
            disabled={!allWorkoutDone}
            style={{
              all: 'unset',
              cursor: allWorkoutDone ? 'pointer' : 'not-allowed',
              background: allWorkoutDone ? ORANGE : '#E5E5E5',
              color: allWorkoutDone ? 'white' : '#999',
              padding: '8px 14px', borderRadius: 10, fontSize: 13,
              fontWeight: 800,
            }}
          >
            סיים אימון
          </button>
        )}
      </div>

      {loadingLogs ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: ORANGE, display: 'inline-block' }} />
        </div>
      ) : (
        <div style={{ padding: '12px 14px' }}>
          {(plan?.sections || []).map((section) => {
            const sectionDone = sectionAllDone(section);
            const rating = sectionRatings[section.id];
            return (
              <div key={section.id} style={{
                background: 'white', borderRadius: 14,
                borderLeft: `4px solid ${ORANGE}`,
                padding: 12, marginBottom: 12,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, gap: 8,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: DARK }}>
                    {section.section_name || 'סקשן'}
                  </div>
                  {rating != null && (
                    <span style={{
                      background: sectionDone ? '#DCFCE7' : '#FEF3C7',
                      color: sectionDone ? '#16A34A' : '#B45309',
                      padding: '2px 10px', borderRadius: 999,
                      fontSize: 12, fontWeight: 800,
                    }}>
                      {Number(rating).toFixed(1)}
                    </span>
                  )}
                </div>
                {(section.exercises || []).map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    sectionId={section.id}
                    executionId={execution.id}
                    completed={!!done[ex.id]}
                    savedNote={notes[ex.id]}
                    savedLogs={setLogIndex[ex.id]}
                    readOnly={readOnly}
                    onToggleComplete={handleToggleComplete}
                    onSavedSet={handleSavedSet}
                    onSavedNote={handleSavedNote}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Section completion popup — white, orange slider, optional notes. */}
      <Dialog open={!!feedbackSection} onOpenChange={(open) => { if (!open) setFeedbackSection(null); }}>
        <DialogContent
          className="w-[90%] sm:max-w-[425px] bg-white p-5 relative rounded-2xl border-none shadow-2xl z-[100] fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-h-[80vh] overflow-y-auto outline-none"
          dir="rtl"
        >
          <button
            type="button"
            onClick={() => setFeedbackSection(null)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
          <DialogTitle className="text-lg font-black text-center">
            סיימת סקשן! 🎯
          </DialogTitle>
          <div className="space-y-3 py-2">
            <div className="p-2 rounded-lg text-center" style={{ backgroundColor: '#FFF8F3', border: `2px solid ${ORANGE}` }}>
              <p className="text-base font-black" style={{ color: ORANGE }}>
                {feedbackSection?.section_name || ''}
              </p>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                איך הרגיש הסקשן?
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: ORANGE, textAlign: 'center', marginBottom: 8 }}>
                {Number(feedbackRating).toFixed(1)}
              </div>
              <input
                type="range" min="1" max="10" step="0.5"
                value={feedbackRating}
                onChange={(e) => setFeedbackRating(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: ORANGE }}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, color: '#888', marginTop: 4,
              }}>
                <span>קשה</span>
                <span>בסדר</span>
                <span>מעולה</span>
              </div>
            </div>
            <input
              type="text"
              placeholder="הערה (אופציונלי)"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              style={{
                width: '100%', height: 40, padding: '0 10px',
                border: '1px solid #EEE', borderRadius: 8, fontSize: 13,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={saveSectionFeedback}
              style={{
                width: '100%', height: 44, borderRadius: 12,
                background: ORANGE, color: 'white', border: 'none',
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
              }}
            >
              שמור
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Workout completion popup — dark theme. */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent
          className="w-[90%] sm:max-w-[425px] p-6 text-center relative rounded-2xl border-none shadow-2xl z-[100] fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-h-[80vh] overflow-y-auto outline-none text-white"
          style={{ backgroundColor: DARK }}
          dir="rtl"
        >
          <button
            type="button"
            onClick={() => setShowSummary(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-1"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
          <DialogTitle className="text-2xl font-black mb-3 text-white">
            סיימת את האימון! 🏆
          </DialogTitle>
          <div className="space-y-4">
            <div style={{
              background: 'rgba(255,111,32,0.12)',
              border: `2px solid ${ORANGE}`,
              borderRadius: 16, padding: 20,
            }}>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                הציון שלך לאימון הזה
              </div>
              <div style={{ fontSize: 48, fontWeight: 700, color: ORANGE, lineHeight: 1 }}>
                {avgRating != null ? avgRating.toFixed(1) : '—'}
              </div>
              <div style={{ fontSize: 13, color: '#bbb', marginTop: 4 }}>
                מתוך 10
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl border" style={{ backgroundColor: '#252525', borderColor: '#333' }}>
              <div className="text-center">
                <div className="text-xl font-black text-white">{completedCount}</div>
                <div className="text-[10px] text-gray-400 font-bold uppercase">תרגילים</div>
              </div>
              <div className="text-center" style={{ borderRightWidth: 1, borderLeftWidth: 1, borderColor: '#3a3a3a', borderStyle: 'solid' }}>
                <div className="text-xl font-black text-white">{totalSets}</div>
                <div className="text-[10px] text-gray-400 font-bold uppercase">סטים</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-white">{formattedWorkTime}</div>
                <div className="text-[10px] text-gray-400 font-bold uppercase">זמן עבודה</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleConfirmFinish}
              disabled={finishing}
              style={{
                width: '100%', height: 48, borderRadius: 12,
                background: ORANGE, color: 'white', border: 'none',
                fontSize: 15, fontWeight: 800,
                cursor: finishing ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
              }}
            >
              {finishing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>שמור וסיים</>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
