import { useEffect, useRef } from 'react';

export function useKeepScreenAwake(enabled) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          const sentinel = await navigator.wakeLock.request('screen');
          if (!cancelled) {
            sentinelRef.current = sentinel;
            sentinel.addEventListener('release', () => {
              sentinelRef.current = null;
            });
          } else {
            sentinel.release();
          }
        }
      } catch (e) {
        console.warn('Wake lock failed:', e);
      }
    }

    acquire();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinelRef.current) {
        try { sentinelRef.current.release(); } catch {}
        sentinelRef.current = null;
      }
    };
  }, [enabled]);
}
