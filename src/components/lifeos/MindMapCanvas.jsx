import React, { useEffect, useMemo, useRef, useState } from 'react';
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
}) {
  const [view, setView] = useState({ tx: 20, ty: 20, scale: 1 });
  const [drag, setDrag] = useState(null);      // live node drag
  const [livePos, setLivePos] = useState({});   // id -> {x,y} during drag
  const saveTimer = useRef(null);
  const gesture = useRef(null);
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

  // Resolved position: live drag → saved coords → auto layout.
  const posOf = (n) => livePos[n.id]
    || (n.pos_x != null && n.pos_y != null ? { x: Number(n.pos_x), y: Number(n.pos_y) } : layout[n.id])
    || { x: 0, y: 0 };

  // Canvas bounds → svg height.
  const maxX = Math.max(200, ...visibleNodes.map(n => posOf(n).x + NODE_W));
  const maxY = Math.max(200, ...visibleNodes.map(n => posOf(n).y + 90));

  // ── Node pointer gesture: tap / long-press / drag ──────────────
  const nodeDown = (e, node) => {
    e.stopPropagation();
    const start = posOf(node);
    gesture.current = {
      node, sx: e.clientX, sy: e.clientY, nx: start.x, ny: start.y,
      moved: false, long: false,
      timer: setTimeout(() => { gesture.current.long = true; onLongPress(node); }, 480),
    };
  };
  const nodeMove = (e) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    g.moved = true;
    clearTimeout(g.timer);
    const nx = g.nx + dx / view.scale;
    const ny = g.ny + dy / view.scale;
    setDrag({ id: g.node.id });
    setLivePos(p => ({ ...p, [g.node.id]: { x: nx, y: ny } }));
  };
  const nodeUp = (e, node) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    clearTimeout(g.timer);
    if (g.long) return;
    if (!g.moved) {
      if (node.node_type === 'task') onToggleDone(node); else onTapNode(node);
      return;
    }
    // Persist dragged position (debounced 500ms).
    const final = livePos[node.id];
    setDrag(null);
    if (final) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { onSavePos(node.id, final.x, final.y); }, 500);
    }
  };

  // ── Canvas pan (pointer down on empty space) ───────────────────
  const panStart = (e) => {
    if (e.target.closest('[data-node]')) return;
    gesture.current = null;
    const start = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    const onMove = (ev) => setView(v => ({ ...v, tx: start.tx + (ev.clientX - start.x), ty: start.ty + (ev.clientY - start.y) }));
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const zoom = (dir) => setView(v => ({ ...v, scale: Math.min(2, Math.max(0.5, +(v.scale + dir * 0.2).toFixed(2))) }));

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

  // Ancestor chain of selected (to highlight its edges).
  const selChain = useMemo(() => {
    const s = new Set();
    let cur = selectedId ? byId[selectedId] : null, guard = 0;
    while (cur && guard++ < 50) { s.add(cur.id); cur = byId[cur.parent_id]; }
    return s;
  }, [selectedId, byId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        width="100%" height="100%"
        onPointerDown={panStart}
        onPointerMove={nodeMove}
        style={{ touchAction: 'none', background: FOCUS.bg, display: 'block' }}
      >
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {/* Edges */}
          {visibleNodes.map(p => visibleChildrenOf(p).map(c => {
            const hot = selChain.has(p.id) && selChain.has(c.id);
            return <path key={p.id + '-' + c.id} d={edgePath(p, c)} fill="none"
              stroke={hot ? FOCUS.edgeSel : FOCUS.edge} strokeWidth={hot ? 3 : 2} />;
          }))}

          {/* Nodes */}
          {visibleNodes.map(n => {
            const p = posOf(n);
            const H = heightFor(n);
            const sel = selectedId === n.id;
            return (
              <foreignObject key={n.id} x={p.x} y={p.y} width={NODE_W} height={H + 24} style={{ overflow: 'visible' }}>
                <div
                  data-node="1"
                  onPointerDown={(e) => nodeDown(e, n)}
                  onPointerUp={(e) => nodeUp(e, n)}
                  style={{
                    width: NODE_W, boxSizing: 'border-box', cursor: 'pointer', userSelect: 'none',
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
        <button onClick={() => zoom(1)} style={zoomBtn}>+</button>
        <button onClick={() => zoom(-1)} style={zoomBtn}>−</button>
      </div>
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
