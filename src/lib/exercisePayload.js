/**
 * exercisePayload — the shared extraction of the exercise-row
 * normalisation that UnifiedPlanBuilder.jsx:1116 has carried inline
 * since the builder was written.
 *
 * It is lifted here VERBATIM in behaviour so that a second writer of
 * the `exercises` table (createPlanFromSpec, in plansApi.js) cannot
 * normalise differently from the coach's own editor.
 *
 * UnifiedPlanBuilder still holds its own identical copy. Pointing it
 * at this module is a one-line import change, but that file is the
 * coach side and is out of scope for the task that created this
 * module — fold it in next time UnifiedPlanBuilder is legitimately
 * open, and delete the local definition then.
 */

/**
 * prepareExerciseData — the single choke point every exercise write
 * passes through.
 *
 * Two rules, both load-bearing:
 *
 * 1. `completed` is STRIPPED. The exercises row holds the coach's plan
 *    definition; the column is global across every trainee and every
 *    run, so it is never authored. Per-run progress lives in
 *    exercise_executions (is_completed, keyed by
 *    workout_execution_id).
 *
 * 2. An empty string becomes NULL. Postgres will happily store '' in a
 *    text column, and every reader in this app tests for null, so ''
 *    reads as "present but blank" everywhere it lands.
 *
 * Note what it does NOT do: it does not drop unknown keys. That is
 * deliberate — silently dropping a key is the failure mode
 * createPlanFromSpec's column validation exists to prevent.
 */
export function prepareExerciseData(formData) {
  const { completed: _dropCompleted, ...rest } = formData || {};
  const data = { ...rest };
  Object.keys(data).forEach((key) => {
    if (typeof data[key] === 'string' && data[key] === '') {
      data[key] = null;
    }
  });
  return data;
}

export default prepareExerciseData;
