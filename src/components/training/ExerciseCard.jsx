import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { notifyExerciseCompleted } from "@/functions/notificationTriggers";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { upsertTraineeProgress } from "@/lib/traineeProgressApi";
import ExerciseCheckbox from "./ExerciseCheckbox";
import ExerciseNotePopup from "./ExerciseNotePopup";
import { useLongPress } from "@/lib/useLongPress";

const fmtTime = (v) => {
  if (!v && v !== 0) return null;
  if (typeof v === "string" && v.includes(":")) {
    const [m, s] = v.split(":").map(Number);
    const total = (m || 0) * 60 + (s || 0);
    if (total === 0) return null;
    if (total % 60 === 0) return `${total / 60} דק׳`;
    return total < 60 ? `${total} שנ׳` : `${m}:${String(s).padStart(2, "0")}`;
  }
  const n = parseInt(v);
  if (isNaN(n) || n === 0) return null;
  if (n % 60 === 0) return `${n / 60} דק׳`;
  return n < 60 ? `${n} שנ׳` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

function formatTempo(val) {
  if (val == null || val === '') return null;
  const str = String(val).trim();
  if (!str) return null;
  let parts = str.split('-').map(p => p.trim()).filter(Boolean);
  if (parts.length === 1 && /^\d{3,4}$/.test(parts[0])) {
    parts = parts[0].split('');
  }
  if (parts.length < 2) return str;
  const labels = ['שלילי', 'החזקה למטה', 'חיובי', 'החזקה למעלה'];
  return parts.map((p, i) => `${labels[i] || ''} ${p}"`).join(' · ');
}

const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
};

const getSubExercises = (ex) => {
  const fromChildren = asArray(ex.children);
  if (fromChildren.length) return fromChildren;
  const fromList = asArray(ex.exercise_list);
  if (fromList.length) return fromList;
  const fromSubExercises = asArray(ex.sub_exercises);
  if (fromSubExercises.length) return fromSubExercises;
  if (!ex.tabata_data) return [];
  try {
    const parsed = typeof ex.tabata_data === "string" ? JSON.parse(ex.tabata_data) : ex.tabata_data;
    if (parsed.sub_exercises) return parsed.sub_exercises;
    if (parsed.blocks) {
      const subs = [];
      parsed.blocks.forEach((block) => {
        (block.block_exercises || []).forEach((be) => {
          subs.push({ exercise_name: be.name, ...block });
        });
      });
      return subs;
    }
  } catch {}
  return [];
};

function buildMetaSegments(ex) {
  const segs = [];
  const reps = ex.reps && ex.reps !== '0' ? ex.reps : null;
  const sets = ex.sets && ex.sets !== '0' ? ex.sets : null;
  const rounds = ex.rounds && ex.rounds !== '0' ? ex.rounds : null;
  const work = fmtTime(ex.work_time);
  const rest = fmtTime(ex.rest_time);
  const restSets = fmtTime(ex.rest_between_sets);
  const hold = fmtTime(ex.static_hold_time);

  if (sets && reps) segs.push(`${sets} סטים × ${reps} חזרות`);
  else if (sets && work) segs.push(`${sets} סטים × ${work}`);
  else if (sets && hold) segs.push(`${sets} סטים × ${hold} החזקה`);
  else if (sets) segs.push(`${sets} סטים`);
  else if (reps) segs.push(`${reps} חזרות`);
  else if (rounds && work) segs.push(`${rounds} סבבים × ${work}`);
  else if (rounds) segs.push(`${rounds} סבבים`);
  else if (work) segs.push(`עבודה ${work}`);
  else if (hold) segs.push(`${hold} החזקה`);

  if (rest) segs.push(`מנוחה ${rest}`);
  else if (restSets) segs.push(`מנ׳ סטים ${restSets}`);

  if (ex.weight && ex.weight !== '0') {
    segs.push(`משקל ${ex.weight} ק"ג`);
  } else if (ex.weight_type && ex.weight_type !== 'bodyweight') {
    segs.push(ex.weight_type);
  }

  if (ex.rpe && ex.rpe !== '0') segs.push(`RPE ${ex.rpe}`);
  if (ex.tempo) {
    const tempo = formatTempo(ex.tempo);
    if (tempo) segs.push(`טמפו ${tempo}`);
  }
  // Surface every other coach-set parameter so the trainee can see
  // exactly what was prescribed without opening the editor. Hidden
  // empty values stay hidden — only set fields appear.
  if (ex.body_position) segs.push(ex.body_position);
  if (ex.equipment) segs.push(ex.equipment);
  if (ex.side) segs.push(ex.side);
  if (ex.grip) segs.push(ex.grip);
  if (ex.range_of_motion) segs.push(ex.range_of_motion);
  return segs;
}

function extractTabata(ex) {
  if (ex.mode !== 'טבטה') return null;
  let data = ex.tabata_data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const work = data.work_time ?? data.work_sec ?? null;
    const rest = data.rest_time ?? data.rest_sec ?? null;
    const rounds = data.rounds ?? null;
    const subs = Array.isArray(data.sub_exercises) ? data.sub_exercises
      : (Array.isArray(data.blocks) && data.blocks[0]?.block_exercises)
      ? data.blocks[0].block_exercises : [];
    if (work || rest || rounds || subs.length > 0) {
      return { work, rest, rounds, exercises: subs };
    }
  }
  if (ex.work_time || ex.rest_time || ex.rounds) {
    return {
      work: ex.work_time || null,
      rest: ex.rest_time || null,
      rounds: ex.rounds || null,
      exercises: [],
    };
  }
  return null;
}

function extractExerciseList(ex) {
  const isListMode = ['סופרסט', 'קומבו', 'רשימה'].includes(ex.mode)
    || ex.category === 'רשימת תרגילים'
    || ex.exercise_type === 'exercise_list';
  const subs = getSubExercises(ex);
  if (!isListMode && subs.length === 0) return null;
  if (subs.length === 0) return null;
  return { exercises: subs, label: ex.mode || 'רשימה' };
}

function describeSub(sub) {
  if (typeof sub === 'string') return { name: sub, detail: null };
  const name = sub.name || sub.exercise_name || 'תת-תרגיל';
  const bits = [];
  if (sub.reps) bits.push(`${sub.reps} חזרות`);
  if (sub.sets) bits.push(`${sub.sets} סטים`);
  if (sub.time || sub.work_time) bits.push(`${sub.time || sub.work_time}"`);
  if (sub.weight) bits.push(`${sub.weight} ק"ג`);
  return { name, detail: bits.join(' · ') || null };
}

export default function ExerciseCard({
  exercise, onToggleComplete, onEdit, onDelete, onRename,
  canEdit = false, isCoach = false, plan, traineeProgress,
}) {
  const queryClient = useQueryClient();
  const [renamingExercise, setRenamingExercise] = useState(false);
  const longPressRename = useLongPress(() => {
    if (canEdit && onRename) setRenamingExercise(true);
  });
  if (!exercise) return null;

  const handleToggleComplete = async (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (onToggleComplete) onToggleComplete(exercise);
    if (!isCoach && !exercise.completed && plan?.created_by) {
      try {
        const currentUser = await base44.auth.me();
        if (currentUser?.id) {
          await notifyExerciseCompleted({
            coachId: plan.created_by, traineeName: currentUser.full_name,
            traineeId: currentUser.id, exerciseName: exercise.exercise_name || exercise.name || "תרגיל",
          });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      } catch {}
    }
  };

  const subExercises = getSubExercises(exercise);
  const planId = plan?.id || null;
  const savedFeedback = traineeProgress?.feedback || '';

  const [showNotePopup, setShowNotePopup] = useState(false);
  const [feedback, setFeedback] = useState(savedFeedback || '');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const debounceRef = useRef(null);
  const lastPersistedRef = useRef(savedFeedback || '');

  useEffect(() => {
    setFeedback(savedFeedback || '');
    lastPersistedRef.current = savedFeedback || '';
  }, [exercise.id, savedFeedback]);

  const queueSave = (next) => {
    setFeedback(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const value = (next || '').trim();
      if (value === (lastPersistedRef.current || '').trim()) return;
      try {
        setSavingFeedback(true);
        const traineeId = (await base44.auth.me())?.id;
        if (!traineeId || !exercise?.id) return;
        await upsertTraineeProgress({
          traineeId, exerciseId: exercise.id, planId,
          feedback: value || null,
        });
        lastPersistedRef.current = value;
      } catch (err) {
        console.warn('[ExerciseCard] feedback save failed:', err?.message);
      } finally {
        setSavingFeedback(false);
      }
    }, 500);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleCheckboxToggle = (_exId, _secId, willBeCompleted) => {
    if (willBeCompleted) {
      setShowNotePopup(true);
    } else {
      handleToggleComplete();
    }
  };

  const metaSegs = buildMetaSegments(exercise);
  const tabata = extractTabata(exercise);
  const exList = extractExerciseList(exercise);
  const coachNote = exercise.description || exercise.notes || exercise.coach_notes || null;
  const completed = !!exercise.completed;
  const showEditButtons = !!canEdit && (!!onEdit || !!onDelete);
  const handleDeleteClick = (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (!onDelete) return;
    if (!window.confirm('למחוק תרגיל זה?')) return;
    onDelete();
  };
  const handleEditClick = (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (onEdit) onEdit();
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 8,
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
      border: completed ? '1px solid #FFE0CC' : '1px solid #F0E4D0',
      borderRight: completed ? '3px solid #FF6F20' : '1px solid #F0E4D0',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      direction: 'rtl',
    }}>
      <ExerciseCheckbox
        exerciseId={exercise.id}
        sectionId={exercise.training_section_id}
        isCompleted={completed}
        onToggle={handleCheckboxToggle}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {renamingExercise ? (
          <input
            autoFocus
            defaultValue={exercise.exercise_name || exercise.name || ''}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const next = e.target.value.trim();
              setRenamingExercise(false);
              const current = exercise.exercise_name || exercise.name || '';
              if (next && next !== current) {
                onRename?.(exercise.id, next);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') {
                e.target.value = exercise.exercise_name || exercise.name || '';
                e.target.blur();
              }
            }}
            style={{
              fontSize: 18, fontWeight: 700, color: '#1a1a1a',
              marginBottom: 4, width: '100%',
              border: 'none', borderBottom: '2px solid #FF6F20',
              background: 'transparent', outline: 'none',
              padding: '2px 0', direction: 'rtl',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <div
            {...(canEdit ? longPressRename : {})}
            style={{
              fontSize: 18, fontWeight: 700, color: '#1a1a1a', marginBottom: 4,
              textDecoration: completed ? 'line-through' : 'none',
              textDecorationColor: completed ? '#FF6F20' : 'transparent',
              cursor: canEdit ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            {exercise.exercise_name || exercise.name || 'תרגיל'}
          </div>
        )}

        {metaSegs.length > 0 && (
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
            {metaSegs.join(' · ')}
          </div>
        )}

        {coachNote && (
          <div style={{ fontSize: 13, color: '#666', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
            {coachNote}
          </div>
        )}

        {tabata && (
          <div style={{ marginTop: 10, padding: 10, background: '#FFF9F0', borderRadius: 8, border: '1px solid #F0E4D0' }}>
            <div style={{ fontSize: 11, color: '#FF6F20', fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>טבטה</div>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: tabata.exercises.length > 0 ? 10 : 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>{tabata.work ?? '—'}{tabata.work ? "''" : ''}</div>
                <div style={{ fontSize: 11, color: '#888' }}>עבודה</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>{tabata.rest ?? '—'}{tabata.rest ? "''" : ''}</div>
                <div style={{ fontSize: 11, color: '#888' }}>מנוחה</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>{tabata.rounds ?? '—'}</div>
                <div style={{ fontSize: 11, color: '#888' }}>סבבים</div>
              </div>
            </div>
            {tabata.exercises.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>תרגילים בסבב:</div>
                {tabata.exercises.map((sub, i) => {
                  const { name, detail } = describeSub(sub);
                  return (
                    <div key={i} style={{ fontSize: 14, color: '#1a1a1a', padding: '3px 0' }}>
                      {i + 1}. {name}
                      {detail && (<span style={{ fontSize: 12, color: '#888', marginRight: 6 }}> · {detail}</span>)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!tabata && exList && (
          <div style={{ marginTop: 10, padding: 10, background: '#FFF9F0', borderRadius: 8, border: '1px solid #F0E4D0' }}>
            <div style={{ fontSize: 11, color: '#FF6F20', fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>רשימת תרגילים</div>
            {exList.exercises.map((sub, i) => {
              const { name, detail } = describeSub(sub);
              return (
                <div key={i} style={{ fontSize: 14, color: '#1a1a1a', padding: '4px 0', borderBottom: i < exList.exercises.length - 1 ? '1px solid #F0E4D0' : 'none' }}>
                  <div style={{ fontWeight: 500 }}>{i + 1}. {name}</div>
                  {detail && (<div style={{ fontSize: 12, color: '#666' }}>{detail}</div>)}
                </div>
              );
            })}
          </div>
        )}

        <input
          type="text"
          placeholder="הוסף משוב לתרגיל (אופציונלי)"
          value={feedback}
          onChange={(e) => queueSave(e.target.value)}
          style={{
            marginTop: 8, width: '100%', padding: '8px 10px',
            border: '1px solid #F0E4D0', borderRadius: 8,
            fontSize: 13, fontFamily: 'inherit', background: '#FFF9F0',
            direction: 'rtl', boxSizing: 'border-box', outline: 'none',
          }}
        />
        {savingFeedback && (
          <div style={{ fontSize: 11, color: '#FF6F20', marginTop: 2 }}>שומר משוב...</div>
        )}
      </div>

      {showEditButtons && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          alignItems: 'center', justifyContent: 'flex-start',
          flexShrink: 0,
        }}>
          {onEdit && (
            <button
              type="button"
              onClick={handleEditClick}
              aria-label="ערוך תרגיל"
              title="ערוך תרגיל"
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: '#FFF7ED', border: '1px solid #FFD9C2',
                color: '#FF6F20', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={handleDeleteClick}
              aria-label="מחק תרגיל"
              title="מחק תרגיל"
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: '#FEF2F2', border: '1px solid #FCA5A5',
                color: '#DC2626', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >
              🗑️
            </button>
          )}
        </div>
      )}

      {showNotePopup && (
        <ExerciseNotePopup
          exerciseName={exercise.exercise_name || exercise.name}
          onSave={async (note) => {
            try {
              if (note && exercise?.id) {
                const traineeId = (await base44.auth.me())?.id;
                if (traineeId) {
                  await upsertTraineeProgress({
                    traineeId, exerciseId: exercise.id, planId,
                    completed: true, feedback: note,
                  });
                  lastPersistedRef.current = note;
                  setFeedback(note);
                }
              }
            } catch (err) {
              console.warn('[ExerciseCard] note save failed:', err?.message);
            } finally {
              handleToggleComplete();
              setShowNotePopup(false);
            }
          }}
          onSkip={() => {
            handleToggleComplete();
            setShowNotePopup(false);
          }}
        />
      )}
    </div>
  );
}
