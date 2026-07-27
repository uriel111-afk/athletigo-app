import { useCallback, useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════════════════════════════
// Tap to select, tap again (or hold) to drag
// ═══════════════════════════════════════════════════════════════════
// Replaces the @dnd-kit drag on the personal day screen. The library could not
// express this model: its activation constraints are per-SENSOR and global to
// the context, while this needs the activation to depend on the state of the
// item under the finger — immediate for an armed item, 400ms for anything else.
//
// Three states, exactly as the brief describes them:
//
//   normal    nothing selected. A touch scrolls the page like any other.
//   selected  one tap. The item is outlined and slightly enlarged; the page
//             still scrolls. A SECOND tap on the same item arms it.
//   dragging  entered by holding for LONG_PRESS_MS, or by touching an armed
//             item. A ghost follows the finger, finger-scrolling is blocked
//             for the duration, and the grid auto-scrolls near a screen edge.
//
// Why a tap can never become an accidental drag: a gesture that travels more
// than SLOP_PX before the long-press timer fires cancels the timer AND the tap.
// That movement is a scroll, and a scroll must never place work in the day.
//
// Drop targets are found with elementFromPoint over `[data-slot]`, the same
// attribute the calendar already renders — so nothing needs registering and a
// slot that scrolls into view mid-drag is immediately droppable. The ghost is
// pointerEvents:none, or it would be the only thing elementFromPoint ever hit.
//
// Position updates are written straight to the DOM through refs. Putting the
// pointer coordinates in React state would re-render the whole screen on every
// move event, and the screen holds the calendar and the drawer.
// ═══════════════════════════════════════════════════════════════════

export const LONG_PRESS_MS = 400;
export const SLOP_PX = 10;
const EDGE_PX = 78;          // how close to an edge auto-scroll kicks in
const EDGE_SPEED = 14;       // px per frame at the very edge

export function useTapDrag({ onDrop, onCancelSelect } = {}) {
  const [selectedId, setSelectedId] = useState(null);
  const [armedId, setArmedId] = useState(null);
  const [dragNode, setDragNode] = useState(null);   // null ⇢ not dragging

  const ghostRef = useRef(null);
  const gesture = useRef(null);     // { node, x0, y0, moved }
  const timer = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  const overEl = useRef(null);
  const raf = useRef(0);
  const dragging = useRef(false);
  const dragNodeRef = useRef(null);
  const selectedRef = useRef(null);

  // Mirrors of the two pieces of state the window listeners read. Kept in refs
  // so the listeners can be registered ONCE: re-subscribing them on every
  // selection change would drop the gesture in progress.
  useEffect(() => { dragNodeRef.current = dragNode; }, [dragNode]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  // Same reason for the callback: a consumer that rebuilds onDrop each render
  // must not tear the listeners down mid-drag.
  const dropRef = useRef(onDrop);
  useEffect(() => { dropRef.current = onDrop; }, [onDrop]);

  // ── highlight of the slot under the finger ──────────────────────
  // Written imperatively for the same reason as the ghost: this changes many
  // times per second and must not re-render the tree. React owns the element's
  // inline styles, so only `outline` is touched and it is always cleared.
  const setOver = (el) => {
    if (overEl.current === el) return;
    if (overEl.current) {
      overEl.current.style.outline = '';
      overEl.current.style.outlineOffset = '';
    }
    overEl.current = el;
    if (el) {
      el.style.outline = '2px dashed #FF6F20';
      el.style.outlineOffset = '-2px';
    }
  };

  const slotUnder = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-slot]') : null;
  };

  // ── auto-scroll while dragging ──────────────────────────────────
  // The hour grid scrolls when the finger is over it; otherwise the window
  // does, so a drag that starts in the drawer can still reach the calendar
  // above it even though finger-scrolling is blocked.
  const step = useCallback(() => {
    if (!dragging.current) return;
    const { y } = pointer.current;
    const h = window.innerHeight;
    let dir = 0;
    if (y < EDGE_PX) dir = -1;
    else if (y > h - EDGE_PX) dir = 1;

    if (dir) {
      const near = dir < 0 ? (EDGE_PX - y) : (y - (h - EDGE_PX));
      const amount = Math.ceil(EDGE_SPEED * Math.min(1, Math.max(0, near / EDGE_PX)));
      const grid = document.querySelector('[data-hour-grid]');
      const r = grid ? grid.getBoundingClientRect() : null;
      const overGrid = r && pointer.current.x >= r.left && pointer.current.x <= r.right
        && y >= r.top - EDGE_PX && y <= r.bottom + EDGE_PX;

      if (overGrid) {
        const before = grid.scrollTop;
        grid.scrollTop = before + dir * amount;
        // At the end of the grid, hand the scroll back to the page.
        if (grid.scrollTop === before) window.scrollBy(0, dir * amount);
      } else {
        window.scrollBy(0, dir * amount);
      }
      // The grid moved under a stationary finger, so the target changed.
      setOver(slotUnder(pointer.current.x, y));
    }
    raf.current = requestAnimationFrame(step);
  }, []);

  const stopDrag = useCallback(() => {
    dragging.current = false;
    cancelAnimationFrame(raf.current);
    setOver(null);
    document.body.style.userSelect = '';
    setDragNode(null);
    // Back to normal, not back to selected: the item has been placed, and a
    // leftover outline on it reads as "still holding this".
    setSelectedId(null);
    setArmedId(null);
  }, []);

  const beginDrag = useCallback((node) => {
    dragging.current = true;
    document.body.style.userSelect = 'none';
    setDragNode(node);
    setSelectedId(node.id);
    setArmedId(null);
    raf.current = requestAnimationFrame(step);
  }, [step]);

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  // ── the one gesture, from pointerdown to pointerup ──────────────
  useEffect(() => {
    const move = (e) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      const g = gesture.current;

      if (dragging.current) {
        if (ghostRef.current) {
          ghostRef.current.style.left = `${e.clientX}px`;
          ghostRef.current.style.top = `${e.clientY}px`;
        }
        setOver(slotUnder(e.clientX, e.clientY));
        return;
      }
      if (!g) return;
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > SLOP_PX) {
        g.moved = true;        // a scroll: no long press, and no tap on release
        clearTimer();
      }
    };

    const up = () => {
      clearTimer();
      const g = gesture.current;
      gesture.current = null;

      if (dragging.current) {
        const target = overEl.current;
        const node = dragNodeRef.current;
        const slot = target ? target.getAttribute('data-slot') : null;
        stopDrag();
        if (slot && node && dropRef.current) dropRef.current(node, slot);
        return;
      }
      if (!g || g.moved) return;

      // A clean tap: select, or arm an already-selected item.
      if (selectedRef.current !== g.node.id) { setSelectedId(g.node.id); setArmedId(null); }
      else setArmedId(g.node.id);
    };

    // Non-passive, so preventDefault actually stops the page from scrolling
    // under a dragging finger. Registered once and gated on `dragging`.
    const blockTouch = (e) => { if (dragging.current) e.preventDefault(); };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', blockTouch, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', blockTouch);
      clearTimer();
      cancelAnimationFrame(raf.current);
    };
  }, [stopDrag]);

  // Put the ghost under the finger on the frame it appears, or it would flash
  // at the top-left corner before the first pointermove moves it.
  useEffect(() => {
    if (dragNode && ghostRef.current) {
      ghostRef.current.style.left = `${pointer.current.x}px`;
      ghostRef.current.style.top = `${pointer.current.y}px`;
    }
  }, [dragNode]);

  // ── what an item hands back ─────────────────────────────────────
  const itemProps = useCallback((node) => ({
    onPointerDown: (e) => {
      if (dragging.current) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      gesture.current = { node, x0: e.clientX, y0: e.clientY, moved: false };
      clearTimer();
      if (armedId === node.id) { beginDrag(node); return; }   // already armed
      timer.current = setTimeout(() => {
        timer.current = null;
        if (gesture.current && !gesture.current.moved) beginDrag(node);
      }, LONG_PRESS_MS);
    },
  }), [armedId, beginDrag]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setArmedId(null);
    if (onCancelSelect) onCancelSelect();
  }, [onCancelSelect]);

  return {
    selectedId, armedId, dragNode, ghostRef,
    dragging: !!dragNode,
    itemProps, clearSelection,
    isSelected: (id) => selectedId === id,
    isArmed: (id) => armedId === id,
  };
}
