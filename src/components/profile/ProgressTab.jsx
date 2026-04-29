import React, { useState, useMemo, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { toast } from 'sonner';
import { exerciseInfoFor, unitLabel } from '@/lib/recordExercises';
import NewRecordDialog from '@/components/forms/NewRecordDialog';

const O = '#FF6F20';
const CARD_BG = '#FFFFFF';
const BORDER = '#F0E4D0';
const EXERCISE_COLORS = ['#FF6F20', '#1D9E75', '#D85A30', '#1565C0', '#9C27B0', '#E91E63', '#00BCD4', '#FF9800'];

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL');
};

// Personal records tab — master chart with per-exercise filter pills,
// stats row, and inline-expandable folders per exercise. Each folder
// shows its own progression chart with PB-emphasised dots, an
// optional ReferenceLine for the linked goal target, and the full
// records list. Adds + edits live in NewRecordDialog.
export default function ProgressTab({ traineeId }) {
  const { user: currentUser } = useContext(AuthContext);
  const isCoach =
    currentUser?.is_coach || currentUser?.role === 'coach' || currentUser?.role === 'admin';
  const queryClient = useQueryClient();

  const [openRecordFolder, setOpenRecordFolder] = useState(null);
  const [filterExercise, setFilterExercise] = useState('all');
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
        .or('status.is.null,status.neq.deleted')
        .order('date', { ascending: true });
      if (error) {
        console.warn('[Records] query failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!traineeId,
  });

  // Goal progress — used to draw the dashed target line on a folder's
  // chart when an exercise has a linked goal. Read-only here.
  const { data: goalProgress = [] } = useQuery({
    queryKey: ['goal-progress', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      const { data, error } = await supabase
        .from('goal_progress')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('date', { ascending: false });
      if (error) {
        console.warn('[Records] goal_progress query failed:', error.message);
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

  // Group records by exercise name. Each folder carries the sorted
  // records array, the all-time best, and the latest entry.
  const folders = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      const key = (r.name || r.exercise_name || '').trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const arr = [];
    for (const [name, list] of map.entries()) {
      const sorted = [...list].sort((a, b) =>
        String(a.date || '').localeCompare(String(b.date || ''))
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

  const exerciseNames = useMemo(() => folders.map(f => f.name), [folders]);

  // Master chart — one line per exercise (filterable). Each row is a
  // unique date; values come from the matching record on that date.
  const masterChartData = useMemo(() => {
    const filteredRecords = filterExercise === 'all'
      ? records
      : records.filter(r => (r.name || r.exercise_name) === filterExercise);
    const dateSet = new Set(filteredRecords.map(r => r.date).filter(Boolean));
    const dates = [...dateSet].sort();
    const chartExercises = filterExercise === 'all' ? exerciseNames : [filterExercise];
    return dates.map(date => {
      const row = { date: fmtDate(date), _isoDate: date };
      chartExercises.forEach(ex => {
        const entry = filteredRecords.find(r =>
          r.date === date && (r.name || r.exercise_name) === ex
        );
        if (entry) row[ex] = Number(entry.value) || 0;
      });
      return row;
    });
  }, [records, exerciseNames, filterExercise]);

  const chartExercises = filterExercise === 'all' ? exerciseNames : [filterExercise];

  const stats = {
    total: records.length,
    exercises: exerciseNames.length,
    personalBests: records.filter(r => r.is_personal_best).length,
  };

  const deleteRecord = async (id) => {
    if (!id) return;
    if (!window.confirm('למחוק שיא זה?')) return;
    const { error } = await supabase
      .from('personal_records')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('שגיאה במחיקה: ' + error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] });
    toast.success('נמחק');
  };

  if (!traineeId) return null;

  // Helper — find the latest goal_progress row for an exercise so we
  // can draw a dashed target line on its chart.
  const linkedGoalFor = (exerciseName) =>
    (goalProgress || [])
      .filter(gp => gp.exercise_name === exerciseName)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <button
        onClick={() => setShowNewRecord(true)}
        style={{
          width: '100%', padding: 14, borderRadius: 14, border: 'none',
          background: O, color: '#fff', fontSize: 16, fontWeight: 600,
          cursor: 'pointer', marginBottom: 16,
        }}
      >
        🏆 שיא חדש
      </button>

      {records.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: '#888',
          background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 15 }}>עוד אין שיאים</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>שיאים יופיעו כאן אחרי הזנה ראשונה</div>
        </div>
      )}

      {records.length > 0 && (
        <div style={{
          background: CARD_BG, borderRadius: 14, border: `1px solid ${BORDER}`,
          padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>📊 סקירת שיאים</div>

          {/* Filter pills — 'הכל' + one per exercise */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setFilterExercise('all')}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none',
                whiteSpace: 'nowrap',
                background: filterExercise === 'all' ? O : '#F0E4D0',
                color: filterExercise === 'all' ? 'white' : '#888',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
            >
              הכל
            </button>
            {exerciseNames.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => setFilterExercise(name)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none',
                  whiteSpace: 'nowrap',
                  background: filterExercise === name ? O : '#F0E4D0',
                  color: filterExercise === name ? 'white' : '#888',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {name.length > 15 ? name.substring(0, 15) + '…' : name}
              </button>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={masterChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
              <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip contentStyle={{
                borderRadius: 12, border: `1px solid ${BORDER}`,
                background: '#fff', fontSize: 12, direction: 'rtl',
              }} />
              {chartExercises.map((ex, i) => {
                const color = EXERCISE_COLORS[i % EXERCISE_COLORS.length];
                return (
                  <Line
                    key={ex}
                    type="monotone"
                    dataKey={ex}
                    name={ex}
                    stroke={color}
                    strokeWidth={2.5}
                    connectNulls
                    dot={(props) => {
                      const { cx, cy, payload, index } = props;
                      const record = records.find(r =>
                        r.date === payload._isoDate &&
                        (r.name || r.exercise_name) === ex
                      );
                      const isPB = !!record?.is_personal_best;
                      return (
                        <circle
                          key={`${ex}-${index}`}
                          cx={cx} cy={cy}
                          r={isPB ? 8 : 5}
                          fill={isPB ? color : 'white'}
                          stroke={color} strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 9, fill: color, stroke: 'white', strokeWidth: 2, cursor: 'pointer' }}
                  />
                );
              })}
              {filterExercise !== 'all' && (() => {
                const linkedGoal = linkedGoalFor(filterExercise);
                if (!linkedGoal?.target_value) return null;
                return (
                  <ReferenceLine
                    y={Number(linkedGoal.target_value)}
                    stroke="#1D9E75"
                    strokeDasharray="5 5"
                    label={{
                      value: `יעד: ${linkedGoal.target_value}`,
                      position: 'right', fill: '#1D9E75', fontSize: 11,
                    }}
                  />
                );
              })()}
            </LineChart>
          </ResponsiveContainer>

          {chartExercises.length > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 12,
              marginTop: 8, fontSize: 11, flexWrap: 'wrap',
            }}>
              {chartExercises.map((ex, i) => {
                const color = EXERCISE_COLORS[i % EXERCISE_COLORS.length];
                return (
                  <span
                    key={ex}
                    onClick={() => setFilterExercise(ex)}
                    style={{ cursor: 'pointer', color: '#1A1A1A' }}
                  >
                    <span style={{ color }}>●</span>{' '}
                    {ex.length > 12 ? ex.substring(0, 12) + '…' : ex}
                  </span>
                );
              })}
            </div>
          )}

          {/* Stats row */}
          <div style={{
            display: 'flex', justifyContent: 'space-around',
            marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}`,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: O }}>{stats.total}</div>
              <div style={{ fontSize: 11, color: '#888' }}>שיאים</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1D9E75' }}>{stats.exercises}</div>
              <div style={{ fontSize: 11, color: '#888' }}>תרגילים</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#D85A30' }}>{stats.personalBests}</div>
              <div style={{ fontSize: 11, color: '#888' }}>שיאים אישיים</div>
            </div>
          </div>
        </div>
      )}

      {/* Per-exercise folders — inline expandable */}
      {folders.map(folder => {
        const { name, records: recs, best, latest } = folder;
        const isOpen = openRecordFolder === name;
        const colorIndex = exerciseNames.indexOf(name);
        const color = EXERCISE_COLORS[colorIndex % EXERCISE_COLORS.length];
        const info = exerciseInfoFor(name);
        const linkedGoal = linkedGoalFor(name);
        return (
          <div key={name} style={{
            background: CARD_BG, borderRadius: 14, border: `1px solid ${BORDER}`,
            marginBottom: 10, overflow: 'hidden',
          }}>
            <div
              onClick={() => setOpenRecordFolder(isOpen ? null : name)}
              style={{
                padding: 14, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 22 }}>{info?.icon || '🎯'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {recs.length} שיאים · אחרון: {fmtDate(latest?.date)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {best?.is_personal_best && <span style={{ fontSize: 16 }}>🏆</span>}
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{best?.value ?? '—'}</div>
                  <div style={{ fontSize: 10, color: '#888' }}>{unitLabel(best?.unit)}</div>
                </div>
                <span style={{
                  fontSize: 14, color: '#888',
                  display: 'inline-block',
                  transition: 'transform 0.2s',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▼</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${BORDER}` }}>
                <div style={{ marginTop: 12, marginBottom: 12 }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={recs.map(r => ({
                        date: fmtDate(r.date),
                        value: Number(r.value) || 0,
                        pb: !!r.is_personal_best,
                      }))}
                      margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                      <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#888' }} />
                      <Tooltip contentStyle={{
                        borderRadius: 12, border: `1px solid ${BORDER}`,
                        background: '#fff', fontSize: 12, direction: 'rtl',
                      }} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={name}
                        stroke={color}
                        strokeWidth={2.5}
                        dot={(props) => {
                          const { cx, cy, payload, index } = props;
                          const isPB = !!payload?.pb;
                          return (
                            <circle
                              key={`${name}-${index}`}
                              cx={cx} cy={cy} r={isPB ? 8 : 5}
                              fill={isPB ? color : 'white'}
                              stroke={color} strokeWidth={2}
                            />
                          );
                        }}
                        activeDot={{ r: 8, fill: color, stroke: 'white', strokeWidth: 2 }}
                      />
                      {linkedGoal?.target_value && (
                        <ReferenceLine
                          y={Number(linkedGoal.target_value)}
                          stroke="#1D9E75"
                          strokeDasharray="5 5"
                          label={{
                            value: `יעד: ${linkedGoal.target_value}`,
                            position: 'right', fill: '#1D9E75', fontSize: 11,
                          }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {linkedGoal && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: '#E8F5E9', borderRadius: 10,
                    marginBottom: 10, fontSize: 13,
                  }}>
                    <span>🎯 יעד: {linkedGoal.goal_name || linkedGoal.exercise_name}</span>
                    <span style={{
                      fontWeight: 600,
                      color: Number(linkedGoal.progress) >= 100 ? '#1D9E75' : '#FF6F20',
                    }}>
                      {linkedGoal.progress != null ? `${linkedGoal.progress}%` : '—'}
                    </span>
                  </div>
                )}

                {[...recs].reverse().map((r, idx, arr) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: idx < arr.length - 1 ? `1px solid ${BORDER}` : 'none',
                      fontSize: 13, gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div>{fmtDate(r.date)}</div>
                      {r.notes && (
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {r.notes}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {r.rpe && <span style={{ fontSize: 11, color: '#888' }}>RPE {r.rpe}</span>}
                      {Number(r.improvement) > 0 && (
                        <span style={{
                          fontSize: 11, color: '#1D9E75',
                          background: '#E8F5E9', padding: '2px 6px', borderRadius: 8,
                        }}>
                          +{r.improvement}
                        </span>
                      )}
                      {r.is_personal_best && <span>🏆</span>}
                      <span style={{
                        fontWeight: 700,
                        color: r.is_personal_best ? color : '#1A1A1A',
                      }}>
                        {r.value} <span style={{ fontSize: 11, fontWeight: 500 }}>{unitLabel(r.unit)}</span>
                      </span>
                      {isCoach && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteRecord(r.id); }}
                          style={{
                            background: 'none', border: 'none', color: '#C62828',
                            fontSize: 13, cursor: 'pointer', padding: 0,
                          }}
                          aria-label="מחק שיא"
                        >🗑</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <NewRecordDialog
        isOpen={showNewRecord}
        onClose={() => setShowNewRecord(false)}
        traineeId={traineeId}
        coachId={isCoach ? currentUser?.id : null}
        currentUserId={currentUser?.id}
        isCoach={isCoach}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] })
        }
      />
    </div>
  );
}
