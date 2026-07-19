import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import { ChevronDown, ChevronLeft, Flame, Phone, CalendarClock, MessageSquare, Plus, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, urgencyStyle, tagColor, isoDate, addDays,
  fetchNodes, fetchLogs, fetchNoteNodeIds, logSetFrom, indexNodes,
  ancestorsOf, descendantTasks, logTask, unlogTask, createNode,
} from '@/lib/lifeos/focus-api';

const FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'open', label: 'פתוחות' },
  { key: 'fear', label: 'אומץ' },
  { key: 'late', label: 'באיחור' },
  { key: 'done', label: 'הושלמו' },
];

export default function FocusList() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [noteIds, setNoteIds] = useState(new Set());
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [quick, setQuick] = useState({});
  const [sheetNode, setSheetNode] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [n, l, ids] = await Promise.all([
        fetchNodes(userId),
        fetchLogs(userId, addDays(today, -40), today),
        fetchNoteNodeIds(userId),
      ]);
      setNodes(n); setLogs(l); setNoteIds(ids);
    } catch (e) { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const { byId, children, roots } = useMemo(() => indexNodes(nodes), [nodes]);
  const logSet = useMemo(() => logSetFrom(logs), [logs]);

  // Top-level branches = direct children of any root.
  const groups = useMemo(() => {
    const list = [];
    roots.forEach(r => (children[r.id] || []).forEach(c => { if (c.node_type !== 'task') list.push(c); }));
    return list;
  }, [roots, children]);

  const allTags = useMemo(() => {
    const s = new Set();
    nodes.forEach(n => (n.tags || []).forEach(t => s.add(t)));
    return [...s];
  }, [nodes]);

  const isDone = (n) => logSet.has(n.id + '|' + today) || n.status === 'done';
  const isLate = (n) => (n.due_date && n.due_date < today) || (!n.frequency && n.task_date && n.task_date < today && !isDone(n));

  const passesFilter = (n) => {
    if (tagFilter && !(n.tags || []).includes(tagFilter)) return false;
    switch (filter) {
      case 'open': return !isDone(n) && n.status !== 'parked';
      case 'fear': return n.is_fear_task;
      case 'late': return isLate(n);
      case 'done': return isDone(n);
      default: return n.status !== 'parked';
    }
  };

  const toggle = async (n) => {
    const done = isDone(n);
    if (done) {
      setLogs(prev => prev.filter(l => !(l.node_id === n.id && l.log_date === today)));
      if (!n.frequency) setNodes(prev => prev.map(x => x.id === n.id ? { ...x, status: 'active', done_at: null } : x));
      try { await unlogTask(n, today); } catch { load(); }
    } else {
      setLogs(prev => [...prev, { node_id: n.id, log_date: today }]);
      if (!n.frequency) setNodes(prev => prev.map(x => x.id === n.id ? { ...x, status: 'done' } : x));
      try { await logTask(userId, n, today); } catch { load(); }
    }
  };

  const addQuick = async (groupId) => {
    const title = (quick[groupId] || '').trim();
    if (!title) return;
    setQuick(q => ({ ...q, [groupId]: '' }));
    try { await createNode(userId, { parent_id: groupId, node_type: 'task', title }); load(); }
    catch (e) { toast.error('שגיאה'); }
  };

  if (!loaded) return <LifeOSLayout title="מיקוד"><FocusChips /><PageSkeleton rows={5} /></LifeOSLayout>;

  return (
    <LifeOSLayout title="מיקוד" fullBleed>
      <FocusChips />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 14px 24px' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 10 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                border: `1px solid ${filter === f.key ? FOCUS.orange : FOCUS.border}`,
                background: filter === f.key ? FOCUS.orange : '#fff',
                color: filter === f.key ? '#fff' : FOCUS.muted, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              }}>{f.label}</button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12 }}>
            {allTags.map(t => {
              const c = tagColor(t);
              const on = tagFilter === t;
              return (
                <button key={t} onClick={() => setTagFilter(on ? null : t)}
                  style={{ flexShrink: 0, background: c.bg, color: c.fg, border: on ? `2px solid ${c.fg}` : '1px solid transparent', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t}
                </button>
              );
            })}
          </div>
        )}

        {groups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: FOCUS.muted }}>
            <ListChecks size={40} color={FOCUS.orange} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: FOCUS.ink, marginTop: 12 }}>אין ענפים עדיין</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>עבור למפה כדי להוסיף ענף ראשון</div>
          </div>
        )}

        {groups.map(g => {
          const subTasks = descendantTasks(g.id, children);
          const shown = subTasks.filter(passesFilter);
          const doneCount = subTasks.filter(isDone).length;
          const isOpen = !collapsed[g.id];
          const hasMetric = g.metric_target != null && g.metric_target !== '';
          const taskPct = subTasks.length ? doneCount / subTasks.length : 0;
          const metricPct = hasMetric && Number(g.metric_target) > 0 ? Math.min(1, Number(g.metric_current || 0) / Number(g.metric_target)) : 0;

          return (
            <div key={g.id} style={{ marginBottom: 16 }}>
              {/* Group header */}
              <div onClick={() => setCollapsed(c => ({ ...c, [g.id]: isOpen }))}
                style={{ background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isOpen ? <ChevronDown size={18} color={FOCUS.muted} /> : <ChevronLeft size={18} color={FOCUS.muted} />}
                    <span style={{ fontSize: 16, fontWeight: 800, color: FOCUS.ink }}>{g.title}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: FOCUS.muted }}>
                    {subTasks.length ? `${doneCount}/${subTasks.length}` : 'ריק'}
                  </span>
                </div>
                {hasMetric && (
                  <div style={{ fontSize: 12, color: '#085041', fontWeight: 700, marginTop: 8 }}>
                    {Number(g.metric_current || 0)} מתוך {Number(g.metric_target)} {g.metric_unit || ''}
                  </div>
                )}
                {subTasks.length > 0 && (
                  <div style={{ height: 5, borderRadius: 4, background: '#F1E7D8', marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${taskPct * 100}%`, height: '100%', background: FOCUS.orange, borderRadius: 4 }} />
                  </div>
                )}
                {hasMetric && (
                  <div style={{ height: 5, borderRadius: 4, background: '#F1E7D8', marginTop: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${metricPct * 100}%`, height: '100%', background: '#16a34a', borderRadius: 4 }} />
                  </div>
                )}
              </div>

              {isOpen && (
                <div style={{ marginTop: 8 }}>
                  {shown.length === 0 && subTasks.length === 0 && (
                    <div style={{ fontSize: 12, color: FOCUS.muted, padding: '6px 4px 10px' }}>אין משימות בענף — הוסף אחת למטה</div>
                  )}
                  {shown.map(n => {
                    const st = urgencyStyle(n);
                    const done = isDone(n);
                    const anc = ancestorsOf(n, byId);
                    return (
                      <div key={n.id} style={{ ...st, borderRadius: 12, padding: '10px 12px', marginBottom: 8, boxShadow: FOCUS.neu, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <button onClick={() => toggle(n)} aria-label="סמן" style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 2, cursor: 'pointer',
                          border: `2px solid ${done ? '#16a34a' : FOCUS.orange}`, background: done ? '#16a34a' : '#fff',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900,
                        }}>{done ? '✓' : ''}</button>
                        <div style={{ flex: 1, minWidth: 0 }} onClick={() => setSheetNode(n)}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: FOCUS.ink, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1 }}>
                            {n.title || 'משימה'}
                          </div>
                          {anc.length > 1 && <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 2 }}>{anc.slice(1).map(a => a.title).join(' › ')}</div>}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                            {n.is_fear_task && <span style={{ background: '#FCEBEB', color: '#C0392B', borderRadius: 7, padding: '2px 7px', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 2 }}><Flame size={10} /> אומץ</span>}
                            {(n.tags || []).map(tg => { const c = tagColor(tg); return <span key={tg} style={{ background: c.bg, color: c.fg, borderRadius: 7, padding: '2px 7px', fontSize: 10, fontWeight: 700 }}>{tg}</span>; })}
                            {n.contact_name && <span style={{ background: '#E6F1FB', color: '#0C447C', borderRadius: 7, padding: '2px 7px', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}><Phone size={9} />{n.contact_name}</span>}
                            {n.due_date && <span style={{ background: '#FCEBEB', color: '#C0392B', borderRadius: 7, padding: '2px 7px', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}><CalendarClock size={9} />{n.due_date}</span>}
                            {noteIds.has(n.id) && <MessageSquare size={13} color={FOCUS.muted} style={{ marginTop: 1 }} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Quick add */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input value={quick[g.id] || ''} onChange={(e) => setQuick(q => ({ ...q, [g.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addQuick(g.id)}
                      placeholder="הוסף משימה מהירה…"
                      style={{ flex: 1, border: `1px dashed ${FOCUS.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', background: '#FFFDFA', outline: 'none', color: FOCUS.ink }} />
                    <button onClick={() => addQuick(g.id)} style={{ padding: '0 13px', borderRadius: 10, border: 'none', background: FOCUS.orange, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Plus size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <IdeaCaptureButton hidden={!!sheetNode} />
      {sheetNode && (
        <NodeDetailSheet node={nodes.find(n => n.id === sheetNode.id) || sheetNode} ancestors={ancestorsOf(sheetNode, byId)} onClose={() => setSheetNode(null)} onSaved={load} />
      )}
    </LifeOSLayout>
  );
}
