import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize } from 'lucide-react';
import { FOCUS, urgencyStyle, descendantTasks, allDescendants, armColorMap, armColorFor, darken, hexAlpha } from '@/lib/lifeos/focus-api';

// ── Geometry ──────────────────────────────────────────────────────
const NODE_W = 138;
const HGAP = 22;
const VGAP = 104;
const HIT_PAD = 8;                 // invisible hit padding around each node
const SIMPLE_H = 34;               // node height in "simple" (title-only) mode
const heightFor = (n) => (n.node_type === 'root' ? 48 : n.node_type === 'branch' ? 74 : 54);
const trStr = (v) => `translate(${v.tx},${v.ty}) scale(${v.scale})`;

// One visual language:
const HIER_EDGE = '#E8D5BC';       // solid = מבנה (hierarchy)
const LINK_EDGE = '#9A93B8';       // dashed purple-gray = קשר (cross-link)
const LIVE_EDGE = FOCUS.edgeSel;   // dashed red = חיבור בתהליך (only live wire)

// ── Auto-anchoring (pure, module-level) ───────────────────────────
// Pick the anchor on `rect` = midpoint of the side whose outward ray
// toward (tx,ty) exits the rectangle first, with the outward normal.
function sideAnchor(rect, tx, ty) {
  const dx = tx - rect.cx, dy = ty - rect.cy;
  const kx = Math.abs(dx) < 1e-6 ? Infinity : (rect.w / 2) / Math.abs(dx);
  const ky = Math.abs(dy) < 1e-6 ? Infinity : (rect.h / 2) / Math.abs(dy);
  if (kx <= ky) {
    return dx >= 0
      ? { x: rect.x + rect.w, y: rect.cy, nx: 1, ny: 0 }   // right
      : { x: rect.x, y: rect.cy, nx: -1, ny: 0 };          // left
  }
  return dy >= 0
    ? { x: rect.cx, y: rect.y + rect.h, nx: 0, ny: 1 }     // bottom
    : { x: rect.cx, y: rect.y, nx: 0, ny: -1 };            // top
}
// Bezier whose control points extend perpendicular from each side (n8n).
function pathBetween(a, b) {
  const off = Math.max(28, Math.hypot(b.x - a.x, b.y - a.y) * 0.35);
  return `M ${a.x} ${a.y} C ${a.x + a.nx * off} ${a.y + a.ny * off}, ${b.x + b.nx * off} ${b.y + b.ny * off}, ${b.x} ${b.y}`;
}
// Live wire: anchored source side → free end (the finger).
function wirePath(a, px, py) {
  const off = Math.max(28, Math.hypot(px - a.x, py - a.y) * 0.35);
  return `M ${a.x} ${a.y} C ${a.x + a.nx * off} ${a.y + a.ny * off}, ${px} ${py}, ${px} ${py}`;
}

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
  links = [], onRemoveLink, onCreateLink, onHierEdgeTap, onEmptyTap,
  connectFromId = null, onHandleTap, onConnectTap, onConnectCancel,
  onConnect, onDisconnect, onDetails, tools = null, simple = false, fitApi = null,
}) {
  // Node height depends on the view mode (simple = short title-only pills).
  const hOf = (n) => (simple ? SIMPLE_H : heightFor(n));
  const [view, setView] = useState({ tx: 20, ty: 20, scale: 1 });
  const [livePos, setLivePos] = useState({});
  const [busy, setBusy] = useState(false);
  const [hoverId, setHoverId] = useState(null); // node under the wire / just-tapped target

  const viewRef = useRef({ tx: 20, ty: 20, scale: 1 });
  const gRef = useRef(null);
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const connectRef = useRef(null);
  const saveTimer = useRef(null);
  const flashTimer = useRef(null);
  const gesture = useRef(null);
  const pan = useRef(null);
  const pinch = useRef(null);
  const connect = useRef(null);
  const pointers = useRef(new Map());
  const winAttached = useRef(false);
  const hoverRef = useRef(null);
  const viewRaf = useRef(0);
  const dragRaf = useRef(0);
  const dragPending = useRef(null);
  const connectRaf = useRef(0);
  const connectPending = useRef(null);
  const centeredRef = useRef(null);
  const fitRaf = useRef(0);
  const fitFn = useRef(null);
  const didAutoFit = useRef(false);
  const lastTap = useRef(0);

  const ctx = useRef({});
  ctx.current = { connectFromId, byId, onCreateLink, onHandleTap, onConnectTap, onConnectCancel, onTapNode, onToggleDone, onSavePos, onRemoveLink, onHierEdgeTap, onEmptyTap };

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

  // Arm colors: top-level branch → color; subtree inherits it.
  const armMap = useMemo(() => armColorMap(children, roots), [children, roots]);
  const armOf = (n) => armColorFor(n, byId, armMap);
  const rectOf = (n) => { const p = posOf(n); const h = hOf(n); return { x: p.x, y: p.y, w: NODE_W, h, cx: p.x + NODE_W / 2, cy: p.y + h / 2 }; };
  const anchored = (A, B) => { const ra = rectOf(A), rb = rectOf(B); return { a: sideAnchor(ra, rb.cx, rb.cy), b: sideAnchor(rb, ra.cx, ra.cy) }; };

  const clampScale = (s) => Math.min(2, Math.max(0.5, s));
  const nodeAt = (el) => { const e = el?.closest?.('[data-node-id]'); return e ? ctx.current.byId[e.getAttribute('data-node-id')] : null; };
  const toCanvas = (cx, cy) => {
    const rect = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - rect.left - v.tx) / v.scale, y: (cy - rect.top - v.ty) / v.scale };
  };
  const setHover = (id) => { if (hoverRef.current !== id) { hoverRef.current = id; setHoverId(id); } };

  // ── Window-level move/up/cancel ───────────────────────────────
  const onMove = useCallback((e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else if (pinch.current) return;

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
      if (!c.moved) { c.moved = true; setBusy(true); }
      const pt = toCanvas(e.clientX, e.clientY);
      connectPending.current = wirePath(sideAnchor(c.srcRect, pt.x, pt.y), pt.x, pt.y);
      if (!connectRaf.current) connectRaf.current = requestAnimationFrame(() => { connectRaf.current = 0; if (connectRef.current && connectPending.current != null) connectRef.current.setAttribute('d', connectPending.current); });
      const t = nodeAt(document.elementFromPoint(e.clientX, e.clientY));
      setHover(t && t.id !== c.fromId ? t.id : null);
      return;
    }

    const g = gesture.current;
    if (g && (g.linkId || g.hierEdge)) { if (Math.abs(e.clientX - g.sx) > 8 || Math.abs(e.clientY - g.sy) > 8) g.moved = true; return; }
    if (g) {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (!g.moved) { g.moved = true; clearTimeout(g.timer); setBusy(true); }
      g.lastX = g.nx + dx / viewRef.current.scale;
      g.lastY = g.ny + dy / viewRef.current.scale;
      dragPending.current = { id: g.node.id, x: g.lastX, y: g.lastY };
      if (!dragRaf.current) dragRaf.current = requestAnimationFrame(() => { dragRaf.current = 0; const d = dragPending.current; if (d) setLivePos(p => ({ ...p, [d.id]: { x: d.x, y: d.y } })); });
      return;
    }

    if (pan.current) {
      const p = pan.current;
      if (!p.moved && (Math.abs(e.clientX - p.x) > 6 || Math.abs(e.clientY - p.y) > 6)) { p.moved = true; setBusy(true); }
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

  const flashTarget = (id) => {
    setHover(id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setHover(null), 450);
  };

  const onUp = useCallback((e) => {
    const wasPinch = !!pinch.current;
    pointers.current.delete(e.pointerId);

    if (wasPinch) {
      if (pointers.current.size < 2) pinch.current = null;
      pan.current = pointers.current.size === 1
        ? (() => { const [pt] = [...pointers.current.values()]; return { x: pt.x, y: pt.y, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false }; })()
        : null;
      commitView(viewRef.current);
      if (pointers.current.size === 0) { setBusy(false); detachWindow(); }
      return;
    }

    if (connect.current) {
      const c = connect.current; connect.current = null;
      if (connectRef.current) connectRef.current.setAttribute('d', '');
      setHover(null);
      if (c.moved) {
        const target = nodeAt(document.elementFromPoint(e.clientX, e.clientY)); // drop anywhere on a node's rect
        if (target && target.id !== c.fromId) { ctx.current.onCreateLink && ctx.current.onCreateLink(c.fromId, target.id); flashTarget(target.id); }
      } else if (ctx.current.connectFromId) {
        ctx.current.onConnectTap && ctx.current.onConnectTap(c.fromId);
      } else {
        ctx.current.onHandleTap && ctx.current.onHandleTap(c.fromId);
      }
      if (pointers.current.size === 0) { pan.current = null; setBusy(false); detachWindow(); }
      return;
    }

    const g = gesture.current;
    gesture.current = null;
    if (g && g.linkId) {
      if (!g.moved) ctx.current.onRemoveLink && ctx.current.onRemoveLink(g.linkId); // tap dashed link → instant remove (+undo)
    } else if (g && g.hierEdge) {
      if (!g.moved && ctx.current.onHierEdgeTap) { // tap solid edge → mini action bar at the tap point
        const r = containerRef.current?.getBoundingClientRect();
        ctx.current.onHierEdgeTap(g.hierChild, r ? e.clientX - r.left : e.clientX, r ? e.clientY - r.top : e.clientY);
      }
    } else if (g) {
      clearTimeout(g.timer);
      if (!g.long) {
        if (!g.moved) {
          if (ctx.current.connectFromId) { flashTarget(g.node.id); ctx.current.onConnectTap && ctx.current.onConnectTap(g.node.id); } // whole-node connect
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
      if (!pan.current.moved) {
        // Single empty-canvas tap dismisses everything (connect/hint/banner/
        // action bar/toasts — handled by the host). Double-tap = fit.
        ctx.current.onEmptyTap && ctx.current.onEmptyTap();
        const now = e.timeStamp || 0;
        if (now - lastTap.current < 320) fitFn.current && fitFn.current();
        lastTap.current = now;
      }
    }

    if (pointers.current.size === 0) { pan.current = null; setBusy(false); detachWindow(); }
  }, [commitView, detachWindow]);

  const onCancel = useCallback((e) => {
    // eslint-disable-next-line no-console
    if (gesture.current?.moved || connect.current?.moved) console.warn('[MindMap] pointercancel mid-gesture — keeping gesture alive');
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setBusy(false);
  }, []);

  const attachWindow = () => {
    if (winAttached.current) return;
    winAttached.current = true;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // ── Container pointerdown ──────────────────────────────────────
  const onDown = (e) => {
    if (pointers.current.size === 0) { gesture.current = null; pan.current = null; connect.current = null; pinch.current = null; }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    attachWindow();

    if (pointers.current.size === 2) {
      if (gesture.current) clearTimeout(gesture.current.timer);
      gesture.current = null; pan.current = null; connect.current = null; setBusy(true);
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
      if (src) connect.current = { fromId: src.id, srcRect: rectOf(src), sx: e.clientX, sy: e.clientY, moved: false };
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
    const hierEl = e.target?.closest?.('[data-hier-edge]');
    if (hierEl) { gesture.current = { hierEdge: true, hierChild: hierEl.getAttribute('data-hier-edge'), sx: e.clientX, sy: e.clientY, moved: false }; return; }
    pan.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false };
  };

  const zoom = (dir) => commitView({ ...viewRef.current, scale: clampScale(+(viewRef.current.scale + dir * 0.2).toFixed(2)) });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const block = (ev) => { if (gesture.current || pan.current || pinch.current || connect.current) ev.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  useEffect(() => () => {
    clearTimeout(saveTimer.current); clearTimeout(flashTimer.current);
    detachWindow();
    [viewRaf, dragRaf, connectRaf, fitRaf].forEach(r => { if (r.current) cancelAnimationFrame(r.current); });
  }, [detachWindow]);

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

  // Fit all visible nodes into the canvas with a 24px margin. Fit may
  // zoom out below the 0.5 interactive floor (down to 0.25).
  const fitView = useCallback((animate = true) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !visibleNodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleNodes.forEach(n => {
      const p = posOf(n), h = hOf(n);
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + h);
    });
    const M = 24, bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const scale = Math.min(2, Math.max(0.25, Math.min((rect.width - 2 * M) / bw, (rect.height - 2 * M) / bh)));
    const target = { scale, tx: rect.width / 2 - ((minX + maxX) / 2) * scale, ty: rect.height / 2 - ((minY + maxY) / 2) * scale };
    if (fitRaf.current) cancelAnimationFrame(fitRaf.current);
    if (!animate) { commitView(target); return; }
    const start = { ...viewRef.current };
    let t0 = 0;
    const step = (t) => {
      if (!t0) t0 = t;
      const k = Math.min(1, (t - t0) / 320), e = 1 - Math.pow(1 - k, 3);
      const v = { tx: start.tx + (target.tx - start.tx) * e, ty: start.ty + (target.ty - start.ty) * e, scale: start.scale + (target.scale - start.scale) * e };
      viewRef.current = v;
      if (gRef.current) gRef.current.setAttribute('transform', trStr(v));
      if (k < 1) fitRaf.current = requestAnimationFrame(step);
      else { fitRaf.current = 0; setView(v); }
    };
    fitRaf.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, commitView, simple]);
  fitFn.current = fitView;
  if (fitApi) fitApi.current = fitView; // let the host trigger a refit (e.g. on view toggle)

  // Auto-fit once on load (no saved view), unless deep-linked to a branch.
  useEffect(() => {
    if (didAutoFit.current || centerOnId) return;
    if (!visibleNodes.length || !svgRef.current) return;
    didAutoFit.current = true;
    fitView(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, centerOnId]);

  const edgePath = (p, c) => { const { a, b } = anchored(p, c); return pathBetween(a, b); };
  const linkPath = (A, B) => { const { a, b } = anchored(A, B); return pathBetween(a, b); };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none', overscrollBehavior: 'none' }}
      onPointerDown={onDown}
    >
      <svg ref={svgRef} width="100%" height="100%" style={{ touchAction: 'none', background: FOCUS.bg, display: 'block' }}>
        <g ref={gRef} transform={trStr(view)}>
          {/* Hierarchy edges — solid, auto-anchored. Tapping one shows the
              structure-line explainer (not removable like a cross-link). */}
          {visibleNodes.map(p => visibleChildrenOf(p).map(c => {
            const d = edgePath(p, c);
            const hitW = Math.max(16, 26 / view.scale);
            const arm = armOf(c);
            return (
              <g key={p.id + '-' + c.id}>
                <path data-hier-edge={c.id} d={d} fill="none" stroke="transparent" strokeWidth={hitW} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
                <path d={d} fill="none" stroke={arm ? hexAlpha(arm, 0.35) : HIER_EDGE} strokeWidth={2} style={{ pointerEvents: 'none' }} />
              </g>
            );
          }))}

          {/* Cross-links — dashed purple-gray, auto-anchored. Tap → remove. */}
          {resolvedLinks.map(l => {
            const d = linkPath(l.a, l.b);
            const hitW = Math.max(18, 30 / view.scale);
            return (
              <g key={l.id}>
                <path data-link-id={l.id} d={d} fill="none" stroke="transparent" strokeWidth={hitW} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
                <path d={d} fill="none" stroke={LINK_EDGE} strokeWidth={2} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />
              </g>
            );
          })}

          {/* Live connection wire — dashed red */}
          <path ref={connectRef} d="" fill="none" stroke={LIVE_EDGE} strokeWidth={2} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />

          {/* Nodes */}
          {visibleNodes.map(n => {
            const p = posOf(n);
            return (
              <MapNode key={n.id} x={p.x} y={p.y} node={n} sel={selectedId === n.id} armColor={armOf(n)} simple={simple}
                highlight={hoverId === n.id} childrenIdx={children} expanded={expanded} isTaskDone={isTaskDone} />
            );
          })}
        </g>
      </svg>

      {/* Floating control cluster (semi-transparent) — fit, zoom, tools */}
      <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 5, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', borderRadius: 12, padding: 5, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => fitFn.current && fitFn.current()} style={zoomBtn} title="התאם לתצוגה"><Maximize size={17} /></button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(1)} style={zoomBtn}>+</button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(-1)} style={zoomBtn}>−</button>
        {tools}
      </div>

      {/* Selection action bar — primary connect/disconnect UX */}
      {selectedId && !busy && !connectFromId && (() => {
        const sel = byId[selectedId];
        if (!sel) return null;
        const p = posOf(sel);
        const bx = view.tx + (p.x + NODE_W / 2) * view.scale;
        const by = view.ty + (p.y + hOf(sel)) * view.scale + 22;
        return (
          <div onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left: bx, top: by, transform: 'translateX(-50%)', display: 'flex', gap: 6, background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 12, padding: 5, boxShadow: '0 4px 14px rgba(0,0,0,0.18)', zIndex: 6, whiteSpace: 'nowrap' }}>
            <button onClick={() => onConnect && onConnect(sel.id)} style={barBtn('#E6F1FB', '#0C447C')}>+ חבר</button>
            <button onClick={() => onDisconnect && onDisconnect(sel)} style={barBtn('#FCEBEB', '#C0392B')}>✂ נתק</button>
            <button onClick={() => onDetails && onDetails(sel)} style={barBtn('#F1F3F6', '#3C3489')}>✏ פרטים</button>
          </div>
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
const barBtn = (bg, fg) => ({
  minHeight: 44, padding: '0 14px', borderRadius: 9, border: 'none',
  background: bg, color: fg, fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
  fontFamily: "'Rubik', system-ui, sans-serif",
});

// 4 side "+" badges on the SELECTED node (18px visible / 32px hit).
// Centered on each side; drag → wire, tap → connect mode.
const HANDLE_SIDES = [
  { key: 't', pos: { top: -16, left: '50%', marginLeft: -16 } },
  { key: 'b', pos: { bottom: -16, left: '50%', marginLeft: -16 } },
  { key: 'l', pos: { left: -16, top: '50%', marginTop: -16 } },
  { key: 'r', pos: { right: -16, top: '50%', marginTop: -16 } },
];

// One node — bigger hit box + whole-rect connect target. Memoized on
// primitives so a drag only re-renders this node.
const MapNode = React.memo(function MapNode({ x, y, node, sel, armColor, simple, highlight, childrenIdx, expanded, isTaskDone }) {
  const H = simple ? SIMPLE_H : heightFor(node);
  return (
    <foreignObject x={x - HIT_PAD} y={y - HIT_PAD} width={NODE_W + HIT_PAD * 2} height={H + HIT_PAD * 2 + 34} style={{ overflow: 'visible' }}>
      <div data-node-id={node.id} style={{ padding: HIT_PAD, width: NODE_W + HIT_PAD * 2, boxSizing: 'border-box', cursor: 'grab', userSelect: 'none', touchAction: 'none', fontFamily: "'Rubik', system-ui, sans-serif" }}>
        <div style={{ position: 'relative', borderRadius: 14, outline: sel ? `2px solid ${FOCUS.edgeSel}` : 'none', boxShadow: highlight ? '0 0 0 3px rgba(22,163,74,0.55)' : 'none', transition: 'box-shadow .12s' }}>
          {simple
            ? <SimpleCard node={node} armColor={armColor} isTaskDone={isTaskDone} />
            : <NodeCard node={node} armColor={armColor} children={childrenIdx} expanded={expanded} isTaskDone={isTaskDone} />}
          {sel && HANDLE_SIDES.map(s => (
            <div key={s.key} data-handle-id={node.id} title="גרור או הקש כדי לקשר"
              style={{ position: 'absolute', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'crosshair', touchAction: 'none', zIndex: 3, ...s.pos }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: FOCUS.edgeSel, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>+</div>
            </div>
          ))}
        </div>
      </div>
    </foreignObject>
  );
});

// Simple mode: title-only compact pill, arm color kept.
function SimpleCard({ node, armColor, isTaskDone }) {
  if (node.node_type === 'root') {
    return <div style={{ background: FOCUS.orange, color: '#fff', borderRadius: 999, padding: '7px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, boxShadow: '0 3px 10px rgba(255,111,32,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.title || 'שורש'}</div>;
  }
  const done = node.node_type === 'task' && isTaskDone(node);
  const accent = node.is_fear_task ? '#E24B4A' : (armColor || FOCUS.border);
  return (
    <div style={{ background: '#fff', border: `1px solid ${FOCUS.border}`, borderRight: `3px solid ${accent}`, borderRadius: 999, padding: '7px 12px', boxShadow: FOCUS.neu, fontSize: 12.5, fontWeight: 700, color: armColor ? darken(armColor) : FOCUS.ink, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: done ? 0.55 : 1, textDecoration: done ? 'line-through' : 'none' }}>
      {node.title || (node.node_type === 'task' ? 'משימה' : 'מושג')}
    </div>
  );
}

function NodeCard({ node, armColor, children, expanded, isTaskDone }) {
  // Root stays solid orange — no arm accent.
  if (node.node_type === 'root') {
    return (
      <div style={{ background: FOCUS.orange, color: '#fff', borderRadius: 999, padding: '12px 10px', textAlign: 'center', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 12px rgba(255,111,32,0.4)' }}>
        {node.title || 'שורש'}
      </div>
    );
  }
  // 3px RIGHT accent in the arm color (fear tasks keep their red accent).
  const armAccent = armColor ? { borderRight: `3px solid ${armColor}` } : null;
  const armDark = armColor ? darken(armColor) : FOCUS.ink;
  if (node.node_type === 'task') {
    const done = isTaskDone(node);
    const st = urgencyStyle(node);
    return (
      <div style={{ ...st, ...(node.is_fear_task ? null : armAccent), borderRadius: 12, padding: '9px 10px', boxShadow: FOCUS.neu, opacity: done ? 0.6 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 15, height: 15, borderRadius: 5, flexShrink: 0, border: `2px solid ${done ? '#16a34a' : (armColor || FOCUS.orange)}`, background: done ? '#16a34a' : 'transparent', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : ''}</span>
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
      <div style={{ background: '#fff', border: `1px solid ${FOCUS.border}`, ...armAccent, borderRadius: 14, padding: '10px', textAlign: 'center', boxShadow: FOCUS.neu }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: armDark }}>{node.title}</div>
        <div style={{ fontSize: 10, color: FOCUS.muted, marginTop: 3 }}>{branches} מושגים · {tasks.length} משימות</div>
      </div>
    );
  }
  return (
    <div style={{ background: '#fff', border: `1px solid ${FOCUS.border}`, ...armAccent, borderRadius: 14, padding: '10px', boxShadow: FOCUS.neu }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: armDark, textAlign: 'center' }}>{node.title}</div>
      {tasks.length > 0 ? (
        <>
          <div style={{ height: 4, borderRadius: 3, background: '#F1E7D8', marginTop: 7, overflow: 'hidden' }}>
            <div style={{ width: `${taskPct * 100}%`, height: '100%', background: armColor || FOCUS.orange }} />
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
