import React, { useState, useMemo, useContext } from 'react';
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

const TECHNIQUE_LABELS = { basic: 'קפיצה בסיס', foot_switch: 'החלפת רגליים', high_knees: 'הרמת ברכיים' };
const O = '#FF6F20';

export default function ProgressTab({ traineeId }) {
  const { user: currentUser } = useContext(AuthContext);
  const isCoach = currentUser?.is_coach || currentUser?.role === 'coach' || currentUser?.role === 'admin';
  const queryClient = useQueryClient();
  const [expandedBaseline, setExpandedBaseline] = useState(null);
  const [expandedRecord, setExpandedRecord] = useState(null);
  const [showAddRecord, setShowAddRecord] = useState(false);

  // ── Baselines ──
  const { data: baselines = [] } = useQuery({
    queryKey: ['baselines-progress', traineeId],
    queryFn: () => base44.entities.Baseline.filter({ trainee_id: traineeId }, 'created_at').catch(() => []),
    enabled: !!traineeId,
  });

  const baselinesByTech = useMemo(() => {
    const grouped = {};
    baselines.forEach(b => {
      const tech = b.technique || 'basic';
      if (!grouped[tech]) grouped[tech] = [];
      grouped[tech].push(b);
    });
    return grouped;
  }, [baselines]);

  // ── Personal Records ──
  const { data: records = [] } = useQuery({
    queryKey: ['personal-records', traineeId],
    queryFn: async () => {
      const { data } = await supabase.from('personal_records')
        .select('*').eq('trainee_id', traineeId).order('date', { ascending: true });
      return data || [];
    },
    enabled: !!traineeId,
  });

  const recordsByType = useMemo(() => {
    const grouped = {};
    records.forEach(r => {
      const key = r.record_type || 'other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });
    return grouped;
  }, [records]);

  // ── Add Record ──
  const [recForm, setRecForm] = useState({ record_type: '', name: '', unit: '', value: '', date: new Date().toISOString().split('T')[0], notes: '' });

  const handleTypeSelect = (key) => {
    const t = getTypeByKey(key);
    setRecForm(f => ({ ...f, record_type: key, name: t.name, unit: t.defaultUnit }));
  };

  const handleSaveRecord = async () => {
    if (!recForm.name || !recForm.value) { toast.error('יש למלא שם וערך'); return; }
    const { error } = await supabase.from('personal_records').insert({
      trainee_id: traineeId,
      coach_id: isCoach ? currentUser.id : null,
      record_type: recForm.record_type || 'other',
      name: recForm.name,
      unit: recForm.unit || 'חזרות',
      value: Number(recForm.value),
      date: recForm.date,
      notes: recForm.notes || null,
      created_by_role: isCoach ? 'coach' : 'trainee',
      created_by_user_id: currentUser.id,
    });
    if (error) { toast.error('שגיאה: ' + error.message); return; }
    toast.success('שיא נשמר!');
    queryClient.invalidateQueries({ queryKey: ['personal-records'] });
    setShowAddRecord(false);
    setRecForm({ record_type: '', name: '', unit: '', value: '', date: new Date().toISOString().split('T')[0], notes: '' });
  };

  const deleteRecord = async (id) => {
    if (!window.confirm('למחוק שיא זה?')) return;
    await supabase.from('personal_records').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['personal-records'] });
    toast.success('נמחק');
  };

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── SECTION 1: Baselines ── */}
      {Object.keys(baselinesByTech).length > 0 && (
        <div>
          <h3 className="text-base font-bold flex items-center gap-2 mb-3"><Zap className="w-5 h-5 text-[#FF6F20]" />בייסליין קפיצה</h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {Object.entries(baselinesByTech).map(([tech, entries]) => {
              const latest = entries[entries.length - 1];
              const prev = entries.length > 1 ? entries[entries.length - 2] : null;
              const trend = prev ? (latest.average_jumps || 0) - (prev.average_jumps || 0) : 0;
              const isOpen = expandedBaseline === tech;
              const chartData = entries.map(e => ({
                date: new Date(e.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
                avg: e.average_jumps || 0,
                max: Math.max(...(e.rounds_data || []).map(r => r.jumps || 0), 0),
              }));
              return (
                <div key={tech} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div onClick={() => setExpandedBaseline(isOpen ? null : tech)} className="p-4 cursor-pointer hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-base">{TECHNIQUE_LABELS[tech] || tech}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          ממוצע: <strong>{latest.average_jumps}</strong> · שיא: <strong>{latest.baseline_score}</strong> JPS
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1">
                          {latest.rounds_count} סיבובים · {new Date(latest.created_at).toLocaleDateString('he-IL')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {trend !== 0 && (
                          <span className={`text-xs font-bold ${trend > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {trend > 0 ? '▲' : '▼'} {Math.abs(Math.round(trend))}
                          </span>
                        )}
                        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                  </div>
                  {isOpen && chartData.length > 1 && (
                    <div className="px-2 pb-3">
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData}>
                          <XAxis dataKey="date" fontSize={10} />
                          <YAxis fontSize={10} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="avg" stroke={O} strokeWidth={2} dot={{ r: 4 }} name="ממוצע" />
                          <Line type="monotone" dataKey="max" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} name="שיא" strokeDasharray="5 5" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SECTION 2: Personal Records ── */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-bold flex items-center gap-2"><Award className="w-5 h-5 text-yellow-500" />שיאים אישיים</h3>
          <Button onClick={() => setShowAddRecord(true)} size="sm" className="rounded-xl font-bold text-white text-xs h-9" style={{ backgroundColor: O }}>
            <Plus className="w-3 h-3 ml-1" />הוסף שיא
          </Button>
        </div>

        {Object.keys(recordsByType).length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <Award className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 text-sm">עדיין אין שיאים. לחץ "הוסף שיא" כדי להתחיל.</p>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {Object.entries(recordsByType).map(([typeKey, entries]) => {
              const type = getTypeByKey(typeKey);
              const best = Math.max(...entries.map(e => e.value));
              const latest = entries[entries.length - 1];
              const isOpen = expandedRecord === typeKey;
              const chartData = entries.map(e => ({
                date: new Date(e.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
                value: e.value,
              }));
              return (
                <div key={typeKey} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div onClick={() => setExpandedRecord(isOpen ? null : typeKey)} className="p-4 cursor-pointer hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-base">{latest.name || type.name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          שיא: <strong className="text-[#FF6F20]">{best}</strong> {latest.unit}
                          {entries.length > 1 && <span> · אחרון: {latest.value} {latest.unit}</span>}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1">{entries.length} רשומות · {new Date(latest.date).toLocaleDateString('he-IL')}</div>
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="px-2 pb-3">
                      {chartData.length > 1 && (
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={chartData}>
                            <XAxis dataKey="date" fontSize={10} />
                            <YAxis fontSize={10} />
                            <Tooltip />
                            <Line type="monotone" dataKey="value" stroke={O} strokeWidth={2} dot={{ r: 4 }} name={latest.unit} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                      <div className="mt-2 space-y-1">
                        {entries.slice(-5).reverse().map(e => (
                          <div key={e.id} className="flex items-center justify-between text-xs px-2 py-1 bg-gray-50 rounded">
                            <span>{new Date(e.date).toLocaleDateString('he-IL')} — <strong>{e.value}</strong> {e.unit}</span>
                            {isCoach && <button onClick={() => deleteRecord(e.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Record Dialog ── */}
      <Dialog open={showAddRecord} onOpenChange={setShowAddRecord}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-lg font-black">הוסף שיא חדש</DialogTitle></DialogHeader>
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
              שמור שיא
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
