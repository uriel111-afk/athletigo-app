import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Per-set previous-performance + personal-record lookup for the trainee's
// open exercise card. Returns a map:
//
//   {
//     [exerciseId]: {
//       [setIndex]: {
//         previous_reps:  number | null,   // most-recent execution's reps for this set
//         record_reps:    number | null,   // max reps for this set across all executions
//         previous_time:  number | null,   // most-recent execution's time_completed
//         record_time:    number | null,   // max time_completed across all executions
//       }
//     }
//   }
//
// One read per (planId, traineeId, currentExecutionId). currentExecutionId
// is excluded so a partially-filled current session never leaks into its
// own "previous" line. setIndex is 0-based to match the in-memory setLogs
// shape (set_number on the DB is 1-based; we subtract here).
//
// Returns an empty object until the fetch resolves so consumers can render
// without conditional checks.
export function usePreviousSetData(planId, traineeId, currentExecutionId) {
  const [data, setData] = useState({});

  useEffect(() => {
    if (!planId || !traineeId) {
      setData({});
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        // PostgREST embedded select via the exercise_set_logs →
        // workout_executions FK. Filters on the embedded row run
        // server-side; we still drop the current execution client-side
        // because PostgREST's `.neq` on embedded fields produces a join
        // that doesn't compose well with `.eq` filters above.
        const { data: rows, error } = await supabase
          .from('exercise_set_logs')
          .select(`
            exercise_id,
            set_number,
            reps_completed,
            time_completed,
            execution_id,
            workout_executions!inner(executed_at, plan_id, trainee_id)
          `)
          .eq('workout_executions.plan_id', planId)
          .eq('workout_executions.trainee_id', traineeId)
          .order('executed_at', { foreignTable: 'workout_executions', ascending: false });

        if (cancelled) return;
        if (error) {
          console.warn('[usePreviousSetData] fetch failed:', error.message);
          setData({});
          return;
        }

        const next = {};
        for (const row of rows || []) {
          if (currentExecutionId && row.execution_id === currentExecutionId) continue;
          const exId = row.exercise_id;
          const setIdx = Math.max(0, (Number(row.set_number) || 1) - 1);
          const reps = row.reps_completed != null && Number(row.reps_completed) > 0
            ? Number(row.reps_completed) : null;
          const time = row.time_completed != null && Number(row.time_completed) > 0
            ? Number(row.time_completed) : null;
          if (reps == null && time == null) continue;

          if (!next[exId]) next[exId] = {};
          if (!next[exId][setIdx]) {
            next[exId][setIdx] = {
              previous_reps: null, record_reps: null,
              previous_time: null, record_time: null,
            };
          }
          const slot = next[exId][setIdx];

          // Most-recent (previous_*) fills only on first sighting since
          // rows are already ordered DESC by executed_at server-side.
          if (reps != null) {
            if (slot.previous_reps == null) slot.previous_reps = reps;
            if (slot.record_reps == null || reps > slot.record_reps) slot.record_reps = reps;
          }
          if (time != null) {
            if (slot.previous_time == null) slot.previous_time = time;
            if (slot.record_time == null || time > slot.record_time) slot.record_time = time;
          }
        }
        setData(next);
      } catch (e) {
        console.warn('[usePreviousSetData] threw:', e?.message);
        if (!cancelled) setData({});
      }
    })();

    return () => { cancelled = true; };
  }, [planId, traineeId, currentExecutionId]);

  return data;
}
