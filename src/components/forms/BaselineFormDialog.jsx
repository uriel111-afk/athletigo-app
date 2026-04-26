import React, { useState, useContext, useMemo, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Activity, X, Calendar, Clock, ChevronDown, Maximize2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { DraftBanner } from "@/components/DraftBanner";

// ─── Constants ───────────────────────────────────────────────────
//
// Tabs use the English labels exactly as in the design (Basic / Foot
// Switch / High Knees) — these are the brand-standard names of the
// jump-rope techniques. Internal IDs stay in snake_case for DB.
const TECHNIQUES = [
  { id: 'basic',       label: 'Basic',       color: '#FF6F20' },
  { id: 'foot_switch', label: 'Foot Switch', color: '#FF6F20' },
  { id: 'high_knees',  label: 'High Knees',  color: '#FF6F20' },
];

const COLORS = {
  primary: '#FF6F20',
  primaryLight: '#FFF5EE',
  primaryTint: '#FFEEDF',
  bg: '#FFFFFF',
  bgSoft: '#FAFAFA',
  bgInput: '#FFFFFF',
  border: '#E5E7EB',
  borderSoft: '#F0F0F0',
  textPrimary: '#1A1A1A',
  textSecondary: '#9CA3AF',
  textMuted: '#C4C4C4',
  danger: '#DC2626',
};

const INITIAL_PER_TECH = () => ({
  basic:       { rounds: [{ jumps: '', misses: '' }, { jumps: '', misses: '' }, { jumps: '', misses: '' }] },
  foot_switch: { rounds: [{ jumps: '', misses: '' }, { jumps: '', misses: '' }, { jumps: '', misses: '' }] },
  high_knees:  { rounds: [{ jumps: '', misses: '' }, { jumps: '', misses: '' }, { jumps: '', misses: '' }] },
});

const INITIAL_DATA = {
  technique: 'basic',
  workTime: 30,        // seconds — used in JPS calc and persisted
  restTime: 30,        // seconds — round rest, persisted
  techRestTime: 60,    // seconds — between-techniques pause; UI helper, not persisted
  notes: '',
  baselineDate: '',
  baselineTime: '',    // HH:MM string — UI display (not persisted as separate column; saved to `time`)
  manualName: '',
  selectedTraineeId: '', // empty = "manual entry"
  perTechnique: INITIAL_PER_TECH(),
};

// ─── Helpers ─────────────────────────────────────────────────────

const fmtMMSS = (totalSeconds) => {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const fmtDateDDMMYYYY = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

// ─── Main component ──────────────────────────────────────────────

export default function BaselineFormDialog({
  isOpen, onClose, traineeId, traineeName,
  editMode = false, existingRows = null,
  viewOnly = false,
}) {
  const queryClient = useQueryClient();
  const { user: authUser } = useContext(AuthContext);
  const isCoach = authUser?.is_coach === true || authUser?.role === 'coach' || authUser?.role === 'admin';
  const coachId = isCoach ? authUser?.id : null;

  // Coach trainee list — populates the dropdown. Only fetched for coaches.
  const [trainees, setTrainees] = useState([]);
  useEffect(() => {
    if (!isOpen || !isCoach || !authUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: services } = await supabase
          .from('client_services')
          .select('trainee_id')
          .eq('coach_id', authUser.id);
        const ids = [...new Set((services || []).map(s => s.trainee_id).filter(Boolean))];
        if (ids.length === 0) { if (!cancelled) setTrainees([]); return; }
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', ids)
          .order('full_name');
        if (!cancelled) setTrainees(users || []);
      } catch (err) {
        console.warn('[BaselineForm] trainees fetch failed:', err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, isCoach, authUser?.id]);

  // Initial data — derived from existingRows in edit/view, otherwise blank.
  const initialData = useMemo(() => {
    const base = {
      ...INITIAL_DATA,
      perTechnique: INITIAL_PER_TECH(),
      baselineDate: new Date().toISOString().split('T')[0],
      baselineTime: new Date().toTimeString().slice(0, 5),
      selectedTraineeId: traineeId || '',
      manualName: traineeName || '',
    };
    if ((editMode || viewOnly) && existingRows && existingRows.length > 0) {
      const first = existingRows[0];
      const perTech = INITIAL_PER_TECH();
      for (const row of existingRows) {
        const t = row.technique;
        if (!perTech[t]) continue;
        const rounds = (row.rounds_data ?? []).map(r => ({
          jumps: String(r.jumps ?? ''),
          misses: String(r.misses ?? ''),
        }));
        // Pad to 3 so the UI always renders 3 round cards.
        while (rounds.length < 3) rounds.push({ jumps: '', misses: '' });
        perTech[t] = { rounds: rounds.slice(0, 3) };
      }
      const firstTech = existingRows.find(r => perTech[r.technique])?.technique || 'basic';
      return {
        ...base,
        technique: firstTech,
        workTime: first.work_time_seconds ?? 30,
        restTime: first.rest_time_seconds ?? 30,
        notes: first.notes ?? '',
        baselineDate: first.date || base.baselineDate,
        baselineTime: (first.time || base.baselineTime).slice(0, 5),
        perTechnique: perTech,
      };
    }
    return base;
  }, [editMode, viewOnly, existingRows, traineeId, traineeName]);

  // Draft scope keeps edit / view / new from leaking into each other.
  const draftScope = (editMode || viewOnly) && existingRows?.[0]?.id
    ? `${viewOnly ? 'view' : 'edit'}_${existingRows[0].id}`
    : `${traineeId ?? 'new'}`;

  const {
    data: formData, setData: setFormData,
    hasDraft, keepDraft, discardDraft, clearDraft,
  } = useFormDraft('BaselineForm', draftScope, isOpen, initialData);

  useKeepScreenAwake(isOpen);

  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Minimize state — collapses the dialog to a floating pill at the
  // bottom-left so the coach can run a stopwatch / look at the timer
  // without losing form state. Form data lives in `formData` (above)
  // so it survives the Dialog mount/unmount cycle.
  const [minimized, setMinimized] = useState(false);
  // Reset minimized whenever the dialog is freshly opened.
  useEffect(() => { if (isOpen) setMinimized(false); }, [isOpen]);

  // Convenience getters/setters bound to the drafted formData.
  const technique = formData.technique;
  const setTechnique = (v) => setFormData(prev => ({ ...prev, technique: v }));
  const workTime = formData.workTime;
  const setWorkTime = (v) => setFormData(prev => ({ ...prev, workTime: v }));
  const restTime = formData.restTime;
  const setRestTime = (v) => setFormData(prev => ({ ...prev, restTime: v }));
  const techRestTime = formData.techRestTime;
  const setTechRestTime = (v) => setFormData(prev => ({ ...prev, techRestTime: v }));
  const notes = formData.notes;
  const setNotes = (v) => setFormData(prev => ({ ...prev, notes: v }));
  const baselineDate = formData.baselineDate;
  const setBaselineDate = (v) => setFormData(prev => ({ ...prev, baselineDate: v }));
  const baselineTime = formData.baselineTime;
  const setBaselineTime = (v) => setFormData(prev => ({ ...prev, baselineTime: v }));
  const selectedTraineeId = formData.selectedTraineeId;
  const setSelectedTraineeId = (v) => setFormData(prev => ({ ...prev, selectedTraineeId: v }));
  const manualName = formData.manualName;
  const setManualName = (v) => setFormData(prev => ({ ...prev, manualName: v }));
  const perTechnique = formData.perTechnique;

  // The trainee_id we'll write — dropdown choice wins over the prop so
  // the coach can record for someone else without re-opening the form.
  const effectiveTraineeId = selectedTraineeId || traineeId || null;

  const setRoundField = (i, field, val) => {
    setFormData(prev => {
      const t = prev.perTechnique[prev.technique] || { rounds: [] };
      const newRounds = [...t.rounds];
      while (newRounds.length <= i) newRounds.push({ jumps: '', misses: '' });
      newRounds[i] = { ...newRounds[i], [field]: val };
      return {
        ...prev,
        perTechnique: { ...prev.perTechnique, [prev.technique]: { ...t, rounds: newRounds } },
      };
    });
  };

  // Calculations for the CURRENT technique (the visible tab).
  // Score = avg jumps per round divided by work time in seconds → JPS.
  const currentRounds = perTechnique[technique]?.rounds || [];
  const calc = useMemo(() => {
    const filled = currentRounds.filter(r => r.jumps !== '' && parseInt(r.jumps) >= 0);
    const total = filled.reduce((s, r) => s + (parseInt(r.jumps) || 0), 0);
    const avg = filled.length > 0 ? total / filled.length : 0;
    const score = workTime > 0 && filled.length > 0 ? avg / workTime : 0;
    return {
      total,
      avg: Math.round(avg * 10) / 10,
      score: Math.round(score * 100) / 100,
      filledCount: filled.length,
    };
  }, [currentRounds, workTime]);

  const filledTechCount = useMemo(() => {
    return Object.values(perTechnique).filter(t =>
      t.rounds.some(r => r.jumps !== '' && parseInt(r.jumps) >= 0)
    ).length;
  }, [perTechnique]);

  const canSave = filledTechCount > 0 && workTime > 0 && !!effectiveTraineeId;

  // ─── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave) {
      if (!effectiveTraineeId) toast.error('בחר מתאמן או הזן שם');
      else if (filledTechCount === 0) toast.error('יש למלא לפחות סיבוב אחד באחת מהטכניקות');
      else if (workTime === 0) toast.error('זמן עבודה לא יכול להיות 0');
      return;
    }

    setSaving(true);
    try {
      const dateStr = baselineDate || new Date().toISOString().split('T')[0];
      const timeStr = (baselineTime && /^\d{2}:\d{2}$/.test(baselineTime))
        ? baselineTime
        : new Date().toTimeString().slice(0, 5);
      const sharedCreatedAt = (editMode && existingRows?.[0]?.created_at)
        ? existingRows[0].created_at
        : new Date().toISOString();

      const techIds = Object.keys(perTechnique);
      const rowsToInsert = [];
      const perTechCalc = {};
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
          trainee_id: effectiveTraineeId,
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

      if (editMode && existingRows && existingRows.length > 0) {
        const idsToDelete = existingRows.map(r => r.id);
        await supabase.from('results_log').delete().in('baseline_id', idsToDelete);
        const { error: delErr } = await supabase.from('baselines').delete().in('id', idsToDelete);
        if (delErr) throw delErr;
      }

      const { data: inserted, error: insErr } = await supabase
        .from('baselines')
        .insert(rowsToInsert)
        .select();
      if (insErr) throw insErr;

      // Mirror to results_log so the trainee profile's "שיאים" tab
      // shows one entry per technique.
      const resultRows = (inserted || []).map(b => {
        const c = perTechCalc[b.technique];
        const techLabel = TECHNIQUES.find(t => t.id === b.technique)?.label || b.technique;
        return {
          trainee_id: effectiveTraineeId,
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
        if (resultErr) console.error('[BaselineForm] results_log insert failed:', resultErr);
      }

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
      console.error('[BaselineForm] Error:', error);
      toast.error('שגיאה בשמירת בייסליין: ' + (error?.message || 'נסה שוב'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete (coach view-only) ──────────────────────────────────
  const handleDelete = async () => {
    if (!existingRows || existingRows.length === 0) {
      setShowDeleteConfirm(false);
      return;
    }
    setDeleting(true);
    try {
      const ids = existingRows.map(r => r.id).filter(Boolean);
      try { await supabase.from('results_log').delete().in('baseline_id', ids); } catch {}
      const { error } = await supabase.from('baselines').delete().in('id', ids);
      if (error) throw error;
      toast.success('הבייסליין נמחק');
      queryClient.invalidateQueries({ queryKey: ['baselines', traineeId] });
      queryClient.invalidateQueries({ queryKey: ['baselines-progress', traineeId] });
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      setShowDeleteConfirm(false);
      onClose();
    } catch (e) {
      console.error('[BaselineForm] delete exception:', e);
      toast.error('המחיקה נכשלה: ' + (e?.message || ''));
    } finally {
      setDeleting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────
  // Dialog is hidden (open=false) when minimized so its backdrop
  // doesn't darken the screen behind the floating pill. The component
  // itself stays mounted, so formData (drafts, picked rounds, etc.)
  // is fully preserved across minimize/restore cycles.
  return (
    <>
      <Dialog
        open={isOpen && !minimized}
        onOpenChange={(open) => { if (!open && !saving && !minimized) onClose(); }}
      >
        <DialogContent
          className="max-w-md p-0"
          style={{ backgroundColor: COLORS.bg, borderRadius: 16, overflow: 'hidden' }}
          onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
        >
        {/* Radix requires a DialogTitle for accessibility. Visual
            heading "אתגר Baseline" already exists below — keep this
            one screen-reader-only so the design stays untouched. */}
        <DialogTitle className="sr-only">אתגר Baseline</DialogTitle>
        <DialogDescription className="sr-only">
          טופס מדידת קפיצות לשנייה (JPS) עם 3 טכניקות ו-3 סיבובים לטכניקה.
        </DialogDescription>
        <div dir="rtl" style={{ padding: '20px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={onClose}
                aria-label="סגור"
                style={{
                  width: 32, height: 32, borderRadius: 999, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  color: COLORS.textSecondary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
              <button
                onClick={() => setMinimized(true)}
                aria-label="מזער"
                title="מזער"
                style={{
                  width: 32, height: 32, borderRadius: 999, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  color: COLORS.textSecondary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronDown size={18} />
              </button>
            </div>
            <div style={{
              flex: 1, textAlign: 'center',
              fontSize: 22, fontWeight: 800,
              color: COLORS.textPrimary,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <span>אתגר Baseline</span>
              <Activity size={20} style={{ color: COLORS.primary }} />
            </div>
            <div style={{ width: 68 }} />
          </div>

          {!viewOnly && hasDraft && (
            <DraftBanner onContinue={keepDraft} onDiscard={discardDraft} />
          )}

          {/* Trainee dropdown */}
          <select
            value={selectedTraineeId}
            onChange={viewOnly ? undefined : (e) => setSelectedTraineeId(e.target.value)}
            disabled={viewOnly}
            style={cardSelect}
          >
            <option value="">— הזנה ידנית —</option>
            {trainees.map(t => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>

          {/* Manual name input — relevant when "manual entry" selected */}
          <input
            type="text"
            value={manualName}
            onChange={viewOnly ? undefined : (e) => setManualName(e.target.value)}
            readOnly={viewOnly}
            disabled={viewOnly}
            placeholder="שם מלא"
            style={{
              ...cardSelect,
              textAlign: 'right',
              opacity: selectedTraineeId ? 0.5 : 1,
              cursor: selectedTraineeId ? 'not-allowed' : 'text',
            }}
          />

          {/* Time + Date row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <DateTimeCard
              icon={<Calendar size={16} style={{ color: COLORS.textSecondary }} />}
              displayValue={fmtDateDDMMYYYY(baselineDate)}
              type="date"
              value={baselineDate}
              onChange={(v) => setBaselineDate(v)}
              disabled={viewOnly}
              max={new Date().toISOString().split('T')[0]}
            />
            <DateTimeCard
              icon={<Clock size={16} style={{ color: COLORS.textSecondary }} />}
              displayValue={baselineTime || '—'}
              type="time"
              value={baselineTime}
              onChange={(v) => setBaselineTime(v)}
              disabled={viewOnly}
            />
          </div>

          {/* Three timer config cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <TimerCard label='מנוחה טכניקות' seconds={techRestTime} onChange={viewOnly ? null : setTechRestTime} />
            <TimerCard label='מנוחה סבבים'    seconds={restTime}     onChange={viewOnly ? null : setRestTime} />
            <TimerCard label='זמן עבודה'      seconds={workTime}     onChange={viewOnly ? null : setWorkTime} />
          </div>

          {/* Pill tabs */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            backgroundColor: COLORS.primaryLight,
            borderRadius: 14, padding: 4,
          }}>
            {TECHNIQUES.map(t => {
              const active = technique === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTechnique(t.id)}
                  style={{
                    padding: '10px 6px', borderRadius: 10,
                    border: 'none',
                    backgroundColor: active ? COLORS.primary : 'transparent',
                    color: active ? '#FFFFFF' : COLORS.textPrimary,
                    fontSize: 14, fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Round cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[0, 1, 2].map(i => {
              const r = currentRounds[i] || { jumps: '', misses: '' };
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: COLORS.bg,
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: 14,
                    padding: 12,
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                >
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: COLORS.textSecondary,
                    textAlign: 'center', letterSpacing: 1,
                  }}>
                    ROUND {i + 1}
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={r.jumps}
                    onChange={viewOnly ? undefined : (e) => setRoundField(i, 'jumps', e.target.value)}
                    readOnly={viewOnly}
                    disabled={viewOnly}
                    placeholder="קפיצות"
                    style={{
                      width: '100%',
                      padding: '14px 8px',
                      borderRadius: 10,
                      border: `2px solid ${COLORS.primary}`,
                      backgroundColor: COLORS.bg,
                      color: COLORS.textPrimary,
                      fontSize: 22, fontWeight: 800,
                      textAlign: 'center',
                      outline: 'none',
                      fontFamily: "'Heebo', 'Assistant', sans-serif",
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={r.misses}
                    onChange={viewOnly ? undefined : (e) => setRoundField(i, 'misses', e.target.value)}
                    readOnly={viewOnly}
                    disabled={viewOnly}
                    placeholder="פספוסים"
                    style={{
                      width: '100%',
                      padding: '10px 8px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: COLORS.bgSoft,
                      color: COLORS.textSecondary,
                      fontSize: 13, fontWeight: 600,
                      textAlign: 'center',
                      outline: 'none',
                      fontFamily: "'Heebo', 'Assistant', sans-serif",
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Stats summary — three cells, last one (SCORE) highlighted */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr',
            gap: 0,
            backgroundColor: COLORS.bgSoft,
            borderRadius: 14,
            padding: 14,
            alignItems: 'center',
          }}>
            <StatCell label='סה"כ' value={String(calc.total)} />
            <StatCell label="ממוצע" value={String(calc.avg.toFixed(1))} dividers />
            <ScoreCell value={calc.score} />
          </div>

          {/* Buttons row */}
          {viewOnly ? (
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <button
                onClick={onClose}
                style={btnPrimary}
              >
                סגור
              </button>
              {isCoach && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    flex: 1,
                    padding: '14px 16px', borderRadius: 12,
                    background: '#FFFFFF', color: COLORS.danger,
                    border: `1px solid ${COLORS.danger}`,
                    fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  🗑️ מחק בייסליין
                </button>
              )}
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr',
              gap: 10, paddingTop: 4,
            }}>
              <button
                onClick={handleSave}
                disabled={saving || !canSave}
                style={{
                  ...btnPrimary,
                  opacity: !canSave || saving ? 0.5 : 1,
                  cursor: !canSave || saving ? 'default' : 'pointer',
                }}
              >
                {saving
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Loader2 size={16} className="animate-spin" /> שומר...
                    </span>
                  : 'שמור תוצאות'}
              </button>
              <button onClick={onClose} disabled={saving} style={btnGhost}>
                ביטול
              </button>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Delete confirm modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={(o) => { if (!o && !deleting) setShowDeleteConfirm(false); }}>
        <DialogContent
          className="max-w-sm"
          style={{ background: '#FFFFFF', border: `2px solid ${COLORS.danger}`, borderRadius: 14 }}
        >
          <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DialogTitle style={{ color: COLORS.danger, fontWeight: 800, fontSize: 18, margin: 0 }}>
              מחיקת בייסליין
            </DialogTitle>
            <div style={{ color: COLORS.textPrimary, fontSize: 14, lineHeight: 1.7 }}>
              האם אתה בטוח שברצונך למחוק את הבייסליין הזה?<br />
              הפעולה תמחק את כל {existingRows?.length || 0} הטכניקות מהסשן
              {existingRows?.[0]?.date && ` (${new Date(existingRows[0].date).toLocaleDateString('he-IL')})`}.<br />
              לא ניתן לשחזר לאחר מחיקה.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{
                  flex: 1, background: '#FFFFFF', color: '#6b7280',
                  border: `1px solid ${COLORS.border}`, borderRadius: 8,
                  padding: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >ביטול</button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1, background: COLORS.danger, color: '#FFFFFF',
                  border: 'none', borderRadius: 8,
                  padding: 10, fontWeight: 700, fontSize: 14,
                  cursor: deleting ? 'wait' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'מוחק...' : 'מחק לצמיתות'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>

    {/* Floating pill — shown only while the dialog is minimized.
        Sits above the timer bar (z-index 12500 vs timer's 12000) so
        the coach always sees a visible "tap to restore" affordance. */}
    {isOpen && minimized && (
      <button
        onClick={() => setMinimized(false)}
        aria-label="הרחב את הטופס"
        style={{
          position: 'fixed',
          bottom: 24, left: 16,
          zIndex: 12500,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 16px',
          borderRadius: 999,
          border: 'none',
          backgroundColor: COLORS.primary,
          color: '#FFFFFF',
          fontSize: 13, fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(255,111,32,0.35)',
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}
      >
        <Activity size={16} />
        <span>אתגר Baseline</span>
        <Maximize2 size={14} />
      </button>
    )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

// A read-style card that hosts a hidden native input. The user sees
// the formatted label + chevron, but tapping anywhere opens the
// native picker (date or time).
function DateTimeCard({ icon, displayValue, type, value, onChange, disabled, max }) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        backgroundColor: COLORS.bg,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ fontSize: 12, color: COLORS.textSecondary }}>▾</span>
      <span style={{
        flex: 1, fontSize: 14, fontWeight: 700,
        color: COLORS.textPrimary,
        textAlign: 'center',
      }}>
        {displayValue}
      </span>
      {icon}
      {/* Hidden native input on top so the platform picker opens. */}
      <input
        type={type}
        value={value}
        onChange={disabled ? undefined : (e) => onChange(e.target.value)}
        disabled={disabled}
        max={max}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          opacity: 0, cursor: disabled ? 'default' : 'pointer',
          border: 'none', padding: 0, margin: 0,
        }}
      />
    </label>
  );
}

// Compact MM:SS card. In edit mode (onChange provided) tapping it
// pops a tiny ± control underneath via toggle. To keep this minimal
// we reuse a hidden numeric input that nudges by 5 seconds — the
// label shows the formatted value either way.
function TimerCard({ label, seconds, onChange }) {
  const editable = typeof onChange === 'function';
  const handleStep = (delta) => {
    if (!editable) return;
    onChange(Math.max(0, (Number(seconds) || 0) + delta));
  };
  return (
    <div style={{
      backgroundColor: COLORS.bg,
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: 14,
      padding: '12px 8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      position: 'relative',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 600, color: COLORS.textSecondary,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 20, fontWeight: 800,
        color: COLORS.textPrimary,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 0.5,
      }}>
        {fmtMMSS(seconds)}
      </span>
      {editable && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex',
        }}>
          <button
            onClick={() => handleStep(-5)}
            aria-label="הפחת 5 שניות"
            style={{
              flex: 1, border: 'none', background: 'transparent',
              cursor: 'pointer', borderRadius: 14,
            }}
          />
          <button
            onClick={() => handleStep(+5)}
            aria-label="הוסף 5 שניות"
            style={{
              flex: 1, border: 'none', background: 'transparent',
              cursor: 'pointer', borderRadius: 14,
            }}
          />
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, dividers = false }) {
  return (
    <div style={{
      textAlign: 'center', padding: '4px 8px',
      borderLeft: dividers ? `1px solid ${COLORS.border}` : 'none',
      borderRight: dividers ? `1px solid ${COLORS.border}` : 'none',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function ScoreCell({ value }) {
  return (
    <div style={{
      backgroundColor: COLORS.primaryTint,
      borderRadius: 12,
      padding: '8px 10px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, letterSpacing: 1 }}>SCORE</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.primary, marginTop: 2 }}>
        {value.toFixed(2)}
        <span style={{ fontSize: 11, fontWeight: 700, marginRight: 4 }}>JPS</span>
      </div>
    </div>
  );
}

// ─── Inline styles ───────────────────────────────────────────────

const cardSelect = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: `1px solid ${COLORS.border}`,
  backgroundColor: COLORS.bgInput,
  color: COLORS.textPrimary,
  fontSize: 14, fontWeight: 600,
  fontFamily: "'Heebo', 'Assistant', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
  appearance: 'none',
  WebkitAppearance: 'none',
  textAlign: 'right',
};

const btnPrimary = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: 'none',
  backgroundColor: COLORS.primary,
  color: '#FFFFFF',
  fontSize: 15, fontWeight: 700,
  cursor: 'pointer',
  fontFamily: "'Heebo', 'Assistant', sans-serif",
};

const btnGhost = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: 'none',
  background: 'transparent',
  color: COLORS.textPrimary,
  fontSize: 14, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Heebo', 'Assistant', sans-serif",
};
