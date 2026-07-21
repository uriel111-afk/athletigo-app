import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Unlink } from 'lucide-react';
import { FOCUS, urgencyStyle, descendantTasks, allDescendants } from '@/lib/lifeos/focus-api';

// ── Geometry ──────────────────────────────────────────────────────
const NODE_W = 138;
const HGAP = 22;
const VGAP = 104;
const HIT_PAD = 8;                 // invisible hit padding around each node
const heightFor = (n) => (n.node_type === 'root' ? 48 : n.node_type === 'branch' ? 74 : 54);
const trStr = (v) => `translate(${v.tx},${v.ty}) scale(${v.scale})`;

// One visual language:
const HIER_EDGE = '#E8D5BC';       // solid = מבנה (hierarchy)
const LINK_EDGE = '#9A93B8';       // dashed purple-gray = קשר (cross-link)
const LIVE_EDGE = FOCUS.edgeSel;   // dashed red = חיבור בתהליך (only live wire)

// n8n-style edge: exit source bottom, enter target top.
const curve = (x1, y1, x2, y2) => {
  const dy = Math.max(24, Math.abs(y2 - y1) * 0.5);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
};

function computeLayout(roots, visibleChildrenOf) {
  const layout = {};
  let cursor = 0;
  const place = (node, depth) => {
    const kids = visibleChildrenOf(node);
    const y = depth * VGAP;
    if (!kids.length) { layout[node.id] = { x: cursor * (NODE_W + HGAP), y }; cursor++; }
    else {
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
  isTaskDone, onTapNode, onToggleDone, onLongPress, onSavePos, centerOnId, onCentered,
  links = [], onRemoveLink, onCreateLink,
  connectFromId = null, onHandleTap, onConnectTap, onConnectCancel,
}) {
  const [view, setView] = useState({ tx: 20, ty: 20, scale: 1 });
  const [livePos, setLivePos] = useState({});
  const [selLink, setSelLink] = useState(null);

  const viewRef = useRef({ tx: 20, ty: 20, scale: 1 });
  const gRef = useRef(null);
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const connectRef = useRef(null);
  const saveTimer = useRef(null);
  const gesture = useRef(null);
  const pan = useRef(null);
  const pinch = useRef(null);
  const connect = useRef(null);
  const pointers = useRef(new Map());
  const winAttached = useRef(false);
  const viewRaf = useRef(0);
  const dragRaf = useRef(0);
  const dragPending = useRef(null);
  const connectRaf = useRef(0);
  const connectPending = useRef(null);
  const centeredRef = useRef(null);

  // Latest dynamic props for the window-level handlers (which capture an
  // old closure) — always read through this ref so nothing goes stale.
  const ctx = useRef({});
  ctx.current = { connectFromId, byId, onCreateLink, onHandleTap, onConnectTap, onConnectCancel, onTapNode, onToggleDone, onSavePos };

  const commitView = useCallback((v) => { viewRef.current = v; setView(v); }, []);

  const visibleChildrenOf = (node) => {
    if (node.node_type === 'task') return [];
    const isExpanded = node.node_type === 'root' || expanded.has(node.id);
    return isExpanded ? (children[node.id] || []) : [];
  };
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

  const posOf = (n) => livePos[n.id]
    || (n.pos_x != null && n.pos_y != null ? { x: Number(n.pos_x), y: Number(n.pos_y) } : layout[n.id])
    || { x: 0, y: 0 };

  const clampScale = (s) => Math.min(2, Math.max(0.5, s));
  const nodeAt = (el) => { const e = el?.closest?.('[data-node-id]'); return e ? ctx.current.byId[e.getAttribute('data-node-id')] : null; };
  const toCanvas = (cx, cy) => {
    const rect = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - rect.left - v.tx) / v.scale, y: (cy - rect.top - v.ty) / v.scale };
  };

  // ── Stable window-level move/up/cancel (attached for a gesture) ──
  const onMove = useCallback((e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else if (pinch.current) return; // stray pointer during pinch

    if (pinch.current && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const pc = pinch.current;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const s = clampScale(pc.startScale * (dist / pc.startDist));
      const wx = (pc.midX - pc.startTx) / pc.startScale, wy = (pc.midY - pc.startTy) / pc.startScale;
      viewRef.current = { scale: s, tx: pc.midX - wx * s, ty: pc.midY - wy * s };
      if (!viewRaf.current) viewRaf.current = requestAnimationFrame(() => { viewRaf.current = 0; if (gRef.current) gRef.current.setAttribute('transform', trStr(viewRef.current)); });
      return;
    }

    if (connect.current) {
      const c = connect.current;
      if (!c.moved && Math.abs(e.clientX - c.sx) < 8 && Math.abs(e.clientY - c.sy) < 8) return;
      c.moved = true;
      const pt = toCanvas(e.clientX, e.clientY);
      connectPending.current = curve(c.x1, c.y1, pt.x, pt.y);
      if (!connectRaf.current) connectRaf.current = requestAnimationFrame(() => { connectRaf.current = 0; if (connectRef.current && connectPending.current != null) connectRef.current.setAttribute('d', connectPending.current); });
      return;
    }

    const g = gesture.current;
    if (g && g.linkId) { if (Math.abs(e.clientX - g.sx) > 8 || Math.abs(e.clientY - g.sy) > 8) g.moved = true; return; }
    if (g) {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (!g.moved) { g.moved = true; clearTimeout(g.timer); } // kill long-press FIRST
      g.lastX = g.nx + dx / viewRef.current.scale;
      g.lastY = g.ny + dy / viewRef.current.scale;
      dragPending.current = { id: g.node.id, x: g.lastX, y: g.lastY };
      if (!dragRaf.current) dragRaf.current = requestAnimationFrame(() => { dragRaf.current = 0; const d = dragPending.current; if (d) setLivePos(p => ({ ...p, [d.id]: { x: d.x, y: d.y } })); });
      return;
    }

    if (pan.current) {
      const p = pan.current; p.moved = p.moved || Math.abs(e.clientX - p.x) > 6 || Math.abs(e.clientY - p.y) > 6;
      viewRef.current = { scale: viewRef.current.scale, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) };
      if (!viewRaf.current) viewRaf.current = requestAnimationFrame(() => { viewRaf.current = 0; if (gRef.current) gRef.current.setAttribute('transform', trStr(viewRef.current)); });
    }
  }, []);

  const detachWindow = useCallback(() => {
    if (!winAttached.current) return;
    winAttached.current = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }, [onMove]); // eslint-disable-line react-hooks/exhaustive-deps

  const onUp = useCallback((e) => {
    const wasPinch = !!pinch.current;
    pointers.current.delete(e.pointerId);

    if (wasPinch) {
      if (pointers.current.size < 2) pinch.current = null;
      pan.current = pointers.current.size === 1
        ? (() => { const [pt] = [...pointers.current.values()]; return { x: pt.x, y: pt.y, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false }; })()
        : null;
      commitView(viewRef.current);
      if (pointers.current.size === 0) detachWindow();
      return;
    }

    if (connect.current) {
      const c = connect.current; connect.current = null;
      if (connectRef.current) connectRef.current.setAttribute('d', '');
      if (c.moved) {
        const target = nodeAt(document.elementFromPoint(e.clientX, e.clientY));
        if (target && target.id !== c.fromId) ctx.current.onCreateLink && ctx.current.onCreateLink(c.fromId, target.id);
      } else if (ctx.current.connectFromId) {
        ctx.current.onConnectTap && ctx.current.onConnectTap(c.fromId); // tap handle while connecting → link to it
      } else {
        ctx.current.onHandleTap && ctx.current.onHandleTap(c.fromId);   // tap handle → enter two-tap connect
      }
      if (pointers.current.size === 0) { pan.current = null; detachWindow(); }
      return;
    }

    const g = gesture.current;
    gesture.current = null;
    if (g && g.linkId) {
      if (!g.moved) setSelLink(g.linkId);
    } else if (g) {
      clearTimeout(g.timer);
      if (!g.long) {
        if (!g.moved) {
          if (ctx.current.connectFromId) ctx.current.onConnectTap && ctx.current.onConnectTap(g.node.id);
          else if (g.node.node_type === 'task') ctx.current.onToggleDone(g.node);
          else ctx.current.onTapNode(g.node);
        } else {
          if (dragRaf.current) { cancelAnimationFrame(dragRaf.current); dragRaf.current = 0; }
          const fx = g.lastX, fy = g.lastY;
          setLivePos(p => ({ ...p, [g.node.id]: { x: fx, y: fy } }));
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => ctx.current.onSavePos(g.node.id, fx, fy), 400);
        }
      }
    } else if (pan.current) {
      commitView(viewRef.current);
      if (!pan.current.moved && ctx.current.connectFromId) ctx.current.onConnectCancel && ctx.current.onConnectCancel();
    }

    if (pointers.current.size === 0) { pan.current = null; detachWindow(); }
  }, [commitView, detachWindow]);

  // pointercancel: DON'T commit-and-die. Keep the gesture alive so the
  // next pointer event continues it; only drop the cancelled pointer.
  const onCancel = useCallback((e) => {
    // eslint-disable-next-line no-console
    if (gesture.current?.moved || connect.current?.moved) console.warn('[MindMap] pointercancel mid-gesture — keeping gesture alive');
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // gesture/pan/connect intentionally preserved — a follow-up
    // pointermove/up resumes/ends them. If nothing follows, the next
    // pointerdown self-heals (pointers is empty there).
  }, []);

  const attachWindow = () => {
    if (winAttached.current) return;
    winAttached.current = true;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // ── Container pointerdown: figure out what was grabbed ──────────
  const onDown = (e) => {
    if (pointers.current.size === 0) { // self-heal any stale gesture
      gesture.current = null; pan.current = null; connect.current = null; pinch.current = null;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    attachWindow();

    if (pointers.current.size === 2) {
      if (gesture.current) clearTimeout(gesture.current.timer);
      gesture.current = null; pan.current = null; connect.current = null;
      const pts = [...pointers.current.values()];
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && pts.length >= 2) {
        const v = viewRef.current;
        pinch.current = {
          startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
          startScale: v.scale, startTx: v.tx, startTy: v.ty,
          midX: (pts[0].x + pts[1].x) / 2 - rect.left, midY: (pts[0].y + pts[1].y) / 2 - rect.top,
        };
      }
      return;
    }
    if (pointers.current.size > 2) return;

    const handleEl = e.target?.closest?.('[data-handle-id]');
    if (handleEl) {
      const src = byId[handleEl.getAttribute('data-handle-id')];
      if (src) { const p = posOf(src); connect.current = { fromId: src.id, x1: p.x + NODE_W / 2, y1: p.y + heightFor(src), sx: e.clientX, sy: e.clientY, moved: false }; }
      return;
    }
    const node = nodeAt(e.target);
    if (node) {
      const start = posOf(node);
      gesture.current = {
        node, sx: e.clientX, sy: e.clientY, nx: start.x, ny: start.y, lastX: start.x, lastY: start.y, moved: false, long: false,
        timer: connectFromId ? null : setTimeout(() => { if (gesture.current && !gesture.current.moved) { gesture.current.long = true; onLongPress(node); } }, 480),
      };
      return;
    }
    const linkEl = e.target?.closest?.('[data-link-id]');
    if (linkEl) { gesture.current = { linkId: linkEl.getAttribute('data-link-id'), sx: e.clientX, sy: e.clientY, moved: false }; return; }
    setSelLink(null);
    pan.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false };
  };

  const zoom = (dir) => commitView({ ...viewRef.current, scale: clampScale(+(viewRef.current.scale + dir * 0.2).toFixed(2)) });

  // Native non-passive touchmove → stop the WebView scrolling/cancelling.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const block = (ev) => { if (gesture.current || pan.current || pinch.current || connect.current) ev.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    detachWindow();
    [viewRaf, dragRaf, connectRaf].forEach(r => { if (r.current) cancelAnimationFrame(r.current); });
  }, [detachWindow]);

  // Center on a node — ONLY the transform.
  useEffect(() => {
    if (!centerOnId) { centeredRef.current = null; return; }
    if (centeredRef.current === centerOnId) return;
    const n = byId[centerOnId];
    const rect = svgRef.current?.getBoundingClientRect();
    if (!n || !rect) return;
    const p = posOf(n);
    const v = viewRef.current;
    commitView({ scale: v.scale, tx: rect.width / 2 - (p.x + NODE_W / 2) * v.scale, ty: Math.max(16, rect.height * 0.26 - p.y * v.scale) });
    centeredRef.current = centerOnId;
    onCentered && onCentered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOnId, layout]);

  const edgePath = (p, c) => { const pp = posOf(p), cp = posOf(c); return curve(pp.x + NODE_W / 2, pp.y + heightFor(p), cp.x + NODE_W / 2, cp.y); };
  const linkPath = (a, b) => { const pa = posOf(a), pb = posOf(b); return curve(pa.x + NODE_W / 2, pa.y + heightFor(a), pb.x + NODE_W / 2, pb.y); };
  const linkMid = (a, b) => { const pa = posOf(a), pb = posOf(b); return { x: (pa.x + pb.x) / 2 + NODE_W / 2, y: (pa.y + heightFor(a) + pb.y) / 2 }; };
  const selLinkObj = resolvedLinks.find(l => l.id === selLink) || null;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none', overscrollBehavior: 'none' }}
      onPointerDown={onDown}
    >
      <style>{'@keyframes focuspulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.55}}'}</style>
      <svg ref={svgRef} width="100%" height="100%" style={{ touchAction: 'none', background: FOCUS.bg, display: 'block' }}>
        <g ref={gRef} transform={trStr(view)}>
          {/* Hierarchy edges — solid, one color, no path emphasis */}
          {visibleNodes.map(p => visibleChildrenOf(p).map(c => (
            <path key={p.id + '-' + c.id} d={edgePath(p, c)} fill="none" stroke={HIER_EDGE} strokeWidth={2} />
          )))}

          {/* Cross-links — dashed purple-gray */}
          {resolvedLinks.map(l => {
            const d = linkPath(l.a, l.b);
            return (
              <g key={l.id}>
                <path d={d} fill="none" stroke={LINK_EDGE} strokeWidth={2} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />
                <path data-link-id={l.id} d={d} fill="none" stroke="transparent" strokeWidth={18} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
              </g>
            );
          })}

          {/* Live connection line — dashed red (only red on any line) */}
          <path ref={connectRef} d="" fill="none" stroke={LIVE_EDGE} strokeWidth={2} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />

          {/* Nodes */}
          {visibleNodes.map(n => {
            const p = posOf(n);
            return (
              <MapNode key={n.id} x={p.x} y={p.y} node={n} sel={selectedId === n.id} pulsing={connectFromId === n.id}
                childrenIdx={children} expanded={expanded} isTaskDone={isTaskDone} />
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(1)} style={zoomBtn}>+</button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(-1)} style={zoomBtn}>−</button>
      </div>

      {/* Remove-link chip (selection shown by the chip, never on the edge) */}
      {selLinkObj && (() => {
        const m = linkMid(selLinkObj.a, selLinkObj.b);
        const sx = view.tx + m.x * view.scale, sy = view.ty + m.y * view.scale;
        return (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { onRemoveLink && onRemoveLink(selLink); setSelLink(null); }}
            style={{ position: 'absolute', left: sx, top: sy, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 5, background: '#fff', border: `1.5px solid ${LINK_EDGE}`, color: '#5B5480', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', fontFamily: "'Rubik', system-ui, sans-serif", whiteSpace: 'nowrap' }}
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

// One node — bigger hit box (HIT_PAD) + a 28px handle hit circle around a
// 14px visible dot. Memoized on primitives so a drag only re-renders this.
const MapNode = React.memo(function MapNode({ x, y, node, sel, pulsing, childrenIdx, expanded, isTaskDone }) {
  const H = heightFor(node);
  return (
    <foreignObject x={x - HIT_PAD} y={y - HIT_PAD} width={NODE_W + HIT_PAD * 2} height={H + HIT_PAD * 2 + 34} style={{ overflow: 'visible' }}>
      <div data-node-id={node.id} style={{ padding: HIT_PAD, width: NODE_W + HIT_PAD * 2, boxSizing: 'border-box', cursor: 'grab', userSelect: 'none', touchAction: 'none', fontFamily: "'Rubik', system-ui, sans-serif" }}>
        <div style={{ position: 'relative', outline: sel ? `2px solid ${FOCUS.edgeSel}` : 'none', borderRadius: 14 }}>
          <NodeCard node={node} children={childrenIdx} expanded={expanded} isTaskDone={isTaskDone} />
          {/* 28px invisible hit circle */}
          <div data-handle-id={node.id} title="הקש או גרור כדי לקשר"
            style={{ position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'crosshair', touchAction: 'none', zIndex: 3 }}>
            {/* 14px visible dot */}
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: FOCUS.edgeSel, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', opacity: sel || pulsing ? 1 : 0.4, animation: pulsing ? 'focuspulse 1s ease-in-out infinite' : 'none' }} />
          </div>
        </div>
      </div>
    </foreignObject>
  );
});

function NodeCard({ node, children, expanded, isTaskDone }) {
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
