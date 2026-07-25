import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, SkipForward, Check, Clock, Battery, BatteryLow, BatteryWarning,
  MapPin, Plus, Layers, X, Flame, Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import QuickCapture from '@/components/lifeos/QuickCapture';
import OpportunitySheet from '@/components/lifeos/OpportunitySheet';
import ModeFormSheet from '@/components/lifeos/ModeFormSheet';
import CyclePathStrip from '@/components/lifeos/CyclePathStrip';
import {
  FOCUS, hexAlpha, isoDate, indexNodes, logTask,
  PERSONAL_ARM_TITLE, BANK_TAG,
} from '@/lib/lifeos/focus-api';
import {
  loadPersonalDay, addExecution, saveDayState, deferTask, setFirstStep,
  lastExecByBranch, branchIdOfFactory, rampIds,
} from '@/lib/lifeos/personal-day-api';
import {
  pickNextMove, netMinutes, isPassive, WINDOWS, DEFAULT_WINDOW,
  capacityCap, suggestFilmingDay, DEFER_COURAGE_AT,
} from '@/lib/lifeos/priority-engine';
import { weekProgressMap } from '@/lib/lifeos/week-math';

// ═══════════════════════════════════════════════════════════════════
// היום — one screen that answers "מה עכשיו?"
// ═══════════════════════════════════════════════════════════════════
// Top to bottom: how much you have today (capacity) → how long the next slot
// is (window) → THE MOVE, one card, one decision → the ramp of the active
// mode → the cycle path of the move's branch.
//
// Every write goes through personal-day-api, and finishing a move writes BOTH
// records: focus_executions (the append-only history the week maths reads) and
// focus_task_logs via logTask (the one-row-per-day mark the habit matrix
// reads). Passive nodes (net_minutes 0) never reach this screen as a move —
// the engine drops them before ranking — but they still sit on the board.
// ═══════════════════════════════════════════════════════════════════

const CAPACITIES = [
  { key: 'full', label: 'יום מלא', Icon: Battery, hint: 'בלי תקרה' },
  { key: 'busy', label: 'עמוס', Icon: BatteryLow, hint: 'עד 2 מהלכים' },
  { key: 'broken', label: 'שבור', Icon: BatteryWarning, hint: 'מהלך אחד' },
];
const WINDOW_LABEL = { 15: '15 דקות', 60: 'שעה', 240: '4 שעות' };

export default function DayScreen({ headerSlot = null }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();   // the path strip leads to /lifeos/personal/path
  const today = isoDate();

  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [slot, setSlot] = useState(DEFAULT_WINDOW);   // the chosen time window
  const [skipped, setSkipped] = useState(() => new Set());   // "הבא" this session only
  const [execFor, setExecFor] = useState(null);              // node being documented
  const [placeOpen, setPlaceOpen] = useState(false);
  const [modeFormOpen, setModeFormOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const d = await loadPersonalDay(userId, { day: today });
    setData(d);
    setLoaded(true);
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const nodes = data?.nodes || [];
  const executions = data?.executions || [];
  const modes = data?.modes || [];
  const dayState = data?.dayState || null;
  const dayStates = data?.dayStates || [];
  const customFields = data?.customFields || [];

  const capacity = dayState?.capacity || 'full';
  const movesDone = Number(dayState?.moves_done || 0);
  const activeMode = modes.find(m => m.id === dayState?.active_mode_id) || null;

  const { byId, children } = useMemo(() => indexNodes(nodes), [nodes]);

  // Today's executions already mark those nodes done — they must not be
  // proposed again, alongside the ones skipped with "הבא".
  const doneIds = useMemo(() => new Set(
    executions.filter(e => String(e.day).slice(0, 10) === today).map(e => e.node_id)
  ), [executions, today]);

  // Only the personal world is proposable here; the business arms have their
  // own screens.
  const personalTasks = useMemo(() => {
    const arm = nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
    if (!arm) return [];
    const out = [];
    const walk = (id) => (children[id] || []).forEach(c => {
      if (c.node_type === 'task' && !(c.tags || []).includes(BANK_TAG)) out.push(c);
      walk(c.id);
    });
    walk(arm.id);
    return out;
  }, [nodes, children]);

  const branchIdOf = useMemo(() => branchIdOfFactory(nodes), [nodes]);
  const lastBranchExec = useMemo(() => lastExecByBranch(executions, nodes), [executions, nodes]);
  const weekProgress = useMemo(
    () => weekProgressMap(personalTasks, executions, { date: today, dayStates }),
    [personalTasks, executions, today, dayStates]);
  const metThisWeek = useMemo(
    () => new Set(Object.entries(weekProgress).filter(([, v]) => v.met).map(([k]) => k)),
    [weekProgress]);

  const ctx = useMemo(() => ({
    today, window: slot, capacity, movesDone,
    doneIds, excludeIds: skipped,
    branchIdOf, lastBranchExec, metThisWeek,
  }), [today, slot, capacity, movesDone, doneIds, skipped, branchIdOf, lastBranchExec, metThisWeek]);

  const move = useMemo(
    () => pickNextMove(personalTasks, ctx),
    [personalTasks, ctx]);

  const filming = useMemo(
    () => suggestFilmingDay(personalTasks, { executions, date: today, dayStates }),
    [personalTasks, executions, today, dayStates]);

  // The branch the current move belongs to — its cycle drives the path strip.
  const moveBranch = useMemo(() => {
    const id = move?.node ? branchIdOf(move.node) : null;
    return id ? byId[id] : null;
  }, [move, branchIdOf, byId]);

  // ── Writes ────────────────────────────────────────────────────────
  const setCapacity = async (key) => {
    try {
      await saveDayState(userId, today, { capacity: key });
      setData(p => ({ ...p, dayState: { ...(p.dayState || { day: today }), capacity: key } }));
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  const setMode = async (modeId) => {
    const next = dayState?.active_mode_id === modeId ? null : modeId;
    try {
      await saveDayState(userId, today, { active_mode_id: next });
      setData(p => ({ ...p, dayState: { ...(p.dayState || { day: today }), active_mode_id: next } }));
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  // Finishing a move: one execution row + the day's done mark + moves_done++.
  const saveExecution = async (node, fields) => {
    await addExecution(userId, { ...fields, node_id: node.id, day: today });
    try { await logTask(userId, node, today); }
    catch { /* the matrix mark is best-effort; the execution row is the truth */ }
    await saveDayState(userId, today, { moves_done: movesDone + 1 });
    setExecFor(null);
    await load();
    toast.success('נרשם ✓');
  };

  const defer = async (node) => {
    try {
      const r = await deferTask(node, { courageAt: DEFER_COURAGE_AT });
      setSkipped(p => new Set(p).add(node.id));
      toast(r.is_fear_task ? 'נדחה — סומן כמשימת אומץ' : 'נדחה');
      await load();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  const next = (node) => setSkipped(p => new Set(p).add(node.id));

  if (!loaded) {
    return (
      <LifeOSLayout title="אישי" hideFab hideTopBar>
        {headerSlot}<PageSkeleton rows={5} />
      </LifeOSLayout>
    );
  }

  const cap = capacityCap(capacity);

  return (
    <LifeOSLayout title="אישי" hideFab hideTopBar>
      {headerSlot}

      {/* ── כמה יש לי היום ── */}
      <div style={card}>
        <div style={cardTitle}>כמה יש לי היום</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {CAPACITIES.map(({ key, label, Icon, hint }) => {
            const on = capacity === key;
            return (
              <button key={key} onClick={() => setCapacity(key)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '9px 4px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.12) : '#fff' }}>
                <Icon size={16} color={on ? '#B4531A' : FOCUS.muted} />
                <span style={{ fontSize: 12, fontWeight: on ? 800 : 700, color: on ? '#B4531A' : FOCUS.ink }}>{label}</span>
                <span style={{ fontSize: 9, color: FOCUS.muted }}>{hint}</span>
              </button>
            );
          })}
        </div>
        {cap !== Infinity && (
          <div style={{ fontSize: 10.5, color: FOCUS.muted, marginTop: 6, textAlign: 'center' }}>
            {movesDone} מתוך {cap} מהלכים היום
          </div>
        )}
      </div>

      {/* ── כמה זמן יש לי עכשיו ── */}
      <div style={card}>
        <div style={cardTitle}>כמה זמן יש לי עכשיו</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {WINDOWS.map(w => {
            const on = slot === w;
            return (
              <button key={w} onClick={() => setSlot(w)}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 4px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 700,
                  border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.12) : '#fff', color: on ? '#B4531A' : FOCUS.ink }}>
                <Clock size={14} color={on ? '#B4531A' : FOCUS.muted} /> {WINDOW_LABEL[w] || `${w}′`}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── המהלך הבא ── */}
      <MoveCard move={move} weekProgress={weekProgress} branchTitle={moveBranch?.title}
        onStart={(n) => setExecFor(n)} onDefer={defer} onNext={next}
        onFirstStep={async (n, txt) => { await setFirstStep(n.id, txt); await load(); }} />

      {/* ── מצבים ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: FOCUS.ink }}>מצב</span>
          <button onClick={() => setModeFormOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', color: '#B4531A', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={13} /> הוסף מצב
          </button>
        </div>
        {modes.length === 0 ? (
          <div style={{ fontSize: 12.5, color: FOCUS.muted }}>אין מצבים עדיין</div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {modes.map(m => {
              const on = activeMode?.id === m.id;
              return (
                <button key={m.id} onClick={() => setMode(m.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 13px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 700,
                    border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.14) : '#fff', color: on ? '#B4531A' : FOCUS.muted }}>
                  <Layers size={13} /> {m.name}
                </button>
              );
            })}
          </div>
        )}
        {activeMode && (
          <RampList mode={activeMode} byId={byId} doneIds={doneIds} onDo={(n) => setExecFor(n)} />
        )}
      </div>

      {/* ── מסלול המחזור, מימין לשמאל ── */}
      {moveBranch?.cycle_start && (
        <CyclePathStrip start={String(moveBranch.cycle_start).slice(0, 10)}
          end={moveBranch.cycle_end ? String(moveBranch.cycle_end).slice(0, 10) : null}
          today={today} label={moveBranch.title}
          onTap={() => navigate('/lifeos/personal/path')} />
      )}

      {/* ── הצעת יום צילום ── */}
      {filming && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Film size={17} color={FOCUS.orange} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: FOCUS.ink }}>יום צילום מוצע: {filming.day.slice(8)}/{filming.day.slice(5, 7)}</div>
            <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 1 }}>נשארו {filming.remaining} השבוע · היום הכי פנוי שנשאר</div>
          </div>
        </div>
      )}

      {/* ── פעולות מהירות ── */}
      <div style={{ padding: '4px 12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => setPlaceOpen(true)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 13, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <MapPin size={16} color={FOCUS.orange} /> אני במקום חדש
        </button>
        <QuickCapture userId={userId} />
      </div>

      {execFor && (
        <ExecutionSheet node={execFor} customFields={customFields}
          onSave={(fields) => saveExecution(execFor, fields)} onClose={() => setExecFor(null)} />
      )}
      {placeOpen && (
        <OpportunitySheet nodes={personalTasks} ctx={ctx}
          onPick={(n) => { setPlaceOpen(false); setExecFor(n); }} onClose={() => setPlaceOpen(false)} />
      )}
      {modeFormOpen && (
        <ModeFormSheet userId={userId} nodes={nodes} sortOrder={(modes.length + 1) * 10}
          onSaved={load} onClose={() => setModeFormOpen(false)} />
      )}
    </LifeOSLayout>
  );
}

// ── The one card that matters ─────────────────────────────────────
function MoveCard({ move, weekProgress, branchTitle, onStart, onDefer, onNext, onFirstStep }) {
  const [stepDraft, setStepDraft] = useState('');

  if (!move) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '26px 14px' }}>
        <Check size={30} color={FOCUS.orange} style={{ opacity: 0.55 }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink, marginTop: 8 }}>אין מה להציע כרגע</div>
        <div style={{ fontSize: 12.5, color: FOCUS.muted, marginTop: 4 }}>הכול סגור להיום, או שהכול נדחה</div>
      </div>
    );
  }

  if (move.capped) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '26px 14px' }}>
        <Check size={30} color={FOCUS.orange} />
        <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink, marginTop: 8 }}>מספיק להיום</div>
        <div style={{ fontSize: 12.5, color: FOCUS.muted, marginTop: 4 }}>
          {move.movesDone} מהלכים — זו התקרה שהגדרת ליום כזה
        </div>
      </div>
    );
  }

  const node = move.node;
  const wp = weekProgress[node.id];
  const fear = !!node.is_fear_task;

  return (
    <div style={{ ...card, border: `1px solid ${hexAlpha(FOCUS.orange, 0.55)}`, background: 'linear-gradient(135deg,#FFFDFA,#FFF4EA)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#B4531A' }}>המהלך הבא</span>
        {branchTitle && <span style={{ fontSize: 10.5, color: FOCUS.muted }}>· {branchTitle}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, fontWeight: 800, color: '#B4531A', background: hexAlpha(FOCUS.orange, 0.16), borderRadius: 7, padding: '2px 6px' }}>{move.score}</span>
      </div>

      <div style={{ fontSize: 19, fontWeight: 800, color: FOCUS.ink, lineHeight: 1.25 }}>{node.title}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 7 }}>
        <Pill><Clock size={11} /> {netMinutes(node)} דקות</Pill>
        {wp && <Pill>{wp.label}</Pill>}
        {node.due_date && <Pill>עד {String(node.due_date).slice(8)}/{String(node.due_date).slice(5, 7)}</Pill>}
        {fear && <Pill tone="fear"><Flame size={11} /> אומץ</Pill>}
        {Number(node.defer_count || 0) > 0 && <Pill>נדחה {node.defer_count}×</Pill>}
      </div>

      {move.oversized && (
        <div style={{ fontSize: 11.5, color: '#B4531A', background: hexAlpha(FOCUS.orange, 0.1), borderRadius: 10, padding: '7px 10px', marginTop: 8, lineHeight: 1.45 }}>
          שום דבר לא נכנס לחלון שבחרת — זה הקטן ביותר שפתוח. אפשר להתחיל ולעצור.
        </div>
      )}

      {node.success_criteria && (
        <div style={{ fontSize: 12, color: FOCUS.muted, marginTop: 7 }}>הצלחה: {node.success_criteria}</div>
      )}

      {/* A fear task always opens on its ten-minute step. Missing → ask once. */}
      {fear && (
        node.first_step ? (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: FOCUS.ink, background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '9px 11px', marginTop: 8 }}>
            הצעד הראשון: {node.first_step}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input value={stepDraft} onChange={(e) => setStepDraft(e.target.value)}
              placeholder="מה הצעד הראשון של עשר דקות?"
              style={{ flex: 1, minWidth: 0, border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit', color: FOCUS.ink, background: '#fff', outline: 'none' }} />
            <button onClick={() => stepDraft.trim() && onFirstStep(node, stepDraft)}
              style={{ flexShrink: 0, padding: '0 14px', borderRadius: 11, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>שמור</button>
          </div>
        )
      )}

      <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
        <button onClick={() => onStart(node)}
          style={{ flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px', borderRadius: 13, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Play size={16} /> יוצא לדרך
        </button>
        <button onClick={() => onNext(node)}
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '13px 6px', borderRadius: 13, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <SkipForward size={14} /> הבא
        </button>
        <button onClick={() => onDefer(node)}
          style={{ flex: 1, padding: '13px 6px', borderRadius: 13, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          לא היום
        </button>
      </div>
    </div>
  );
}

// ── The active mode's ramp, in order ──────────────────────────────
function RampList({ mode, byId, doneIds, onDo }) {
  const ids = rampIds(mode);
  const main = mode.main_node_id ? byId[mode.main_node_id] : null;
  if (!ids.length && !main) return null;
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${FOCUS.border}`, paddingTop: 9 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: FOCUS.muted, marginBottom: 6 }}>הרמפה — לפי הסדר</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {ids.map((id, i) => {
          const n = byId[id];
          if (!n) return null;
          const done = doneIds.has(n.id);
          return (
            <button key={id} onClick={() => !done && onDo(n)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 11, border: `1px solid ${FOCUS.border}`, background: done ? hexAlpha(FOCUS.orange, 0.08) : '#fff', cursor: done ? 'default' : 'pointer', textAlign: 'right', fontFamily: 'inherit' }}>
              <span style={{ width: 19, height: 19, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: done ? FOCUS.orange : '#F0E4D0', color: done ? '#fff' : FOCUS.muted }}>
                {done ? '✓' : i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: done ? FOCUS.muted : FOCUS.ink, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
              {!isPassive(n) && <span style={{ fontSize: 10, color: FOCUS.muted, flexShrink: 0 }}>{netMinutes(n)}′</span>}
            </button>
          );
        })}
        {main && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 11, border: `1px solid ${hexAlpha(FOCUS.orange, 0.5)}`, background: hexAlpha(FOCUS.orange, 0.08) }}>
            <Play size={13} color={FOCUS.orange} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{main.title}</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: '#B4531A', flexShrink: 0 }}>המרכזית</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── תיעוד ביצוע ───────────────────────────────────────────────────
// Every field optional. Custom fields the user defined in StructureSheet are
// rendered here and stored in the execution's `custom` jsonb.
function ExecutionSheet({ node, customFields = [], onSave, onClose }) {
  const [minutes, setMinutes] = useState(String(netMinutes(node) || ''));
  const [what, setWhat] = useState('');
  const [sat, setSat] = useState(0);
  const [improve, setImprove] = useState('');
  const [custom, setCustom] = useState({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({
        minutes: minutes === '' ? null : Number(minutes),
        what_happened: what.trim() || null,
        satisfaction: sat || null,
        improve_next: improve.trim() || null,
        custom,
      });
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); setBusy(false); }
  };

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1440, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>{node.title}</div>
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 11, color: FOCUS.muted, marginBottom: 10 }}>כל השדות אופציונליים</div>

        <div style={fLbl}>כמה דקות בפועל</div>
        <input type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={fInp} />

        <div style={fLbl}>מה קרה בפועל</div>
        <textarea value={what} onChange={(e) => setWhat(e.target.value)} rows={2} style={{ ...fInp, resize: 'vertical' }} />

        <div style={fLbl}>שביעות רצון</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {[1, 2, 3, 4, 5].map(v => (
            <button key={v} onClick={() => setSat(sat === v ? 0 : v)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15,
                border: `1px solid ${sat === v ? FOCUS.orange : FOCUS.border}`, background: sat === v ? hexAlpha(FOCUS.orange, 0.14) : '#fff' }}>
              {['😞', '😕', '😐', '🙂', '😄'][v - 1]}
            </button>
          ))}
        </div>

        <div style={fLbl}>מה לשפר בפעם הבאה</div>
        <input value={improve} onChange={(e) => setImprove(e.target.value)} style={fInp} />

        {customFields.map(f => (
          <div key={f.id}>
            <div style={fLbl}>{f.label}</div>
            {f.field_type === 'select' ? (
              <select value={custom[f.label] || ''} onChange={(e) => setCustom(p => ({ ...p, [f.label]: e.target.value }))} style={fInp}>
                <option value="">—</option>
                {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.field_type === 'number' || f.field_type === 'scale' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                value={custom[f.label] || ''}
                onChange={(e) => setCustom(p => ({ ...p, [f.label]: e.target.value }))} style={fInp} />
            )}
          </div>
        ))}

        <button onClick={save} disabled={busy}
          style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 14, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Check size={17} /> {busy ? 'שומר…' : 'סיימתי'}
        </button>
      </div>
    </div>
  );
}

// ── shared bits ───────────────────────────────────────────────────
const Pill = ({ children, tone }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
    border: `1px solid ${tone === 'fear' ? hexAlpha(FOCUS.red, 0.4) : FOCUS.border}`,
    background: tone === 'fear' ? hexAlpha(FOCUS.red, 0.09) : '#fff',
    color: tone === 'fear' ? FOCUS.red : FOCUS.muted }}>
    {children}
  </span>
);
const card = { margin: '0 12px 10px', padding: '11px 13px', background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 16, boxShadow: FOCUS.neu };
const cardTitle = { fontSize: 12, fontWeight: 800, color: FOCUS.ink, marginBottom: 7 };
const fLbl = { fontSize: 11, fontWeight: 700, color: FOCUS.muted, margin: '12px 0 5px' };
const fInp = { width: '100%', boxSizing: 'border-box', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' };
