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
import { useFormDraft } from "@/hooks/useFormDraft";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { DraftBanner } from "@/components/DraftBanner";

const TECHNIQUES = [
  { id: 'basic', label: 'Basic', labelHe: 'בסיס', icon: Zap, color: '#FF6F20' },
  { id: 'foot_switch', label: 'Foot Switch', labelHe: 'החלפת רגליים', icon: Activity, color: '#2196F3' },
  { id: 'high_knees', label: 'High Knees', labelHe: 'הרמת ברכיים', icon: TrendingUp, color: '#4CAF50' },
];

const INITIAL_DATA = {
  technique: 'basic',
  workTime: 30,
  restTime: 30,
  notes: '',
  baselineDate: '',
  perTechnique: {
    basic:       { roundsCount: 3, rounds: [{ jumps: '', misses: '' }, { jumps: '', misses: '' }, { jumps: '', misses: '' }] },
    foot_switch: { roundsCount: 3, rounds: [{ jumps: '', misses: '' }, { jumps: '', misses: '' }, { jumps: '', misses: '' }] },
    high_knees:  { roundsCount: 3, rounds: [{ jumps: '', misses: '' }, { jumps: '', misses: '' }, { jumps: '', misses: '' }] },
  },
};

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

export default function BaselineFormDialog({
  isOpen, onClose, traineeId, traineeName,
  editMode = false, existingRows = null,
  viewOnly = false,
}) {
  const queryClient = useQueryClient();
  const { user: authUser } = useContext(AuthContext);
  const isCoach = authUser?.is_coach === true || authUser?.role === 'coach' || authUser?.role === 'admin';
  // For coach: coach_id = authUser.id. For trainee: coach_id = null
  const coachId = isCoach ? authUser?.id : null;

  // In edit mode OR view-only: derive initialData from existingRows.
  const initialData = useMemo(() => {
    if ((editMode || viewOnly) && existingRows && existingRows.length > 0) {
      const first = existingRows[0];
      const perTech = JSON.parse(JSON.stringify(INITIAL_DATA.perTechnique));
      for (const row of existingRows) {
        const t = row.technique;
        if (!perTech[t]) continue;
        const rounds = (row.rounds_data ?? []).map(r => ({
          jumps: String(r.jumps ?? ''),
          misses: String(r.misses ?? ''),
        }));
        perTech[t] = {
          roundsCount: rounds.length || 1,
          rounds: rounds.length ? rounds : [{ jumps: '', misses: '' }],
        };
      }
      // Pick technique to display first: one of the existing rows
      const firstTech = existingRows.find(r => INITIAL_DATA.perTechnique[r.technique])?.technique || 'basic';
      return {
        ...INITIAL_DATA,
        technique: firstTech,
        workTime: first.work_time_seconds ?? 30,
        restTime: first.rest_time_seconds ?? 30,
        notes: first.notes ?? '',
        baselineDate: first.date || new Date().toISOString().split('T')[0],
        perTechnique: perTech,
      };
    }
    return { ...INITIAL_DATA, baselineDate: new Date().toISOString().split('T')[0] };
  }, [editMode, viewOnly, existingRows]);

  // Scope key isolates edit / view / new drafts so they can't leak into each other.
  const draftScope = (editMode || viewOnly) && existingRows?.[0]?.id
    ? `${viewOnly ? 'view' : 'edit'}_${existingRows[0].id}`
    : `${traineeId ?? 'new'}`;

  const {
    data: formData, setData: setFormData,
    hasDraft, keepDraft, discardDraft, clearDraft,
  } = useFormDraft('BaselineForm', draftScope, isOpen, initialData);

  useKeepScreenAwake(isOpen);

  const [saving, setSaving] = useState(false);

  // Convenience accessors / setters bound to the drafted formData
  const technique = formData.technique;
  const setTechnique = (v) => setFormData(prev => ({ ...prev, technique: v }));
  const workTime = formData.workTime;
  const setWorkTime = (v) => setFormData(prev => ({ ...prev, workTime: v }));
  const restTime = formData.restTime;
  const setRestTime = (v) => setFormData(prev => ({ ...prev, restTime: v }));
  const notes = formData.notes;
  const setNotes = (v) => setFormData(prev => ({ ...prev, notes: v }));
  const baselineDate = formData.baselineDate;
  const setBaselineDate = (v) => setFormData(prev => ({ ...prev, baselineDate: v }));
  const perTechnique = formData.perTechnique;

  // Current technique's data
  const roundsCount = perTechnique[technique].roundsCount;
  const rounds = perTechnique[technique].rounds;

  const handleRoundsCountChange = (n) => {
    setFormData(prev => {
      const t = prev.perTechnique[prev.technique];
      const newRounds = n > t.rounds.length
        ? [...t.rounds, ...Array.from({ length: n - t.rounds.length }, () => ({ jumps: '', misses: '' }))]
        : t.rounds.slice(0, n);
      return {
        ...prev,
        perTechnique: { ...prev.perTechnique, [prev.technique]: { roundsCount: n, rounds: newRounds } },
      };
    });
  };

  const setRoundField = (i, field, val) => {
    setFormData(prev => {
      const t = prev.perTechnique[prev.technique];
      const newRounds = [...t.rounds];
      newRounds[i] = { ...newRounds[i], [field]: val };
      return {
        ...prev,
        perTechnique: { ...prev.perTechnique, [prev.technique]: { ...t, rounds: newRounds } },
      };
    });
  };

  // Real-time calculation — for CURRENT technique tab only (display in score strip)
  const calc = useMemo(() => {
    const filledRounds = rounds.filter(r => r.jumps !== '' && parseInt(r.jumps) >= 0);
    const totalJumps = filledRounds.reduce((s, r) => s + (parseInt(r.jumps) || 0), 0);
    const avg = filledRounds.length > 0 ? totalJumps / filledRounds.length : 0;
    const maxJumps = filledRounds.length > 0 ? Math.max(...filledRounds.map(r => parseInt(r.jumps) || 0)) : 0;
    const score = workTime > 0 && filledRounds.length > 0 ? avg / workTime : 0;
    return { totalJumps, avg: Math.round(avg * 100) / 100, maxJumps, score: Math.round(score * 100) / 100, filledCount: filledRounds.length };
  }, [rounds, workTime]);

  // Count techniques that have at least one filled round
  const filledTechCount = useMemo(() => {
    return Object.values(perTechnique).filter(t =>
      t.rounds.some(r => r.jumps !== '' && parseInt(r.jumps) >= 0)
    ).length;
  }, [perTechnique]);

  const canSave = filledTechCount > 0 && workTime > 0;

  const handleSave = async () => {
    if (!canSave) {
      if (filledTechCount === 0) toast.error("יש למלא לפחות סיבוב אחד באחת מהטכניקות");
      else if (workTime === 0) toast.error("זמן עבודה לא יכול להיות 0");
      return;
    }

    setSaving(true);
    try {
      const dateStr = baselineDate || new Date().toISOString().split('T')[0];
      const timeStr = new Date().toTimeString().slice(0, 5);
      // In edit mode: reuse the original session's created_at so the session key (minute slice) is preserved
      const sharedCreatedAt = (editMode && existingRows?.[0]?.created_at)
        ? existingRows[0].created_at
        : new Date().toISOString();

      // Build one row per technique that has filled rounds
      const techIds = Object.keys(perTechnique); // ['basic','foot_switch','high_knees']
      const rowsToInsert = [];
      const perTechCalc = {}; // for results_log entries
      for (const techId of techIds) {
        const techData = perTechnique[techId];
        const filled = techData.rounds.filter(r => r.jumps !== '' && parseInt(r.jumps) >= 0);
        if (filled.length === 0) continue;

        const totalJumps = filled.reduce((s, r) => s + (parseInt(r.jumps) || 0), 0);
        const avg = Math.round((totalJumps / filled.length) * 100) / 100;
        const score = workTime > 0 ? Math.round((avg / workTime) * 100) / 100 : 0;
        const roundsData = filled.map((r, i) => ({
          round: i + 1,
          jumps: parseInt(r.jumps) || 0,
          misses: parseInt(r.misses) || 0,
        }));

        rowsToInsert.push({
          trainee_id: traineeId,
          coach_id: coachId,
          date: dateStr,
          time: timeStr,
          technique: techId,
          work_time_seconds: workTime,
          rest_time_seconds: restTime,
          rounds_count: filled.length,
          rounds_data: roundsData,
          total_jumps: totalJumps,
          average_jumps: avg,
          baseline_score: score,
          notes: notes || null,
          created_at: sharedCreatedAt,
        });

        perTechCalc[techId] = { totalJumps, avg, score, roundsCount: filled.length };
      }

      // Edit mode: delete the original session's rows + their linked results_log entries
      if (editMode && existingRows && existingRows.length > 0) {
        const idsToDelete = existingRows.map(r => r.id);
        // Best-effort: delete results_log entries linked to these baselines first (FK ON DELETE not guaranteed)
        await supabase.from('results_log').delete().in('baseline_id', idsToDelete);
        const { error: delErr } = await supabase.from('baselines').delete().in('id', idsToDelete);
        if (delErr) throw delErr;
      }

      console.log('[BaselineForm] saving session', {
        sharedCreatedAt,
        techniquesWithData: rowsToInsert.map(r => r.technique),
        rowCount: rowsToInsert.length,
      });

      // Insert all new rows in one batch
      const { data: inserted, error: insErr } = await supabase
        .from('baselines')
        .insert(rowsToInsert)
        .select();
      if (insErr) throw insErr;

      console.log('[BaselineForm] inserted rows', {
        returned: inserted?.length ?? 0,
        ids: (inserted ?? []).map(r => r.id),
        createdAtValues: (inserted ?? []).map(r => r.created_at),
        sessionKeys: (inserted ?? []).map(r => String(r.created_at).slice(0, 16)),
      });

      // Mirror to results_log (one entry per technique, for the achievements tab)
      const resultRows = (inserted || []).map(b => {
        const c = perTechCalc[b.technique];
        const techLabel = TECHNIQUES.find(t => t.id === b.technique)?.label || b.technique;
        return {
          trainee_id: traineeId,
          created_by: coachId || authUser?.id || null,
          title: `Baseline - ${techLabel}`,
          record_value: String(c.score),
          record_unit: 'JPS',
          category: 'baseline',
          baseline_id: b.id,
          date: dateStr,
          description: `${c.totalJumps} קפיצות, ממוצע ${c.avg}, ${c.roundsCount} סיבובים × ${workTime} שניות`,
        };
      });
      if (resultRows.length > 0) {
        const { error: resultErr } = await supabase.from('results_log').insert(resultRows);
        if (resultErr) console.error("[BaselineForm] results_log insert failed:", resultErr);
      }

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
      queryClient.invalidateQueries({ queryKey: ['baselines-progress'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });

      toast.success(editMode ? 'הבייסליין עודכן' : `בייסליין נשמר — ${rowsToInsert.length} טכניקות`);
      clearDraft();
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
      <DialogContent className="max-w-md p-0"
        onInteractOutside={(e) => { if (saving) e.preventDefault(); }}>
        <DialogHeader className="px-3 pt-3 pb-1">
          <DialogTitle className="text-base font-black text-gray-900">
            {viewOnly
              ? `בייסליין — ${existingRows?.[0]?.date
                  ? new Date(existingRows[0].date).toLocaleDateString('he-IL')
                  : ''}`
              : editMode ? 'עריכת בייסליין' : 'בייסליין חדש'}
          </DialogTitle>
          {traineeName && <p className="text-xs text-gray-400">{traineeName}</p>}
          {!viewOnly && filledTechCount > 0 && (
            <p className="text-[10px] text-gray-500 mt-0.5">{filledTechCount} טכניקות עם נתונים</p>
          )}
        </DialogHeader>

        <div className="px-3 pb-3 space-y-2">
          {!viewOnly && hasDraft && (
            <DraftBanner onContinue={keepDraft} onDiscard={discardDraft} />
          )}
          {/* Date — editable in new/edit; read-only in view */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400">תאריך:</span>
            <input type="date" value={baselineDate}
              onChange={viewOnly ? undefined : (e => setBaselineDate(e.target.value))}
              readOnly={viewOnly}
              disabled={viewOnly}
              max={new Date().toISOString().split('T')[0]}
              className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1"
              style={{ fontSize: 16 }} />
          </div>

          {/* Technique Selection — compact horizontal (tabs remain switchable in view mode) */}
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

          {/* Parameters — hidden in view-only (the underlying values are still passed through to the rows display) */}
          {!viewOnly && (
            <div className="flex justify-around items-start bg-gray-50 rounded-lg p-2 border border-gray-100">
              <TimePicker label="עבודה" value={workTime} onChange={setWorkTime} />
              <NumPicker label="סיבובים" value={roundsCount} onChange={handleRoundsCountChange} min={1} max={10} />
              <TimePicker label="מנוחה" value={restTime} onChange={setRestTime} />
            </div>
          )}
          {viewOnly && (
            <div className="flex justify-around items-center bg-gray-50 rounded-lg p-2 border border-gray-100 text-xs text-gray-500">
              <span>עבודה: <strong>{workTime}s</strong></span>
              <span>סיבובים: <strong>{roundsCount}</strong></span>
              <span>מנוחה: <strong>{restTime}s</strong></span>
            </div>
          )}

          {/* Round Inputs — RTL horizontal */}
          <div style={{ display: 'flex', flexDirection: 'row', direction: 'rtl', gap: 6, width: '100%' }}>
            {rounds.map((r, i) => (
              <div key={i} style={{ flex: 1 }} className="bg-white rounded-lg border border-gray-200 p-1.5">
                <div className="text-[9px] font-bold text-gray-400 text-center mb-0.5">סיבוב {i + 1}</div>
                <Input type="number" min={0} placeholder="קפיצות" value={r.jumps}
                  onChange={viewOnly ? undefined : (e => setRoundField(i, 'jumps', e.target.value))}
                  readOnly={viewOnly}
                  disabled={viewOnly}
                  className="text-center font-black text-base h-8 border-[#FF6F20] focus-visible:ring-[#FF6F20] focus-visible:ring-1 mb-0.5" />
                <Input type="number" min={0} placeholder="פספוס" value={r.misses}
                  onChange={viewOnly ? undefined : (e => setRoundField(i, 'misses', e.target.value))}
                  readOnly={viewOnly}
                  disabled={viewOnly}
                  className="text-center text-[10px] h-6 bg-gray-50 border-transparent placeholder:text-gray-300" />
              </div>
            ))}
          </div>

          {/* Real-time Score — same display in view mode */}
          <div className="grid grid-cols-4 bg-gray-900 rounded-lg p-2">
            <div className="text-center">
              <div className="text-[9px] text-gray-400 font-bold">סה"כ</div>
              <div className="text-sm font-black text-white">{calc.totalJumps}</div>
            </div>
            <div className="text-center border-x border-gray-700">
              <div className="text-[9px] text-gray-400 font-bold">ממוצע</div>
              <div className="text-sm font-black text-white">{calc.avg}</div>
            </div>
            <div className="text-center border-l border-gray-700">
              <div className="text-[9px] text-green-400 font-bold">שיא</div>
              <div className="text-sm font-black text-green-400">{calc.maxJumps}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-[#FF6F20] font-bold">SCORE</div>
              <div className="text-lg font-black text-[#FF6F20]">{calc.score}<span className="text-[10px] mr-0.5">JPS</span></div>
            </div>
          </div>

          {/* Notes — single line (read-only in view) */}
          <Input value={notes}
            onChange={viewOnly ? undefined : (e => setNotes(e.target.value))}
            readOnly={viewOnly}
            disabled={viewOnly}
            placeholder="הערות (אופציונלי)" className="text-right text-xs h-8 rounded-lg" />

          {/* Submit / Close button */}
          {viewOnly ? (
            <Button onClick={onClose}
              className="w-full rounded-lg py-2 font-bold text-white min-h-[40px] text-sm"
              style={{ backgroundColor: '#FF6F20' }}>
              סגור
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving || !canSave}
              className="w-full rounded-lg py-2 font-bold text-white min-h-[40px] text-sm"
              style={{ backgroundColor: canSave ? '#FF6F20' : '#ccc' }}>
              {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />שומר...</> : 'שמור תוצאות'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
