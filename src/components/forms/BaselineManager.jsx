import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import BaselineFormDialog, { BASELINE_OPEN_EVENT } from "./BaselineFormDialog";

// Multi-instance manager. Listens to the window-level open event,
// dedups by traineeId (re-opening for the same person restores the
// existing form rather than spawning a duplicate), caps at 5 parallel
// forms, and renders one <BaselineFormDialog /> per open session plus
// a stacked pill row for the minimized ones. Mounted once at App.jsx
// root so forms survive every route change.
const MAX_OPEN = 5;

let nextId = 1;
const newId = () => `b${nextId++}`;

export default function BaselineManager() {
  // openBaselines: [{ id, traineeId, traineeName, editMode, existingRows, viewOnly, isMinimized }]
  const [openBaselines, setOpenBaselines] = useState([]);

  // Per-pill drag offsets, keyed by baseline id so each minimized
  // form can be dragged independently. Cleared lazily — when a form
  // closes, we drop its entry so the map doesn't grow forever.
  const [pillOffsets, setPillOffsets] = useState({});
  const pillDragRef = useRef({ id: null, startX: 0, startY: 0, baseX: 0, baseY: 0, moved: false });

  // ── Open / close / minimize toggles ────────────────────────────
  const openBaseline = useCallback((detail) => {
    const traineeId = detail?.traineeId ?? null;
    const traineeName = detail?.traineeName ?? '';
    const editMode = !!detail?.editMode;
    const viewOnly = !!detail?.viewOnly;
    const existingRows = detail?.existingRows ?? null;

    setOpenBaselines(prev => {
      // Edit/view sessions are scoped to a specific row set, so they
      // can coexist with a "new" session for the same trainee. New
      // sessions dedup on traineeId so reopening from another page
      // restores the existing draft instead of double-stacking.
      if (!editMode && !viewOnly && traineeId) {
        const existing = prev.find(b => b.traineeId === traineeId && !b.editMode && !b.viewOnly);
        if (existing) {
          return prev.map(b => b.id === existing.id ? { ...b, isMinimized: false } : b);
        }
      }
      if (prev.length >= MAX_OPEN) {
        toast.error('מקסימום 5 טפסים פתוחים. סגור אחד קודם.');
        return prev;
      }
      return [...prev, {
        id: newId(),
        traineeId,
        traineeName,
        editMode, viewOnly, existingRows,
        isMinimized: false,
      }];
    });
  }, []);

  const closeBaseline = useCallback((id) => {
    setOpenBaselines(prev => prev.filter(b => b.id !== id));
    setPillOffsets(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const toggleMinimize = useCallback((id) => {
    setOpenBaselines(prev =>
      prev.map(b => b.id === id ? { ...b, isMinimized: !b.isMinimized } : b)
    );
  }, []);

  // ── Window event wiring ────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => openBaseline(e.detail || {});
    window.addEventListener(BASELINE_OPEN_EVENT, handler);
    return () => window.removeEventListener(BASELINE_OPEN_EVENT, handler);
  }, [openBaseline]);

  // ── Pill drag handlers ─────────────────────────────────────────
  const onPillPointerDown = (id, e) => {
    if (e.button && e.button !== 0) return;
    const cur = pillOffsets[id] || { x: 0, y: 0 };
    pillDragRef.current = {
      id, moved: false,
      startX: e.clientX, startY: e.clientY,
      baseX: cur.x, baseY: cur.y,
    };
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
  };

  useEffect(() => {
    const handleMove = (e) => {
      const d = pillDragRef.current;
      if (!d.id) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      // 3px threshold so a quick tap still counts as "click to restore".
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      const w = window.innerWidth, h = window.innerHeight;
      const next = {
        x: Math.max(-(w - 200), Math.min(w - 200, d.baseX + dx)),
        y: Math.max(-(h - 80), Math.min(0, d.baseY + dy)),
      };
      setPillOffsets(prev => ({ ...prev, [d.id]: next }));
    };
    const handleUp = () => { pillDragRef.current.id = null; };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────
  // Pills are stacked bottom-up: the first minimized form sits at
  // bottom 80, each subsequent one moves up by 44px. Order is the
  // open order (filter preserves it) so the layout is predictable.
  const minimized = openBaselines.filter(b => b.isMinimized);

  return (
    <>
      {openBaselines.map((baseline, index) => (
        <BaselineFormDialog
          key={baseline.id}
          traineeId={baseline.traineeId}
          traineeName={baseline.traineeName}
          editMode={baseline.editMode}
          existingRows={baseline.existingRows}
          viewOnly={baseline.viewOnly}
          isMinimized={baseline.isMinimized}
          onClose={() => closeBaseline(baseline.id)}
          onMinimize={() => toggleMinimize(baseline.id)}
          stackIndex={index}
        />
      ))}

      {minimized.map((baseline, index) => {
        const offset = pillOffsets[baseline.id] || { x: 0, y: 0 };
        const labelName = baseline.traineeName || 'בייסליין';
        return (
          <button
            key={baseline.id}
            onPointerDown={(e) => onPillPointerDown(baseline.id, e)}
            onClick={() => {
              // Drag end fires a click — ignore it so dragging the
              // pill doesn't pop the dialog open mid-gesture.
              if (pillDragRef.current.moved && pillDragRef.current.id === null) {
                pillDragRef.current.moved = false;
                return;
              }
              if (pillDragRef.current.moved) return;
              toggleMinimize(baseline.id);
            }}
            aria-label={`הרחב את הטופס של ${labelName}`}
            style={{
              position: 'fixed',
              bottom: 80 + (index * 44),
              left: 16,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              zIndex: 12500,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 12px',
              borderRadius: 20,
              border: '1.5px solid #F0E4D0',
              backgroundColor: '#FFFFFF',
              color: '#1A1A1A',
              fontSize: 13, fontWeight: 500,
              cursor: 'grab',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
              touchAction: 'none',
              maxWidth: 200,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span aria-hidden style={{ color: '#FF6F20', fontSize: 14 }}>⚡</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {labelName}
            </span>
          </button>
        );
      })}
    </>
  );
}
