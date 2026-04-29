import { useState, useEffect } from 'react';

// Track viewport dimensions and re-render on resize. Used by
// surfaces that need to flip layout/values at known breakpoints
// (e.g. responsive chart heights, mobile-only paddings).
//
// SSR-safe: falls back to 1024×768 when `window` is undefined,
// then catches up on the first effect tick. The listener is torn
// down on unmount.
export function useWindowSize() {
  const [size, setSize] = useState({
    width:  typeof window !== 'undefined' ? window.innerWidth  : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  useEffect(() => {
    const handler = () => setSize({
      width:  window.innerWidth,
      height: window.innerHeight,
    });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return size;
}

export default useWindowSize;
