import React, { useState, useMemo, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { exerciseInfoFor, unitLabel } from '@/lib/recordExercises';
import NewRecordDialog from '@/components/forms/NewRecordDialog';

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
// personal_records schema). The form itself lives in NewRecordDialog
// so the same modal also opens from Dashboard + TraineeHome.
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

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {!currentFolder && (
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
      )}

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

      {!currentFolder && folders.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', background: '#FFF9F0',
          border: `1px solid ${BORDER}`, borderRadius: 14, color: '#888',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 15 }}>אין שיאים עדיין</div>
        </div>
      )}

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
            onClick={() => setShowNewRecord(true)}
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
