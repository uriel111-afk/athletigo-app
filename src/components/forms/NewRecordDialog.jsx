import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  DEFAULT_EXERCISES, RECORD_UNITS, RECORD_TYPE_OPTIONS,
  exerciseInfoFor, unitLabel,
} from '@/lib/recordExercises';
import { checkAchievement } from '@/lib/goalsApi';

const O = '#FF6F20';
const BORDER = '#F0E4D0';

// Single shared "Add Record" bottom-sheet — used from:
//   • Dashboard (no traineeId prop → renders trainee picker at top,
//     coach selects whose record this is)
//   • TraineeProfile › ProgressTab (traineeId from URL prop → no picker)
//   • TraineeHome (traineeId = current user → no picker)
//
// Save flow is identical regardless of entry point: writes to
// personal_records, computes previous_value / improvement /
// is_personal_best against existing rows for (trainee, name),
// demotes the prior PB row when broken, fires a 'new_record'
// notification on PB. The wrapper page just decides who the
// trainee is and provides an onSuccess callback to refresh its
// local data.
export default function NewRecordDialog({
  isOpen,
  onClose,
  traineeId,        // string | null — null means show picker
  coachId,          // owner for RLS (mirrors ProgressTab's coach_id pattern)
  trainees,         // [{ id, full_name }] — only consumed when traineeId is null
  currentUserId,    // user.id of whoever is invoking the form
  isCoach,          // role marker — drives created_by_role + coach_id columns
  onSuccess,        // () => void — called after successful save
  editData,         // existing personal_records row — when set, the form
                    // prefills from it and saves as UPDATE instead of INSERT
  onAchievement,    // ({ goal, value, exerciseName }) — fired when the
                    // saved value crosses an active goal's target so the
                    // page can show a celebration popup
}) {
  const isEdit = !!editData?.id;
  const today = new Date().toISOString().split('T')[0];
  const initialForm = {
    pickedTraineeId: '',
    exercise: '',
    customName: '',
    type: 'max_reps',
    value: '',
    unit: 'reps',
    date: today,
    techniqueName: '',
    rpe: 7,
    quality: 7,
    notes: '',
    videoUrl: '',
  };
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Reset on every open so a stale form doesn't bleed across sessions.
  // When editData is provided, prefill from the existing row instead.
  useEffect(() => {
    if (!isOpen) return;
    if (isEdit) {
      const exerciseName = editData.name || editData.exercise_name || '';
      // Match against DEFAULT_EXERCISES — anything not on the canonical
      // list is treated as a custom name so the user can still rename.
      const isKnown = DEFAULT_EXERCISES.some(e => e.name === exerciseName);
      setForm({
        pickedTraineeId: editData.trainee_id || '',
        exercise: isKnown ? exerciseName : '__custom__',
        customName: isKnown ? '' : exerciseName,
        type: editData.record_type || 'max_reps',
        value: editData.value != null ? String(editData.value) : '',
        unit: editData.unit || 'reps',
        date: editData.date || today,
        techniqueName: editData.technique_name || '',
        rpe: editData.rpe ?? 7,
        quality: editData.quality_rating ?? 7,
        notes: editData.notes || '',
        videoUrl: editData.video_url || '',
      });
    } else {
      setForm(initialForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEdit, editData?.id]);

  if (!isOpen) return null;

  const resolvedTraineeId = traineeId || form.pickedTraineeId || null;
  const resolvedExerciseName = form.exercise === '__custom__'
    ? form.customName.trim()
    : (form.exercise || '').trim();

  const canSave =
    !!resolvedTraineeId
    && !!resolvedExerciseName
    && form.value !== ''
    && !Number.isNaN(Number(form.value))
    && !saving;

  const handleSaveRecord = async () => {
    if (!canSave) return;
    setSaving(true);
    const numericValue = Number(form.value);
    const exerciseName = resolvedExerciseName;
    const exerciseInfo = exerciseInfoFor(exerciseName);

    // EDIT mode — UPDATE the existing row in place. We don't recompute
    // is_personal_best / improvement here on purpose: those derive from
    // the row's relative position in the timeline, and recomputing them
    // for a single edited row would corrupt the rest of the history.
    // The coach can clear is_personal_best by editing a different row
    // that displaces it. Notes / value / date / RPE / unit / video are
    // the typical fix-up fields and they all flow through.
    if (isEdit) {
      const updates = {
        record_type: form.type || 'max_reps',
        name: exerciseName,
        unit: form.unit || 'reps',
        value: numericValue,
        date: form.date || today,
        notes: form.notes?.trim() || null,
        exercise_category: exerciseInfo?.category || editData.exercise_category || 'general',
        video_url: form.videoUrl?.trim() || null,
        rpe: form.rpe ? Number(form.rpe) : null,
        quality_rating: form.quality ? Number(form.quality) : null,
        technique_acquired: form.type === 'technique',
        technique_name: form.type === 'technique' ? (form.techniqueName?.trim() || null) : null,
      };
      const { error: updateErr } = await supabase
        .from('personal_records')
        .update(updates)
        .eq('id', editData.id);
      if (updateErr) {
        console.error('[Records] update error:', updateErr);
        toast.error('שגיאה בעדכון: ' + updateErr.message);
        setSaving(false);
        return;
      }
      toast.success('✓ שיא עודכן');
      setSaving(false);
      onSuccess?.();
      onClose?.();
      return;
    }

    // Pull existing records for this exercise to compute previous_value,
    // improvement, and is_personal_best.
    const { data: prior, error: priorErr } = await supabase
      .from('personal_records')
      .select('id, value, date, is_personal_best')
      .eq('trainee_id', resolvedTraineeId)
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
      trainee_id: resolvedTraineeId,
      coach_id: isCoach ? (coachId || currentUserId || null) : null,
      record_type: form.type || 'max_reps',
      name: exerciseName,
      unit: form.unit || 'reps',
      value: numericValue,
      date: form.date || today,
      notes: form.notes?.trim() || null,
      exercise_category: exerciseInfo?.category || 'general',
      previous_value: Number.isFinite(previousValue) ? previousValue : null,
      improvement,
      video_url: form.videoUrl?.trim() || null,
      rpe: form.rpe ? Number(form.rpe) : null,
      quality_rating: form.quality ? Number(form.quality) : null,
      technique_acquired: form.type === 'technique',
      technique_name: form.type === 'technique' ? (form.techniqueName?.trim() || null) : null,
      is_personal_best: isPersonalBest,
      created_by_role: isCoach ? 'coach' : 'trainee',
      created_by_user_id: currentUserId || null,
    };

    const { error: insertErr } = await supabase
      .from('personal_records')
      .insert(payload);

    if (insertErr) {
      console.error('[Records] insert error:', insertErr);
      toast.error('שגיאה בשמירה: ' + insertErr.message);
      setSaving(false);
      return;
    }

    if (isPersonalBest && resolvedTraineeId) {
      try {
        await supabase.from('notifications').insert({
          user_id: resolvedTraineeId,
          type: 'new_record',
          title: '🏆 שיא אישי חדש!',
          message: `${exerciseName}: ${numericValue} ${unitLabel(form.unit)}`,
          is_read: false,
        });
      } catch (e) {
        console.warn('[Records] notification failed:', e?.message);
      }
    }

    // Goal achievement check — fires AFTER the personal_records insert
    // lands so the celebration popup reads against the freshest state.
    // Best-effort: failure here doesn't undo the record save.
    let achievementResult = null;
    if (resolvedTraineeId && Number.isFinite(numericValue)) {
      try {
        achievementResult = await checkAchievement(
          resolvedTraineeId, exerciseName, numericValue
        );
      } catch (e) {
        console.warn('[Records] achievement check failed:', e?.message);
      }
    }

    toast.success(isPersonalBest ? '🏆 שיא אישי חדש!' : '✓ שיא נשמר');
    setSaving(false);
    if (achievementResult?.achieved && onAchievement) {
      onAchievement({
        goal: achievementResult.goal,
        value: numericValue,
        exerciseName,
      });
    }
    onSuccess?.();
    onClose?.();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 10000, display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '14px 14px 0 0', padding: 20,
          width: '100%', maxWidth: 400, maxHeight: '85vh', overflowY: 'auto',
          direction: 'rtl', WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 16,
        }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{isEdit ? '✏️ עריכת שיא' : '🏆 שיא חדש'}</div>
          <button
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: 'none', border: 'none', fontSize: 22,
              cursor: 'pointer', color: '#888',
            }}
          >
            ✕
          </button>
        </div>

        {/* Trainee picker — only when no traineeId was passed in */}
        {!traineeId && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>בחר מתאמן/ת *</div>
            <select
              value={form.pickedTraineeId}
              onChange={(e) => setField('pickedTraineeId', e.target.value)}
              style={{
                width: '100%', padding: 10, borderRadius: 12,
                border: `1px solid ${BORDER}`, fontSize: 14, direction: 'rtl',
                background: '#fff', appearance: 'auto',
              }}
            >
              <option value="">בחר...</option>
              {(trainees || []).map(t => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Exercise picker */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>שם התרגיל *</div>
          <select
            value={form.exercise}
            onChange={(e) => {
              const next = e.target.value;
              const info = exerciseInfoFor(next);
              setForm(prev => ({
                ...prev,
                exercise: next,
                unit: info?.units?.[0] || prev.unit,
              }));
            }}
            style={{
              width: '100%', padding: 10, borderRadius: 12,
              border: `1px solid ${BORDER}`, fontSize: 14, direction: 'rtl',
              background: '#fff', appearance: 'auto',
            }}
          >
            <option value="">בחר תרגיל...</option>
            {DEFAULT_EXERCISES.map(ex => (
              <option key={ex.name} value={ex.name}>{ex.icon} {ex.name}</option>
            ))}
            <option value="__custom__">➕ תרגיל חדש...</option>
          </select>
          {form.exercise === '__custom__' && (
            <input
              type="text"
              value={form.customName}
              onChange={(e) => setField('customName', e.target.value)}
              placeholder="שם התרגיל החדש"
              style={{
                width: '100%', padding: 10, borderRadius: 12,
                border: `1px solid ${BORDER}`, fontSize: 14, direction: 'rtl',
                marginTop: 6, boxSizing: 'border-box', outline: 'none',
              }}
            />
          )}
        </div>

        {/* Record type */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>סוג שיא</div>
          <select
            value={form.type}
            onChange={(e) => setField('type', e.target.value)}
            style={{
              width: '100%', padding: 10, borderRadius: 12,
              border: `1px solid ${BORDER}`, fontSize: 14, direction: 'rtl',
              background: '#fff', appearance: 'auto',
            }}
          >
            {RECORD_TYPE_OPTIONS.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Value + unit */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 2 }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>ערך השיא *</div>
            <input
              type="number"
              value={form.value}
              onChange={(e) => setField('value', e.target.value)}
              placeholder="0"
              style={{
                width: '100%', padding: 10, borderRadius: 12,
                border: `1px solid ${BORDER}`, fontSize: 18, fontWeight: 600,
                textAlign: 'center', boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>יחידה</div>
            <select
              value={form.unit}
              onChange={(e) => setField('unit', e.target.value)}
              style={{
                width: '100%', padding: 10, borderRadius: 12,
                border: `1px solid ${BORDER}`, fontSize: 14,
                background: '#fff', appearance: 'auto',
              }}
            >
              {RECORD_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>תאריך</div>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setField('date', e.target.value)}
            style={{
              width: '100%', padding: 10, borderRadius: 12,
              border: `1px solid ${BORDER}`, fontSize: 14,
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>

        {/* Technique name — only for record_type === 'technique' */}
        {form.type === 'technique' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
              שם הטכניקה שנרכשה
            </div>
            <input
              type="text"
              value={form.techniqueName}
              onChange={(e) => setField('techniqueName', e.target.value)}
              placeholder="למשל: Double Under, Muscle-Up..."
              style={{
                width: '100%', padding: 10, borderRadius: 12,
                border: `1px solid ${BORDER}`, fontSize: 14, direction: 'rtl',
                boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
        )}

        {/* RPE slider */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
            RPE — דירוג קושי (1-10)
          </div>
          <input
            type="range" min="1" max="10"
            value={form.rpe}
            onChange={(e) => setField('rpe', Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 600, color: O }}>
            {form.rpe}/10
          </div>
        </div>

        {/* Quality slider */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
            דירוג איכות ביצוע (1-10)
          </div>
          <input
            type="range" min="1" max="10"
            value={form.quality}
            onChange={(e) => setField('quality', Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 600, color: O }}>
            {form.quality}/10
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>הערות</div>
          <textarea
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="תיאור, תחושות, הערות..."
            style={{
              width: '100%', padding: 10, borderRadius: 12,
              border: `1px solid ${BORDER}`, fontSize: 14, direction: 'rtl',
              minHeight: 60, resize: 'vertical', boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {/* Video URL */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
            לינק לוידאו (לא חובה)
          </div>
          <input
            type="url"
            value={form.videoUrl}
            onChange={(e) => setField('videoUrl', e.target.value)}
            placeholder="https://..."
            style={{
              width: '100%', padding: 10, borderRadius: 12,
              border: `1px solid ${BORDER}`, fontSize: 14,
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSaveRecord}
          disabled={!canSave}
          style={{
            width: '100%', padding: 14, borderRadius: 14, border: 'none',
            background: canSave ? O : '#ccc', color: '#fff',
            fontSize: 16, fontWeight: 600,
            cursor: canSave ? 'pointer' : 'default',
          }}
        >
          {saving ? '💾 שומר…' : (isEdit ? '💾 שמור שינויים' : '💾 שמור שיא')}
        </button>
      </div>
    </div>
  );
}
