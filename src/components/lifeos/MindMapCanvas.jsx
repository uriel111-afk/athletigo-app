import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Unlink } from 'lucide-react';
import { FOCUS, urgencyStyle, descendantTasks, allDescendants } from '@/lib/lifeos/focus-api';

// ── Geometry ──────────────────────────────────────────────────────
const NODE_W = 138;
const HGAP = 22;
const VGAP = 104;
const heightFor = (n) => (n.node_type === 'root' ? 48 : n.node_type === 'branch' ? 74 : 54);

// Tidy-tree auto layout over the VISIBLE tree. Returns layout coords
// (top-left of each node) in map space.
function computeLayout(roots, visibleChildrenOf) {
  const layout = {};
  let cursor = 0;
  const place = (node, depth) => {
    const kids = visibleChildrenOf(node);
    const y = depth * VGAP;
    if (!kids.length) {
      layout[node.id] = { x: cursor * (NODE_W + HGAP), y };
      cursor++;
    } else {
      kids.forEach(k => place(k, depth + 1));
      const xs = kids.map(k => layout[k.id].x);
      layout[node.id] = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y };
    }
  };
  roots.forEach(r => place(r, 0));
  return layout;
}

export default function MindMapCanvas({
  nodes, byId, children, roots, expanded, selectedId,
  isTaskDone, onTapNode, onToggleDone, onLongPress, onSavePos, centerOnId,
  links = [], onRemoveLink, linkMode = false, onPickLinkTarget,
}) {
  const [view, setView] = useState({ tx: 20, ty: 20, scale: 1 });
  const [drag, setDrag] = useState(null);      // live node drag
  const [livePos, setLivePos] = useState({});   // id -> {x,y} during drag
  const [selLink, setSelLink] = useState(null); // selected cross-link id
  const saveTimer = useRef(null);
  const gesture = useRef(null);   // single-finger node gesture (tap/drag/long-press)
  const pan = useRef(null);       // single-finger canvas pan
  const pinch = useRef(null);     // two-finger pinch-zoom
  const pointers = useRef(new Map()); // active pointerId -> {x,y}
  const svgRef = useRef(null);

  const visibleChildrenOf = (node) => {
    if (node.node_type === 'task') return [];
    const isExpanded = node.node_type === 'root' || expanded.has(node.id);
    return isExpanded ? (children[node.id] || []) : [];
  };

  // Which nodes are visible at all (walk from roots through expanded).
  const visibleNodes = useMemo(() => {
    const out = [];
    const walk = (n) => { out.push(n); visibleChildrenOf(n).forEach(walk); };
    roots.forEach(walk);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, expanded, children, roots]);

  const layout = useMemo(() => computeLayout(roots, visibleChildrenOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, expanded, children, roots]);

  // Resolve a node to its nearest VISIBLE ancestor (links into a
  // collapsed subtree attach to the collapsed ancestor that's shown).
  const visibleIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);
  const visibleAncestor = (id) => {
    let cur = byId[id], guard = 0;
    while (cur && guard++ < 100) { if (visibleIds.has(cur.id)) return cur; cur = byId[cur.parent_id]; }
    return null;
  };
  const resolvedLinks = useMemo(() => links.map(lk => {
    const a = visibleAncestor(lk.from_node), b = visibleAncestor(lk.to_node);
    if (!a || !b || a.id === b.id) return null;
    return { id: lk.id, a, b };
  }).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [links, visibleIds, byId]);

  // Resolved position: live drag → saved coords → auto layout.
  const posOf = (n) => livePos[n.id]
    || (n.pos_x != null && n.pos_y != null ? { x: Number(n.pos_x), y: Number(n.pos_y) } : layout[n.id])
    || { x: 0, y: 0 };

  // Canvas bounds → svg height.
  const maxX = Math.max(200, ...visibleNodes.map(n => posOf(n).x + NODE_W));
  const maxY = Math.max(200, ...visibleNodes.map(n => posOf(n).y + 90));

  const clampScale = (s) => Math.min(2, Math.max(0.5, s));
  const findNode = (target) => {
    const el = target?.closest?.('[data-node-id]');
    return el ? byId[el.getAttribute('data-node-id')] : null;
  };
  const beginPinch = () => {
    // Two fingers → cancel any single-finger gesture and start pinching.
    if (gesture.current) clearTimeout(gesture.current.timer);
    gesture.current = null;
    pan.current = null;
    setDrag(null);
    const pts = [...pointers.current.values()];
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || pts.length < 2) return;
    const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
    const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
    pinch.current = {
      startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      startScale: view.scale, startTx: view.tx, startTy: view.ty, midX, midY,
    };
  };

  // ── Unified pointer handling: tap / long-press / drag / pan / pinch ──
  const onDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }

    if (pointers.current.size === 2) { beginPinch(); return; }
    if (pointers.current.size > 2) return;

    // Single pointer: node gesture → link tap → canvas pan.
    const node = findNode(e.target);
    if (node) {
      const start = posOf(node);
      gesture.current = {
        node, sx: e.clientX, sy: e.clientY, nx: start.x, ny: start.y, moved: false, long: false,
        timer: setTimeout(() => { if (gesture.current) { gesture.current.long = true; onLongPress(node); } }, 480),
      };
      return;
    }
    const linkEl = e.target?.closest?.('[data-link-id]');
    if (linkEl) {
      gesture.current = { linkId: linkEl.getAttribute('data-link-id'), sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
    setSelLink(null); // tapping empty canvas deselects any link
    pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  };

  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Pinch takes priority whenever two fingers are down.
    if (pinch.current && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const newScale = clampScale(pinch.current.startScale * (dist / pinch.current.startDist));
      // Keep the world point under the finger-midpoint fixed while scaling.
      const worldX = (pinch.current.midX - pinch.current.startTx) / pinch.current.startScale;
      const worldY = (pinch.current.midY - pinch.current.startTy) / pinch.current.startScale;
      setView(v => ({ ...v, scale: newScale, tx: pinch.current.midX - worldX * newScale, ty: pinch.current.midY - worldY * newScale }));
      return;
    }

    const g = gesture.current;
    if (g && g.linkId) {
      // Movement past the threshold cancels the link tap.
      if (Math.abs(e.clientX - g.sx) > 8 || Math.abs(e.clientY - g.sy) > 8) g.moved = true;
      return;
    }
    if (g) {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // 8px threshold
      g.moved = true;
      clearTimeout(g.timer);
      setDrag({ id: g.node.id });
      setLivePos(p => ({ ...p, [g.node.id]: { x: g.nx + dx / view.scale, y: g.ny + dy / view.scale } }));
      return;
    }

    if (pan.current) {
      const p = pan.current;
      setView(v => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
    }
  };

  const onUp = (e) => {
    const wasPinch = !!pinch.current;
    pointers.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }

    if (wasPinch) {
      // Leaving pinch: drop to 0/1 finger cleanly (rebaseline pan, no jump).
      if (pointers.current.size < 2) pinch.current = null;
      pan.current = pointers.current.size === 1
        ? (() => { const [pt] = [...pointers.current.values()]; return { x: pt.x, y: pt.y, tx: view.tx, ty: view.ty }; })()
        : null;
      return;
    }

    const g = gesture.current;
    gesture.current = null;
    if (g && g.linkId) {
      if (!g.moved) setSelLink(g.linkId); // tap a dashed edge → select it
      if (pointers.current.size === 0) pan.current = null;
      return;
    }
    if (g) {
      clearTimeout(g.timer);
      if (!g.long) {
        if (!g.moved) {
          if (linkMode) { onPickLinkTarget && onPickLinkTarget(g.node); }
          else if (g.node.node_type === 'task') onToggleDone(g.node); else onTapNode(g.node);
        } else {
          const final = livePos[g.node.id];
          setDrag(null);
          if (final) { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => onSavePos(g.node.id, final.x, final.y), 500); }
        }
      }
    }
    if (pointers.current.size === 0) pan.current = null;
  };

  const onCancel = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) { pan.current = null; if (gesture.current) { clearTimeout(gesture.current.timer); gesture.current = null; } }
  };

  const zoom = (dir) => setView(v => ({ ...v, scale: clampScale(+(v.scale + dir * 0.2).toFixed(2)) }));

  useEffect(() => () => { clearTimeout(saveTimer.current); }, []);

  // Center the view on a requested node (e.g. arriving from the Control
  // tower "tap a branch"). Runs once positions are available.
  useEffect(() => {
    if (!centerOnId) return;
    const n = byId[centerOnId];
    const rect = svgRef.current?.getBoundingClientRect();
    if (!n || !rect) return;
    const p = posOf(n);
    setView(v => ({
      ...v,
      tx: rect.width / 2 - (p.x + NODE_W / 2) * v.scale,
      ty: Math.max(16, rect.height * 0.26 - p.y * v.scale),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOnId, nodes]);

  // Path from parent to a visible child (bottom-center → top-center).
  const edgePath = (p, c) => {
    const pp = posOf(p), cp = posOf(c);
    const x1 = pp.x + NODE_W / 2, y1 = pp.y + heightFor(p);
    const x2 = cp.x + NODE_W / 2, y2 = cp.y;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  };

  // Cross-link path: center-to-center bezier (distinct from hierarchy).
  const linkPath = (a, b) => {
    const pa = posOf(a), pb = posOf(b);
    const x1 = pa.x + NODE_W / 2, y1 = pa.y + heightFor(a) / 2;
    const x2 = pb.x + NODE_W / 2, y2 = pb.y + heightFor(b) / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };
  const linkMid = (a, b) => {
    const pa = posOf(a), pb = posOf(b);
    return { x: (pa.x + pb.x) / 2 + NODE_W / 2, y: (pa.y + heightFor(a) / 2 + pb.y + heightFor(b) / 2) / 2 };
  };
  const selLinkObj = resolvedLinks.find(l => l.id === selLink) || null;

  // Ancestor chain of selected (to highlight its edges).
  const selChain = useMemo(() => {
    const s = new Set();
    let cur = selectedId ? byId[selectedId] : null, guard = 0;
    while (cur && guard++ < 50) { s.add(cur.id); cur = byId[cur.parent_id]; }
    return s;
  }, [selectedId, byId]);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none', overscrollBehavior: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      <svg
        ref={svgRef}
        width="100%" height="100%"
        style={{ touchAction: 'none', background: FOCUS.bg, display: 'block' }}
      >
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {/* Hierarchy edges (solid) */}
          {visibleNodes.map(p => visibleChildrenOf(p).map(c => {
            const hot = selChain.has(p.id) && selChain.has(c.id);
            return <path key={p.id + '-' + c.id} d={edgePath(p, c)} fill="none"
              stroke={hot ? FOCUS.edgeSel : FOCUS.edge} strokeWidth={hot ? 3 : 2} />;
          }))}

          {/* Cross-links (dashed) — visual references only */}
          {resolvedLinks.map(l => {
            const d = linkPath(l.a, l.b);
            const on = selLink === l.id;
            return (
              <g key={l.id}>
                <path d={d} fill="none" stroke={on ? FOCUS.edgeSel : '#B4B2A9'} strokeWidth={on ? 2.5 : 1.5} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />
                {/* fat transparent hit-area for tapping */}
                <path data-link-id={l.id} d={d} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
              </g>
            );
          })}

          {/* Nodes */}
          {visibleNodes.map(n => {
            const p = posOf(n);
            const H = heightFor(n);
            const sel = selectedId === n.id;
            return (
              <foreignObject key={n.id} x={p.x} y={p.y} width={NODE_W} height={H + 24} style={{ overflow: 'visible' }}>
                <div
                  data-node-id={n.id}
                  style={{
                    width: NODE_W, boxSizing: 'border-box', cursor: 'pointer', userSelect: 'none',
                    touchAction: 'none',
                    outline: sel ? `2px solid ${FOCUS.edgeSel}` : 'none', borderRadius: 14,
                    fontFamily: "'Rubik', system-ui, sans-serif",
                  }}
                >
                  <NodeCard node={n} children={children} expanded={expanded} isTaskDone={isTaskDone} sel={sel} />
                </div>
              </foreignObject>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(1)} style={zoomBtn}>+</button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(-1)} style={zoomBtn}>−</button>
      </div>

      {/* Remove-link chip at the selected link's midpoint */}
      {selLinkObj && (() => {
        const m = linkMid(selLinkObj.a, selLinkObj.b);
        const sx = view.tx + m.x * view.scale, sy = view.ty + m.y * view.scale;
        return (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { onRemoveLink && onRemoveLink(selLink); setSelLink(null); }}
            style={{ position: 'absolute', left: sx, top: sy, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 5, background: '#fff', border: `1.5px solid ${FOCUS.edgeSel}`, color: FOCUS.edgeSel, borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', fontFamily: "'Rubik', system-ui, sans-serif", whiteSpace: 'nowrap' }}
          >
            <Unlink size={14} /> הסר קשר
          </button>
        );
      })()}
    </div>
  );
}

const zoomBtn = {
  width: 36, height: 36, borderRadius: 10, border: `1px solid ${FOCUS.border}`,
  background: '#fff', boxShadow: FOCUS.neu, fontSize: 20, fontWeight: 700,
  color: FOCUS.ink, cursor: 'pointer', lineHeight: 1,
};

function NodeCard({ node, children, expanded, isTaskDone, sel }) {
  if (node.node_type === 'root') {
    return (
      <div style={{ background: FOCUS.orange, color: '#fff', borderRadius: 999, padding: '12px 10px', textAlign: 'center', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 12px rgba(255,111,32,0.4)' }}>
        {node.title || 'שורש'}
      </div>
    );
  }

  if (node.node_type === 'task') {
    const done = isTaskDone(node);
    const st = urgencyStyle(node);
    return (
      <div style={{ ...st, borderRadius: 12, padding: '9px 10px', boxShadow: FOCUS.neu, opacity: done ? 0.6 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 15, height: 15, borderRadius: 5, flexShrink: 0, border: `2px solid ${done ? '#16a34a' : FOCUS.orange}`, background: done ? '#16a34a' : 'transparent', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : ''}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: FOCUS.ink, textDecoration: done ? 'line-through' : 'none' }}>{node.title || 'משימה'}</span>
        </div>
        {node.is_fear_task && <div style={{ fontSize: 9, color: '#C0392B', fontWeight: 800, marginTop: 3 }}>🔥 אומץ</div>}
      </div>
    );
  }

  // branch
  const kids = children[node.id] || [];
  const isExpanded = expanded.has(node.id);
  const tasks = descendantTasks(node.id, children);
  const doneCount = tasks.filter(isTaskDone).length;
  const hasMetric = node.metric_target != null && node.metric_target !== '';
  const taskPct = tasks.length ? doneCount / tasks.length : 0;
  const metricPct = hasMetric && Number(node.metric_target) > 0 ? Math.min(1, Number(node.metric_current || 0) / Number(node.metric_target)) : 0;

  if (!isExpanded && kids.length > 0) {
    const desc = allDescendants(node.id, children);
    const branches = desc.filter(d => d.node_type !== 'task').length;
    return (
      <div style={{ background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 14, padding: '10px', textAlign: 'center', boxShadow: FOCUS.neu }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: FOCUS.ink }}>{node.title}</div>
        <div style={{ fontSize: 10, color: FOCUS.muted, marginTop: 3 }}>{branches} מושגים · {tasks.length} משימות</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 14, padding: '10px', boxShadow: FOCUS.neu }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: FOCUS.ink, textAlign: 'center' }}>{node.title}</div>
      {tasks.length > 0 ? (
        <>
          <div style={{ height: 4, borderRadius: 3, background: '#F1E7D8', marginTop: 7, overflow: 'hidden' }}>
            <div style={{ width: `${taskPct * 100}%`, height: '100%', background: FOCUS.orange }} />
          </div>
          {hasMetric && (
            <div style={{ height: 4, borderRadius: 3, background: '#F1E7D8', marginTop: 4, overflow: 'hidden' }}>
              <div style={{ width: `${metricPct * 100}%`, height: '100%', background: '#16a34a' }} />
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 9.5, color: FOCUS.muted, textAlign: 'center', marginTop: 5 }}>ריק — הוסף משימה</div>
      )}
    </div>
  );
}
