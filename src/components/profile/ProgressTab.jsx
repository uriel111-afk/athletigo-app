import React, { useState, useMemo, useContext, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Plus, Trash2, Award, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RECORD_TYPES, getTypeByKey } from '@/lib/personalRecordTypes';
import { openBaselineDialog } from '@/components/forms/BaselineFormDialog';
import { groupRecordsByName } from '@/lib/recordGrouping';
import { RecordFolderCard } from './RecordFolderCard';
import { RecordFlatCard } from './RecordFlatCard';
import { BaselinesFolderCard } from './BaselinesFolderCard';
import { PersonalRecordViewer } from './PersonalRecordViewer';

const TECHNIQUE_LABELS = { basic: 'קפיצה בסיס', foot_switch: 'החלפת רגליים', high_knees: 'הרמת ברכיים' };
const O = '#FF6F20';
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function formatHebrewDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return `${HEB_DAYS[d.getDay()]}, ${d.toLocaleDateString('he-IL')}`;
}

// (BaselineSessionCard removed — replaced by BaselinesFolderCard which
// wraps all sessions in a single folder per spec)

export default function ProgressTab({ traineeId }) {
  const { user: currentUser } = useContext(AuthContext);
  const isCoach = currentUser?.is_coach || currentUser?.role === 'coach' || currentUser?.role === 'admin';
  const queryClient = useQueryClient();
  const [showAddRecord, setShowAddRecord] = useState(false);
  // BaselineFormDialog mounts globally in App.jsx — fire openBaselineDialog
  // with viewOnly + existingRows when the user taps a session in the folder.
  const [viewingRecord, setViewingRecord] = useState(null);
  // null = adding a new record. Truthy = editing existing row.
  const [editingRecord, setEditingRecord] = useState(null);

  // ── Baselines ──
  const { data: baselines = [] } = useQuery({
    queryKey: ['baselines-progress', traineeId],
    queryFn: () => base44.entities.Baseline.filter({ trainee_id: traineeId }, 'created_at').catch(() => []),
    enabled: !!traineeId,
  });

  // Group rows into sessions by created_at-to-the-minute. Rows from the same
  // BaselineFormDialog submission share an identical created_at (set in code).
  const baselineSessions = useMemo(() => {
    const map = new Map();
    for (const row of baselines) {
      if (!row?.created_at) continue;
      const key = String(row.created_at).slice(0, 16); // YYYY-MM-DDTHH:MM
      if (!map.has(key)) map.set(key, { sessionKey: key, sessionDate: row.created_at, techniques: [] });
      map.get(key).techniques.push(row);
    }
    // newest first
    const sessions = Array.from(map.values()).sort((a, b) =>
      String(b.sessionDate).localeCompare(String(a.sessionDate))
    );
    // Diagnostic: lets us see in DevTools whether the grouping found multiple
    // techniques per session. If a session shows 1 technique here but the user
    // saved 3, the bug is upstream (DB, RLS, or save handler).
    if (baselines.length > 0) {
      console.log('[ProgressTab] baseline grouping', {
        rowCount: baselines.length,
        sessionCount: sessions.length,
        perSession: sessions.map(s => ({
          key: s.sessionKey,
          techniques: s.techniques.map(t => t.technique),
        })),
      });
    }
    return sessions;
  }, [baselines]);

  // (handleViewSession inlined into BaselinesFolderCard's onSessionClick prop)

  // ── Personal Records ──
  const { data: records = [] } = useQuery({
    queryKey: ['personal-records', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      try {
        const { data, error } = await supabase.from('personal_records')
          .select('*').eq('trainee_id', traineeId).order('date', { ascending: true });
        if (error) { console.warn('personal_records query failed:', error.message); return []; }
        console.log('[Records] fetched:', data?.length || 0, data);
        return data || [];
      } catch (e) { console.warn('personal_records table may not exist:', e.message); return []; }
    },
    enabled: !!traineeId,
  });

  // Folder-based grouping by normalized name (spec: single record = flat,
  // 2+ = folder). Baselines get their own dedicated folder rendered above.
  const recordGroups = useMemo(() => groupRecordsByName(records), [records]);

  // Realtime — coach adds a record on laptop → trainee phone refreshes live.
  useEffect(() => {
    if (!traineeId) return;
    const ch = supabase
      .channel(`personal-records-${traineeId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'personal_records',
        filter: `trainee_id=eq.${traineeId}`
      }, () => queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] }))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [traineeId, queryClient]);

  // ── Add Record ──
  const [recForm, setRecForm] = useState({ record_type: '', name: '', unit: '', value: '', date: new Date().toISOString().split('T')[0], notes: '' });

  const handleTypeSelect = (key) => {
    const t = getTypeByKey(key);
    setRecForm(f => ({ ...f, record_type: key, name: t.name, unit: t.defaultUnit }));
  };

  const resetRecordForm = () => {
    setRecForm({ record_type: '', name: '', unit: '', value: '', date: new Date().toISOString().split('T')[0], notes: '' });
    setEditingRecord(null);
  };

  const openAddRecord = () => {
    resetRecordForm();
    setShowAddRecord(true);
  };

  const openEditRecord = (record) => {
    setEditingRecord(record);
    setRecForm({
      record_type: record.record_type || '',
      name: record.name || '',
      unit: record.unit || '',
      value: record.value != null ? String(record.value) : '',
      date: record.date ? String(record.date).split('T')[0] : new Date().toISOString().split('T')[0],
      notes: record.notes || '',
    });
    setViewingRecord(null);
    setShowAddRecord(true);
  };

  const handleSaveRecord = async () => {
    if (!recForm.name?.trim()) { toast.error('יש להזין שם לשיא'); return; }
    if (recForm.value === '' || recForm.value == null) { toast.error('יש להזין ערך'); return; }
    const numericValue = Number(recForm.value);
    if (Number.isNaN(numericValue)) { toast.error('הערך חייב להיות מספר'); return; }
    const payload = {
      trainee_id: traineeId,
      coach_id: isCoach ? currentUser.id : null,
      record_type: recForm.record_type || 'other',
      name: recForm.name.trim(),
      unit: recForm.unit?.trim() || '',
      value: numericValue,
      date: recForm.date || new Date().toISOString().split('T')[0],
      notes: recForm.notes?.trim() || null,
    };
    console.log('[Records] save payload:', payload, 'editing?', editingRecord?.id || null);
    try {
      if (editingRecord?.id) {
        const { error } = await supabase.from('personal_records').update(payload).eq('id', editingRecord.id);
        if (error) { console.error('[Records] update error:', error); toast.error('שגיאה: ' + error.message); return; }
        toast.success('שיא עודכן');
      } else {
        const insertPayload = {
          ...payload,
          created_by_role: isCoach ? 'coach' : 'trainee',
          created_by_user_id: currentUser.id,
        };
        const { error } = await supabase.from('personal_records').insert(insertPayload);
        if (error) { console.error('[Records] insert error:', error); toast.error('שגיאה: ' + error.message); return; }
        toast.success('שיא נשמר!');
      }
      queryClient.invalidateQueries({ queryKey: ['personal-records'] });
      setShowAddRecord(false);
      resetRecordForm();
    } catch (e) {
      console.error('[Records] save error:', e);
      toast.error('שגיאה בשמירה: ' + (e?.message || 'נסה שוב'));
    }
  };

  const deleteRecord = async (record) => {
    const id = record?.id || record;
    if (!id) return;
    if (!window.confirm('למחוק שיא זה?')) return;
    try {
      const { error } = await supabase.from('personal_records').delete().eq('id', id);
      if (error) { console.error('[Records] delete error:', error); toast.error('שגיאה: ' + error.message); return; }
      queryClient.invalidateQueries({ queryKey: ['personal-records'] });
      setViewingRecord(null);
      toast.success('נמחק');
    } catch (e) {
      console.error('[Records] delete error:', e);
      toast.error('שגיאה במחיקה: ' + (e?.message || ''));
    }
  };

  if (!traineeId) return null;

  return (
    <div className="space-y-6" dir="rtl">

      {/* Baselines — single dedicated folder, always first if any sessions exist */}
      {baselineSessions.length > 0 && (
        <BaselinesFolderCard
          sessions={baselineSessions}
          onSessionClick={(s) => openBaselineDialog({ traineeId, viewOnly: true, existingRows: s.techniques })}
        />
      )}

      {/* BaselineFormDialog mounted globally in App.jsx — opened
          via openBaselineDialog() in onSessionClick above. */}

      {/* Add-record button row (header) */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-500" />שיאים ובייסליינים
        </h3>
        <Button onClick={openAddRecord} size="sm" className="rounded-xl font-bold text-white text-xs h-9" style={{ backgroundColor: O }}>
          <Plus className="w-3 h-3 ml-1" />הוסף שיא
        </Button>
      </div>

      {/* Personal records — folders (2+) and flat cards (1) by normalized name */}
      {recordGroups.map((g) => (
        g.isFolder ? (
          <RecordFolderCard
            key={g.key}
            group={g}
            onRecordClick={setViewingRecord}
          />
        ) : (
          <RecordFlatCard
            key={g.key}
            record={g.latestRecord}
            onClick={setViewingRecord}
          />
        )
      ))}

      {/* Empty state — only when there's nothing at all */}
      {baselineSessions.length === 0 && recordGroups.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', background: '#FFF9F0', borderRadius: 12 }}>
          אין שיאים או בייסליינים עדיין
        </div>
      )}

      {/* Record viewer — coach gets edit/delete actions */}
      {viewingRecord && (
        <PersonalRecordViewer
          record={viewingRecord}
          onClose={() => setViewingRecord(null)}
          onEdit={isCoach ? openEditRecord : undefined}
          onDelete={isCoach ? deleteRecord : undefined}
        />
      )}

      {/* ── Add / Edit Record Dialog ── */}
      <Dialog open={showAddRecord} onOpenChange={(open) => { if (!open) { setShowAddRecord(false); resetRecordForm(); } else { setShowAddRecord(true); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-lg font-black">{editingRecord ? 'עריכת שיא' : 'הוסף שיא חדש'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2" dir="rtl">
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">סוג השיא</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {RECORD_TYPES.map(t => (
                  <button key={t.key} onClick={() => handleTypeSelect(t.key)}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: recForm.record_type === t.key ? '2px solid #FF6F20' : '1.5px solid #eee',
                      background: recForm.record_type === t.key ? '#FFF0E8' : 'white',
                      color: recForm.record_type === t.key ? '#FF6F20' : '#555', cursor: 'pointer' }}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1">שם השיא</label>
              <input value={recForm.name} onChange={e => setRecForm(f => ({ ...f, name: e.target.value }))} placeholder="לדוגמה: עליות מתח רחבות"
                style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1.5px solid #ddd', borderRadius: 10, boxSizing: 'border-box', direction: 'rtl', outline: 'none' }} />
            </div>
            <div className="flex gap-3">
              <div style={{ flex: 2 }}>
                <label className="text-sm font-bold text-gray-700 block mb-1">ערך</label>
                <input type="number" value={recForm.value} onChange={e => setRecForm(f => ({ ...f, value: e.target.value }))} placeholder="12"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 18, fontWeight: 700, border: '1.5px solid #ddd', borderRadius: 10, boxSizing: 'border-box', textAlign: 'center', outline: 'none' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="text-sm font-bold text-gray-700 block mb-1">יחידה</label>
                <input value={recForm.unit} onChange={e => setRecForm(f => ({ ...f, unit: e.target.value }))} placeholder="חזרות"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1.5px solid #ddd', borderRadius: 10, boxSizing: 'border-box', direction: 'rtl', outline: 'none' }} />
              </div>
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1">תאריך</label>
              <input type="date" value={recForm.date} onChange={e => setRecForm(f => ({ ...f, date: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1.5px solid #ddd', borderRadius: 10, boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <input value={recForm.notes} onChange={e => setRecForm(f => ({ ...f, notes: e.target.value }))} placeholder="הערות (אופציונלי)"
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1.5px solid #ddd', borderRadius: 10, boxSizing: 'border-box', direction: 'rtl', outline: 'none' }} />
            <Button onClick={handleSaveRecord} className="w-full rounded-xl py-3 font-bold text-white min-h-[44px]" style={{ backgroundColor: O }}>
              {editingRecord ? '💾 עדכן שיא' : '🏆 שמור שיא'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
