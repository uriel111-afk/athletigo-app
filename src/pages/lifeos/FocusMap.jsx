import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import MindMapCanvas from '@/components/lifeos/MindMapCanvas';
import { Plus, Inbox, LayoutGrid, X, Network, Archive, GitBranch, Flame, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, isoDate, addDays, HEB_DAYS, tagColor,
  fetchNodes, fetchLogs, fetchIdeas, logSetFrom, indexNodes,
  ancestorsOf, allDescendants, createNode, updateNode, logTask, unlogTask,
  clearPositions, updateIdea, fetchLinks, createLink, deleteLink,
} from '@/lib/lifeos/focus-api';

export default function FocusMap() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const location = useLocation();
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [centerId, setCenterId] = useState(null);
  const [sheetNode, setSheetNode] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [links, setLinks] = useState([]);
  const [connectFrom, setConnectFrom] = useState(null); // two-tap connect source id
  const [disconnectNode, setDisconnectNode] = useState(null); // node whose connections are listed
  const [sheetReparent, setSheetReparent] = useState(false);  // open NodeDetailSheet with reparent picker

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [n, l, i, lk] = await Promise.all([
        fetchNodes(userId),
        fetchLogs(userId, addDays(today, -40), today),
        fetchIdeas(userId),
        fetchLinks(userId),
      ]);
      setNodes(n); setLogs(l); setIdeas(i); setLinks(lk);
      // Expand all branches by default on first load.
      setExpanded(prev => prev.size ? prev : new Set(n.filter(x => x.node_type !== 'task').map(x => x.id)));
    } catch (e) { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  // Deep-link from the Control tower: focus a specific branch.
  useEffect(() => {
    const bid = location.state?.focusBranchId;
    if (!bid) return;
    setSelectedId(bid);
    setExpanded(prev => new Set(prev).add(bid));
    setCenterId(bid);
  }, [location.state]);

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

  // Create a link (used by both handle-drag and two-tap connect).
  const createLinkBetween = async (fromId, toId) => {
    if (fromId === toId) return;
    try {
      await createLink(userId, fromId, toId);
      setLinks(await fetchLinks(userId));
      toast.success('קשר נוצר');
    } catch { toast.error('שגיאה ביצירת קשר'); }
  };

  // Two-tap connect: tap a handle → enter mode; tap a node → link (stay in
  // mode for 1-to-N); tap empty / ביטול → cancel.
  const startConnect = (id) => setConnectFrom(id);
  const connectTo = (targetId) => { if (connectFrom && targetId !== connectFrom) createLinkBetween(connectFrom, targetId); };
  const cancelConnect = () => setConnectFrom(null);

  const removeLink = async (linkId, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('להסיר את הקשר?')) return;
    try { await deleteLink(linkId); setLinks(await fetchLinks(userId)); toast.success('הקשר הוסר'); }
    catch { toast.error('שגיאה'); }
  };

  // Parent for a new node: the selected node, else the main root (or
  // null → a new top-level node when the tree is still empty).
  const addParent = selectedId ? byId[selectedId] : (roots[0] || null);

  // A node was created via the inline add panel: close it, refresh, and
  // select + center the new node so a follow-up add chains under it.
  const handleCreated = async (created) => {
    setAddOpen(false);
    // Expand the parent AND the new node so a concept's chain is visible.
    setExpanded(prev => {
      const s = new Set(prev);
      if (created.parent_id) s.add(created.parent_id);
      s.add(created.id);
      return s;
    });
    await load();
    setSelectedId(created.id);
    setCenterId(created.id);
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

  if (!loaded) return <LifeOSLayout title="מיקוד" fullBleed hideFab hideHeader><FocusChips compact /><PageSkeleton rows={6} /></LifeOSLayout>;

  const empty = nodes.length === 0;

  // Chips + map tools merged into ONE compact scrollable row.
  const tools = (
    <>
      <button onClick={autoArrange} style={compactTool}>
        <LayoutGrid size={14} /> סידור
      </button>
      <button onClick={() => setInboxOpen(true)} style={{ ...compactTool, position: 'relative' }}>
        <Inbox size={14} /> תיבה
        {ideas.length > 0 && (
          <span style={{ position: 'absolute', top: -5, left: -5, background: FOCUS.orange, color: '#fff', borderRadius: 999, minWidth: 16, height: 16, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{ideas.length}</span>
        )}
      </button>
    </>
  );

  return (
    <LifeOSLayout title="מיקוד" fullBleed hideFab hideHeader>
      <FocusChips compact trailing={tools} />

      {/* Canvas — fills all remaining space, edge to edge */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', overflow: 'hidden', background: FOCUS.bg }}>
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
            centerOnId={centerId} onCentered={() => setCenterId(null)}
            links={links} onRemoveLink={removeLink} onCreateLink={createLinkBetween}
            connectFromId={connectFrom} onHandleTap={startConnect} onConnectTap={connectTo} onConnectCancel={cancelConnect}
            onConnect={startConnect} onDisconnect={(n) => setDisconnectNode(n)} onDetails={(n) => { setSelectedId(n.id); setSheetNode(n); }}
          />
        )}

        {/* Connect-mode banner (functional, always shown while connecting) */}
        {connectFrom && (
          <div style={{ position: 'absolute', top: 8, left: 12, right: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#3A3450', color: '#fff', borderRadius: 12, padding: '9px 12px', boxShadow: '0 4px 14px rgba(0,0,0,0.25)', zIndex: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>🔗 בחר צומת לחיבור{byId[connectFrom]?.title ? ` מ"${byId[connectFrom].title}"` : ''} · ניתן לחבר לכמה</span>
            <button onClick={cancelConnect} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>סיום</button>
          </div>
        )}

        {/* Hint — overlay only, and only on a small/new map (≤5 nodes). */}
        {!connectFrom && !empty && nodes.length <= 5 && (
          <div style={{ position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: FOCUS.muted, pointerEvents: 'none' }}>
            הקש לבחירה · גרור להזזה · הקש ⊕ להוספה
          </div>
        )}

        {/* Floating add (bottom-RIGHT) → opens the full inline add panel.
            Hidden whenever any sheet/panel/capture overlay is open so it
            never covers panel content. */}
        {!(addOpen || sheetNode || inboxOpen || captureOpen || connectFrom) && (
          <button onClick={() => setAddOpen(true)} aria-label="הוסף צומת"
            style={{ position: 'absolute', right: 16, bottom: 16, width: 52, height: 52, borderRadius: '50%', border: 'none', background: FOCUS.orangeGrad, color: '#fff', boxShadow: '0 6px 16px rgba(255,111,32,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={26} />
          </button>
        )}
      </div>

      {addOpen && (
        <AddNodePanel userId={userId} parent={addParent} onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      )}

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

      {/* Disconnect sheet — all of a node's connections in one place */}
      {disconnectNode && (
        <DisconnectSheet
          node={nodes.find(n => n.id === disconnectNode.id) || disconnectNode}
          links={links} byId={byId}
          onRemoveLink={(id) => removeLink(id, true)}
          onReparent={(n) => { setDisconnectNode(null); setSelectedId(n.id); setSheetReparent(true); setSheetNode(n); }}
          onClose={() => setDisconnectNode(null)}
        />
      )}

      <IdeaCaptureButton onSaved={load} hidden={!!(sheetNode || addOpen || inboxOpen || connectFrom || disconnectNode)} onOpenChange={setCaptureOpen} />
      {sheetNode && <NodeDetailSheet node={nodes.find(n => n.id === sheetNode.id) || sheetNode} ancestors={ancestorsOf(sheetNode, byId)} allNodes={nodes} initialReparentOpen={sheetReparent} onClose={() => { setSheetNode(null); setSheetReparent(false); }} onSaved={load} />}
    </LifeOSLayout>
  );
}

// Lists every connection of a node: cross-links + its hierarchy parent.
function DisconnectSheet({ node, links, byId, onRemoveLink, onReparent, onClose }) {
  const crossLinks = links
    .filter(l => l.from_node === node.id || l.to_node === node.id)
    .map(l => {
      const otherId = l.from_node === node.id ? l.to_node : l.from_node;
      const other = byId[otherId];
      return other ? { linkId: l.id, other } : null;
    })
    .filter(Boolean);
  const parent = node.parent_id ? byId[node.parent_id] : null;
  const crumb = (n) => ancestorsOf(n, byId).map(a => a.title).join(' › ');
  const empty = crossLinks.length === 0 && !parent;

  return (
    <div onClick={onClose} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: FOCUS.ink }}>קשרים · {node.title || 'צומת'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>

        {empty && (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: FOCUS.muted }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: FOCUS.ink }}>אין קשרים לצומת הזה</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>השתמש ב"+ חבר" כדי ליצור קשר</div>
          </div>
        )}

        {parent && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: FOCUS.muted, margin: '2px 0 6px' }}>הורה במבנה</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#FBF6EF', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: FOCUS.ink }}>{parent.title}</div>
                {crumb(parent) && <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 2 }}>{crumb(parent)}</div>}
              </div>
              <button onClick={() => onReparent(node)} style={{ flexShrink: 0, background: '#EEEDFE', color: '#3C3489', border: 'none', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>העבר לענף אחר</button>
            </div>
          </>
        )}

        {crossLinks.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: FOCUS.muted, margin: '2px 0 6px' }}>קשרים ({crossLinks.length})</div>
            {crossLinks.map(({ linkId, other }) => (
              <div key={linkId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: FOCUS.ink }}>{other.title || 'צומת'}</div>
                  {crumb(other) && <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 2 }}>{crumb(other)}</div>}
                </div>
                <button onClick={() => onRemoveLink(linkId)} style={{ flexShrink: 0, background: '#FCEBEB', color: '#C0392B', border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>הסר</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
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

// Compact map tools that sit in the merged chips row (32px tall to match).
const compactTool = {
  flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '0 12px',
  borderRadius: 10, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu,
  color: FOCUS.ink, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

// ─── Full inline add panel (slide-up, NOT Radix) ──────────────────
const pInput = { width: '100%', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none', boxSizing: 'border-box' };
const pLabel = { fontSize: 11, fontWeight: 700, color: FOCUS.muted, margin: '10px 0 5px' };

// Concept templates: pre-configure fields + an optional task chain. They
// only affect CREATION — nothing new is stored beyond the resulting nodes.
const TEMPLATES = {
  general:  { label: 'כללי' },
  product:  { label: 'מוצר',   unit: 'יחידות', tag: 'מוצר',  autoExpand: true, highlightBudget: true,
              chain: ['עמוד מוצר עם תשלום', 'סרטון מוצר', 'תמחור ומשלוח', 'פרסום ראשון'] },
  service:  { label: 'שירות',  unit: 'לקוחות', tag: 'שירות',
              chain: ['הגדרת מסלול ותמחור', 'עמוד שירות', 'לקוח ניסיון ראשון'] },
  campaign: { label: 'קמפיין', unit: 'מכירות', tag: 'קמפיין', requireBudget: true,
              chain: ['הגדרת תקציב', 'תסריט הקליפ', 'צילום', 'עריכה', 'דף נחיתה', 'חיבור תשלום', 'פרסום', 'מעקב תוצאות שבועי'],
              weeklyLast: true },
};
const TEMPLATE_TAGS = new Set(['מוצר', 'שירות', 'קמפיין']);
const TEMPLATE_ORDER = ['general', 'product', 'service', 'campaign'];

function Chip({ active, color, onClick, children }) {
  const c = color || FOCUS.orange;
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '9px 4px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${active ? c : FOCUS.border}`, background: active ? c : '#fff', color: active ? '#fff' : FOCUS.muted, fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>{children}</button>
  );
}

function AddNodePanel({ userId, parent, onClose, onCreated }) {
  const [type, setType] = useState('task');
  const [title, setTitle] = useState('');
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  // task fields
  const [priority, setPriority] = useState(0);
  const [fear, setFear] = useState(false);
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [contact, setContact] = useState('');
  const [tags, setTags] = useState([]);
  const [tagText, setTagText] = useState('');
  const [freq, setFreq] = useState('once'); // once | daily | weekly
  const [dow, setDow] = useState(0);
  // branch fields
  const [metricTarget, setMetricTarget] = useState('');
  const [metricUnit, setMetricUnit] = useState('');
  const [budget, setBudget] = useState('');
  const [cycleStart, setCycleStart] = useState('');
  const [cycleEnd, setCycleEnd] = useState('');
  // template + task chain
  const [template, setTemplate] = useState('general');
  const [chain, setChain] = useState([]);       // [{title, checked, weekly}]
  const [chainOpen, setChainOpen] = useState(false);

  const addTag = () => {
    const t = tagText.trim(); if (!t) return;
    setTags(prev => [...new Set([...prev, t])]); setTagText('');
  };

  // Selecting a template pre-configures fields (all still editable).
  const applyTemplate = (key) => {
    setTemplate(key);
    const tpl = TEMPLATES[key];
    // Swap the auto-added template tag (keep any user tags).
    setTags(prev => {
      const kept = prev.filter(t => !TEMPLATE_TAGS.has(t));
      return tpl.tag ? [...new Set([...kept, tpl.tag])] : kept;
    });
    if (tpl.unit) setMetricUnit(tpl.unit);
    if (tpl.autoExpand) setMore(true);
    const c = (tpl.chain || []).map((t, i) => ({ title: t, checked: true, weekly: !!(tpl.weeklyLast && i === tpl.chain.length - 1) }));
    setChain(c);
    setChainOpen(false);
  };
  const checkedCount = chain.filter(c => c.checked).length;
  const campaignBudgetMissing = template === 'campaign' && budget === '';

  const save = async () => {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    const fields = { parent_id: parent?.id || null, node_type: type, title: t };
    if (type === 'task') {
      fields.priority = priority;
      fields.is_fear_task = fear;
      if (freq === 'daily') fields.frequency = 'daily';
      else if (freq === 'weekly') { fields.frequency = 'weekly'; fields.day_of_week = dow; }
      else if (taskDate) fields.task_date = taskDate; // one-time
      if (taskTime) fields.task_time = taskTime;
      if (dueDate) fields.due_date = dueDate;
      if (contact.trim()) fields.contact_name = contact.trim();
      if (tags.length) fields.tags = tags;
    } else {
      if (metricTarget !== '') fields.metric_target = Number(metricTarget);
      if (metricUnit.trim()) fields.metric_unit = metricUnit.trim();
      if (budget !== '') fields.budget = Number(budget);
      if (cycleStart) fields.cycle_start = cycleStart;
      if (cycleEnd) fields.cycle_end = cycleEnd;
      if (tags.length) fields.tags = tags;
    }
    try {
      const created = await createNode(userId, fields);
      // Concept templates: create the checked chain items as child tasks.
      if (type === 'branch') {
        const checked = chain.filter(c => c.checked);
        for (let i = 0; i < checked.length; i++) {
          const c = checked[i];
          const cf = { parent_id: created.id, node_type: 'task', title: c.title, sort_order: i };
          if (c.weekly) { cf.frequency = 'weekly'; cf.day_of_week = 5; }
          await createNode(userId, cf);
        }
      }
      onCreated(created);
    } catch { toast.error('שגיאה'); setSaving(false); }
  };

  return (
    <div dir="rtl" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: FOCUS.muted, fontWeight: 600 }}>{parent ? `תחת: ${parent.title}` : 'צומת ראשי חדש'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>

        {/* Row 1: type + title */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Chip active={type === 'branch'} onClick={() => setType('branch')}><GitBranch size={13} style={{ verticalAlign: 'middle', marginLeft: 3 }} />מושג</Chip>
          <Chip active={type === 'task'} onClick={() => setType('task')}><Plus size={13} style={{ verticalAlign: 'middle', marginLeft: 3 }} />משימה</Chip>
        </div>

        {/* Row 2: template (concepts only) */}
        {type === 'branch' && (
          <>
            <div style={pLabel}>תבנית</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {TEMPLATE_ORDER.map(k => (
                <Chip key={k} active={template === k} onClick={() => applyTemplate(k)}>{TEMPLATES[k].label}</Chip>
              ))}
            </div>
          </>
        )}

        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !more && save()} placeholder="כותרת" style={{ ...pInput, fontSize: 16, fontWeight: 700 }} />

        {/* Expander */}
        <button onClick={() => setMore(m => !m)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: FOCUS.orange, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '12px 2px', fontFamily: 'inherit' }}>
          <ChevronDown size={15} style={{ transform: more ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} /> עוד פרטים
        </button>

        {more && type === 'task' && (
          <div>
            <div style={pLabel}>עדיפות</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[[0, 'רגיל', FOCUS.orange], [1, 'דחוף', '#EF9F27'], [2, 'קריטי', '#E24B4A']].map(([v, l, c]) => (
                <Chip key={v} active={priority === v} color={c} onClick={() => setPriority(v)}>{l}</Chip>
              ))}
            </div>
            <button onClick={() => setFear(f => !f)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 11, margin: '10px 0', cursor: 'pointer', border: `1.5px solid ${fear ? '#E24B4A' : FOCUS.border}`, background: fear ? '#FCEBEB' : '#fff', color: fear ? '#E24B4A' : FOCUS.muted, fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
              <Flame size={15} /> {fear ? 'משימת אומץ ✓' : 'סמן כמשימת אומץ'}
            </button>

            <div style={pLabel}>תדירות</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Chip active={freq === 'once'} onClick={() => setFreq('once')}>חד פעמי</Chip>
              <Chip active={freq === 'daily'} onClick={() => setFreq('daily')}>יומי</Chip>
              <Chip active={freq === 'weekly'} onClick={() => setFreq('weekly')}>שבועי</Chip>
            </div>
            {freq === 'weekly' && (
              <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                {HEB_DAYS.map((d, i) => (
                  <button key={i} onClick={() => setDow(i)} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer', background: dow === i ? FOCUS.orange : '#F1E7D8', color: dow === i ? '#fff' : FOCUS.muted, fontSize: 13, fontWeight: 700 }}>{d}</button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {freq === 'once' && (
                <div style={{ flex: 1 }}><div style={pLabel}>תאריך</div><input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} style={pInput} /></div>
              )}
              <div style={{ flex: 1 }}><div style={pLabel}>שעה</div><input type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} style={pInput} /></div>
              <div style={{ flex: 1 }}><div style={pLabel}>דדליין</div><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={pInput} /></div>
            </div>

            <div style={pLabel}>איש קשר</div>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="שם" style={pInput} />

            <div style={pLabel}>תגיות</div>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {tags.map(tg => { const c = tagColor(tg); return <span key={tg} onClick={() => setTags(tags.filter(x => x !== tg))} style={{ background: c.bg, color: c.fg, borderRadius: 8, padding: '3px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{tg} ✕</span>; })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={tagText} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="הוסף תגית…" style={{ ...pInput, flex: 1 }} />
              <button onClick={addTag} style={{ padding: '0 14px', borderRadius: 11, border: 'none', background: FOCUS.orange, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
          </div>
        )}

        {more && type === 'branch' && (
          <div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><div style={pLabel}>מדד יעד</div><input type="number" inputMode="decimal" value={metricTarget} onChange={(e) => setMetricTarget(e.target.value)} style={pInput} /></div>
              <div style={{ flex: 1 }}><div style={pLabel}>יחידה</div><input value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} placeholder="₪ / יח׳" style={pInput} /></div>
            </div>
            <div style={pLabel}>תקציב{campaignBudgetMissing ? ' · חובה לקמפיין' : ''}</div>
            <input type="number" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="₪"
              style={{ ...pInput, ...(campaignBudgetMissing ? { border: '2px solid #FF6F20' } : TEMPLATES[template]?.highlightBudget ? { border: `1.5px solid ${FOCUS.orange}` } : {}) }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><div style={pLabel}>תחילת מחזור</div><input type="date" value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} style={pInput} /></div>
              <div style={{ flex: 1 }}><div style={pLabel}>סוף מחזור</div><input type="date" value={cycleEnd} onChange={(e) => setCycleEnd(e.target.value)} style={pInput} /></div>
            </div>

            <div style={pLabel}>תגיות</div>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {tags.map(tg => { const c = tagColor(tg); return <span key={tg} onClick={() => setTags(tags.filter(x => x !== tg))} style={{ background: c.bg, color: c.fg, borderRadius: 8, padding: '3px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{tg} ✕</span>; })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={tagText} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="הוסף תגית…" style={{ ...pInput, flex: 1 }} />
              <button onClick={addTag} style={{ padding: '0 14px', borderRadius: 11, border: 'none', background: FOCUS.orange, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
          </div>
        )}

        {/* Ready-made task chain (concept templates only) */}
        {type === 'branch' && chain.length > 0 && (
          <div style={{ marginTop: 12, border: `1px solid ${FOCUS.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <button onClick={() => setChainOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FBF6EF', border: 'none', padding: '11px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: FOCUS.ink }}>שרשרת משימות מוכנה</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: FOCUS.muted, fontWeight: 700 }}>
                {checkedCount}/{chain.length}
                <ChevronDown size={15} style={{ transform: chainOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </span>
            </button>
            {chainOpen && (
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {chain.map((c, i) => (
                  <button key={i} onClick={() => setChain(prev => prev.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: 'none', background: c.checked ? '#FFF6EE' : '#fff', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit' }}>
                    <span style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 6, border: `2px solid ${c.checked ? FOCUS.orange : FOCUS.border}`, background: c.checked ? FOCUS.orange : '#fff', color: '#fff', fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.checked ? '✓' : ''}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: FOCUS.ink }}>{c.title}{c.weekly ? ' · שבועי' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={save} disabled={!title.trim() || saving}
          style={{ width: '100%', marginTop: 16, padding: '14px', borderRadius: 14, border: 'none', background: title.trim() ? FOCUS.orangeGrad : '#E6D8C6', color: '#fff', fontSize: 15, fontWeight: 800, cursor: title.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          {saving ? 'שומר…' : 'צור צומת'}
        </button>
      </div>
    </div>
  );
}
