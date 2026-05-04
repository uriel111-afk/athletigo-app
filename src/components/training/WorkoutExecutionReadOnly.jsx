import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  getExecutionWithSetLogs, indexSetLogs, valueFromLog,
} from '@/lib/workoutExecutionApi';

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';
const GREEN = '#16A34A';

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

// hasNumeric / buildParamsLine mirror the trainee active flow's
// formatter. We never render a "?" — segments only appear when the
// underlying field has a real, non-zero value.
function hasNumeric(v) {
  if (v == null || v === '' || v === '0') return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}
function buildParamsLine(ex) {
  const main = [];
  if (hasNumeric(ex.sets))            main.push(`${ex.sets} סטים`);
  if (hasNumeric(ex.reps))            main.push(`${ex.reps} חזרות`);
  else if (hasNumeric(ex.work_time))  main.push(`${ex.work_time} שניות`);
  else if (hasNumeric(ex.rounds))     main.push(`${ex.rounds} סבבים`);
  else if (hasNumeric(ex.static_hold_time)) main.push(`${ex.static_hold_time} החזקה`);

  const extras = [];
  if (hasNumeric(ex.rest_time)) extras.push(`מנוחה ${ex.rest_time}''`);
  if (hasNumeric(ex.weight))    extras.push(`${ex.weight} ק״ג`);
  if (hasNumeric(ex.rpe))       extras.push(`RPE ${ex.rpe}`);
  if (ex.tempo)                 extras.push(`טמפו ${ex.tempo}`);

  const mainStr = main.join(' × ');
  const extrasStr = extras.join(' · ');
  if (mainStr && extrasStr) return `${mainStr} · ${extrasStr}`;
  return mainStr || extrasStr || '';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

function ExerciseRow({ exercise, completed, savedLogs }) {
  const mode = exercise.mode || 'reps';
  const sets = Math.max(1, Number(exercise.sets) || 1);
  const target = targetForMode(exercise);
  const targetStr = target === '' || target == null ? '' : String(target);
  const noteRow = savedLogs?.[1];
  const note = noteRow?.notes || '';

  return (
    <div style={{
      background: 'white',
      border: '1px solid #EEE',
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
      opacity: completed ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          aria-label="בוצע"
          style={{
            width: 22, height: 22, borderRadius: 6,
            border: `2px solid ${completed ? GREEN : '#D0D0D0'}`,
            background: completed ? GREEN : 'white',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 4,
          }}
        >
          {completed && <Check className="w-3 h-3" style={{ color: 'white' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: DARK, marginBottom: 4 }}>
            {exercise.exercise_name || exercise.name || 'תרגיל'}
          </div>
          {(() => {
            const params = buildParamsLine(exercise);
            return params ? (
              <div style={{ fontSize: 12, color: '#666' }}>{params}</div>
            ) : null;
          })()}
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

      {sets > 1 && (() => {
        // Materialize each set as { set_number, reps_completed,
        // difficulty_rating, completed }. Missing rows render as
        // an em-dash row so coach + trainee see exactly which sets
        // were skipped vs which were logged.
        const setLogs = Array.from({ length: sets }, (_, i) => {
          const n = i + 1;
          const row = savedLogs?.[n] || {};
          return {
            set_number: n,
            reps_completed: row.reps_completed ?? null,
            difficulty_rating: row.difficulty_rating ?? null,
            completed: !!row.completed,
            time_completed: row.time_completed ?? null,
            weight_used: row.weight_used ?? null,
          };
        });
        const valueLabel = (log) => {
          const v = valueFromLog(log, mode);
          if (v == null || v === '' || v === 0 || v === '0') return null;
          const unit = modeLabel(mode);
          return `${v} ${unit}`;
        };
        const totalReps = setLogs.reduce((a, b) => a + (Number(b.reps_completed) || 0), 0);
        const ratedSets = setLogs.filter((l) => l.difficulty_rating != null);
        const avgDiff = ratedSets.length > 0
          ? ratedSets.reduce((a, b) => a + Number(b.difficulty_rating || 0), 0) / ratedSets.length
          : null;

        return (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #EEE' }}>
            {setLogs.map((log) => {
              const label = valueLabel(log);
              return (
                <div key={log.set_number} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid #F9F9F9',
                }}>
                  <span style={{ fontSize: 12, color: '#888', minWidth: 40 }}>
                    סט {log.set_number}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 14, fontWeight: 700, color: DARK,
                    textAlign: 'right', minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {label || '—'}
                  </span>
                  {log.difficulty_rating != null && (
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: ORANGE,
                      background: '#FFF5EE', padding: '2px 8px',
                      borderRadius: 999, flexShrink: 0,
                    }}>
                      קושי {log.difficulty_rating}/10
                    </span>
                  )}
                  {log.completed && (
                    <span style={{ color: GREEN, fontSize: 14, flexShrink: 0 }}>✓</span>
                  )}
                </div>
              );
            })}

            {(totalReps > 0 || avgDiff != null) && (
              <div style={{
                marginTop: 8,
                padding: '8px 12px',
                background: '#FFF5EE',
                borderRadius: 8,
                fontSize: 12,
                color: ORANGE,
                fontWeight: 600,
              }}>
                {[
                  totalReps > 0 ? `סה"כ: ${totalReps} ${modeLabel(mode)}` : null,
                  avgDiff != null ? `קושי ממוצע: ${avgDiff.toFixed(1)}/10` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        );
      })()}

      {note && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            width: '100%', minHeight: 36, padding: '8px 10px',
            border: '1px solid #E5E5E5', borderRadius: 8,
            fontSize: 13, background: '#FAFAFA', color: '#444',
            boxSizing: 'border-box',
          }}>
            {note}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkoutExecutionReadOnly({
  plan, executionId, onBack, compact = false,
}) {
  const [loading, setLoading] = useState(!!executionId);
  const [execution, setExecution] = useState(null);
  const [setLogIndex, setSetLogIndex] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!executionId) { setLoading(false); setExecution(null); return; }
    setLoading(true);
    getExecutionWithSetLogs(executionId)
      .then(({ execution: exec, setLogs }) => {
        if (cancelled) return;
        setExecution(exec);
        setSetLogIndex(indexSetLogs(setLogs));
      })
      .catch((e) => { if (!cancelled) setError(e?.message || 'load failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [executionId]);

  const sectionRatings = execution?.section_ratings || {};

  // An exercise is shown "completed" if it has any set logs from this run.
  const completedSet = useMemo(() => {
    const s = new Set();
    for (const exId of Object.keys(setLogIndex)) s.add(exId);
    return s;
  }, [setLogIndex]);

  const wrapperStyle = compact
    ? { background: 'transparent' }
    : { background: '#FAFAFA', minHeight: '100vh', paddingBottom: 80 };

  return (
    <div dir="rtl" style={wrapperStyle}>
      {!compact && (
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
              {executionId
                ? `תצוגה בלבד · ${formatDate(execution?.executed_at)}`
                : 'תצוגת תבנית · קריאה בלבד'}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: compact ? 16 : 40, textAlign: 'center' }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: ORANGE, display: 'inline-block' }} />
        </div>
      ) : error ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
          לא הצלחנו לטעון את הביצוע ({error})
        </div>
      ) : (
        <div style={{ padding: compact ? '8px 0 0' : '12px 14px' }}>
          {/* Average score card — only when we actually have an execution
              (and never in compact mode, where the parent card already
              shows the score badge). */}
          {!compact && execution?.self_rating != null && (
            <div style={{
              background: '#FFF5EE',
              border: `2px solid ${ORANGE}`,
              borderRadius: 16, padding: 16,
              marginBottom: 14, textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: '#888' }}>הציון לאימון</div>
              <div style={{ fontSize: 42, fontWeight: 700, color: ORANGE, lineHeight: 1 }}>
                {Number(execution.self_rating).toFixed(1)}
              </div>
              {execution.completion_percent != null && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  השלמה: {execution.completion_percent}%
                </div>
              )}
            </div>
          )}

          {(plan?.sections || []).map((section) => {
            const rating = sectionRatings[section.id];
            return (
              <div key={section.id} style={{
                background: 'white', borderRadius: 14,
                borderLeft: `4px solid ${ORANGE}`,
                padding: 12, marginBottom: 10,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, gap: 8,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: DARK }}>
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
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    completed={completedSet.has(ex.id)}
                    savedLogs={setLogIndex[ex.id]}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
