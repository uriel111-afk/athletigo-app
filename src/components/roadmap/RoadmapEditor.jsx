import React, { useContext, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Trash2, Plus, Check, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import { RECORD_UNITS, DEFAULT_EXERCISES, unitLabel } from '@/lib/recordExercises';
import {
  listStations, groupIntoLadders, createStation, updateStation,
  deleteStation, reorderStations,
} from '@/lib/roadmapApi';
import {
  CREAM, CHARCOAL, ORANGE, WHITE, CARD_BORDER, DIVIDER, MUTED,
  GREEN, BEIGE, SANS, LTR_NUM, stationValueLabel,
} from './roadmapUi';

/**
 * COACH EDITOR — the ONLY place the client writes roadmap_stations.
 *
 * coach_id is taken from AuthContext on every create, never defaulted
 * and never hardcoded: the coach_manage_stations policy is
 * auth.uid() = coach_id, so a row saved without it would be
 * unwritable by anyone afterwards.
 *
 * status and reached_at are NOT in any payload here. Both triggers
 * own them — the one on personal_records and the BEFORE INSERT one
 * that stamps a station the trainee has already passed.
 *
 * The last station by sort_order IS the goal; it is edited like any
 * other row and marked with a flag in the list.
 */

const emptyDraft = { exerciseName: '', label: '', threshold: '', unit: 'reps' };

export default function RoadmapEditor({ traineeId }) {
  const { user } = useContext(AuthContext);
  const coachId = user?.id || null;
  const queryClient = useQueryClient();

  const [ladderIdx, setLadderIdx] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [order, setOrder] = useState(null);   // local order while dragging
  const [busy, setBusy] = useState(false);
  const dragIndex = useRef(null);

  const { data: stations = [] } = useQuery({
    queryKey: ['roadmap-stations', traineeId],
    enabled: !!traineeId,
    queryFn: () => listStations(traineeId),
  });

  const ladders = useMemo(() => groupIntoLadders(stations), [stations]);
  const ladder = ladders[Math.min(ladderIdx, Math.max(0, ladders.length - 1))] || null;
  const rows = order || ladder?.stations || [];

  const refresh = () => {
    setOrder(null);
    queryClient.invalidateQueries({ queryKey: ['roadmap-stations', traineeId] });
    queryClient.invalidateQueries({ queryKey: ['roadmap-pbs', traineeId] });
  };

  // ── Drag reorder — the app's existing pattern (DropDetail.jsx):
  // HTML5 drag for the mouse, arrows for a thumb.
  const onDragStart = (i) => { dragIndex.current = i; };
  const onDragOver = (e, i) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === i) return;
    setOrder((cur) => {
      const next = [...(cur || rows)];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      dragIndex.current = i;
      return next;
    });
  };
  const move = (i, dir) => {
    const j = i + dir;
    const cur = [...rows];
    if (j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    setOrder(cur);
  };

  const saveOrder = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await reorderStations(order.map((s) => s.id));
      toast.success('הסדר נשמר');
      refresh();
    } catch (e) {
      toast.error('שמירת הסדר נכשלה: ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (s) => {
    setAdding(false);
    setEditingId(s.id);
    setDraft({
      exerciseName: s.exercise_name || '',
      label: s.label || '',
      threshold: s.threshold != null ? String(s.threshold) : '',
      unit: s.unit || 'reps',
    });
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setDraft({
      ...emptyDraft,
      // A new station continues the ladder that is open.
      exerciseName: ladder?.exerciseName || '',
      unit: ladder?.unit || 'reps',
    });
  };

  const saveDraft = async () => {
    if (!draft.exerciseName.trim()) { toast.error('חסר תרגיל'); return; }
    if (!draft.label.trim()) { toast.error('חסר שם תחנה'); return; }
    if (!Number.isFinite(Number(draft.threshold)) || draft.threshold === '') {
      toast.error('סף לא תקין'); return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await updateStation(editingId, {
          exerciseName: draft.exerciseName,
          label: draft.label,
          threshold: draft.threshold,
          unit: draft.unit,
        });
        toast.success('התחנה עודכנה');
      } else {
        // coach_id comes from AuthContext. roadmapApi throws when it
        // is missing rather than writing an unwritable row.
        await createStation({
          traineeId,
          coachId,
          exerciseName: draft.exerciseName,
          label: draft.label,
          threshold: draft.threshold,
          unit: draft.unit,
          sortOrder: rows.length + 1,
        });
        toast.success('תחנה נוספה');
      }
      setEditingId(null);
      setAdding(false);
      setDraft(emptyDraft);
      refresh();
    } catch (e) {
      toast.error('שמירה נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`למחוק את התחנה "${s.label}"?`)) return;
    setBusy(true);
    try {
      await deleteStation(s.id);
      toast.success('נמחק');
      refresh();
    } catch (e) {
      toast.error('מחיקה נכשלה: ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  if (!traineeId) return null;

  return (
    <div dir="rtl" style={{
      fontFamily: SANS, background: CREAM,
      border: `1px solid ${CARD_BORDER}`, borderRadius: 16,
      overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        background: CHARCOAL, color: WHITE, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 15 }}>🗺️</span>
        <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>מפת התחנות</span>
        <button
          type="button"
          onClick={startAdd}
          style={{
            border: 'none', borderRadius: 9, background: ORANGE, color: WHITE,
            fontFamily: SANS, fontSize: 12, fontWeight: 800, cursor: 'pointer',
            padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4,
          }}
        ><Plus size={14} /> תחנה</button>
      </div>

      {ladders.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 12px 0' }}>
          {ladders.map((l, i) => (
            <button
              key={l.exerciseName}
              type="button"
              onClick={() => { setOrder(null); setLadderIdx(i); }}
              style={{
                flexShrink: 0, borderRadius: 999, cursor: 'pointer',
                padding: '5px 12px', fontFamily: SANS, fontSize: 12, fontWeight: 700,
                border: `1px solid ${i === ladderIdx ? ORANGE : CARD_BORDER}`,
                background: i === ladderIdx ? ORANGE : WHITE,
                color: i === ladderIdx ? WHITE : MUTED,
              }}
            >{l.exerciseName}</button>
          ))}
        </div>
      )}

      {!ladder && !adding && (
        <div style={{ padding: '24px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL }}>
            אין עדיין תחנות
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
            כל תחנה היא סף על תרגיל אחד. האחרונה בסדר היא היעד.
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ padding: 12 }}>
          {rows.map((s, i) => {
            const isGoal = i === rows.length - 1;
            const reached = s.status === 'reached';
            return (
              <div
                key={s.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={() => { dragIndex.current = null; }}
                style={{
                  background: WHITE, borderRadius: 12,
                  border: `1px solid ${isGoal ? ORANGE : CARD_BORDER}`,
                  padding: 10, marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <GripVertical size={16} color={BEIGE} style={{ flexShrink: 0, cursor: 'grab' }} />
                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <button type="button" onClick={() => move(i, -1)} style={arrowStyle} aria-label="למעלה">▲</button>
                  <button type="button" onClick={() => move(i, 1)} style={arrowStyle} aria-label="למטה">▼</button>
                </div>
                <span style={{
                  flexShrink: 0, width: 24, height: 24, borderRadius: 999,
                  background: reached ? GREEN : CREAM,
                  color: reached ? WHITE : MUTED,
                  border: `1px solid ${reached ? GREEN : CARD_BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                }}>
                  {reached ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13.5, fontWeight: 800, color: CHARCOAL,
                    display: 'flex', alignItems: 'center', gap: 5,
                    overflowWrap: 'anywhere',
                  }}>
                    {isGoal && <Flag size={12} color={ORANGE} style={{ flexShrink: 0 }} />}
                    {s.label}
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                    <span style={LTR_NUM}>{stationValueLabel(s.threshold, s.unit)}</span>
                    {' '}{unitLabel(s.unit)} · {s.exercise_name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  style={{
                    flexShrink: 0, border: `1px solid ${CARD_BORDER}`, borderRadius: 8,
                    background: WHITE, color: CHARCOAL, cursor: 'pointer',
                    fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: '5px 9px',
                  }}
                >עריכה</button>
                <button
                  type="button"
                  onClick={() => remove(s)}
                  aria-label="מחיקה"
                  style={{
                    flexShrink: 0, border: 'none', background: 'transparent',
                    cursor: 'pointer', padding: 4, display: 'flex',
                  }}
                ><Trash2 size={15} color="#D85A30" /></button>
              </div>
            );
          })}

          {order && (
            <button
              type="button"
              onClick={saveOrder}
              disabled={busy}
              style={{
                width: '100%', minHeight: 44, borderRadius: 11, border: 'none',
                background: CHARCOAL, color: WHITE, fontFamily: SANS,
                fontSize: 14, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >שמור סדר חדש</button>
          )}
        </div>
      )}

      {(adding || editingId) && (
        <div style={{
          borderTop: `1px solid ${DIVIDER}`, background: WHITE, padding: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginBottom: 10 }}>
            {editingId ? 'עריכת תחנה' : 'תחנה חדשה'}
          </div>

          <Field label="תרגיל">
            <input
              list="roadmap-exercises"
              value={draft.exerciseName}
              onChange={(e) => setDraft((d) => ({ ...d, exerciseName: e.target.value }))}
              placeholder="שם התרגיל בשיאים"
              style={inputStyle}
            />
            <datalist id="roadmap-exercises">
              {DEFAULT_EXERCISES.map((e) => <option key={e.name} value={e.name} />)}
            </datalist>
          </Field>

          <Field label="שם התחנה">
            <input
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="למשל: 5 מתח רצוף"
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Field label="סף">
                <input
                  type="number"
                  inputMode="decimal"
                  value={draft.threshold}
                  onChange={(e) => setDraft((d) => ({ ...d, threshold: e.target.value }))}
                  style={{ ...inputStyle, textAlign: 'center', ...LTR_NUM }}
                />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="יחידה">
                <select
                  value={draft.unit}
                  onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                  style={inputStyle}
                >
                  {RECORD_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => { setAdding(false); setEditingId(null); setDraft(emptyDraft); }}
              style={{
                flex: 1, minHeight: 44, borderRadius: 11,
                border: `1px solid ${CARD_BORDER}`, background: WHITE, color: MUTED,
                fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >ביטול</button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={busy}
              style={{
                flex: 2, minHeight: 44, borderRadius: 11, border: 'none',
                background: ORANGE, color: WHITE, fontFamily: SANS,
                fontSize: 14, fontWeight: 800,
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >{busy ? 'שומר…' : 'שמירה'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', height: 42, boxSizing: 'border-box',
  borderRadius: 10, border: `1px solid ${CARD_BORDER}`,
  background: CREAM, padding: '0 10px',
  fontSize: 14, fontFamily: SANS, color: CHARCOAL,
};

const arrowStyle = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  color: MUTED, fontSize: 9, lineHeight: 1, padding: '1px 2px',
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
