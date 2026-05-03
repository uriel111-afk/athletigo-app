import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { saveCompletedWorkout } from '@/lib/workoutExecutionApi';

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

function formatSeconds(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function ExerciseCard({
  exercise, sectionId, completed, note, setValues,
  onToggleComplete, onSetChange, onNoteChange,
}) {
  const mode = exercise.mode || 'reps';
  const sets = Math.max(1, Number(exercise.sets) || 1);
  const target = targetForMode(exercise);
  const targetStr = target === '' || target == null ? '' : String(target);

  return (
    <div style={{
      background: 'white',
      border: '1px solid #EEE',
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button
          type="button"
          onClick={() => onToggleComplete(exercise.id, sectionId, !completed)}
          aria-label="בוצע"
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 22, height: 22, borderRadius: 6,
            border: `2px solid ${completed ? ORANGE : '#D0D0D0'}`,
            background: completed ? ORANGE : 'white',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 4,
          }}
        >
          {completed && <Check className="w-3 h-3" style={{ color: 'white' }} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: DARK, marginBottom: 4 }}>
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

      {sets > 1 && (
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
                value={setValues?.[n] ?? ''}
                placeholder={targetStr}
                onChange={(e) => onSetChange(exercise.id, n, e.target.value)}
                style={{
                  width: 64, height: 36, textAlign: 'center',
                  border: '1px solid #F0E4D0',
                  borderRadius: 8, fontSize: 14, fontWeight: 700,
                  background: 'white', color: DARK, outline: 'none',
                }}
                onFocus={(e) => { e.target.style.borderColor = ORANGE; }}
                onBlur={(e) => { e.target.style.borderColor = '#F0E4D0'; }}
              />
            </label>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <input
          type="text"
          placeholder="הערה לתרגיל..."
          value={note ?? ''}
          onChange={(e) => onNoteChange(exercise.id, e.target.value)}
          style={{
            width: '100%', height: 36, padding: '0 10px',
            border: '1px solid #F0E4D0', borderRadius: 8,
            fontSize: 13, background: 'white',
            outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.target.style.borderColor = ORANGE; }}
          onBlur={(e) => { e.target.style.borderColor = '#F0E4D0'; }}
        />
      </div>
    </div>
  );
}

export default function WorkoutExecution({ plan, traineeId, onBack, onCompleted }) {
  const allExercises = useMemo(
    () => (plan?.sections || []).flatMap((s) => s.exercises || []),
    [plan]
  );
  const totalExercises = allExercises.length;

  // Pure-memory state — nothing persisted until "שמור וסיים".
  const [done, setDone] = useState({});             // exerciseId -> true
  const [setValues, setSetValues] = useState({});   // exerciseId -> { setN -> value }
  const [notes, setNotes] = useState({});           // exerciseId -> string
  const [sectionRatings, setSectionRatings] = useState({}); // sectionId -> rating

  const [feedbackSection, setFeedbackSection] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(7);
  const [feedbackNote, setFeedbackNote] = useState('');

  const [showSummary, setShowSummary] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  const completedCount = Object.keys(done).length;

  const totalSets = useMemo(
    () => allExercises.reduce((sum, ex) => sum + (Math.max(1, Number(ex.sets) || 1)), 0),
    [allExercises]
  );

  const completionPercent = totalExercises > 0
    ? Math.round((completedCount / totalExercises) * 100)
    : 0;

  const avgRating = useMemo(() => {
    const vals = Object.values(sectionRatings).filter((v) => v != null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }, [sectionRatings]);

  const totalWorkSeconds = useMemo(() => {
    return allExercises.reduce((sum, ex) => {
      if (!done[ex.id]) return sum;
      const wt = Number(ex.work_time) || 0;
      const setsN = Math.max(1, Number(ex.sets) || 1);
      return sum + wt * setsN;
    }, 0);
  }, [allExercises, done]);

  const allWorkoutDone = totalExercises > 0 && completedCount === totalExercises;

  const handleToggleComplete = useCallback((exerciseId, sectionId, nextChecked) => {
    if (nextChecked) {
      setDone((p) => ({ ...p, [exerciseId]: true }));
      // Open section feedback popup once that section is fully ticked
      // and hasn't been rated yet.
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
    } else {
      setDone((p) => {
        const n = { ...p }; delete n[exerciseId]; return n;
      });
    }
  }, [plan, done, sectionRatings]);

  const handleSetChange = useCallback((exerciseId, setNumber, value) => {
    setSetValues((prev) => ({
      ...prev,
      [exerciseId]: { ...(prev[exerciseId] || {}), [setNumber]: value },
    }));
  }, []);

  const handleNoteChange = useCallback((exerciseId, value) => {
    setNotes((prev) => ({ ...prev, [exerciseId]: value }));
  }, []);

  const saveSectionFeedback = (skip = false) => {
    if (!feedbackSection) return;
    setSectionRatings((p) => ({
      ...p,
      [feedbackSection.id]: skip ? null : feedbackRating,
    }));
    setFeedbackSection(null);
    if (!skip) {
      toast.success(`✅ סקשן "${feedbackSection.section_name || ''}" הושלם`);
    }
  };

  const handleFinishClick = () => setShowSummary(true);

  // Build the set_logs payload for saveCompletedWorkout. Only emit logs
  // for exercises the trainee actually checked off — incomplete exercises
  // don't pollute the log table.
  const buildSetLogPayload = () => {
    const out = [];
    for (const ex of allExercises) {
      if (!done[ex.id]) continue;
      const mode = ex.mode || 'reps';
      const sets = Math.max(1, Number(ex.sets) || 1);
      const note = notes[ex.id] || null;
      for (let n = 1; n <= sets; n += 1) {
        const value = setValues[ex.id]?.[n];
        out.push({
          exercise_id: ex.id,
          set_number: n,
          mode,
          value,
          // Note rides on set #1 so the per-exercise note has a stable home.
          note: n === 1 ? note : null,
        });
      }
    }
    return out;
  };

  const handleConfirmFinish = async () => {
    setFinishing(true);
    try {
      await saveCompletedWorkout({
        planId: plan.id,
        traineeId,
        selfRating: avgRating,
        completionPercent,
        sectionRatings,
        setLogs: buildSetLogPayload(),
      });
      setShowSummary(false);
      // Green +1 flash, then bounce back to the folder list.
      setShowFlash(true);
      setTimeout(() => {
        setShowFlash(false);
        onCompleted && onCompleted();
      }, 1500);
    } catch (e) {
      toast.error('שמירה נכשלה: ' + (e?.message || ''));
      setFinishing(false);
    }
  };

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
            אימון בביצוע · {completedCount}/{totalExercises} תרגילים
          </div>
        </div>
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
      </div>

      <div style={{ padding: '12px 14px' }}>
        {(plan?.sections || []).map((section) => {
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
                    background: '#FFF5EE',
                    color: ORANGE,
                    border: `1px solid ${ORANGE}`,
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
                  completed={!!done[ex.id]}
                  note={notes[ex.id]}
                  setValues={setValues[ex.id]}
                  onToggleComplete={handleToggleComplete}
                  onSetChange={handleSetChange}
                  onNoteChange={handleNoteChange}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Section completion popup. The X button skips with rating=null —
          the section is still recorded as "done" but unscored. */}
      <Dialog open={!!feedbackSection} onOpenChange={(open) => { if (!open) saveSectionFeedback(true); }}>
        <DialogContent
          className="w-[90%] sm:max-w-[425px] bg-white p-5 relative rounded-2xl border-none shadow-2xl z-[100] fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-h-[80vh] overflow-y-auto outline-none"
          dir="rtl"
        >
          <button
            type="button"
            onClick={() => saveSectionFeedback(true)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="דלג"
          >
            <X className="w-5 h-5" />
          </button>
          <DialogTitle className="text-lg font-black text-center" style={{ color: ORANGE }}>
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
            <textarea
              placeholder="הערה (אופציונלי)"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: 10,
                border: '1px solid #F0E4D0', borderRadius: 8, fontSize: 13,
                outline: 'none', boxSizing: 'border-box', resize: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => saveSectionFeedback(false)}
              style={{
                width: '100%', height: 48, borderRadius: 12,
                background: ORANGE, color: 'white', border: 'none',
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
              }}
            >
              שמור והמשך
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Workout completion popup — dark theme, big score, stats grid. */}
      <Dialog open={showSummary} onOpenChange={(open) => { if (!finishing) setShowSummary(open); }}>
        <DialogContent
          className="w-[90%] sm:max-w-[425px] p-6 text-center relative rounded-2xl border-none shadow-2xl z-[100] fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-h-[80vh] overflow-y-auto outline-none text-white"
          style={{ backgroundColor: DARK }}
          dir="rtl"
        >
          {!finishing && (
            <button
              type="button"
              onClick={() => setShowSummary(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-1"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          )}
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
              <div style={{ fontSize: 56, fontWeight: 700, color: ORANGE, lineHeight: 1 }}>
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
                <div className="text-xl font-black text-white">{formatSeconds(totalWorkSeconds)}</div>
                <div className="text-[10px] text-gray-400 font-bold uppercase">זמן עבודה</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleConfirmFinish}
              disabled={finishing}
              style={{
                width: '100%', height: 52, borderRadius: 12,
                background: ORANGE, color: 'white', border: 'none',
                fontSize: 16, fontWeight: 800,
                cursor: finishing ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
              }}
            >
              {finishing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שמור וסיים'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Green +1 flash. Pure CSS animation, no library. */}
      {showFlash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(34,197,94,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeFlash 1.5s ease forwards',
          pointerEvents: 'none',
        }}>
          <style>{`
            @keyframes fadeFlash {
              0%   { opacity: 0; transform: scale(0.8); }
              20%  { opacity: 1; transform: scale(1); }
              80%  { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(1.05); }
            }
          `}</style>
          <div style={{
            color: 'white', fontSize: 64, fontWeight: 900, textAlign: 'center',
            textShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            +1 אימון
            <div style={{ fontSize: 24, marginTop: 8, fontWeight: 700 }}>נשמר! 💪</div>
          </div>
        </div>
      )}
    </div>
  );
}
