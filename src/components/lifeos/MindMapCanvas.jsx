import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { FOCUS, urgencyStyle, descendantTasks, allDescendants, armColorMap, armColorFor, darken, hexAlpha } from '@/lib/lifeos/focus-api';

// ── Geometry ──────────────────────────────────────────────────────
// Clean rounded-rectangle cards at a FIXED comfortable width. Layout
// reserves a per-level row height so cards never overlap vertically,
// and packs sibling SUBTREES into disjoint horizontal bands so they
// never overlap horizontally — for ANY tree shape.
const NODE_W = 158;                // fixed card width (concepts + tasks)
const ROOT_W = 190;                // root pill is distinctly larger
const SIMPLE_W = 150;              // card width in "simple" (title-only) mode
const HGAP = 24;                   // min horizontal gap between subtrees
const LEVEL_GAP = 100;             // fixed vertical gap between levels
const ROOT_GAP = 140;              // extra breathing room under the root
const HIT_PAD = 12;                // invisible hit padding around each card

// Zoom range. The floor is deliberately far below "readable": on a map with
// hundreds of nodes the whole tree only fits at a very small scale, and the
// old 0.5 floor made it impossible to ever see everything at once. Cards stop
// being legible long before 0.05 — that is fine, this end of the range is for
// surveying the shape of the map, not for reading it.
const MIN_SCALE = 0.05;
const MAX_SCALE = 2;
// Multiplicative zoom step. A fixed ±0.2 was fine near 1× but useless at the
// bottom of the range (0.3 → 0.1 → below zero); a ratio keeps every press the
// same perceptual amount and can traverse the whole range.
const ZOOM_STEP = 1.25;

// Reserved heights (layout + edge anchoring). Cards may render a touch
// shorter for single-line titles; the reserve guarantees no overlap.
const H = {
  rootSimple: 42, simple: 40,
  root: 54, task: 60,
  branchCollapsed: 66, branchEmpty: 60, branchTasks: 86,
};
const trStr = (v) => `translate(${v.tx},${v.ty}) scale(${v.scale})`;

// One visual language:
const HIER_EDGE = '#E8D5BC';       // fallback solid = מבנה (hierarchy)
const LINK_EDGE = '#9A93B8';       // dashed purple-gray = קשר (cross-link)
const LIVE_EDGE = FOCUS.edgeSel;   // dashed red = חיבור בתהליך (only live wire)
const SEL_EDGE = '#C0392B';        // thick red = הקו הנבחר (selected edge)

const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25, wordBreak: 'break-word' };
const clamp1 = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const CARD_SHADOW = '0 1px 2px rgba(90,60,25,0.10), 0 4px 12px rgba(90,60,25,0.07)';
const CARD_LIFT = '0 6px 20px rgba(90,60,25,0.20)';

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
// Smooth cubic bezier whose control points extend perpendicular from
// each side. The offset grows with horizontal distance so lines bow
// AROUND siblings instead of cutting straight through them. `extra` bows
// the curve further out — used so a cross-link that duplicates a
// parent-child structure edge stays visible next to it instead of
// sitting exactly on top of it.
function cubicOf(a, b, extra = 0) {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  const off = Math.min(130, Math.max(30, dy * 0.55 + dx * 0.22)) + extra;
  return [
    { x: a.x, y: a.y },
    { x: a.x + a.nx * off, y: a.y + a.ny * off },
    { x: b.x + b.nx * off, y: b.y + b.ny * off },
    { x: b.x, y: b.y },
  ];
}
const pathOf = (c) => `M ${c[0].x} ${c[0].y} C ${c[1].x} ${c[1].y}, ${c[2].x} ${c[2].y}, ${c[3].x} ${c[3].y}`;
// Bezier point at t=0.5 — where the selected-edge ✕ pill is anchored.
const midOf = (c) => ({ x: (c[0].x + 3 * c[1].x + 3 * c[2].x + c[3].x) / 8, y: (c[0].y + 3 * c[1].y + 3 * c[2].y + c[3].y) / 8 });
function pathBetween(a, b, extra = 0) { return pathOf(cubicOf(a, b, extra)); }
// Extra bow for a cross-link that mirrors a parent-child structure edge.
const DUP_BOW = 74;
// Live wire: anchored source side → free end (the finger).
function wirePath(a, px, py) {
  const off = Math.max(28, Math.hypot(px - a.x, py - a.y) * 0.35);
  return `M ${a.x} ${a.y} C ${a.x + a.nx * off} ${a.y + a.ny * off}, ${px} ${py}, ${px} ${py}`;
}

// ── Tidy-tree layout — provably overlap-free ──────────────────────
// 1) scan for each level's reserved row height → cumulative y per depth.
// 2) each subtree claims a horizontal band = max(nodeWidth, childrenSpan).
//    Sibling bands are disjoint (separated by HGAP), and every node is
//    centered inside its own band, so parents sit centered over their
//    children's bounding box and nothing can overlap.
function computeLayout(roots, visibleChildrenOf, wOf, hOf) {
  const layout = {};
  const rowH = {};
  const scan = (n, d) => {
    rowH[d] = Math.max(rowH[d] || 0, hOf(n));
    visibleChildrenOf(n).forEach(c => scan(c, d + 1));
  };
  roots.forEach(r => scan(r, 0));
  const maxD = Math.max(0, ...Object.keys(rowH).map(Number));
  const yAt = { 0: 0 };
  for (let d = 1; d <= maxD; d++) {
    const gap = d === 1 ? ROOT_GAP : LEVEL_GAP;
    yAt[d] = yAt[d - 1] + (rowH[d - 1] || 0) + gap;
  }
  const subW = (n) => {
    const kids = visibleChildrenOf(n);
    if (!kids.length) return wOf(n);
    const cw = kids.reduce((s, k) => s + subW(k), 0) + HGAP * (kids.length - 1);
    return Math.max(wOf(n), cw);
  };
  const assign = (n, leftX, d) => {
    const sw = subW(n), w = wOf(n), cx = leftX + sw / 2;
    layout[n.id] = { x: cx - w / 2, y: yAt[d] };
    const kids = visibleChildrenOf(n);
    if (kids.length) {
      const cw = kids.reduce((s, k) => s + subW(k), 0) + HGAP * (kids.length - 1);
      let cursor = cx - cw / 2;
      kids.forEach(k => { assign(k, cursor, d + 1); cursor += subW(k) + HGAP; });
    }
  };
  let cur = 0;
  roots.forEach(r => { assign(r, cur, 0); cur += subW(r) + HGAP * 2; });
  return layout;
}

export default function MindMapCanvas({
  nodes, byId, children, roots, expanded, selectedId,
  isTaskDone, onTapNode, onToggleDone, onLongPress, onSavePos, centerOnId, onCentered,
  links = [], onCreateLink, onEmptyTap,
  selectedEdge = null, onEdgeSelect, onEdgeDelete, onEdgeReconnect,
  reconnectActive = false, onReconnectTap,
  connectFromId = null, onHandleTap, onConnectTap, onConnectCancel,
  onConnect, onDisconnect, onDetails, tools = null, simple = false, fitApi = null, posApi = null,
}) {
  // Card width/height depend on the view mode and node state.
  const wOf = useCallback((n) => (simple ? SIMPLE_W : n.node_type === 'root' ? ROOT_W : NODE_W), [simple]);
  const hOf = useCallback((n) => {
    if (simple) return n.node_type === 'root' ? H.rootSimple : H.simple;
    if (n.node_type === 'root') return H.root;
    if (n.node_type === 'task') return H.task;
    const kids = children[n.id] || [];
    if (kids.length && !expanded.has(n.id)) return H.branchCollapsed;
    return descendantTasks(n.id, children).length > 0 ? H.branchTasks : H.branchEmpty;
  }, [simple, children, expanded]);

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
  ctx.current = { connectFromId, byId, onCreateLink, onHandleTap, onConnectTap, onConnectCancel, onTapNode, onToggleDone, onSavePos, onEmptyTap, onEdgeSelect, reconnectActive, onReconnectTap };

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
  const layout = useMemo(() => computeLayout(roots, visibleChildrenOf, wOf, hOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, expanded, children, roots, simple]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);
  const visibleAncestor = (id) => {
    let cur = byId[id], guard = 0;
    while (cur && guard++ < 100) { if (visibleIds.has(cur.id)) return cur; cur = byId[cur.parent_id]; }
    return null;
  };
  const resolvedLinks = useMemo(() => links.map(lk => {
    const a = visibleAncestor(lk.from_node), b = visibleAncestor(lk.to_node);
    if (!a || !b || a.id === b.id) return null;
    // A link that mirrors a parent-child structure edge is drawn with an
    // extra bow so both lines stay separately visible AND separately tappable.
    const dup = a.parent_id === b.id || b.parent_id === a.id;
    return { id: lk.id, a, b, dup };
  }).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [links, visibleIds, byId]);

  const posOf = (n) => livePos[n.id]
    || (n.pos_x != null && n.pos_y != null ? { x: Number(n.pos_x), y: Number(n.pos_y) } : layout[n.id])
    || { x: 0, y: 0 };

  // Let the host read a node's CURRENT rendered coordinates — including the
  // auto-layout slot of a node that has no saved pos_x/pos_y yet. Detaching a
  // node makes it a root of its own, which hands it a brand-new layout slot in
  // the root row; freezing these coords first is what stops it from jumping.
  // Returns null when the node has NO real position: a node inside a collapsed
  // branch is never laid out, and posOf's {0,0} fallback would otherwise be
  // mistaken for a genuine coordinate and pin the whole hidden subtree to the
  // origin. Callers must treat null as "nothing to freeze", not as {0,0}.
  if (posApi) posApi.current = (id) => {
    const n = byId[id];
    if (!n) return null;
    if (livePos[id]) return livePos[id];
    if (n.pos_x != null && n.pos_y != null) return { x: Number(n.pos_x), y: Number(n.pos_y) };
    return layout[id] || null;
  };

  // Arm colors: top-level branch → color; subtree inherits it.
  const armMap = useMemo(() => armColorMap(children, roots), [children, roots]);
  const armOf = (n) => armColorFor(n, byId, armMap);
  const rectOf = (n) => { const p = posOf(n); const w = wOf(n), h = hOf(n); return { x: p.x, y: p.y, w, h, cx: p.x + w / 2, cy: p.y + h / 2 }; };
  const anchored = (A, B) => { const ra = rectOf(A), rb = rectOf(B); return { a: sideAnchor(ra, rb.cx, rb.cy), b: sideAnchor(rb, ra.cx, ra.cy) }; };

  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
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
    // ONE RULE: tapping (or long-pressing) any line — dashed cross-link OR
    // solid structure edge — SELECTS it. The selection is sticky: the line
    // highlights and an ✕ / ⇄ pill anchors to its midpoint, so deleting it
    // never depends on where the finger happened to land.
    if (g && (g.linkId || g.hierEdge)) {
      if (!g.moved && ctx.current.onEdgeSelect) {
        const desc = g.linkId ? { type: 'link', linkId: g.linkId } : { type: 'hier', childId: g.hierChild };
        ctx.current.onEdgeSelect(desc);
      }
    } else if (g) {
      clearTimeout(g.timer);
      if (!g.long) {
        if (!g.moved) {
          if (ctx.current.reconnectActive) { flashTarget(g.node.id); ctx.current.onReconnectTap && ctx.current.onReconnectTap(g.node.id); } // reconnect target
          else if (ctx.current.connectFromId) { flashTarget(g.node.id); ctx.current.onConnectTap && ctx.current.onConnectTap(g.node.id); } // whole-node connect
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
    if (gesture.current?.moved || connect.current?.moved) console.warn('[MindMap] pointercancel mid-gesture');
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // Once every pointer is released, tear down exactly like onUp does — reset
    // gesture/pan/connect and detach the window listeners. Without this a
    // WebView-initiated cancel left stale state + live window handlers behind,
    // which could disturb taps elsewhere while the map stayed mounted. A cancel
    // with another finger still down keeps the active gesture alive (same guard
    // onUp uses), so mid-drag resilience is unchanged.
    if (pointers.current.size === 0) {
      if (gesture.current?.timer) clearTimeout(gesture.current.timer);
      gesture.current = null; pan.current = null; connect.current = null; pinch.current = null;
      setBusy(false);
      detachWindow();
    }
  }, [detachWindow]);

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

    // Edge grab-dot — checked FIRST because it is the only edge target that
    // is painted above the node cards, and it must win over everything else.
    const dotEl = e.target?.closest?.('[data-edge-dot]');
    if (dotEl) {
      const [kind, id] = (dotEl.getAttribute('data-edge-dot') || '').split(':');
      gesture.current = kind === 'link'
        ? { linkId: id, sx: e.clientX, sy: e.clientY, moved: false }
        : { hierEdge: true, hierChild: id, sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
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
        timer: (connectFromId || reconnectActive) ? null : setTimeout(() => { if (gesture.current && !gesture.current.moved) { gesture.current.long = true; onLongPress(node); } }, 480),
      };
      return;
    }
    const linkEl = e.target?.closest?.('[data-link-id]');
    if (linkEl) { gesture.current = { linkId: linkEl.getAttribute('data-link-id'), sx: e.clientX, sy: e.clientY, moved: false }; return; }
    const hierEl = e.target?.closest?.('[data-hier-edge]');
    if (hierEl) { gesture.current = { hierEdge: true, hierChild: hierEl.getAttribute('data-hier-edge'), sx: e.clientX, sy: e.clientY, moved: false }; return; }
    pan.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false };
  };

  const zoom = (dir) => commitView({ ...viewRef.current, scale: clampScale(viewRef.current.scale * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)) });

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
    commitView({ scale: v.scale, tx: rect.width / 2 - (p.x + wOf(n) / 2) * v.scale, ty: Math.max(16, rect.height * 0.26 - p.y * v.scale) });
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
      const p = posOf(n);
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + wOf(n)); maxY = Math.max(maxY, p.y + hOf(n));
    });
    const M = 24, bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    // Clamped to the same range as manual zoom, so "התאם" can always reach a
    // scale that holds the entire tree no matter how many nodes there are.
    // (The old 0.25 floor silently cropped big maps: the fit ran, but the
    // outermost branches stayed off-screen with no way to reach them.)
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((rect.width - 2 * M) / bw, (rect.height - 2 * M) / bh)));
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
  const linkPath = (A, B, extra = 0) => { const { a, b } = anchored(A, B); return pathBetween(a, b, extra); };

  const isSelHier = (childId) => selectedEdge?.type === 'hier' && selectedEdge.childId === childId;
  const isSelLink = (linkId) => selectedEdge?.type === 'link' && selectedEdge.linkId === linkId;

  // Midpoint of the selected edge in CONTAINER (screen) coordinates — the
  // anchor for the ✕ / ⇄ pill. Recomputed every render so it tracks drags,
  // pan and zoom. null when the edge isn't currently drawn.
  const selEdgePoint = (() => {
    if (!selectedEdge) return null;
    let mid = null;
    if (selectedEdge.type === 'hier') {
      const c = byId[selectedEdge.childId];
      const p = c && byId[c.parent_id];
      if (!c || !p || !visibleIds.has(c.id) || !visibleIds.has(p.id)) return null;
      const { a, b } = anchored(p, c);
      mid = midOf(cubicOf(a, b));
    } else {
      const l = resolvedLinks.find(x => x.id === selectedEdge.linkId);
      if (!l) return null;
      const { a, b } = anchored(l.a, l.b);
      mid = midOf(cubicOf(a, b, l.dup ? DUP_BOW : 0));
    }
    const cw = containerRef.current?.clientWidth || 0;
    const ch = containerRef.current?.clientHeight || 0;
    const sx = view.tx + mid.x * view.scale;
    const sy = view.ty + mid.y * view.scale;
    // Keep the pill reachable even when the line's midpoint is off-canvas.
    // The top floor (62) clears the "קו נבחר" banner the host renders at y=8.
    return { x: cw ? Math.max(56, Math.min(sx, cw - 56)) : sx, y: ch ? Math.max(62, Math.min(sy, ch - 30)) : sy };
  })();

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none', overscrollBehavior: 'none' }}
      onPointerDown={onDown}
    >
      <svg ref={svgRef} width="100%" height="100%" style={{ touchAction: 'none', background: FOCUS.bg, display: 'block' }}>
        <defs>
          {/* Subtle Figma/Miro-style dot grid for spatial reference. */}
          <pattern id="mm-dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1.3" cy="1.3" r="1.3" fill="#9C7A4E" fillOpacity="0.10" />
          </pattern>
        </defs>
        <g ref={gRef} transform={trStr(view)}>
          {/* Dot grid lives INSIDE the panned group so it scrolls with the
              canvas, giving a sense of movement while panning. */}
          <rect x={-6000} y={-6000} width={12000} height={12000} fill="url(#mm-dotgrid)" style={{ pointerEvents: 'none' }} />

          {/* Hierarchy edges — smooth arm-colored beziers at 40% opacity.
              Tapping one selects it (red highlight + ✕ / ⇄ pill). */}
          {visibleNodes.map(p => visibleChildrenOf(p).map(c => {
            const d = edgePath(p, c);
            const hitW = Math.max(22, 34 / view.scale);
            const arm = armOf(c);
            const on = isSelHier(c.id);
            return (
              <g key={p.id + '-' + c.id}>
                <path data-hier-edge={c.id} d={d} fill="none" stroke="transparent" strokeWidth={hitW} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
                {on && <path d={d} fill="none" stroke={hexAlpha(SEL_EDGE, 0.25)} strokeWidth={9} strokeLinecap="round" style={{ pointerEvents: 'none' }} />}
                <path d={d} fill="none" stroke={on ? SEL_EDGE : (arm ? hexAlpha(arm, 0.4) : HIER_EDGE)} strokeWidth={on ? 3.5 : 2} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              </g>
            );
          }))}

          {/* Cross-links — thin dashed neutral, auto-anchored. Tap → select. */}
          {resolvedLinks.map(l => {
            const d = linkPath(l.a, l.b, l.dup ? DUP_BOW : 0);
            const hitW = Math.max(22, 34 / view.scale);
            const on = isSelLink(l.id);
            return (
              <g key={l.id}>
                <path data-link-id={l.id} d={d} fill="none" stroke="transparent" strokeWidth={hitW} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
                {on && <path d={d} fill="none" stroke={hexAlpha(SEL_EDGE, 0.25)} strokeWidth={9} strokeLinecap="round" style={{ pointerEvents: 'none' }} />}
                <path d={d} fill="none" stroke={on ? SEL_EDGE : LINK_EDGE} strokeWidth={on ? 3.5 : 2} strokeDasharray="6 5" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              </g>
            );
          })}

          {/* Live connection wire — dashed red */}
          <path ref={connectRef} d="" fill="none" stroke={LIVE_EDGE} strokeWidth={2} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />

          {/* Nodes */}
          {visibleNodes.map(n => {
            const p = posOf(n);
            return (
              <MapNode key={n.id} x={p.x} y={p.y} w={wOf(n)} h={hOf(n)} node={n} sel={selectedId === n.id} armColor={armOf(n)} simple={simple}
                highlight={hoverId === n.id} childrenIdx={children} expanded={expanded} isTaskDone={isTaskDone} />
            );
          })}

          {/* Edge grab-dots — the ONLY edge target painted ABOVE the cards.
              Node cards are drawn after the edges, and each card's hit box is
              w+24 × h+24, so a line running between same-row nodes is 100%
              covered and its stroke can never be tapped. This dot sits at the
              line's midpoint and is always reachable.
              Cross-links always get one (few per map, and the ones users
              actually want to cut); structure edges get one only while a node
              they touch is selected, so the map stays clean. */}
          <g>
            {/* PAINT ORDER MATTERS. A dot's hit circle is ~36px across, so a
                structure-edge dot and a cross-link dot can overlap, and the
                later sibling wins the hit test. Structure dots go FIRST so the
                cross-link dot wins any overlap: cutting a cross-link is
                cheap and local, while detaching a branch moves a whole
                subtree. Losing that coin-flip must fall on the safer action. */}
            {selectedId && visibleNodes.map(p => visibleChildrenOf(p).filter(c => c.id === selectedId || p.id === selectedId).map(c => {
              const { a, b } = anchored(p, c);
              const m = midOf(cubicOf(a, b));
              return <EdgeDot key={'dh-' + c.id} tag={'hier:' + c.id} m={m} scale={view.scale} color={armOf(c) || '#B48A5A'} on={isSelHier(c.id)} />;
            }))}
            {resolvedLinks.map(l => {
              const { a, b } = anchored(l.a, l.b);
              const m = midOf(cubicOf(a, b, l.dup ? DUP_BOW : 0));
              return <EdgeDot key={'d-' + l.id} tag={'link:' + l.id} m={m} scale={view.scale} color={LINK_EDGE} on={isSelLink(l.id)} />;
            })}
          </g>
        </g>
      </svg>

      {/* No midpoint handles at rest — every edge is tapped directly via its
          wide transparent hit-path (data-hier-edge / data-link-id, above),
          which SELECTS it. The selected edge then gets this pill anchored to
          its own midpoint (not to the tap point), so the delete button can
          never end up clipped outside the canvas. Delete/Backspace does the
          same thing on desktop. */}
      {selEdgePoint && !busy && (
        <div onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'absolute', left: selEdgePoint.x, top: selEdgePoint.y, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 999, padding: 4, boxShadow: '0 4px 14px rgba(0,0,0,0.22)', zIndex: 7 }}>
          <button onClick={() => onEdgeDelete && onEdgeDelete(selectedEdge)} aria-label="נתק קו" title="נתק קו"
            style={{ ...edgePillBtn, background: '#C0392B', color: '#fff', fontSize: 17 }}>✕</button>
          <button onClick={() => onEdgeReconnect && onEdgeReconnect(selectedEdge)} aria-label="חבר למקום אחר" title="חבר למקום אחר"
            style={{ ...edgePillBtn, background: '#EEEDFE', color: '#3C3489', fontSize: 15 }}>⇄</button>
        </div>
      )}

      {/* Floating tool cluster — one elegant vertical pill-shaped toolbar */}
      <div style={toolbar}>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => fitFn.current && fitFn.current()} style={toolBtn} title="התאם לתצוגה"><Maximize size={17} /><span style={toolLabel}>התאם</span></button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(1)} style={toolBtn} title="הגדל"><ZoomIn size={17} /><span style={toolLabel}>הגדל</span></button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(-1)} style={toolBtn} title="הקטן"><ZoomOut size={17} /><span style={toolLabel}>הקטן</span></button>
        {tools && <div style={toolDivider} />}
        {tools}
      </div>

      {/* Selection action bar — primary connect/disconnect UX */}
      {selectedId && !busy && !connectFromId && (() => {
        const sel = byId[selectedId];
        if (!sel) return null;
        const p = posOf(sel);
        const bx = view.tx + (p.x + wOf(sel) / 2) * view.scale;
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

// Single elegant vertical pill toolbar — icons only, subtle shadow.
const toolbar = {
  position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 2,
  background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  borderRadius: 22, padding: 6, boxShadow: '0 4px 16px rgba(90,60,25,0.14)', border: '1px solid rgba(240,228,208,0.9)',
};
const toolBtn = {
  width: 48, minHeight: 44, borderRadius: 14, border: 'none', background: 'transparent',
  color: FOCUS.ink, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '5px 0',
};
// 10px caption under each toolbar icon so buttons are tellable apart on
// mobile (native `title` tooltips never surface in the webview).
const toolLabel = { fontSize: 10, fontWeight: 700, lineHeight: 1 };
const toolDivider = { height: 1, background: 'rgba(140,110,70,0.14)', margin: '3px 7px' };
// Round buttons of the selected-edge pill (✕ נתק / ⇄ חבר למקום אחר).
// 34px keeps them comfortably tappable without covering the line itself.
const edgePillBtn = {
  width: 34, height: 34, borderRadius: '50%', border: 'none', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 900, lineHeight: 1, cursor: 'pointer', fontFamily: "'Rubik', system-ui, sans-serif",
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

// One node — fixed-size rounded card + whole-rect connect target.
// Memoized on primitives so a drag only re-renders this node.
const MapNode = React.memo(function MapNode({ x, y, w, h, node, sel, armColor, simple, highlight, childrenIdx, expanded, isTaskDone }) {
  const radius = node.node_type === 'root' ? 999 : 16;
  const ring = armColor || FOCUS.edgeSel;
  return (
    <foreignObject x={x - HIT_PAD} y={y - HIT_PAD} width={w + HIT_PAD * 2} height={h + HIT_PAD * 2} style={{ overflow: 'visible' }}>
      <div data-node-id={node.id} style={{ padding: HIT_PAD, width: w + HIT_PAD * 2, boxSizing: 'border-box', cursor: 'grab', userSelect: 'none', touchAction: 'none', fontFamily: "'Rubik', system-ui, sans-serif" }}>
        <div style={{ position: 'relative', width: w, height: h }}>
          {/* Selection = ring in the arm color + a subtle shadow lift, with
              NO change to the card fill. Highlight = green pulse ring. */}
          <div style={{
            position: 'relative', width: '100%', height: '100%', borderRadius: radius,
            outline: sel ? `2px solid ${ring}` : 'none', outlineOffset: 2,
            boxShadow: highlight ? '0 0 0 3px rgba(22,163,74,0.55)' : (sel ? CARD_LIFT : 'none'),
            transition: 'box-shadow .14s ease',
          }}>
            {simple
              ? <SimpleCard node={node} armColor={armColor} isTaskDone={isTaskDone} />
              : <NodeCard node={node} armColor={armColor} children={childrenIdx} expanded={expanded} isTaskDone={isTaskDone} />}
          </div>
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

// One edge grab-dot: a wide invisible hit circle + a small visible dot.
// Both radii are divided by the view scale so the target stays a constant
// ~36px across on screen at any zoom level.
function EdgeDot({ tag, m, scale, color, on }) {
  const s = Math.max(0.25, scale);
  return (
    <g>
      <circle data-edge-dot={tag} cx={m.x} cy={m.y} r={18 / s} fill="transparent" style={{ pointerEvents: 'all', cursor: 'pointer' }} />
      <circle cx={m.x} cy={m.y} r={(on ? 7 : 4.5) / s} fill={on ? SEL_EDGE : color} stroke="#fff" strokeWidth={1.5 / s} style={{ pointerEvents: 'none' }} />
    </g>
  );
}

// Small pill badge used under a collapsed-branch title.
function CountPill({ text, color }) {
  return (
    <span style={{ display: 'inline-block', maxWidth: '100%', background: hexAlpha(color, 0.12), color: darken(color, 0.62), borderRadius: 999, padding: '2px 9px', fontSize: 10.5, fontWeight: 800, ...clamp1 }}>{text}</span>
  );
}

// Simple mode: title-only compact card, arm color kept.
function SimpleCard({ node, armColor, isTaskDone }) {
  if (node.node_type === 'root') {
    return <div style={{ width: '100%', height: '100%', background: FOCUS.orange, color: '#fff', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', fontSize: 13.5, fontWeight: 800, boxShadow: '0 4px 12px rgba(255,111,32,0.38)', boxSizing: 'border-box' }}><span style={clamp1}>{node.title || 'שורש'}</span></div>;
  }
  const done = node.node_type === 'task' && isTaskDone(node);
  const accent = node.is_fear_task ? '#E24B4A' : (armColor || FOCUS.border);
  return (
    <div style={{ width: '100%', height: '100%', background: '#fff', border: `1px solid ${FOCUS.border}`, borderRight: `3px solid ${accent}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', boxShadow: CARD_SHADOW, fontSize: 12.5, fontWeight: 700, color: armColor ? darken(armColor) : FOCUS.ink, boxSizing: 'border-box', opacity: done ? 0.55 : 1, textDecoration: done ? 'line-through' : 'none' }}>
      <span style={clamp1}>{node.title || (node.node_type === 'task' ? 'משימה' : 'מושג')}</span>
    </div>
  );
}

function NodeCard({ node, armColor, children, expanded, isTaskDone }) {
  // Root stays a solid orange pill — no arm accent, distinctly larger.
  if (node.node_type === 'root') {
    return (
      <div style={{ width: '100%', height: '100%', background: FOCUS.orange, color: '#fff', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 18px', fontSize: 15, fontWeight: 800, boxShadow: '0 5px 14px rgba(255,111,32,0.4)', boxSizing: 'border-box' }}>
        <span style={clamp2}>{node.title || 'שורש'}</span>
      </div>
    );
  }
  // 4px RIGHT accent in the arm color (fear tasks keep their red accent).
  const armAccent = armColor ? { borderRight: `4px solid ${armColor}` } : null;
  const armDark = armColor ? darken(armColor) : FOCUS.ink;
  if (node.node_type === 'task') {
    const done = isTaskDone(node);
    const st = urgencyStyle(node);
    return (
      <div style={{ ...st, ...(node.is_fear_task ? null : armAccent), width: '100%', height: '100%', borderRadius: 16, padding: '10px 14px', boxShadow: CARD_SHADOW, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, opacity: done ? 0.6 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, border: `2px solid ${done ? '#16a34a' : (armColor || FOCUS.orange)}`, background: done ? '#16a34a' : 'transparent', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : ''}</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: FOCUS.ink, textDecoration: done ? 'line-through' : 'none', ...clamp2 }}>{node.title || 'משימה'}</span>
        </div>
        {node.is_fear_task && <div style={{ fontSize: 9.5, color: '#C0392B', fontWeight: 800, marginRight: 24 }}>🔥 אומץ</div>}
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
    const pill = branches > 0
      ? `${branches} מושגים${tasks.length ? ` · ${tasks.length} משימות` : ''}`
      : `${tasks.length} משימות`;
    return (
      <div style={{ width: '100%', height: '100%', background: '#fff', border: `1px solid ${FOCUS.border}`, ...armAccent, borderRadius: 16, padding: '10px 14px', textAlign: 'center', boxShadow: CARD_SHADOW, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: armDark, maxWidth: '100%', ...clamp2 }}>{node.title}</div>
        <CountPill text={pill} color={armColor || '#B48A5A'} />
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', background: '#fff', border: `1px solid ${FOCUS.border}`, ...armAccent, borderRadius: 16, padding: '10px 14px', boxShadow: CARD_SHADOW, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: armDark, textAlign: 'center', ...clamp2 }}>{node.title}</div>
      {tasks.length > 0 ? (
        <div>
          <div style={{ height: 4, borderRadius: 3, background: '#F1E7D8', overflow: 'hidden' }}>
            <div style={{ width: `${taskPct * 100}%`, height: '100%', background: armColor || FOCUS.orange }} />
          </div>
          {hasMetric && (
            <div style={{ height: 4, borderRadius: 3, background: '#F1E7D8', marginTop: 4, overflow: 'hidden' }}>
              <div style={{ width: `${metricPct * 100}%`, height: '100%', background: '#16a34a' }} />
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 9.5, color: FOCUS.muted, textAlign: 'center' }}>ריק — הוסף משימה</div>
      )}
    </div>
  );
}
