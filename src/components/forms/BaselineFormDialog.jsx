import React, { useState, useContext, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Activity, X, Calendar, Clock, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
// DraftBanner replaced by inline DraftToast (floating, auto-dismiss)
// — see component definition near the bottom of this file.

// ─── Constants ───────────────────────────────────────────────────
//
// Tabs in Hebrew. Internal IDs stay in snake_case so DB rows + the
// results_log mirror keep matching previous data. RTL flow puts בסיס
// visually right-most as expected.
const TECHNIQUES = [
  { id: 'basic',       label: 'בסיס',          color: '#FF6F20' },
  { id: 'foot_switch', label: 'החלפת רגליים',  color: '#FF6F20' },
  { id: 'high_knees',  label: 'הרמת ברכיים',   color: '#FF6F20' },
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

// Window event used to open a baseline form from anywhere. The
// BaselineManager (App.jsx-mounted) listens, dedups by traineeId,
// and renders one <BaselineFormDialog /> per open session — so the
// coach can run multiple parallel sessions for different trainees.
export const BASELINE_OPEN_EVENT = 'baseline-open';

// Convenience wrapper so callers don't have to reach for window.dispatchEvent.
export function openBaselineDialog(detail = {}) {
  window.dispatchEvent(new CustomEvent(BASELINE_OPEN_EVENT, { detail }));
}

// Controlled component: the BaselineManager owns visibility +
// minimize state and passes them in. This file used to be
// self-managed via a window event listener; that pattern only
// allowed one form at a time, which broke "multiple trainees in
// parallel". The opener helper above is unchanged for callers.
export default function BaselineFormDialog({
  traineeId, traineeName,
  editMode = false, existingRows = null, viewOnly = false,
  isMinimized = false,
  onClose, onMinimize,
  stackIndex = 0,
}) {
  const isOpen = true;          // mounted ⇒ open (manager controls mounts)
  const minimized = isMinimized;
  const setMinimized = (next) => {
    // Toggle support: caller can pass a function or a value.
    const flag = typeof next === 'function' ? next(minimized) : next;
    if (flag !== minimized) onMinimize?.();
  };

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
  // Drag offset for the dialog (relative to its centered position).
  // Initial offset is staggered by stackIndex so multiple parallel
  // forms don't perfectly overlap when first opened. The user can
  // drag from there; the manager doesn't reset position on minimize.
  const [dialogPos, setDialogPos] = useState({ x: stackIndex * 24, y: stackIndex * 24 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  // ── Dialog drag handlers ───────────────────────────────────────
  // Bound on the title bar (onPointerDown). Move + up listeners are
  // attached to window so dragging stays smooth when the pointer
  // leaves the title strip. clamp() keeps the dialog inside the
  // viewport so it can't be lost off-screen.
  const onTitlePointerDown = (e) => {
    if (e.button && e.button !== 0) return; // ignore right-click
    dragRef.current = {
      active: true, moved: false,
      startX: e.clientX, startY: e.clientY,
      baseX: dialogPos.x, baseY: dialogPos.y,
    };
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
  };
  useEffect(() => {
    const handleMove = (e) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      // 3px threshold so a tap (no real movement) still counts as a click.
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
      const w = window.innerWidth, h = window.innerHeight;
      // Allow ~half-screen drift in any direction. Generous bounds —
      // the dialog is centered, so x=0 means centered.
      const next = {
        x: Math.max(-w / 2 + 80, Math.min(w / 2 - 80, dragRef.current.baseX + dx)),
        y: Math.max(-h / 2 + 40, Math.min(h / 2 - 40, dragRef.current.baseY + dy)),
      };
      setDialogPos(next);
    };
    const handleUp = () => { dragRef.current.active = false; };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, []);

  // Pill drag + render moved to BaselineManager — it owns the
  // bottom-left stack so multiple minimized forms can sit side by
  // side without each form fighting for the same anchor.

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
  // Best = max jumps across the round set (peak single-round value).
  const currentRounds = perTechnique[technique]?.rounds || [];
  const calc = useMemo(() => {
    const filled = currentRounds.filter(r => r.jumps !== '' && parseInt(r.jumps) >= 0);
    const total = filled.reduce((s, r) => s + (parseInt(r.jumps) || 0), 0);
    const avg = filled.length > 0 ? total / filled.length : 0;
    const score = workTime > 0 && filled.length > 0 ? avg / workTime : 0;
    const best = filled.length > 0 ? Math.max(...filled.map(r => parseInt(r.jumps) || 0)) : 0;
    return {
      total,
      best,
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
        const bestRound = Math.max(...filled.map(r => parseInt(r.jumps) || 0));
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
          // Between-techniques pause — save under both the canonical
          // *_seconds suffix and the shorter alias the spec asks for.
          // base44.entities.Baseline's column-retry drops whichever
          // name the live schema is missing, so this is safe regardless
          // of which migration ran.
          tech_rest_seconds: techRestTime,
          tech_rest_time: techRestTime,
          rounds_count: filled.length,
          rounds_data: roundsData,
          total_jumps: totalJumps,
          average_jumps: avg,
          baseline_score: score,
          best_round: bestRound,
          notes: notes || null,
          created_at: sharedCreatedAt,
        });

        perTechCalc[techId] = { totalJumps, avg, score, bestRound, roundsCount: filled.length };
      }

      if (editMode && existingRows && existingRows.length > 0) {
        const idsToDelete = existingRows.map(r => r.id);
        await supabase.from('results_log').delete().in('baseline_id', idsToDelete);
        const { error: delErr } = await supabase.from('baselines').delete().in('id', idsToDelete);
        if (delErr) throw delErr;
      }

      // Insert. If best_round column doesn't exist yet
      // (20260426_baselines_best_round.sql not applied), retry without
      // it so the save still works and the user is unblocked.
      let inserted, insErr;
      ({ data: inserted, error: insErr } = await supabase
        .from('baselines').insert(rowsToInsert).select());
      if (insErr && /best_round/i.test(insErr.message || '')) {
        const slim = rowsToInsert.map(({ best_round, ...rest }) => rest);
        ({ data: inserted, error: insErr } = await supabase
          .from('baselines').insert(slim).select());
      }
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
          // !max-h-[100dvh] overrides the primitive's 75vh cap so the
          // form has the full viewport when needed (small screens) and
          // never scrolls — every element is sized to fit.
          className="max-w-md p-0 !max-h-[100dvh]"
          onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
          // Drag offset added to the primitive's centering transform.
          // The primitive merges this style over its defaults (since
          // the dialog.jsx fix), so position/zIndex/top/left stay,
          // only `transform` is replaced with our combined value.
          style={{
            transform: `translate(calc(-50% + ${dialogPos.x}px), calc(-50% + ${dialogPos.y}px))`,
          }}
        >
        {/* Radix requires a DialogTitle for accessibility. Visual
            heading "אתגר Baseline" already exists below — keep this
            one screen-reader-only so the design stays untouched. */}
        <DialogTitle className="sr-only">אתגר Baseline</DialogTitle>
        <DialogDescription className="sr-only">
          טופס מדידת קפיצות לשנייה (JPS) עם 3 טכניקות ו-3 סיבובים לטכניקה.
        </DialogDescription>
        {/* Compact column — every section sized to fit a single
            viewport without scroll. Header/footer don't need
            position:sticky because nothing here scrolls. */}
        <div dir="rtl" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Header — compact 28×28 buttons, 16px title */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                onClick={onClose}
                aria-label="סגור"
                style={iconBtn28}
              >
                <X size={16} />
              </button>
              <button
                onClick={() => setMinimized(true)}
                aria-label="מזער"
                title="מזער"
                style={iconBtn28}
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <div
              onPointerDown={onTitlePointerDown}
              onClick={() => {
                // A real drag also fires click on pointerup. Skip the
                // toggle in that case so dragging the dialog doesn't
                // accidentally minimize it.
                if (dragRef.current.moved) {
                  dragRef.current.moved = false;
                  return;
                }
                setMinimized(m => !m);
              }}
              title="גרור להזזה · לחיצה ממזערת"
              style={{
                flex: 1, textAlign: 'center',
                fontSize: 16, fontWeight: 800,
                color: COLORS.textPrimary,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: dragRef.current.active ? 'grabbing' : 'grab',
                userSelect: 'none',
                touchAction: 'none', // let the pointer drive — don't scroll the page
              }}
            >
              <span>אתגר Baseline</span>
              <Activity size={16} style={{ color: COLORS.primary }} />
            </div>
            <div style={{ width: 60 }} />
          </div>

          {/* Draft notification moved out of the form body — see
              <DraftToast /> below the Dialog. Inline banner used to
              push content out of the viewport and force scroll. */}

          {/* Trainee selector removed — the trainee is always preselected
              before the form opens, passed in as the traineeId prop, and
              consumed downstream via effectiveTraineeId. */}

          {/* Time + Date row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
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

          {/* Three timer config controls — native <select>. The previous
              bottom-sheet picker fought Radix Dialog's react-remove-scroll
              and stuck on touch; native selects always work because the
              browser/OS owns the scroll. RTL flow: first child = rightmost. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>זמן עבודה</div>
              <select
                value={workTime}
                onChange={(e) => setWorkTime(Number(e.target.value))}
                disabled={viewOnly}
                style={{
                  width: '100%', padding: '8px', borderRadius: 12,
                  border: '1px solid #F0E4D0', fontSize: 18, fontWeight: 600,
                  textAlign: 'center', textAlignLast: 'center',
                  direction: 'rtl', background: 'white', appearance: 'auto',
                  cursor: viewOnly ? 'default' : 'pointer',
                }}
              >
                {Array.from({ length: 90 }, (_, i) => i + 1).map((s) => (
                  <option key={s} value={s}>
                    {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>זמן מנוחה</div>
              <select
                value={restTime}
                onChange={(e) => setRestTime(Number(e.target.value))}
                disabled={viewOnly}
                style={{
                  width: '100%', padding: '8px', borderRadius: 12,
                  border: '1px solid #F0E4D0', fontSize: 18, fontWeight: 600,
                  textAlign: 'center', textAlignLast: 'center',
                  direction: 'rtl', background: 'white', appearance: 'auto',
                  cursor: viewOnly ? 'default' : 'pointer',
                }}
              >
                {Array.from({ length: 90 }, (_, i) => i + 1).map((s) => (
                  <option key={s} value={s}>
                    {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4, whiteSpace: 'nowrap' }}>מנוחה בין טכניקות</div>
              <select
                value={techRestTime}
                onChange={(e) => setTechRestTime(Number(e.target.value))}
                disabled={viewOnly}
                style={{
                  width: '100%', padding: '8px', borderRadius: 12,
                  border: '1px solid #F0E4D0', fontSize: 18, fontWeight: 600,
                  textAlign: 'center', textAlignLast: 'center',
                  direction: 'rtl', background: 'white', appearance: 'auto',
                  cursor: viewOnly ? 'default' : 'pointer',
                }}
              >
                {Array.from({ length: 90 }, (_, i) => i + 1).map((s) => (
                  <option key={s} value={s}>
                    {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pill tabs — orange divider between buttons. Switched to
              flex so we can interleave <Divider/> elements between
              the tabs (grid would scatter them across columns). */}
          <div style={{
            display: 'flex', alignItems: 'center',
            backgroundColor: COLORS.primaryLight,
            borderRadius: 10, padding: 3,
          }}>
            {TECHNIQUES.map((t, idx) => {
              const active = technique === t.id;
              return (
                <React.Fragment key={t.id}>
                  {idx > 0 && (
                    <span aria-hidden style={{
                      width: 2, height: 16,
                      backgroundColor: COLORS.primary,
                      margin: '0 4px',
                      flexShrink: 0,
                    }} />
                  )}
                <button
                  type="button"
                  onClick={() => setTechnique(t.id)}
                  style={{
                    flex: 1,
                    padding: '6px 4px', borderRadius: 8,
                    border: 'none',
                    backgroundColor: active ? COLORS.primary : 'transparent',
                    color: active ? '#FFFFFF' : COLORS.textPrimary,
                    fontSize: 12, fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {t.label}
                </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Round cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[0, 1, 2].map(i => {
              const r = currentRounds[i] || { jumps: '', misses: '' };
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: COLORS.bg,
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: 10,
                    padding: 6,
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: COLORS.textSecondary,
                    textAlign: 'center',
                  }}>
                    סיבוב {i + 1}
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
                      padding: '8px 4px',
                      borderRadius: 8,
                      border: `2px solid ${COLORS.primary}`,
                      backgroundColor: COLORS.bg,
                      color: COLORS.textPrimary,
                      fontSize: 16, fontWeight: 800,
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
                      padding: '6px 4px',
                      borderRadius: 6,
                      border: 'none',
                      backgroundColor: COLORS.bgSoft,
                      color: COLORS.textSecondary,
                      fontSize: 11, fontWeight: 600,
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

          {/* Stats summary — four cells, SCORE highlighted */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.3fr',
            gap: 0,
            backgroundColor: COLORS.bgSoft,
            borderRadius: 10,
            padding: 8,
            alignItems: 'center',
          }}>
            <StatCell label='סה"כ'  value={String(calc.total)} />
            <StatCell label="ממוצע" value={String(calc.avg.toFixed(1))} dividers />
            <StatCell label="שיא"   value={String(calc.best)} />
            <ScoreCell value={calc.score} />
          </div>

          {/* Buttons row */}
          {viewOnly ? (
            <div style={{ display: 'flex', gap: 8 }}>
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
                    padding: '10px 14px', borderRadius: 10,
                    background: '#FFFFFF', color: COLORS.danger,
                    border: `1px solid ${COLORS.danger}`,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  🗑️ מחק בייסליין
                </button>
              )}
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr',
              gap: 8,
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
        <DialogContent className="max-w-sm">
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

    {/* Draft restore prompt — floats above the dialog (z 12001 >
        dialog 11001) and stays put until the coach picks an option.
        No auto-dismiss: choosing prematurely lost their old data, so
        the prompt waits for an explicit click. */}
    {isOpen && !viewOnly && hasDraft && (
      <DraftToast onRestore={keepDraft} onDiscard={discardDraft} />
    )}

    </>
  );
}

// Persistent restore-draft prompt. Two explicit choices, no timer —
// the coach controls when (and how) it goes away.
//
// Portaled to document.body so it sits outside the Radix Dialog
// subtree. Without the portal, react-remove-scroll (used by Radix
// Dialog in modal mode) plus the dialog's
// onPointerDownOutside={e => e.preventDefault()} can swallow clicks
// on this toast — the buttons would visually highlight but neither
// onRestore nor onDiscard would fire. Portaling + pointerEvents:auto
// keeps the toast in its own pointer-events scope.
function DraftToast({ onRestore, onDiscard }) {
  const node = (
    <div
      dir="rtl"
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 12001,
        pointerEvents: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        border: '1px solid #FF6F20',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
        animation: 'draftToastIn 180ms ease-out',
        maxWidth: 'min(90vw, 360px)',
        minWidth: 280,
      }}
    >
      <style>{`@keyframes draftToastIn { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 14, fontWeight: 700, color: '#1A1A1A',
      }}>
        <span style={{ fontSize: 18 }}>📝</span>
        <span>יש טיוטה קודמת — להמשיך אותה?</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Baseline] draft: restoring');
            onRestore?.();
          }}
          style={{
            flex: 1,
            padding: '10px 12px', borderRadius: 10, border: 'none',
            backgroundColor: '#FF6F20', color: '#FFFFFF',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            pointerEvents: 'auto',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >
          המשך מאיפה שהפסקתי
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Baseline] draft: discarding');
            onDiscard?.();
          }}
          style={{
            flex: 1,
            padding: '10px 12px', borderRadius: 10,
            backgroundColor: 'transparent',
            color: '#6B7280',
            border: '1px solid #E5E7EB',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            pointerEvents: 'auto',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >
          התחל מחדש
        </button>
      </div>
    </div>
  );
  // Portal to body so the toast escapes the Radix Dialog's modality
  // scope. Guard for SSR / detached envs where document is unavailable.
  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(node, document.body);
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
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 10,
        border: `1px solid ${COLORS.border}`,
        backgroundColor: COLORS.bg,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ fontSize: 10, color: COLORS.textSecondary }}>▾</span>
      <span style={{
        flex: 1, fontSize: 13, fontWeight: 700,
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

// Compact MM:SS card. In edit mode tapping anywhere on the card
// fires the onPick callback — the parent opens a bottom-sheet
// picker (1..90 seconds) so the coach can scroll-select instead
// of nudging in 5s steps. read-only (onPick null) hides the cursor
// and the click handler.
function TimerCard({ label, seconds, onPick }) {
  const editable = typeof onPick === 'function';
  return (
    <div
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? onPick : undefined}
      style={{
        backgroundColor: COLORS.bg,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        padding: '6px 4px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        cursor: editable ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        fontSize: 10, fontWeight: 600, color: COLORS.textSecondary,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 15, fontWeight: 800,
        color: COLORS.textPrimary,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 0.5,
      }}>
        {fmtMMSS(seconds)}
      </span>
    </div>
  );
}

function StatCell({ label, value, dividers = false }) {
  return (
    <div style={{
      textAlign: 'center', padding: '2px 6px',
      borderLeft: dividers ? `1px solid ${COLORS.border}` : 'none',
      borderRight: dividers ? `1px solid ${COLORS.border}` : 'none',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textSecondary }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ScoreCell({ value }) {
  return (
    <div style={{
      backgroundColor: COLORS.primaryTint,
      borderRadius: 8,
      padding: '4px 6px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.primary, letterSpacing: 0.6 }}>SCORE</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.primary, marginTop: 1 }}>
        {value.toFixed(2)}
        <span style={{ fontSize: 9, fontWeight: 700, marginRight: 3 }}>JPS</span>
      </div>
    </div>
  );
}

// ─── Inline styles ───────────────────────────────────────────────

// 28×28 pill button (close + minimize). Slightly smaller than the
// 32px header buttons we had pre-compaction; saves vertical space.
const iconBtn28 = {
  width: 28, height: 28, borderRadius: 999, border: 'none',
  background: 'transparent', cursor: 'pointer',
  color: COLORS.textSecondary,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0,
};

// Form row controls — ~36px tall instead of the previous ~44px.
const cardSelect = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 10,
  border: `1px solid ${COLORS.border}`,
  backgroundColor: COLORS.bgInput,
  color: COLORS.textPrimary,
  fontSize: 13, fontWeight: 600,
  fontFamily: "'Heebo', 'Assistant', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
  appearance: 'none',
  WebkitAppearance: 'none',
  textAlign: 'right',
};

const btnPrimary = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  backgroundColor: COLORS.primary,
  color: '#FFFFFF',
  fontSize: 14, fontWeight: 700,
  cursor: 'pointer',
  fontFamily: "'Heebo', 'Assistant', sans-serif",
};

const btnGhost = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: 'transparent',
  color: COLORS.textPrimary,
  fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Heebo', 'Assistant', sans-serif",
};
