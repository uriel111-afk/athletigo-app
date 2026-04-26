import { useEffect, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';

// Thin top-of-screen progress bar — orange fill on a beige rail.
// Usage modes:
//   <LoadingProgress isLoading={someBoolean} />
//   <LoadingProgress />   ← omit isLoading and the bar tracks every
//                            in-flight react-query automatically
//                            (recommended at App.jsx root).
//
// The progress is faked: jump to 30% immediately, ease through 60/80/90
// while the real work runs, snap to 100% the moment loading flips off,
// then fade out. This pattern is the YouTube/GitHub style — it gives
// the user the *feeling* of motion without exposing how much work is
// truly left (which we don't actually know).
export default function LoadingProgress({ isLoading }) {
  // Auto-mode: when isLoading isn't passed, fall back to the global
  // react-query fetching counter. >0 means at least one query is busy.
  const queryFetchCount = useIsFetching();
  const loading = typeof isLoading === 'boolean' ? isLoading : queryFetchCount > 0;

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (loading) {
      // Stagger the fake progress so the bar visibly moves even when
      // a query resolves quickly. Each step is shorter than the last
      // so we asymptote toward 90% rather than racing to 100% early.
      setProgress(30);
      const t1 = setTimeout(() => setProgress(60), 300);
      const t2 = setTimeout(() => setProgress(80), 800);
      const t3 = setTimeout(() => setProgress(90), 1500);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    // Loading ended: snap to 100%, then reset to 0 once the fade-out
    // transition has played. The 0 state hides the bar entirely.
    setProgress(100);
    const t = setTimeout(() => setProgress(0), 400);
    return () => clearTimeout(t);
  }, [loading]);

  if (progress === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: 3,
        zIndex: 99999,
        background: '#F0E4D0',
        opacity: progress === 100 ? 0 : 1,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          background: '#FF6F20',
          width: `${progress}%`,
          borderRadius: '0 2px 2px 0',
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}
