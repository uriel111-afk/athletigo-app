import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import { AlarmClock, Flame, Phone, CalendarClock, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, urgencyStyle, tagColor, isoDate, addDays, hebrewDateLabel,
  fetchNodes, fetchLogs, logSetFrom, harvestToday, computeStreak, todayStats,
  indexNodes, ancestorsOf, logTask,
} from '@/lib/lifeos/focus-api';

// ─── One task row with tap-to-done + long-press-to-open-sheet ─────
function TaskRow({ node, byId, onDone, onOpen, accent }) {
  const t = useRef({ x: 0, y: 0, moved: false, timer: null, long: false });
  const anc = ancestorsOf(node, byId);
  const st = urgencyStyle(node);

  const start = (e) => {
    const p = e.touches ? e.touches[0] : e;
    t.current = { x: p.clientX, y: p.clientY, moved: false, long: false, timer: null };
    t.current.timer = setTimeout(() => { t.current.long = true; onOpen(node); }, 450);
  };
  const move = (e) => {
    const p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - t.current.x) > 8 || Math.abs(p.clientY - t.current.y) > 8) {
      t.current.moved = true;
      clearTimeout(t.current.timer);
    }
  };
  const end = () => {
    clearTimeout(t.current.timer);
    if (!t.current.long && !t.current.moved) onDone(node);
  };

  return (
    <div
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={() => clearTimeout(t.current.timer)}
      style={{
        ...st, borderRadius: 14, padding: '12px 14px', marginBottom: 10,
        boxShadow: FOCUS.neu, cursor: 'pointer', userSelect: 'none',
        borderRight: accent ? `4px solid ${accent}` : st.borderRight,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}
    >
      <div style={{
        width: 24, height: 24, borderRadius: '50%', border: `2px solid ${FOCUS.orange}`,
        flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Check size={14} color={FOCUS.orange} style={{ opacity: 0.25 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: FOCUS.ink }}>{node.title || 'משימה ללא שם'}</div>
        {anc.length > 0 && (
          <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 2 }}>{anc.map(a => a.title).join(' › ')}</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: anc.length ? 6 : 4 }}>
          {node.is_fear_task && (
            <span style={{ background: '#FCEBEB', color: '#C0392B', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Flame size={11} /> אומץ
            </span>
          )}
          {(node.tags || []).map(tg => {
            const c = tagColor(tg);
            return <span key={tg} style={{ background: c.bg, color: c.fg, borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{tg}</span>;
          })}
          {node.contact_name && (
            <span style={{ background: '#E6F1FB', color: '#0C447C', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Phone size={10} /> {node.contact_name}
            </span>
          )}
          {node.due_date && (
            <span style={{ background: '#FCEBEB', color: '#C0392B', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <CalendarClock size={10} /> {node.due_date}
            </span>
          )}
          {node.task_time && (
            <span style={{ background: '#FAEEDA', color: '#633806', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
              {String(node.task_time).slice(0, 5)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Ring({ done, total }) {
  const pct = total ? done / total : 0;
  const R = 34, C = 2 * Math.PI * R;
  const perfect = total > 0 && done === total;
  return (
    <div style={{ position: 'relative', width: 84, height: 84, filter: perfect ? 'drop-shadow(0 0 10px rgba(255,111,32,0.7))' : 'none' }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={R} fill="none" stroke="#F0E4D0" strokeWidth="7" />
        <circle cx="42" cy="42" r={R} fill="none" stroke={FOCUS.orange} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 42 42)" style={{ transition: 'stroke-dashoffset .4s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: FOCUS.ink }}>{done}/{total}</div>
      </div>
    </div>
  );
}

const Section = ({ title, color, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: color || FOCUS.muted, marginBottom: 8, padding: '0 2px' }}>{title}</div>
    {children}
  </div>
);

export default function FocusToday() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [sheetNode, setSheetNode] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [n, l] = await Promise.all([
        fetchNodes(userId),
        fetchLogs(userId, addDays(today, -62), today),
      ]);
      setNodes(n); setLogs(l);
    } catch (e) { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const { byId } = useMemo(() => indexNodes(nodes), [nodes]);
  const logSet = useMemo(() => logSetFrom(logs), [logs]);
  const { overdue, rollover, main } = useMemo(() => harvestToday(nodes, logSet, today), [nodes, logSet, today]);
  const streak = useMemo(() => computeStreak(nodes, logs, today), [nodes, logs, today]);
  const stats = useMemo(() => todayStats(nodes, logSet, today), [nodes, logSet, today]);
  const perfect = stats.total > 0 && stats.done === stats.total;

  const markDone = async (node) => {
    // optimistic
    setLogs(prev => [...prev, { node_id: node.id, log_date: today }]);
    if (!node.frequency) setNodes(prev => prev.map(x => x.id === node.id ? { ...x, status: 'done', done_at: new Date().toISOString() } : x));
    try { await logTask(userId, node, today); toast.success('כל הכבוד! ✓'); }
    catch (e) { toast.error('שגיאה'); load(); }
  };

  if (!loaded) {
    return <LifeOSLayout title="מיקוד"><FocusChips /><PageSkeleton rows={5} /></LifeOSLayout>;
  }

  const nothing = overdue.length + rollover.length + main.length === 0;

  return (
    <LifeOSLayout title="מיקוד">
      <FocusChips />
      <div style={{ padding: '0 14px' }}>
        {/* Header card */}
        <div style={{
          background: perfect ? 'linear-gradient(135deg,#FFF3E9,#FFE4CF)' : FOCUS.card,
          border: `1px solid ${FOCUS.border}`, borderRadius: 18, boxShadow: FOCUS.neu,
          padding: 16, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <Ring done={stats.done} total={stats.total} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>{hebrewDateLabel(today)}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ background: '#FFF3E9', color: '#B4531A', borderRadius: 10, padding: '5px 10px', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                🔥 רצף {streak}
              </span>
              {perfect && (
                <span style={{ background: FOCUS.orange, color: '#fff', borderRadius: 10, padding: '5px 10px', fontSize: 12, fontWeight: 800 }}>יום מושלם ✨</span>
              )}
            </div>
          </div>
        </div>

        {overdue.length > 0 && (
          <Section title="עבר דדליין" color="#C0392B">
            {overdue.map(n => <TaskRow key={n.id} node={n} byId={byId} accent="#E24B4A" onDone={markDone} onOpen={setSheetNode} />)}
          </Section>
        )}

        {rollover.length > 0 && (
          <Section title="התגלגל מאתמול" color="#B4531A">
            {rollover.map(n => <TaskRow key={n.id} node={n} byId={byId} accent="#EF9F27" onDone={markDone} onOpen={setSheetNode} />)}
          </Section>
        )}

        {main.length > 0 && (
          <Section title="המשימות של היום">
            {main.map(n => <TaskRow key={n.id} node={n} byId={byId} onDone={markDone} onOpen={setSheetNode} />)}
          </Section>
        )}

        {nothing && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: FOCUS.muted }}>
            <AlarmClock size={40} color={FOCUS.orange} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: FOCUS.ink, marginTop: 12 }}>אין משימות היום עדיין</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>הוסף משימות במפה או ברשימה כדי לראות אותן כאן</div>
          </div>
        )}
      </div>

      <IdeaCaptureButton />
      {sheetNode && (
        <NodeDetailSheet
          node={nodes.find(n => n.id === sheetNode.id) || sheetNode}
          ancestors={ancestorsOf(sheetNode, byId)}
          onClose={() => setSheetNode(null)}
          onSaved={load}
        />
      )}
    </LifeOSLayout>
  );
}
