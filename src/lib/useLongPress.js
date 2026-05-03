import { useRef, useCallback } from "react";

// 600ms long-press detector. Returns the four pointer/touch handlers
// the consumer spreads onto the target element. The callback fires
// once per press; lifting / leaving / dragging cancels the timer
// without firing.
//
// Usage:
//   const longPress = useLongPress(() => setRenaming(true));
//   <h3 {...longPress}>{section.name}</h3>
export function useLongPress(callback, ms = 600) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  const start = useCallback(() => {
    firedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      callback?.();
    }, ms);
  }, [callback, ms]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchMove: stop,
    onTouchCancel: stop,
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
  };
}

export default useLongPress;
