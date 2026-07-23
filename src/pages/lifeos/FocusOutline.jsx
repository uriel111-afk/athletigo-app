import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import { ChevronDown, ChevronLeft, IndentDecrease, IndentIncrease, MoreHorizontal, Plus, AlignLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, isoDate, addDays,
  fetchNodes, fetchLogs, logSetFrom, indexNodes, ancestorsOf,
  createNode, updateNode, deleteNode, logTask, unlogTask,
  armColorMap, armColorFor, darken,
} from '@/lib/lifeos/focus-api';

const INDENT = 20;

// ── One editable outline row (edit state is LOCAL so switching rows
//    never mixes drafts). Buttons live inside the edit form so they can
//    save the current text before a structural move. ──────────────────
function InlineEdit({ node, canToggleType, onEnter, onCommit, onIndent, onOutdent, onToggleType, onOpenSheet }) {
  const [val, setVal] = useState(node.title || '');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const stay = (e) => e.preventDefault(); // keep the input focused through a button tap

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(val); } }}
        onBlur={() => onCommit(val)}
        placeholder="הקלד…"
        style={{ flex: 1, minWidth: 0, border: 'none', borderBottom: `1.5px solid ${FOCUS.orange}`, background: 'transparent', fontSize: 15, fontWeight: 600, color: FOCUS.ink, padding: '3px 2px', outline: 'none', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button onPointerDown={stay} onClick={() => onIndent(val)} title="הזח" style={eBtn}><IndentIncrease size={16} /></button>
        <button onPointerDown={stay} onClick={() => onOutdent(val)} title="הוצא" style={eBtn}><IndentDecrease size={16} /></button>
        {canToggleType && <button onPointerDown={stay} onClick={() => onToggleType(val)} title="משימה/מושג" style={eBtn}>{node.node_type === 'task' ? '●' : '☐'}</button>}
        <button onPointerDown={stay} onClick={() => onOpenSheet(val)} title="עוד" style={eBtn}><MoreHorizontal size={17} /></button>
      </div>
    </div>
  );
}

export default function FocusOutline() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [sheetNode, setSheetNode] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [n, l] = await Promise.all([
        fetchNodes(userId),
        fetchLogs(userId, addDays(today, -40), today),
      ]);
      setNodes(n); setLogs(l);
    } catch { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const { byId, children, roots } = useMemo(() => indexNodes(nodes), [nodes]);
  const armMap = useMemo(() => armColorMap(children, roots), [children, roots]);
  const logSet = useMemo(() => logSetFrom(logs), [logs]);
  const isDone = (n) => logSet.has(n.id + '|' + today) || n.status === 'done';

  // Flatten the tree DFS, hiding roots. Collapsed branches hide subtrees.
  const rows = useMemo(() => {
    const out = [];
    const walk = (n, depth) => {
      out.push({ node: n, depth });
      if (n.node_type === 'task') return;
      if (collapsed.has(n.id)) return;
      (children[n.id] || []).forEach(c => walk(c, depth + 1));
    };
    roots.forEach(r => (children[r.id] || []).forEach(c => walk(c, 0)));
    return out;
  }, [children, roots, collapsed]);

  const rootId = roots[0]?.id || null;

  // ── Persistence primitives (optimistic) ───────────────────────────
  const patchLocal = (id, patch) => setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));

  const saveTitle = async (node, value) => {
    const t = value.trim();
    if (!t || t === node.title) return;
    patchLocal(node.id, { title: t });
    try { await updateNode(node.id, { title: t }); } catch { load(); }
  };

  const removeNode = async (node) => {
    setNodes(prev => prev.filter(n => n.id !== node.id));
    try { await deleteNode(node.id); } catch { load(); }
  };

  // Persist an ordered sibling group under parentId (parent_id + sort_order).
  const persistGroup = async (parentId, ordered, extra = {}) => {
    setNodes(prev => {
      const map = new Map(prev.map(n => [n.id, n]));
      ordered.forEach((n, i) => map.set(n.id, { ...map.get(n.id), parent_id: parentId, sort_order: i, ...(n.id === extra.id ? extra.patch : {}) }));
      return [...map.values()];
    });
    try {
      await Promise.all(ordered.map((n, i) => updateNode(n.id, { parent_id: parentId, sort_order: i, ...(n.id === extra.id ? extra.patch : {}) })));
    } catch { load(); }
  };

  // ── Structural ops ────────────────────────────────────────────────
  const createSibling = async (after) => {
    const parentId = after.parent_id;
    const sibs = children[parentId] || [];
    const idx = sibs.findIndex(s => s.id === after.id);
    try {
      const created = await createNode(userId, { parent_id: parentId, node_type: 'task', title: '' });
      const ordered = [...sibs.slice(0, idx + 1), created, ...sibs.slice(idx + 1)];
      await persistGroup(parentId, ordered);
      setEditingId(created.id);
    } catch { toast.error('שגיאה'); load(); }
  };

  const addTopLevel = async () => {
    if (!rootId) { toast('הוסף ענף ראשון במפה'); return; }
    const sibs = children[rootId] || [];
    try {
      const created = await createNode(userId, { parent_id: rootId, node_type: 'branch', title: '' });
      await persistGroup(rootId, [...sibs, created]);
      setEditingId(created.id);
    } catch { toast.error('שגיאה'); load(); }
  };

  const indent = async (node, value) => {
    await saveTitle(node, value);
    const sibs = children[node.parent_id] || [];
    const idx = sibs.findIndex(s => s.id === node.id);
    if (idx <= 0) { toast('אין לאן להזיח'); return; }
    const newParent = sibs[idx - 1];
    const targetKids = (children[newParent.id] || []).filter(k => k.id !== node.id);
    setCollapsed(c => { const s = new Set(c); s.delete(newParent.id); return s; });
    // A task that gains a child becomes a concept.
    const extra = newParent.node_type === 'task' ? { id: newParent.id, patch: { node_type: 'branch' } } : {};
    await persistGroup(newParent.id, [...targetKids, node], extra);
  };

  const outdent = async (node, value) => {
    await saveTitle(node, value);
    const parent = byId[node.parent_id];
    if (!parent || !parent.parent_id) { toast('כבר ברמה העליונה'); return; }
    const grand = parent.parent_id;
    const gsibs = (children[grand] || []).filter(s => s.id !== node.id);
    const pIdx = gsibs.findIndex(s => s.id === parent.id);
    const ordered = [...gsibs.slice(0, pIdx + 1), node, ...gsibs.slice(pIdx + 1)];
    await persistGroup(grand, ordered);
  };

  const toggleType = async (node, value) => {
    await saveTitle(node, value);
    if ((children[node.id] || []).length) { toast('רק לצומת ללא ילדים'); return; }
    const next = node.node_type === 'task' ? 'branch' : 'task';
    patchLocal(node.id, { node_type: next });
    try { await updateNode(node.id, { node_type: next }); } catch { load(); }
  };

  const toggleDone = async (node) => {
    const done = isDone(node);
    if (done) {
      setLogs(prev => prev.filter(l => !(l.node_id === node.id && l.log_date === today)));
      if (!node.frequency) patchLocal(node.id, { status: 'active', done_at: null });
      try { await unlogTask(node, today); } catch { load(); }
    } else {
      setLogs(prev => [...prev, { node_id: node.id, log_date: today }]);
      if (!node.frequency) patchLocal(node.id, { status: 'done' });
      try { await logTask(userId, node, today); } catch { load(); }
    }
  };

  // Edit-form callbacks
  const onEnter = async (node, value) => { await saveTitle(node, value); setEditingId(null); await createSibling(node); };
  const onCommit = async (node, value) => { if (editingId !== node.id) return; if (!value.trim()) { setEditingId(null); await removeNode(node); } else { await saveTitle(node, value); setEditingId(null); } };
  const onOpenSheet = async (node, value) => { await saveTitle(node, value); setEditingId(null); setSheetNode(node); };

  if (!loaded) return <LifeOSLayout title="מיקוד" fullBleed hideFab><FocusChips /><PageSkeleton rows={7} /></LifeOSLayout>;

  return (
    <LifeOSLayout title="מיקוד" fullBleed hideFab>
      <FocusChips />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 12px 24px' }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: FOCUS.muted }}>
            <AlignLeft size={40} color={FOCUS.orange} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: FOCUS.ink, marginTop: 12 }}>המתאר ריק</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{rootId ? 'הוסף שורה כדי להתחיל לכתוב' : 'הוסף ענף ראשון במפה'}</div>
            {rootId && (
              <button onClick={addTopLevel} style={addBtn}><Plus size={16} /> הוסף שורה</button>
            )}
          </div>
        ) : (
          <>
            {rows.map(({ node, depth }) => {
              const arm = armColorFor(node, byId, armMap);
              const kids = children[node.id] || [];
              const hasKids = node.node_type !== 'task' && kids.length > 0;
              const isColl = collapsed.has(node.id);
              const editing = editingId === node.id;
              const done = node.node_type === 'task' && isDone(node);
              return (
                <div key={node.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 4px', paddingRight: depth * INDENT + 4, borderBottom: `1px solid ${FOCUS.border}`, minHeight: 40 }}>
                  {/* chevron (branch w/ children) */}
                  {hasKids ? (
                    <button onClick={() => setCollapsed(c => { const s = new Set(c); s.has(node.id) ? s.delete(node.id) : s.add(node.id); return s; })}
                      style={{ ...iconBtn, color: FOCUS.muted }}>
                      {isColl ? <ChevronLeft size={16} /> : <ChevronDown size={16} />}
                    </button>
                  ) : <span style={{ width: 20, flexShrink: 0 }} />}

                  {/* marker: task checkbox / branch dot */}
                  {node.node_type === 'task' ? (
                    <button onClick={() => toggleDone(node)} aria-label="סמן"
                      style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 6, cursor: 'pointer', border: `2px solid ${done ? '#16a34a' : (arm || FOCUS.orange)}`, background: done ? '#16a34a' : '#fff', color: '#fff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {done ? '✓' : ''}
                    </button>
                  ) : (
                    <span style={{ width: 11, height: 11, flexShrink: 0, borderRadius: '50%', background: arm || FOCUS.orange }} />
                  )}

                  {/* title / inline editor */}
                  {editing ? (
                    <InlineEdit
                      node={node}
                      canToggleType={kids.length === 0}
                      onEnter={(v) => onEnter(node, v)}
                      onCommit={(v) => onCommit(node, v)}
                      onIndent={(v) => indent(node, v)}
                      onOutdent={(v) => outdent(node, v)}
                      onToggleType={(v) => toggleType(node, v)}
                      onOpenSheet={(v) => onOpenSheet(node, v)}
                    />
                  ) : (
                    <span onClick={() => setEditingId(node.id)}
                      style={{ flex: 1, minWidth: 0, fontSize: 15, cursor: 'text', fontWeight: node.node_type === 'task' ? 600 : 800, color: node.node_type === 'task' ? FOCUS.ink : (arm ? darken(arm) : FOCUS.ink), textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {node.title || <span style={{ color: FOCUS.muted, fontWeight: 500 }}>ללא כותרת</span>}
                    </span>
                  )}
                </div>
              );
            })}
            <button onClick={addTopLevel} style={{ ...addBtn, width: '100%', marginTop: 12, justifyContent: 'center' }}><Plus size={16} /> הוסף שורה</button>
          </>
        )}
      </div>

      <IdeaCaptureButton hidden={!!sheetNode} onSaved={load} />
      {sheetNode && (
        <NodeDetailSheet node={nodes.find(n => n.id === sheetNode.id) || sheetNode} ancestors={ancestorsOf(sheetNode, byId)} allNodes={nodes} onClose={() => setSheetNode(null)} onSaved={load} />
      )}
    </LifeOSLayout>
  );
}

const eBtn = { width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: FOCUS.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, fontFamily: 'inherit', flexShrink: 0 };
const iconBtn = { width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 };
const addBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, padding: '10px 16px', borderRadius: 12, border: `1px dashed ${FOCUS.border}`, background: '#fff', color: FOCUS.orange, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
