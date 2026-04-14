import React, { useState, useContext, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Zap, Activity, TrendingUp } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AuthContext } from "@/lib/AuthContext";
import { toast } from "sonner";

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
  const { user: coach } = useContext(AuthContext);

  const [technique, setTechnique] = useState('basic');
  const [workTime, setWorkTime] = useState(30);
  const [restTime, setRestTime] = useState(30);
  const [roundsCount, setRoundsCount] = useState(3);
  const [rounds, setRounds] = useState(Array.from({ length: 3 }, () => ({ jumps: '', misses: '' })));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

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
      const now = new Date();
      const roundsData = rounds.map((r, i) => ({ round: i + 1, jumps: parseInt(r.jumps) || 0, misses: parseInt(r.misses) || 0 }));

      console.log("[BaselineForm] Saving baseline...", { traineeId, technique, score: calc.score });

      // 1. Save to baselines table
      const baseline = await base44.entities.Baseline.create({
        trainee_id: traineeId,
        coach_id: coach?.id || null,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
        technique,
        work_time_seconds: workTime,
        rest_time_seconds: restTime,
        rounds_count: roundsCount,
        rounds_data: roundsData,
        total_jumps: calc.totalJumps,
        average_jumps: calc.avg,
        baseline_score: calc.score,
        notes: notes || null,
      });

      console.log("[BaselineForm] Baseline saved:", baseline.id);

      // 2. Save to results_log for display in achievements tab
      const techLabel = TECHNIQUES.find(t => t.id === technique)?.label || technique;
      await base44.entities.ResultsLog.create({
        trainee_id: traineeId,
        created_by: coach?.id || null,
        title: `Baseline - ${techLabel}`,
        record_value: calc.score,
        record_unit: 'JPS',
        category: 'baseline',
        date: now.toISOString().split('T')[0],
        baseline_id: baseline.id,
        description: `${calc.totalJumps} קפיצות, ממוצע ${calc.avg}, ${roundsCount} סיבובים × ${workTime} שניות`,
      });

      // 3. Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto bg-white p-0" dir="rtl"
        onInteractOutside={(e) => { if (saving) e.preventDefault(); }}>
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-xl font-black text-gray-900">מדידת בייסליין</DialogTitle>
          {traineeName && <p className="text-sm text-gray-500">{traineeName}</p>}
        </DialogHeader>

        <div className="p-4 space-y-5">
          {/* Technique Selection */}
          <div>
            <label className="text-sm font-bold text-gray-700 block mb-2 text-right">טכניקה</label>
            <div className="grid grid-cols-3 gap-2">
              {TECHNIQUES.map(t => {
                const Icon = t.icon;
                const active = technique === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setTechnique(t.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all active:scale-95
                      ${active ? 'shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                    style={active ? { borderColor: t.color, backgroundColor: t.color + '10' } : {}}>
                    <Icon className="w-6 h-6" style={{ color: active ? t.color : '#9CA3AF' }} />
                    <span className="text-xs font-black" style={{ color: active ? t.color : '#6B7280' }}>{t.label}</span>
                    <span className="text-[10px] text-gray-400">{t.labelHe}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Parameters */}
          <div className="flex justify-around items-start bg-gray-50 rounded-xl p-3 border border-gray-100">
            <TimePicker label="זמן עבודה" value={workTime} onChange={setWorkTime} />
            <NumPicker label="סיבובים" value={roundsCount} onChange={handleRoundsCountChange} min={1} max={10} />
            <TimePicker label="זמן מנוחה" value={restTime} onChange={setRestTime} />
          </div>

          {/* Round Inputs */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 block text-right">סיבובים</label>
            <div className="grid grid-cols-3 gap-2">
              {rounds.map((r, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-2 shadow-sm">
                  <div className="text-[10px] font-bold text-gray-400 text-center mb-1">ROUND {i + 1}</div>
                  <Input type="number" min={0} placeholder="קפיצות" value={r.jumps}
                    onChange={e => setRoundField(i, 'jumps', e.target.value)}
                    className="text-center font-black text-lg h-10 border-[#FF6F20] focus-visible:ring-[#FF6F20] focus-visible:ring-1 mb-1" />
                  <Input type="number" min={0} placeholder="פספוסים" value={r.misses}
                    onChange={e => setRoundField(i, 'misses', e.target.value)}
                    className="text-center text-xs h-7 bg-gray-50 border-transparent placeholder:text-gray-400" />
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Score */}
          <div className="grid grid-cols-3 gap-2 bg-gray-900 rounded-xl p-3">
            <div className="text-center">
              <div className="text-[10px] text-gray-400 font-bold mb-0.5">סה"כ קפיצות</div>
              <div className="text-lg font-black text-white">{calc.totalJumps}</div>
            </div>
            <div className="text-center border-x border-gray-700">
              <div className="text-[10px] text-gray-400 font-bold mb-0.5">ממוצע</div>
              <div className="text-lg font-black text-white">{calc.avg}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-[#FF6F20] font-bold mb-0.5">SCORE</div>
              <div className="text-xl font-black text-[#FF6F20]">{calc.score} <span className="text-xs">JPS</span></div>
            </div>
          </div>

          {/* Notes */}
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="הערות (אופציונלי)" className="text-right resize-none rounded-xl text-sm" />

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving || !canSave}
            className="w-full rounded-xl py-3 font-bold text-white min-h-[48px] text-base"
            style={{ backgroundColor: canSave ? '#FF6F20' : '#ccc' }}>
            {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />שומר...</> : 'שמור תוצאות'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
