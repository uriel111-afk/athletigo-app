import React, { useState, useContext, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Zap, Activity, TrendingUp } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useCloseConfirm } from "../hooks/useCloseConfirm";

const TECHNIQUES = [
  { id: 'basic', label: 'Basic', labelHe: 'בסיס', icon: Zap, color: '#FF6F20' },
  { id: 'foot_switch', label: 'Foot Switch', labelHe: 'החלפת רגליים', icon: Activity, color: '#2196F3' },
  { id: 'high_knees', label: 'High Knees', labelHe: 'הרמת ברכיים', icon: TrendingUp, color: '#4CAF50' },
];

function TimeScrollPicker({ value, onChange, max = 59 }) {
  return (
    <select value={value} onChange={e => onChange(parseInt(e.target.value))}
      className="h-10 rounded-lg border border-gray-200 bg-white text-center text-base font-bold text-gray-900 appearance-none cursor-pointer focus:border-[#FF6F20] focus:ring-1 focus:ring-[#FF6F20] outline-none"
      style={{ width: 56, minWidth: 56, paddingLeft: 4, paddingRight: 4 }}>
      {Array.from({ length: max + 1 }, (_, i) => (
        <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
      ))}
    </select>
  );
}

function TimePicker({ value, onChange, label }) {
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-bold text-gray-400 mb-1">{label}</span>
      <div className="flex items-center gap-1" dir="ltr">
        <TimeScrollPicker value={mins} max={59} onChange={m => onChange(m * 60 + secs)} />
        <span className="text-gray-400 font-black text-lg select-none">:</span>
        <TimeScrollPicker value={secs} max={59} onChange={s => onChange(mins * 60 + s)} />
      </div>
    </div>
  );
}

function NumPicker({ value, onChange, min = 1, max = 10, label }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-bold text-gray-400 mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] active:scale-95 text-lg font-bold">-</button>
        <span className="w-8 text-center text-xl font-black text-gray-900">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] active:scale-95 text-lg font-bold">+</button>
      </div>
    </div>
  );
}

export default function BaselineFormDialog({ isOpen, onClose, traineeId, traineeName }) {
  const queryClient = useQueryClient();
  const { user: authUser } = useContext(AuthContext);
  const isCoach = authUser?.is_coach === true || authUser?.role === 'coach' || authUser?.role === 'admin';
  // For coach: coach_id = authUser.id. For trainee: coach_id = null
  const coachId = isCoach ? authUser?.id : null;

  const [technique, setTechnique] = useState('basic');
  const [workTime, setWorkTime] = useState(30);
  const [restTime, setRestTime] = useState(30);
  const [roundsCount, setRoundsCount] = useState(3);
  const [rounds, setRounds] = useState(Array.from({ length: 3 }, () => ({ jumps: '', misses: '' })));
  const [notes, setNotes] = useState('');
  const [baselineDate, setBaselineDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const hasChanges = rounds.some(r => r.jumps !== '' || r.misses !== '') || notes !== '';
  const { confirmClose, ConfirmDialog } = useCloseConfirm(hasChanges, onClose);

  // Keep rounds array in sync with roundsCount
  const handleRoundsCountChange = (n) => {
    setRoundsCount(n);
    setRounds(prev => {
      if (n > prev.length) return [...prev, ...Array.from({ length: n - prev.length }, () => ({ jumps: '', misses: '' }))];
      return prev.slice(0, n);
    });
  };

  const setRoundField = (i, field, val) => {
    setRounds(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: val }; return n; });
  };

  // Real-time calculation
  const calc = useMemo(() => {
    const filledRounds = rounds.filter(r => r.jumps !== '' && parseInt(r.jumps) >= 0);
    const totalJumps = filledRounds.reduce((s, r) => s + (parseInt(r.jumps) || 0), 0);
    const avg = filledRounds.length > 0 ? totalJumps / filledRounds.length : 0;
    const score = workTime > 0 && filledRounds.length > 0 ? avg / workTime : 0;
    return { totalJumps, avg: Math.round(avg * 100) / 100, score: Math.round(score * 100) / 100, filledCount: filledRounds.length };
  }, [rounds, workTime]);

  const canSave = technique && calc.filledCount > 0 && workTime > 0;

  const handleSave = async () => {
    if (!canSave) {
      if (!technique) toast.error("יש לבחור טכניקה");
      else if (calc.filledCount === 0) toast.error("יש למלא לפחות סיבוב אחד");
      else if (workTime === 0) toast.error("זמן עבודה לא יכול להיות 0");
      return;
    }

    setSaving(true);
    try {
      const dateStr = baselineDate || new Date().toISOString().split('T')[0];
      const timeStr = new Date().toTimeString().slice(0, 5);
      const roundsData = rounds.map((r, i) => ({ round: i + 1, jumps: parseInt(r.jumps) || 0, misses: parseInt(r.misses) || 0 }));
      const techLabel = TECHNIQUES.find(t => t.id === technique)?.label || technique;


      // 1. INSERT to baselines
      const { data: baselineData, error: baselineErr } = await supabase
        .from('baselines')
        .insert({
          trainee_id: traineeId,
          coach_id: coachId,
          date: dateStr,
          time: timeStr,
          technique,
          work_time_seconds: workTime,
          rest_time_seconds: restTime,
          rounds_count: roundsCount,
          rounds_data: roundsData,
          total_jumps: calc.totalJumps,
          average_jumps: calc.avg,
          baseline_score: calc.score,
          notes: notes || null,
        })
        .select()
        .single();

      if (baselineErr) throw baselineErr;

      // 2. INSERT to results_log (for achievements tab)
      const { error: resultErr } = await supabase
        .from('results_log')
        .insert({
          trainee_id: traineeId,
          created_by: coachId || authUser?.id || null,
          title: `Baseline - ${techLabel}`,
          record_value: String(calc.score),
          record_unit: 'JPS',
          category: 'baseline',
          baseline_id: baselineData.id,
          date: dateStr,
          description: `${calc.totalJumps} קפיצות, ממוצע ${calc.avg}, ${roundsCount} סיבובים × ${workTime} שניות`,
        });

      if (resultErr) {
        console.error("[BaselineForm] results_log insert failed:", resultErr);
        // Don't throw — baseline was saved, just log the issue
      } else {
      }

      // 3. Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });

      toast.success(`בייסליין נשמר בהצלחה — ${calc.score} JPS`);
      onClose();
    } catch (error) {
      console.error("[BaselineForm] Error:", error);
      toast.error("שגיאה בשמירת בייסליין: " + (error?.message || "נסה שוב"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) confirmClose(); }}>
      <DialogContent className="max-w-md p-0"
        onInteractOutside={(e) => { if (saving) e.preventDefault(); }}>
        {ConfirmDialog}
        <DialogHeader className="px-3 pt-3 pb-1">
          <DialogTitle className="text-base font-black text-gray-900">מדידת בייסליין</DialogTitle>
          {traineeName && <p className="text-xs text-gray-400">{traineeName}</p>}
        </DialogHeader>

        <div className="px-3 pb-3 space-y-2">
          {/* Date — editable for coach, shown for trainee */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400">תאריך:</span>
            <input type="date" value={baselineDate} onChange={e => setBaselineDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1"
              style={{ fontSize: 16 }} />
          </div>

          {/* Technique Selection — compact horizontal */}
          <div className="grid grid-cols-3 gap-1.5">
            {TECHNIQUES.map(t => {
              const Icon = t.icon;
              const active = technique === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setTechnique(t.id)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 transition-all active:scale-95
                    ${active ? 'shadow-sm' : 'border-gray-100 bg-white'}`}
                  style={active ? { borderColor: t.color, backgroundColor: t.color + '10' } : {}}>
                  <Icon className="w-4 h-4" style={{ color: active ? t.color : '#9CA3AF' }} />
                  <span className="text-[11px] font-black" style={{ color: active ? t.color : '#6B7280' }}>{t.labelHe}</span>
                </button>
              );
            })}
          </div>

          {/* Parameters — single row */}
          <div className="flex justify-around items-start bg-gray-50 rounded-lg p-2 border border-gray-100">
            <TimePicker label="עבודה" value={workTime} onChange={setWorkTime} />
            <NumPicker label="סיבובים" value={roundsCount} onChange={handleRoundsCountChange} min={1} max={10} />
            <TimePicker label="מנוחה" value={restTime} onChange={setRestTime} />
          </div>

          {/* Round Inputs — RTL horizontal */}
          <div style={{ display: 'flex', flexDirection: 'row', direction: 'rtl', gap: 6, width: '100%' }}>
            {rounds.map((r, i) => (
              <div key={i} style={{ flex: 1 }} className="bg-white rounded-lg border border-gray-200 p-1.5">
                <div className="text-[9px] font-bold text-gray-400 text-center mb-0.5">סיבוב {i + 1}</div>
                <Input type="number" min={0} placeholder="קפיצות" value={r.jumps}
                  onChange={e => setRoundField(i, 'jumps', e.target.value)}
                  className="text-center font-black text-base h-8 border-[#FF6F20] focus-visible:ring-[#FF6F20] focus-visible:ring-1 mb-0.5" />
                <Input type="number" min={0} placeholder="פספוס" value={r.misses}
                  onChange={e => setRoundField(i, 'misses', e.target.value)}
                  className="text-center text-[10px] h-6 bg-gray-50 border-transparent placeholder:text-gray-300" />
              </div>
            ))}
          </div>

          {/* Real-time Score — compact */}
          <div className="grid grid-cols-3 bg-gray-900 rounded-lg p-2">
            <div className="text-center">
              <div className="text-[9px] text-gray-400 font-bold">סה"כ</div>
              <div className="text-sm font-black text-white">{calc.totalJumps}</div>
            </div>
            <div className="text-center border-x border-gray-700">
              <div className="text-[9px] text-gray-400 font-bold">ממוצע</div>
              <div className="text-sm font-black text-white">{calc.avg}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-[#FF6F20] font-bold">SCORE</div>
              <div className="text-lg font-black text-[#FF6F20]">{calc.score}<span className="text-[10px] mr-0.5">JPS</span></div>
            </div>
          </div>

          {/* Notes — single line */}
          <Input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="הערות (אופציונלי)" className="text-right text-xs h-8 rounded-lg" />

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving || !canSave}
            className="w-full rounded-lg py-2 font-bold text-white min-h-[40px] text-sm"
            style={{ backgroundColor: canSave ? '#FF6F20' : '#ccc' }}>
            {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />שומר...</> : 'שמור תוצאות'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
