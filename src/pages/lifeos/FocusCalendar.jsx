import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthContext } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import SessionFormDialog from '@/components/forms/SessionFormDialog';
import { createCoachSession } from '@/lib/sessions/createCoachSession';
import { CalendarRange, Dumbbell, Clock, X, ChevronLeft, Check, Plus, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, urgencyStyle, tagColor, isoDate, addDays, dowOf, HEB_DAYS, HEB_DAYS_FULL,
  fetchNodes, fetchSessionsForDate, indexNodes, ancestorsOf, descendantTasks,
  updateNode, createNode, logTask,
} from '@/lib/lifeos/focus-api';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00..22:00
const hourOf = (t) => (t ? parseInt(String(t).slice(0, 2), 10) : null);
const pad2 = (h) => String(h).padStart(2, '0');

function occursOn(n, date) {
  if (n.node_type !== 'task' || n.status !== 'active') return false;
  if (n.frequency === 'daily') return true;
  if (n.frequency === 'weekly') return n.day_of_week === dowOf(date);
  if (n.frequency === 'monthly') { const d = new Date(date + 'T00:00:00').getDate(); return d >= 1 && d <= 3; }
  return n.task_date === date;
}

export default function FocusCalendar() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const location = useLocation();
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(location.state?.date || today);
  const [loaded, setLoaded] = useState(false);
  const [sheetNode, setSheetNode] = useState(null);
  const [timeMenu, setTimeMenu] = useState(null); // node awaiting a time
  const [planOpen, setPlanOpen] = useState(!!location.state?.openPlan);
  const swipe = useRef({ x: 0 });

  // Apply deep-link state on later navigations too (not just first mount).
  useEffect(() => {
    if (location.state?.date) setSelected(location.state.date);
    if (location.state?.openPlan) setPlanOpen(true);
  }, [location.state]);

  const loadNodes = useCallback(async () => {
    if (!userId) return;
    try { setNodes(await fetchNodes(userId)); } catch { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId]);

  const loadSessions = useCallback(async () => {
    if (!userId) return;
    try { setSessions(await fetchSessionsForDate(userId, selected)); } catch { setSessions([]); }
  }, [userId, selected]);

  useEffect(() => { loadNodes(); }, [loadNodes]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const { byId, roots } = useMemo(() => indexNodes(nodes), [nodes]);

  // ── Add-event flow (task or training session) ─────────────────
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addSlot, setAddSlot] = useState(null);       // { hour } | null
  const [chooserMode, setChooserMode] = useState('pick'); // 'pick' | 'task'
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionPreset, setSessionPreset] = useState({ date: null, time: null });

  // Trainees for the reused session form (shares cache with מפגשים).
  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees-list'],
    queryFn: async () => {
      try {
        const all = await base44.entities.User.list('-created_at', 1000);
        return all.filter((u) => !u.account_deleted && u.role !== 'admin' && u.user_role !== 'coach' && (u.role === 'user' || u.role === 'trainee'));
      } catch { return []; }
    },
    initialData: [], staleTime: 30000, retry: 2,
  });

  const openAdd = (hour = null) => { setAddSlot({ hour }); setChooserMode('pick'); setNewTaskTitle(''); };

  const createTaskAtSlot = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const hour = addSlot?.hour;
    const fields = { parent_id: roots[0]?.id || null, node_type: 'task', title, task_date: selected };
    if (hour != null) fields.task_time = `${pad2(hour)}:00`;
    setAddSlot(null); setNewTaskTitle('');
    try { await createNode(userId, fields); loadNodes(); toast.success('נוספה משימה'); }
    catch { toast.error('שגיאה'); }
  };

  const openSessionForm = () => {
    const hour = addSlot?.hour;
    setSessionPreset({ date: selected, time: hour != null ? `${pad2(hour)}:00` : null });
    setAddSlot(null);
    setSessionOpen(true);
  };

  // Reuse the PROVEN מפגשים creation path (shared helper → trainees see it).
  const submitSession = async (sessionData) => {
    await createCoachSession({ coach: user, sessionData, queryClient });
    setSessionOpen(false);
    loadSessions(); // refresh the day → blue card appears immediately
  };

  // Tapping an existing session deep-links to its מפגשים detail.
  const openSessionDetail = (s) => {
    if (s.trainee_id) navigate(`/TraineeProfile?userId=${s.trainee_id}&tab=attendance&sessionId=${s.id}`);
    else navigate('/sessions');
  };

  // Week strip (Sun..Sat containing `selected`).
  const weekDates = useMemo(() => {
    const start = addDays(selected, -dowOf(selected));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  const dayTasks = useMemo(() => nodes.filter(n => occursOn(n, selected)), [nodes, selected]);
  const timed = useMemo(() => dayTasks.filter(n => n.task_time), [dayTasks]);
  const untimed = useMemo(() => dayTasks.filter(n => !n.task_time), [dayTasks]);

  const itemsAtHour = (h) => [
    ...timed.filter(n => hourOf(n.task_time) === h).map(n => ({ kind: 'task', n })),
    ...sessions.filter(s => hourOf(s.time) === h).map(s => ({ kind: 'session', s })),
  ];

  const setTime = async (node, time) => {
    setTimeMenu(null);
    try { await updateNode(node.id, { task_time: time, task_date: node.task_date || selected }); loadNodes(); toast.success('נקבעה שעה'); }
    catch { toast.error('שגיאה'); }
  };

  const onTouchStart = (e) => { swipe.current.x = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - swipe.current.x;
    if (Math.abs(dx) > 55) setSelected(s => addDays(s, dx > 0 ? -1 : 1)); // RTL: swipe right → previous
  };

  if (!loaded) return <LifeOSLayout title="מיקוד" hideFab><FocusChips /><PageSkeleton rows={6} /></LifeOSLayout>;

  return (
    <LifeOSLayout title="מיקוד" fullBleed hideFab>
      <FocusChips />
      <div style={{ padding: '0 14px', flexShrink: 0 }}>
        <button onClick={() => setPlanOpen(true)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 14, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 14, boxShadow: '0 4px 14px rgba(255,111,32,0.35)' }}>
          <CalendarRange size={18} /> תכנון שבוע
        </button>

        {/* Day chips */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {weekDates.map(d => {
            const on = d === selected;
            const isToday = d === today;
            return (
              <button key={d} onClick={() => setSelected(d)}
                style={{
                  flex: 1, padding: '8px 2px', borderRadius: 12, cursor: 'pointer', border: 'none',
                  background: on ? FOCUS.orange : (isToday ? '#FFF3E9' : '#fff'),
                  color: on ? '#fff' : (isToday ? '#B4531A' : FOCUS.muted),
                  boxShadow: on ? 'none' : FOCUS.neu, fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{HEB_DAYS[dowOf(d)]}</span>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{new Date(d + 'T00:00:00').getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* Add-event button on the day header */}
        <button onClick={() => openAdd(null)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 12, border: `1px dashed ${FOCUS.border}`, background: '#fff', color: FOCUS.orange, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 14, fontFamily: 'inherit' }}>
          <Plus size={16} /> אירוע חדש
        </button>
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 14px 24px' }}>
        {/* Untimed tray */}
        <div style={{ background: '#FBF6EF', border: `1px dashed ${FOCUS.border}`, borderRadius: 14, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: FOCUS.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={13} /> ללא שעה
          </div>
          {untimed.length === 0 ? (
            <div style={{ fontSize: 12, color: FOCUS.muted }}>אין משימות ללא שעה ליום הזה</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {untimed.map(n => {
                const st = urgencyStyle(n);
                return (
                  <button key={n.id} onClick={() => setTimeMenu(n)}
                    style={{ ...st, borderRadius: 10, padding: '7px 11px', fontSize: 13, fontWeight: 700, color: FOCUS.ink, cursor: 'pointer', boxShadow: FOCUS.neu }}>
                    {n.title || 'משימה'} <span style={{ color: FOCUS.orange }}>+ שעה</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative' }}>
          {HOURS.map(h => {
            const items = itemsAtHour(h);
            return (
              <div key={h} onClick={() => openAdd(h)} style={{ display: 'flex', gap: 10, minHeight: 46, borderTop: `1px solid ${FOCUS.border}`, padding: '6px 0', cursor: 'pointer' }}>
                <div style={{ width: 42, flexShrink: 0, fontSize: 12, color: FOCUS.muted, fontWeight: 700 }}>{String(h).padStart(2, '0')}:00</div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((it, i) => it.kind === 'session' ? (
                    <div key={'s' + i} onClick={(e) => { e.stopPropagation(); openSessionDetail(it.s); }} style={{ background: '#fff', borderRight: `4px solid ${FOCUS.session}`, border: `1px solid ${FOCUS.border}`, borderRadius: 10, padding: '8px 11px', boxShadow: FOCUS.neu, cursor: 'pointer' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: FOCUS.ink }}>{it.s.displayName}</div>
                      <div style={{ fontSize: 11, color: FOCUS.session, fontWeight: 600, marginTop: 2 }}>
                        {String(it.s.time).slice(0, 5)} · {it.s.session_type || 'אימון'}
                      </div>
                    </div>
                  ) : (
                    <div key={'t' + i} onClick={(e) => { e.stopPropagation(); setSheetNode(it.n); }} style={{ ...urgencyStyle(it.n), borderRadius: 10, padding: '8px 11px', boxShadow: FOCUS.neu, cursor: 'pointer' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: FOCUS.ink }}>{it.n.title || 'משימה'}</div>
                      <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: FOCUS.orange, fontWeight: 700 }}>{String(it.n.task_time).slice(0, 5)}</span>
                        {(it.n.tags || []).map(tg => { const c = tagColor(tg); return <span key={tg} style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{tg}</span>; })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {timed.length === 0 && sessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 20px', color: FOCUS.muted }}>
            <Dumbbell size={30} color={FOCUS.orange} style={{ opacity: 0.4 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: FOCUS.ink, marginTop: 8 }}>אין אירועים ביום הזה</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>שבץ משימות מהמגש למעלה</div>
          </div>
        )}
      </div>

      {/* Time-chip menu */}
      {timeMenu && (
        <div onClick={() => setTimeMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} dir="rtl" style={{ width: '100%', maxWidth: 560, background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 20px)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>מתי? · {timeMenu.title}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[['בוקר', '08:00'], ['צהריים', '13:00'], ['ערב', '19:00']].map(([l, t]) => (
                <button key={t} onClick={() => setTime(timeMenu, t)} style={{ flex: 1, minWidth: 90, padding: '12px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#FFF3E9', color: '#B4531A', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{l} {t}</button>
              ))}
            </div>
            <input type="time" onChange={(e) => e.target.value && setTime(timeMenu, e.target.value)} style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, fontFamily: 'inherit', fontSize: 14 }} />
          </div>
        </div>
      )}

      {planOpen && <WeekPlanFlow userId={userId} nodes={nodes} byId={byId} weekDates={weekDates} onClose={() => setPlanOpen(false)} onChanged={loadNodes} />}

      {/* Add-event chooser: task or training session */}
      {addSlot && (
        <div onClick={() => setAddSlot(null)} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 20px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>אירוע חדש{addSlot.hour != null ? ` · ${pad2(addSlot.hour)}:00` : ''}</div>
              <button onClick={() => setAddSlot(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: chooserMode === 'task' ? 14 : 0 }}>
              <button onClick={() => setChooserMode('task')}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 8px', borderRadius: 14, cursor: 'pointer', border: `1.5px solid ${chooserMode === 'task' ? FOCUS.orange : FOCUS.border}`, background: chooserMode === 'task' ? '#FFF3E9' : '#fff', color: chooserMode === 'task' ? '#B4531A' : FOCUS.ink, fontFamily: 'inherit' }}>
                <ListChecks size={22} /> <span style={{ fontSize: 14, fontWeight: 800 }}>משימה</span>
              </button>
              <button onClick={openSessionForm}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 8px', borderRadius: 14, cursor: 'pointer', border: `1.5px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.session, fontFamily: 'inherit' }}>
                <Dumbbell size={22} /> <span style={{ fontSize: 14, fontWeight: 800, color: FOCUS.ink }}>אימון</span>
              </button>
            </div>
            {chooserMode === 'task' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input autoFocus value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createTaskAtSlot()}
                  placeholder="שם המשימה…" style={{ flex: 1, border: `1px solid ${FOCUS.border}`, borderRadius: 12, padding: '11px 12px', fontSize: 14, fontFamily: 'inherit', background: '#FFFDFA', outline: 'none' }} />
                <button onClick={createTaskAtSlot} disabled={!newTaskTitle.trim()} style={{ padding: '0 18px', borderRadius: 12, border: 'none', background: newTaskTitle.trim() ? FOCUS.orangeGrad : '#E6D8C6', color: '#fff', fontWeight: 800, cursor: newTaskTitle.trim() ? 'pointer' : 'default' }}>הוסף</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reused מפגשים session form (creates a trainee-visible session) */}
      <SessionFormDialog
        isOpen={sessionOpen}
        onClose={() => setSessionOpen(false)}
        onSubmit={submitSession}
        trainees={trainees}
        coachId={user?.id}
        presetDate={sessionPreset.date}
        presetTime={sessionPreset.time}
      />

      <IdeaCaptureButton hidden={!!(sheetNode || timeMenu || planOpen || addSlot || sessionOpen)} />
      {sheetNode && <NodeDetailSheet node={nodes.find(n => n.id === sheetNode.id) || sheetNode} ancestors={ancestorsOf(sheetNode, byId)} allNodes={nodes} onClose={() => setSheetNode(null)} onSaved={loadNodes} />}
    </LifeOSLayout>
  );
}

// ─── Guided week-planning flow over top-level branches ────────────
function WeekPlanFlow({ userId, nodes, byId, weekDates, onClose, onChanged }) {
  const today = isoDate();
  const { children, roots } = useMemo(() => indexNodes(nodes), [nodes]);
  const groups = useMemo(() => {
    const list = [];
    roots.forEach(r => (children[r.id] || []).forEach(c => { if (c.node_type !== 'task') list.push(c); }));
    return list;
  }, [roots, children]);

  const [step, setStep] = useState(0);
  const [quick, setQuick] = useState('');
  const [scheduledCount, setScheduledCount] = useState(0);
  const finished = step >= groups.length;
  const group = groups[step];

  const candidates = useMemo(() => {
    if (!group) return [];
    return descendantTasks(group.id, children).filter(n =>
      n.status === 'active' && !n.frequency && (!n.task_date || n.task_date < today));
  }, [group, children, today]);

  const setDay = async (n, date) => {
    try { await updateNode(n.id, { task_date: date }); setScheduledCount(c => c + 1); onChanged(); }
    catch { toast.error('שגיאה'); }
  };
  const setPriority = async (n, p) => { try { await updateNode(n.id, { priority: p }); onChanged(); } catch {} };
  const markDone = async (n) => { try { await logTask(userId, n, today); onChanged(); toast.success('הושלם'); } catch {} };
  const addQuick = async () => {
    const t = quick.trim(); if (!t || !group) return;
    setQuick('');
    try { await createNode(userId, { parent_id: group.id, node_type: 'task', title: t }); onChanged(); } catch {}
  };

  return (
    <div dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 1400, background: FOCUS.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'max(env(safe-area-inset-top),14px) 16px 12px', background: '#fff', borderBottom: `1px solid ${FOCUS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>תכנון שבוע</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={22} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, maxWidth: 560, margin: '0 auto', width: '100%' }}>
        {finished ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 44 }}>🎉</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: FOCUS.ink, marginTop: 12 }}>השבוע מתוכנן!</div>
            <div style={{ fontSize: 14, color: FOCUS.muted, marginTop: 8 }}>שיבצת {scheduledCount} משימות השבוע</div>
            <button onClick={onClose} style={{ marginTop: 24, padding: '13px 40px', borderRadius: 14, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>סיום</button>
          </div>
        ) : !group ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: FOCUS.muted }}>אין ענפים לתכנון — הוסף ענף במפה</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: FOCUS.muted, fontWeight: 700 }}>ענף {step + 1} מתוך {groups.length}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: FOCUS.ink, marginBottom: 4 }}>{group.title}</div>
            <div style={{ fontSize: 13, color: FOCUS.muted, marginBottom: 16 }}>שבץ ימים למשימות הפתוחות</div>

            {candidates.length === 0 && (
              <div style={{ fontSize: 13, color: FOCUS.muted, padding: '20px 0' }}>אין משימות פתוחות בענף הזה — אפשר להוסיף אחת למטה</div>
            )}
            {candidates.map(n => (
              <div key={n.id} style={{ ...urgencyStyle(n), borderRadius: 14, padding: 12, marginBottom: 10, boxShadow: FOCUS.neu }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: FOCUS.ink }}>{n.title || 'משימה'}</div>
                  <button onClick={() => markDone(n)} style={{ background: '#E1F5EE', color: '#085041', border: 'none', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><Check size={12} /> בוצע</button>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  {weekDates.map(d => {
                    const on = n.task_date === d;
                    return <button key={d} onClick={() => setDay(n, d)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: on ? FOCUS.orange : '#F1E7D8', color: on ? '#fff' : FOCUS.muted, fontSize: 12, fontWeight: 700 }}>{HEB_DAYS[dowOf(d)]}</button>;
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {[[0, 'רגיל'], [1, 'דחוף'], [2, 'קריטי']].map(([p, l]) => (
                    <button key={p} onClick={() => setPriority(n, p)} style={{ flex: 1, padding: '5px 0', borderRadius: 8, cursor: 'pointer', border: `1px solid ${n.priority === p ? FOCUS.orange : FOCUS.border}`, background: n.priority === p ? '#FFF3E9' : '#fff', color: n.priority === p ? '#B4531A' : FOCUS.muted, fontSize: 11, fontWeight: 700 }}>{l}</button>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuick()} placeholder="הוסף משימה לענף…" style={{ flex: 1, border: `1px dashed ${FOCUS.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', background: '#fff', outline: 'none' }} />
              <button onClick={addQuick} style={{ padding: '0 13px', borderRadius: 10, border: 'none', background: FOCUS.orange, color: '#fff', cursor: 'pointer' }}><Plus size={16} /></button>
            </div>
          </>
        )}
      </div>

      {!finished && group && (
        <div style={{ padding: '12px 16px calc(env(safe-area-inset-bottom,0px) + 14px)', background: '#fff', borderTop: `1px solid ${FOCUS.border}` }}>
          <button onClick={() => setStep(s => s + 1)} style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {step === groups.length - 1 ? 'סיום' : 'הבא'} <ChevronLeft size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
