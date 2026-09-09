import { supabase } from '@/lib/supabaseClient';
import { exerciseInfoFor, unitLabel } from '@/lib/recordExercises';
import { checkAchievement } from '@/lib/goalsApi';

// THE personal_records write.
//
// Moved here verbatim out of NewRecordDialog's save handler so there
// is exactly one insert path for a record, whichever screen the
// trainee entered it on. The dialog still owns its form and its
// toasts; this owns the bookkeeping the columns need:
//
//   previous_value  the most recent value for (trainee, name)
//   improvement     new − previous
//   is_personal_best computed against the max, and the prior holder
//                   is demoted in the same flow
//   a 'new_record' notification on a PB
//   checkAchievement, so an active goal flips to הושג
//
// It does NOT touch roadmap_stations. A station clears inside the
// database — trg_clear_roadmap_stations on this very insert — so a
// trainee needs no write grant there and no client can forget to
// stamp it.
//
// Returns { isPersonalBest, achievement }. Throws on insert failure;
// the notification and the achievement check are best-effort.
export async function createPersonalRecord({
  traineeId,
  coachId = null,
  isCoach = false,
  currentUserId = null,
  exerciseName,
  value,
  unit = 'reps',
  recordType = 'max_reps',
  date = null,
  notes = null,
  videoUrl = null,
  rpe = null,
  quality = null,
  techniqueName = null,
  exerciseCategory = null,
}) {
  const numericValue = Number(value);
  if (!traineeId) throw new Error('חסר מתאמן');
  if (!exerciseName) throw new Error('חסר שם תרגיל');
  if (!Number.isFinite(numericValue)) throw new Error('ערך לא תקין');

  const today = new Date().toISOString().split('T')[0];
  const exerciseInfo = exerciseInfoFor(exerciseName);

  // Pull existing records for this exercise to compute previous_value,
  // improvement, and is_personal_best.
  const { data: prior, error: priorErr } = await supabase
    .from('personal_records')
    .select('id, value, date, is_personal_best')
    .eq('trainee_id', traineeId)
    .eq('name', exerciseName)
    .or('status.is.null,status.neq.deleted');
  if (priorErr) {
    console.error('[Records] prior fetch failed:', priorErr);
  }

  let previousValue = null;
  let maxPrev = -Infinity;
  let priorPbId = null;
  if (Array.isArray(prior) && prior.length) {
    const byDateDesc = [...prior].sort(
      (a, b) => String(b.date || '').localeCompare(String(a.date || ''))
    );
    previousValue = Number(byDateDesc[0]?.value);
    for (const r of prior) {
      const v = Number(r.value);
      if (v > maxPrev) maxPrev = v;
      if (r.is_personal_best) priorPbId = r.id;
    }
  }

  const isPersonalBest = !Number.isFinite(maxPrev) || numericValue > maxPrev;
  const improvement = Number.isFinite(previousValue)
    ? +(numericValue - previousValue).toFixed(2)
    : null;

  if (isPersonalBest && priorPbId) {
    await supabase
      .from('personal_records')
      .update({ is_personal_best: false })
      .eq('id', priorPbId);
  }

  const payload = {
    trainee_id: traineeId,
    coach_id: isCoach ? (coachId || currentUserId || null) : null,
    record_type: recordType || 'max_reps',
    name: exerciseName,
    unit: unit || 'reps',
    value: numericValue,
    date: date || today,
    notes: notes || null,
    exercise_category: exerciseCategory || exerciseInfo?.category || 'general',
    previous_value: Number.isFinite(previousValue) ? previousValue : null,
    improvement,
    video_url: videoUrl || null,
    rpe: rpe != null && rpe !== '' ? Number(rpe) : null,
    quality_rating: quality != null && quality !== '' ? Number(quality) : null,
    technique_acquired: recordType === 'technique',
    technique_name: recordType === 'technique' ? (techniqueName || null) : null,
    is_personal_best: isPersonalBest,
    created_by_role: isCoach ? 'coach' : 'trainee',
    created_by_user_id: currentUserId || null,
  };

  const { error: insertErr } = await supabase
    .from('personal_records')
    .insert(payload);
  if (insertErr) {
    console.error('[Records] insert error:', insertErr);
    throw insertErr;
  }

  if (isPersonalBest) {
    try {
      await supabase.from('notifications').insert({
        user_id: traineeId,
        type: 'new_record',
        title: '🏆 שיא אישי חדש!',
        message: `${exerciseName}: ${numericValue} ${unitLabel(unit)}`,
        is_read: false,
      });
    } catch (e) {
      console.warn('[Records] notification failed:', e?.message);
    }
  }

  // Goal achievement check — fires AFTER the insert lands so it reads
  // against the freshest state. Best-effort: failure here doesn't
  // undo the record save.
  let achievement = null;
  try {
    achievement = await checkAchievement(traineeId, exerciseName, numericValue);
  } catch (e) {
    console.warn('[Records] achievement check failed:', e?.message);
  }

  return { isPersonalBest, achievement };
}
