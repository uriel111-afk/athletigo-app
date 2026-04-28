import React, { useState, useMemo, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import {
  DEFAULT_EXERCISES, RECORD_UNITS, RECORD_TYPE_OPTIONS,
  exerciseInfoFor, unitLabel,
} from '@/lib/recordExercises';

const O = '#FF6F20';
const CARD_BG = '#FFFFFF';
const BORDER = '#F0E4D0';

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL');
};

// Personal-records tab — folder view per exercise + detail view with
// Recharts line chart of progression. The DB column for the exercise
// label is `name`, value is `value`, unit is `unit` (legacy from
// personal_records schema). Spec field names map to those at I/O time.
export default function ProgressTab({ traineeId }) {
  const { user: currentUser } = useContext(AuthContext);
  const isCoach =
    currentUser?.is_coach || currentUser?.role === 'coach' || currentUser?.role === 'admin';
  const queryClient = useQueryClient();

  // null = list of folders, string = name of currently-open folder
  const [openFolder, setOpenFolder] = useState(null);
  const [showNewRecord, setShowNewRecord] = useState(false);

  // ── Data ───────────────────────────────────────────────────────
  const { data: records = [] } = useQuery({
    queryKey: ['personal-records', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      const { data, error } = await supabase
        .from('personal_records')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('date', { ascending: true });
      if (error) {
        console.warn('[Records] query failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!traineeId,
  });

  // Realtime — coach adds a record on laptop → trainee phone refreshes live.
  useEffect(() => {
    if (!traineeId) return;
    const ch = supabase
      .channel(`personal-records-${traineeId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'personal_records',
        filter: `trainee_id=eq.${traineeId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] }))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [traineeId, queryClient]);

  // Group by exercise name → { records, best, latest }
  const folders = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      const key = (r.name || '').trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, { records: [] });
      map.get(key).records.push(r);
    }
    // Per-folder best (max value) + latest (last by date) + sort folders by latest
    const arr = [];
    for (const [name, f] of map.entries()) {
      const sorted = [...f.records].sort(
        (a, b) => String(a.date || '').localeCompare(String(b.date || ''))
      );
      const best = sorted.reduce(
        (mx, r) => (Number(r.value) > Number(mx?.value || -Infinity) ? r : mx),
        sorted[0]
      );
      const latest = sorted[sorted.length - 1];
      arr.push({ name, records: sorted, best, latest });
    }
    arr.sort((a, b) =>
      String(b.latest?.date || '').localeCompare(String(a.latest?.date || ''))
    );
    return arr;
  }, [records]);

  const currentFolder = useMemo(
    () => folders.find(f => f.name === openFolder) || null,
    [folders, openFolder]
  );

  // ── New-record form state ──────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const initialForm = {
    exercise: '',          // either an existing DEFAULT_EXERCISES name, '__custom__', or any string
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
  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const resolvedExerciseName = form.exercise === '__custom__'
    ? form.customName.trim()
    : (form.exercise || '').trim();

  const canSave = !!resolvedExerciseName && form.value !== '' && !Number.isNaN(Number(form.value));

  const openNewRecordSheet = (presetName = '') => {
    const preset = presetName ? exerciseInfoFor(presetName) : null;
    setForm({
      ...initialForm,
      exercise: presetName && DEFAULT_EXERCISES.some(e => e.name === presetName)
        ? presetName
        : (presetName ? '__custom__' : ''),
      customName: presetName && !DEFAULT_EXERCISES.some(e => e.name === presetName)
        ? presetName : '',
      unit: preset?.units?.[0] || 'reps',
      date: today,
    });
    setShowNewRecord(true);
  };

  const closeSheet = () => {
    setShowNewRecord(false);
    setForm(initialForm);
  };

  const handleSaveRecord = async () => {
    if (!canSave) return;
    const numericValue = Number(form.value);
    const exerciseName = resolvedExerciseName;
    const exerciseInfo = exerciseInfoFor(exerciseName);

    // Pull existing records for this exercise to compute previous_value,
    // improvement, and is_personal_best.
    const { data: prior, error: priorErr } = await supabase
      .from('personal_records')
      .select('id, value, date, is_personal_best')
      .eq('trainee_id', traineeId)
      .eq('name', exerciseName);
    if (priorErr) {
      console.error('[Records] prior fetch failed:', priorErr);
    }

    let previousValue = null;
    let maxPrev = -Infinity;
    let priorPbId = null;
    if (Array.isArray(prior) && prior.length) {
      // previous_value = chronologically most recent prior entry
      const byDateDesc = [...prior].sort(
        (a, b) => String(b.date || '').localeCompare(String(a.date || ''))
      );
      previousValue = Number(byDateDesc[0]?.value);
      // current PB row (if any) — to flip when this entry beats it
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

    // If this is a new PB, demote the previously-flagged PB row first
    // so only one row per (trainee, exercise) carries is_personal_best=true.
    if (isPersonalBest && priorPbId) {
      await supabase
        .from('personal_records')
        .update({ is_personal_best: false })
        .eq('id', priorPbId);
    }

    const payload = {
      trainee_id: traineeId,
      coach_id: isCoach ? currentUser?.id || null : null,
      record_type: form.type || 'max_reps',
      name: exerciseName,
      unit: form.unit || 'reps',
      value: numericValue,
      date: form.date || today,
      notes: form.notes?.trim() || null,
      // Extended fields (added via ALTER):
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
      created_by_user_id: currentUser?.id || null,
    };

    const { error: insertErr } = await supabase
      .from('personal_records')
      .insert(payload);
    if (insertErr) {
      console.error('[Records] insert error:', insertErr);
      toast.error('שגיאה בשמירה: ' + insertErr.message);
      return;
    }

    // Notify the trainee on a new PB. Coach-saved records would otherwise
    // need a refresh for the trainee to see the celebration.
    if (isPersonalBest && traineeId) {
      try {
        await supabase.from('notifications').insert({
          user_id: traineeId,
          type: 'new_record',
          title: '🏆 שיא אישי חדש!',
          message: `${exerciseName}: ${numericValue} ${unitLabel(form.unit)}`,
          is_read: false,
        });
      } catch (e) {
        console.warn('[Records] notification failed:', e?.message);
      }
    }

    toast.success(isPersonalBest ? '🏆 שיא אישי חדש!' : '✓ שיא נשמר');
    queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] });
    closeSheet();
  };

  const deleteRecord = async (id) => {
    if (!id) return;
    if (!window.confirm('למחוק שיא זה?')) return;
    const { error } = await supabase.from('personal_records').delete().eq('id', id);
    if (error) {
      toast.error('שגיאה במחיקה: ' + error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] });
    toast.success('נמחק');
  };

  if (!traineeId) return null;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* "+ שיא חדש" CTA — always visible at the top of the list view */}
      {!currentFolder && (
        <button
          onClick={() => openNewRecordSheet('')}
          style={{
            width: '100%', padding: 14, borderRadius: 14, border: 'none',
            background: O, color: '#fff', fontSize: 16, fontWeight: 600,
            cursor: 'pointer', marginBottom: 16,
          }}
        >
          🏆 שיא חדש
        </button>
      )}

      {/* List view — one folder card per exercise that has records */}
      {!currentFolder && folders.length > 0 && folders.map((f) => {
        const info = exerciseInfoFor(f.name);
        return (
          <div
            key={f.name}
            onClick={() => setOpenFolder(f.name)}
            style={{
              background: CARD_BG, borderRadius: 14, border: `1px solid ${BORDER}`,
              padding: 14, marginBottom: 10, cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 26 }}>{info?.icon || '🎯'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 600, color: '#1A1A1A',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {f.name}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {f.records.length} שיאים • אחרון: {fmtDate(f.latest?.date)}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'left', flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: O }}>
                {f.best?.value ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {unitLabel(f.best?.unit)}
              </div>
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {!currentFolder && folders.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', background: '#FFF9F0',
          border: `1px solid ${BORDER}`, borderRadius: 14, color: '#888',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 15 }}>אין שיאים עדיין</div>
        </div>
      )}

      {/* Detail view — chart + list of records for the open folder */}
      {currentFolder && (
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <button
              onClick={() => setOpenFolder(null)}
              style={{
                background: 'none', border: 'none', fontSize: 15, cursor: 'pointer',
                color: O, fontWeight: 600,
              }}
            >
              ← חזרה
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>
                {exerciseInfoFor(currentFolder.name)?.icon || '🎯'}
              </span>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{currentFolder.name}</div>
            </div>
          </div>

          {/* Recharts progression line — points highlighted when PB */}
          <div style={{
            background: CARD_BG, borderRadius: 14, border: `1px solid ${BORDER}`,
            padding: 12, marginBottom: 14, height: 220,
          }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={currentFolder.records.map(r => ({
                  date: fmtDate(r.date),
                  value: Number(r.value),
                  pb: !!r.is_personal_best,
                }))}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={BORDER} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10, border: `1px solid ${BORDER}`,
                    background: '#fff', fontSize: 12,
                  }}
                  labelStyle={{ color: '#888' }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={O}
                  strokeWidth={2}
                  fill="rgba(255,111,32,0.1)"
                  dot={(props) => {
                    const { cx, cy, payload, index } = props;
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx} cy={cy} r={5}
                        fill={payload.pb ? O : '#FDF8F3'}
                        stroke={O} strokeWidth={2}
                      />
                    );
                  }}
                  activeDot={{ r: 7, fill: O, stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Per-record list */}
          {[...currentFolder.records].reverse().map((r) => (
            <div
              key={r.id}
              style={{
                background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`,
                padding: 12, marginBottom: 8,
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{fmtDate(r.date)}</div>
                  {r.notes && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.notes}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {r.is_personal_best && <span style={{ fontSize: 16 }}>🏆</span>}
                  <div style={{
                    fontSize: 18, fontWeight: 700,
                    color: r.is_personal_best ? O : '#1A1A1A',
                  }}>
                    {r.value} <span style={{ fontSize: 13, fontWeight: 500 }}>{unitLabel(r.unit)}</span>
                  </div>
                  {Number(r.improvement) > 0 && (
                    <span style={{
                      fontSize: 12, color: '#2E7D32',
                      background: '#E8F5E9', padding: '2px 6px', borderRadius: 8,
                    }}>
                      +{r.improvement}
                    </span>
                  )}
                </div>
              </div>
              {(r.video_url || r.rpe || r.quality_rating) && (
                <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {r.video_url && (
                    <a
                      href={r.video_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, color: O }}
                    >
                      🎥 צפה בוידאו
                    </a>
                  )}
                  {r.rpe && (
                    <span style={{ fontSize: 12, color: '#888' }}>RPE: {r.rpe}/10</span>
                  )}
                  {r.quality_rating && (
                    <span style={{ fontSize: 12, color: '#888' }}>איכות: {r.quality_rating}/10</span>
                  )}
                </div>
              )}
              {isCoach && (
                <div style={{ marginTop: 8, textAlign: 'left' }}>
                  <button
                    onClick={() => deleteRecord(r.id)}
                    style={{
                      background: 'none', border: 'none', color: '#C62828',
                      fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    🗑️ מחק
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => openNewRecordSheet(currentFolder.name)}
            style={{
              width: '100%', padding: 14, borderRadius: 14, border: 'none',
              background: O, color: '#fff', fontSize: 16, fontWeight: 600,
              cursor: 'pointer', marginTop: 12,
            }}
          >
            🏆 שיא חדש ל{currentFolder.name}
          </button>
        </div>
      )}

      {/* Bottom-sheet — new/edit record form */}
      {showNewRecord && (
        <div
          onClick={closeSheet}
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
              <div style={{ fontSize: 18, fontWeight: 600 }}>🏆 שיא חדש</div>
              <button
                onClick={closeSheet}
                aria-label="סגור"
                style={{
                  background: 'none', border: 'none', fontSize: 22,
                  cursor: 'pointer', color: '#888',
                }}
              >
                ✕
              </button>
            </div>

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
              💾 שמור שיא
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
