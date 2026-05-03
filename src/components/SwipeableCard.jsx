import React, { useEffect, useRef, useState } from 'react';

const THRESHOLD = 80;          // px the card travels to reveal actions
const OPEN_OVERSHOOT = 20;     // extra rubber-band beyond THRESHOLD
const SWIPE_DETECT_PX = 6;     // how much movement counts as "a swipe"

// Reusable swipe-to-reveal card. Renders children on a layer that
// translates left while the user drags; the action layer underneath
// (edit + delete buttons) becomes visible. When `disabled` is true,
// the wrapper renders children directly with no gesture handling so
// trainee surfaces stay tap-only.
//
// Outside-tap-to-close: a window-level pointerdown listener clears the
// open state when the user taps anywhere outside this card.
export default function SwipeableCard({
  children, onEdit, onDelete, disabled = false,
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(null);
  const swipedRef = useRef(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (offsetX === 0) return undefined;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOffsetX(0);
      }
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [offsetX]);

  if (disabled) return children;

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
    swipedRef.current = false;
  };

  const handleTouchMove = (e) => {
    if (!isDragging || startX.current == null) return;
    const diff = e.touches[0].clientX - startX.current;
    if (Math.abs(diff) > SWIPE_DETECT_PX) swipedRef.current = true;
    if (diff < 0) {
      setOffsetX(Math.max(diff, -(THRESHOLD + OPEN_OVERSHOOT)));
    } else if (offsetX < 0) {
      // Allow closing via right-swipe when already open.
      setOffsetX(Math.min(0, offsetX + diff));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setOffsetX((cur) => (cur < -THRESHOLD / 2 ? -THRESHOLD : 0));
    startX.current = null;
  };

  // After a swipe, the synthetic click event still fires on touchend.
  // Suppress it in the capture phase so the inner card's tap-handler
  // doesn't navigate / activate. The next tap (now that the card is
  // open) closes the card and the child handler fires from then on.
  const handleClickCapture = (e) => {
    if (offsetX !== 0 || swipedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      setOffsetX(0);
      swipedRef.current = false;
    }
  };

  const close = () => setOffsetX(0);

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 12 }}
    >
      {/* Swipe hint — small vertical bar on the leading edge */}
      <div style={{
        position: 'absolute',
        left: 6, top: '35%', bottom: '35%',
        width: 3, borderRadius: 999,
        background: '#E5E7EB',
        zIndex: 2,
        pointerEvents: 'none',
      }} />

      {/* Action buttons revealed on swipe */}
      <div style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: THRESHOLD,
        display: 'flex',
        alignItems: 'stretch',
      }}>
        {onEdit && (
          <button
            type="button"
            onClick={() => { close(); onEdit(); }}
            style={{
              flex: 1,
              background: '#3B82F6',
              border: 'none',
              color: 'white',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 18 }}>✏️</span>
            עריכה
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => { close(); onDelete(); }}
            style={{
              flex: 1,
              background: '#EF4444',
              border: 'none',
              color: 'white',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              borderRadius: '0 0 0 12px',
            }}
          >
            <span style={{ fontSize: 18 }}>🗑️</span>
            מחיקה
          </button>
        )}
      </div>

      {/* Card content — slides left to reveal buttons */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClickCapture={handleClickCapture}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease',
          position: 'relative',
          zIndex: 1,
          background: 'white',
          borderRadius: 12,
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  );
}
