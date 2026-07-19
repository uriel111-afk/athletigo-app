import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import MindMapCanvas from '@/components/lifeos/MindMapCanvas';
import { Plus, Inbox, LayoutGrid, X, Network, Archive, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, isoDate, addDays,
  fetchNodes, fetchLogs, fetchIdeas, logSetFrom, indexNodes,
  ancestorsOf, allDescendants, createNode, updateNode, logTask, unlogTask,
  clearPositions, updateIdea,
} from '@/lib/lifeos/focus-api';

export default function FocusMap() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [sheetNode, setSheetNode] = useState(null);
  const [addMenu, setAddMenu] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [n, l, i] = await Promise.all([
        fetchNodes(userId),
        fetchLogs(userId, addDays(today, -40), today),
        fetchIdeas(userId),
      ]);
      setNodes(n); setLogs(l); setIdeas(i);
      // Expand all branches by default on first load.
      setExpanded(prev => prev.size ? prev : new Set(n.filter(x => x.node_type !== 'task').map(x => x.id)));
    } catch (e) { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const { byId, children, roots } = useMemo(() => indexNodes(nodes), [nodes]);
  const logSet = useMemo(() => logSetFrom(logs), [logs]);
  const isTaskDone = useCallback((n) => logSet.has(n.id + '|' + today) || n.status === 'done', [logSet, today]);

  const tapNode = (node) => {
    setSelectedId(node.id);
    if (node.node_type !== 'task' && (children[node.id] || []).length) {
      setExpanded(prev => { const s = new Set(prev); s.has(node.id) ? s.delete(node.id) : s.add(node.id); return s; });
    }
  };

  const toggleDone = async (node) => {
    const done = isTaskDone(node);
    setSelectedId(node.id);
    if (done) {
      setLogs(p => p.filter(l => !(l.node_id === node.id && l.log_date === today)));
      if (!node.frequency) setNodes(p => p.map(x => x.id === node.id ? { ...x, status: 'active' } : x));
      try { await unlogTask(node, today); } catch { load(); }
    } else {
      setLogs(p => [...p, { node_id: node.id, log_date: today }]);
      if (!node.frequency) setNodes(p => p.map(x => x.id === node.id ? { ...x, status: 'done' } : x));
      try { await logTask(userId, node, today); } catch { load(); }
    }
  };

  const savePos = async (id, x, y) => {
    setNodes(p => p.map(n => n.id === id ? { ...n, pos_x: x, pos_y: y } : n));
    try { await updateNode(id, { pos_x: x, pos_y: y }); } catch { toast.error('שגיאה בשמירת מיקום'); }
  };

  const addChild = async (type) => {
    setAddMenu(false);
    const parentId = selectedId || (roots[0] && roots[0].id);
    if (!parentId) { toast.error('בחר צומת קודם'); return; }
    try {
      const created = await createNode(userId, { parent_id: parentId, node_type: type, title: type === 'task' ? 'משימה חדשה' : 'מושג חדש' });
      setExpanded(prev => new Set(prev).add(parentId));
      await load();
      setSelectedId(created.id);
      setSheetNode(created);
    } catch (e) { toast.error('שגיאה'); }
  };

  const autoArrange = async () => {
    const target = selectedId ? byId[selectedId] : null;
    const scope = target ? [target, ...allDescendants(target.id, children)] : nodes;
    if (!scope.length) return;
    if (!window.confirm(target ? `לסדר מחדש את "${target.title}" וכל מה שמתחתיו?` : 'לסדר מחדש את כל המפה?')) return;
    const ids = scope.map(n => n.id);
    setNodes(p => p.map(n => ids.includes(n.id) ? { ...n, pos_x: null, pos_y: null } : n));
    try { await clearPositions(ids); toast.success('סודר אוטומטית'); } catch { toast.error('שגיאה'); load(); }
  };

  const convertIdea = async (idea, parentId, type) => {
    try {
      await createNode(userId, { parent_id: parentId, node_type: type, title: idea.content });
      await updateIdea(idea.id, { status: 'converted' });
      setIdeas(p => p.filter(x => x.id !== idea.id));
      setExpanded(prev => new Set(prev).add(parentId));
      load();
      toast.success('נוסף למפה');
    } catch { toast.error('שגיאה'); }
  };
  const archiveIdea = async (idea) => {
    try { await updateIdea(idea.id, { status: 'archived' }); setIdeas(p => p.filter(x => x.id !== idea.id)); } catch {}
  };

  const branchOptions = useMemo(() => nodes.filter(n => n.node_type !== 'task'), [nodes]);

  if (!loaded) return <LifeOSLayout title="מיקוד"><FocusChips /><PageSkeleton rows={6} /></LifeOSLayout>;

  const empty = nodes.length === 0;

  return (
    <LifeOSLayout title="מיקוד">
      <FocusChips />

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '0 14px 10px', alignItems: 'center' }}>
        <button onClick={autoArrange} style={toolBtn}>
          <LayoutGrid size={15} /> סידור אוטומטי
        </button>
        <button onClick={() => setInboxOpen(true)} style={{ ...toolBtn, position: 'relative' }}>
          <Inbox size={15} /> תיבה
          {ideas.length > 0 && (
            <span style={{ position: 'absolute', top: -6, left: -6, background: FOCUS.orange, color: '#fff', borderRadius: 999, minWidth: 18, height: 18, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{ideas.length}</span>
          )}
        </button>
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative', margin: '0 14px', borderRadius: 18, overflow: 'hidden', border: `1px solid ${FOCUS.border}`, height: 'calc(100dvh - 320px)', minHeight: 380, background: FOCUS.bg }}>
        {empty ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: FOCUS.muted, padding: 24, textAlign: 'center' }}>
            <Network size={44} color={FOCUS.orange} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: FOCUS.ink, marginTop: 12 }}>המפה ריקה</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>הוסף ענף ראשון עם הכפתור ⊕</div>
          </div>
        ) : (
          <MindMapCanvas
            nodes={nodes} byId={byId} children={children} roots={roots}
            expanded={expanded} selectedId={selectedId} isTaskDone={isTaskDone}
            onTapNode={tapNode} onToggleDone={toggleDone}
            onLongPress={(n) => { setSelectedId(n.id); setSheetNode(n); }}
            onSavePos={savePos}
          />
        )}

        {/* Floating add */}
        <div style={{ position: 'absolute', left: 12, bottom: 12 }}>
          {addMenu && (
            <div style={{ position: 'absolute', bottom: 62, left: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => addChild('branch')} style={addOpt}><GitBranch size={15} /> מושג</button>
              <button onClick={() => addChild('task')} style={addOpt}><Plus size={15} /> משימה</button>
            </div>
          )}
          <button onClick={() => setAddMenu(m => !m)} aria-label="הוסף צומת"
            style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', background: FOCUS.orangeGrad, color: '#fff', boxShadow: '0 6px 16px rgba(255,111,32,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: addMenu ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }}>
            <Plus size={26} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: FOCUS.muted, textAlign: 'center', padding: '8px 14px 0' }}>
        {selectedId ? `נבחר: ${byId[selectedId]?.title || ''} · הוספה תיצור צומת מתחתיו` : 'הקש על צומת לבחירה · לחיצה ארוכה לעריכה · גרור להזזה'}
      </div>

      {/* Inbox drawer */}
      {inboxOpen && (
        <div onClick={() => setInboxOpen(false)} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Inbox size={18} color={FOCUS.orange} /> תיבת רעיונות</div>
              <button onClick={() => setInboxOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
            </div>
            {ideas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: FOCUS.muted }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: FOCUS.ink }}>התיבה ריקה</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>לכוד רעיון עם הכפתור הכתום הצף</div>
              </div>
            ) : ideas.map(idea => (
              <IdeaRow key={idea.id} idea={idea} branchOptions={branchOptions} onConvert={convertIdea} onArchive={archiveIdea} />
            ))}
          </div>
        </div>
      )}

      <IdeaCaptureButton onSaved={load} />
      {sheetNode && <NodeDetailSheet node={nodes.find(n => n.id === sheetNode.id) || sheetNode} ancestors={ancestorsOf(sheetNode, byId)} onClose={() => setSheetNode(null)} onSaved={load} />}
    </LifeOSLayout>
  );
}

function IdeaRow({ idea, branchOptions, onConvert, onArchive }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('task');
  const [parent, setParent] = useState(branchOptions[0]?.id || '');
  return (
    <div style={{ background: '#FBF6EF', borderRadius: 14, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 14, color: FOCUS.ink, fontWeight: 600 }}>{idea.content}</div>
      {!open ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={() => setOpen(true)} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: FOCUS.orange, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>להפוך לצומת</button>
          <button onClick={() => onArchive(idea)} style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Archive size={13} /> ארכיון</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[['task', 'משימה'], ['branch', 'מושג']].map(([v, l]) => (
              <button key={v} onClick={() => setType(v)} style={{ flex: 1, padding: '7px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${type === v ? FOCUS.orange : FOCUS.border}`, background: type === v ? '#FFF3E9' : '#fff', color: type === v ? '#B4531A' : FOCUS.muted, fontSize: 12, fontWeight: 700 }}>{l}</button>
            ))}
          </div>
          <select value={parent} onChange={(e) => setParent(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: 10, border: `1px solid ${FOCUS.border}`, fontFamily: 'inherit', fontSize: 13, marginBottom: 8, background: '#fff' }}>
            {branchOptions.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onConvert(idea, parent, type)} disabled={!parent} style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', background: parent ? FOCUS.orangeGrad : '#E6D8C6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: parent ? 'pointer' : 'default' }}>הוסף</button>
            <button onClick={() => setOpen(false)} style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

const toolBtn = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 12,
  border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu,
  color: FOCUS.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const addOpt = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 12,
  border: 'none', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  color: FOCUS.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};
