import { useRef } from 'react';
import { toast } from 'sonner';
import { useSmartBackHandler } from '@/hooks/useSmartBack';

const GUARD_MSG = 'התרגיל פעיל — עצור אותו קודם, או צא עם לחיצה כפולה';

// Back guard for a foreground-running exercise (breathing / tabata /
// intervals). While `active`, a first back press shows a toast and does
// NOT stop or exit; a second press within 2s calls `onLeave()` — which
// leaves the screen WITHOUT stopping (the engine keeps running in the
// background with its notification). Registered on the shared SmartBack
// stack, so the App-level Android handler routes the press here (and a
// modal opened on top still closes first — LIFO).
export function useExerciseBackGuard(active, onLeave) {
  const lastRef = useRef(0);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  useSmartBackHandler(!!active, () => {
    const now = Date.now();
    if (now - lastRef.current < 2000) {
      lastRef.current = 0;
      if (typeof onLeaveRef.current === 'function') onLeaveRef.current();
    } else {
      lastRef.current = now;
      toast(GUARD_MSG);
    }
  });
}
