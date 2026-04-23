import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useActiveTimer } from "@/contexts/ActiveTimerContext";

// Full-screen trainee-side exercise execution — captures:
//   - completed sets (toggle grid)
//   - mastery 1–10
//   - perceived difficulty 1–4
//   - free-form reflection
// Persists a row to `exercise_executions` which powers per-plan scoring
// and the progress chart. Plays nicely with the existing Exercise entity
// update — callers can pass onCompletedExercise to also flip the plan's
// per-exercise `completed` flag so progress bars stay accurate.

const CHIP_STYLE = {
  padding: '4px 10px',
  background: '#FFF0E4',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#FF6F20',
};

export default function ExerciseExecution({
  isOpen,
  onClose,
  exercise,
  planId,
  traineeId,
  onCompletedExercise,
}) {
  const { setShowTabata } = useActiveTimer() || {};
  const plannedSets = Number(exercise?.sets) > 0 ? Number(exercise.sets) : 4;

  const [completedSets, setCompletedSets] = useState([]);
  const [mastery, setMastery] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset per exercise open
  useEffect(() => {
    if (!isOpen) return;
    setCompletedSets([]);
    setMastery(0);
    setDifficulty(0);
    setReflection("");
  }, [isOpen, exercise?.id]);

  const exerciseName = exercise?.exercise_name || exercise?.name || "תרגיל";

  const tabataCfg = useMemo(() => {
    if (!exercise) return null;
    // Normalize multiple historical shapes
    const raw = exercise.tabata_config || exercise.tabata_data || null;
    if (!raw) return null;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const work = Number(parsed.work_sec ?? parsed.work ?? 20) || 20;
      const rest = Number(parsed.rest_sec ?? parsed.rest ?? 10) || 10;
      const rounds = Number(parsed.rounds ?? 8) || 8;
      return { work, rest, rounds };
    } catch { return null; }
  }, [exercise]);

  if (!isOpen || !exercise) return null;

  const toggleSet = (i) => {
    setCompletedSets((prev) => prev.includes(i) ? prev.filter(n => n !== i) : [...prev, i]);
  };

  const openTabata = () => {
    if (!tabataCfg) return;
    try {
      localStorage.setItem('tb3', JSON.stringify({
        prep: 10,
        work: tabataCfg.work,
        rest: tabataCfg.rest,
        rb: 60,
        rounds: tabataCfg.rounds,
        sets: 1,
      }));
    } catch {}
    if (setShowTabata) setShowTabata(true);
  };

  const saveExecution = async () => {
    if (saving) return;
    if (mastery === 0) { toast.error("דרגו את השליטה"); return; }
    if (difficulty === 0) { toast.error("דרגו את הקושי"); return; }
    setSaving(true);
    try {
      await base44.entities.ExerciseExecution.create({
        trainee_id: traineeId || null,
        plan_id: planId || exercise.training_plan_id || null,
        exercise_id: exercise.id || null,
        exercise_name: exerciseName,
        sets_completed: completedSets.length,
        mastery_rating: mastery,
        difficulty,
        reflection: reflection.trim() || null,
      });
      if (typeof onCompletedExercise === 'function') {
        try { await onCompletedExercise(exercise); } catch {}
      }
      toast.success("✅ תרגיל נרשם");
      onClose?.();
    } catch (e) {
      console.error("[ExerciseExecution] save failed:", e);
      toast.error("שגיאה בשמירה: " + (e?.message || "נסה שוב"));
    } finally {
      setSaving(false);
    }
  };

  const masteryColor = (n) => (n <= 3 ? '#dc2626' : n <= 6 ? '#EAB308' : '#16a34a');

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#FFF9F0',
      zIndex: 8000, direction: 'rtl',
      overflowY: 'auto', padding: '16px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '16px',
      }}>
        <button onClick={onClose} style={{
          background: 'none', border: 'none',
          fontSize: '20px', cursor: 'pointer',
          color: '#1a1a1a',
        }}>✕</button>
        <div style={{ fontSize: '18px', fontWeight: 700, textAlign: 'center', flex: 1 }}>
          {exerciseName}
        </div>
        <div style={{ width: '28px' }} />
      </div>

      {/* Exercise info */}
      <div style={{
        background: 'white', borderRadius: '14px',
        padding: '14px', marginBottom: '12px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: exercise.notes || exercise.coach_notes ? '10px' : 0 }}>
          {exercise.sets && <span style={CHIP_STYLE}>{exercise.sets} סטים</span>}
          {exercise.reps && <span style={CHIP_STYLE}>{exercise.reps} חזרות</span>}
          {exercise.weight && <span style={CHIP_STYLE}>{exercise.weight} ק״ג</span>}
          {exercise.rpe && <span style={CHIP_STYLE}>RPE {exercise.rpe}</span>}
        </div>
        {(exercise.notes || exercise.coach_notes) && (
          <div style={{ fontSize: '13px', color: '#888' }}>
            {exercise.coach_notes || exercise.notes}
          </div>
        )}
      </div>

      {/* Tabata launch */}
      {tabataCfg && (
        <button onClick={openTabata} style={{
          width: '100%', padding: '14px',
          background: '#FF6F20', color: 'white',
          border: 'none', borderRadius: '14px',
          fontSize: '16px', fontWeight: 600,
          marginBottom: '12px', cursor: 'pointer',
        }}>
          ⏱ הפעל טבטה ({tabataCfg.work}s עבודה / {tabataCfg.rest}s מנוחה / {tabataCfg.rounds} סבבים)
        </button>
      )}

      {/* Set counter */}
      <div style={{ background: 'white', borderRadius: '14px', padding: '14px', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>סטים שהושלמו</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {Array.from({ length: plannedSets }, (_, i) => {
            const on = completedSets.includes(i);
            return (
              <div key={i} onClick={() => toggleSet(i)} style={{
                width: '44px', height: '44px',
                borderRadius: '12px',
                background: on ? '#FF6F20' : '#F0F0F0',
                color: on ? 'white' : '#888',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', fontWeight: 600, cursor: 'pointer',
                userSelect: 'none',
              }}>{i + 1}</div>
            );
          })}
        </div>
      </div>

      {/* Mastery 1-10 */}
      <div style={{ background: 'white', borderRadius: '14px', padding: '14px', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>דירוג שליטה</div>
        <div style={{ display: 'flex', gap: '4px', direction: 'ltr' }}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <div key={n} onClick={() => setMastery(n)} style={{
              flex: 1, height: '36px',
              borderRadius: '8px',
              background: mastery >= n ? masteryColor(n) : '#F0F0F0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 600,
              color: mastery >= n ? 'white' : '#888',
              cursor: 'pointer', userSelect: 'none',
            }}>{n}</div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', marginTop: '4px' }}>
          <span>קל</span><span>בינוני</span><span>קשה</span>
        </div>
      </div>

      {/* Difficulty */}
      <div style={{ background: 'white', borderRadius: '14px', padding: '14px', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>רמת קושי</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { v: 1, label: 'קל',       icon: '😊' },
            { v: 2, label: 'בינוני',   icon: '😐' },
            { v: 3, label: 'קשה',      icon: '😤' },
            { v: 4, label: 'מאוד קשה', icon: '🔥' },
          ].map(d => {
            const on = difficulty === d.v;
            return (
              <div key={d.v} onClick={() => setDifficulty(d.v)} style={{
                flex: 1, padding: '10px 4px',
                borderRadius: '12px',
                background: on ? '#FFF0E4' : '#F0F0F0',
                border: on ? '2px solid #FF6F20' : '1px solid transparent',
                textAlign: 'center', cursor: 'pointer',
                userSelect: 'none',
              }}>
                <div style={{ fontSize: '20px' }}>{d.icon}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '2px', color: on ? '#FF6F20' : '#888' }}>
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reflection */}
      <div style={{ background: 'white', borderRadius: '14px', padding: '14px', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>💭 רפלקציה</div>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="איך הרגשת? מה היה קשה? מה השתפר?"
          style={{
            width: '100%', padding: '10px',
            borderRadius: '12px',
            border: '0.5px solid #F0E4D0',
            fontSize: '13px', minHeight: '60px',
            resize: 'vertical', direction: 'rtl',
            boxSizing: 'border-box', outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <button onClick={saveExecution} disabled={saving} style={{
        width: '100%', padding: '14px',
        background: saving ? '#ccc' : '#FF6F20',
        color: 'white', border: 'none',
        borderRadius: '14px',
        fontSize: '16px', fontWeight: 600,
        cursor: saving ? 'default' : 'pointer',
        marginBottom: '20px',
      }}>
        {saving ? 'שומר...' : '✅ סיימתי תרגיל'}
      </button>
    </div>
  );
}
