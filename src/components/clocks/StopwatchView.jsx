import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw, Flag, ChevronRight } from 'lucide-react';
import { useClock } from '@/contexts/ClockContext';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import {
  BRAND, FN, FL, C3, fmtStopwatch,
  SOUND_START, SOUND_RESET, unlockAudio,
} from '@/components/clocks/clockUi';

/**
 * StopwatchView — the clocks tab's stopwatch, lifted out of Clocks.jsx
 * so the SAME face can also be raised as a global overlay from the plan
 * screen. The tab renders this identical component.
 *
 * Moved verbatim. Only the props are new:
 *
 *   onBack        replaces the hard-wired navigate('/clocks') so a plan
 *                 run closes its overlay and stays on the sheet, and
 *                 gives the READY screen a way out — the overlay now
 *                 opens there, not on a running clock.
 *   exerciseName  named above the figures while it runs.
 *   bigDigits     raises the running figure for the overlay.
 */

const MinimizeBtn = ({ onClick }) => (
  <button onClick={onClick} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
      <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
    </svg>
  </button>
);

/* ═══ STOPWATCH ═══ */
function StopwatchView({ onMinimize, onBack, exerciseName = null, bigDigits = false }) {
  const navigate = useNavigate();
  const { startStopwatch, pause, resume, reset, lapStopwatch, display, isRunning, activeClock, laps } = useClock();
  const { setLiveTimer: setLiveTimerAT, setIsMinimized: setIsMinimizedAT, isMinimized: isMinimizedAT } = useActiveTimer();
  // Gate the full-screen overlay on the *bar* minimize flag so that
  // TimerFooterBar.handleExpand (which flips this flag back to false)
  // returns the user to the running overlay — not the setup screen.
  const active = activeClock === 'stopwatch' && !isMinimizedAT;

  // Mirror minimizeTimer (Clocks.jsx) state writes EXACTLY so the bar
  // gets the same snapshot the proven minimize button writes. Only the
  // navigation destination differs — back goes to /clocks, the original
  // minimize button goes to the role home.
  const handleClockBack = (e) => {
    e.stopPropagation();
    // From the READY screen no clock is running, so skip the snapshot
    // write — it would surface a phantom footer bar.
    if (activeClock === 'stopwatch') {
      setLiveTimerAT({ type: 'stopwatch', display: fmtStopwatch(display), phase: 'סטופר', info: null, paused: !isRunning });
      setIsMinimizedAT(true);
    }
    // A plan run closes its overlay and stays on the sheet. Only the
    // clocks tab falls through to the original navigate.
    if (onBack) { onBack(); return; }
    navigate('/clocks');
  };

  if (active) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center" dir="rtl"
        style={{ backgroundColor: BRAND, padding: '20px 16px 100px', gap: 16, position: 'fixed' }}>
        <button
          onClick={handleClockBack}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          aria-label="חזרה"
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 5,
            width: 44, height: 44, borderRadius: 12,
            background: '#FFFFFF', border: '1px solid #F0E4D0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ChevronRight size={24} color="#1a1a1a" />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MinimizeBtn onClick={onMinimize} />
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' }}>STOPWATCH</div>
        </div>
        {exerciseName && (
          <div style={{
            fontSize: 16, fontWeight: 700, fontFamily: FL, color: '#FFF',
            textAlign: 'center', maxWidth: 320, lineHeight: 1.3,
          }}>{exerciseName}</div>
        )}
        <div className="tabular-nums leading-none" style={{ fontSize: bigDigits ? 'clamp(60px, 17vw, 108px)' : 'clamp(52px, 15vw, 96px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontFamily: FN, color: '#FFF', letterSpacing: -2, lineHeight: 1 }}>{fmtStopwatch(display)}</div>
        {laps.length > 0 && (
          <div className="w-full rounded-xl p-3 max-h-28 overflow-y-auto" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            {laps.map((l, i) => (
              <div key={i} className="flex justify-between py-1">
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: FL, color: 'rgba(255,255,255,0.7)' }}>הקפה {i + 1}</span>
                <span className="tabular-nums" style={{ fontSize: 16, fontWeight: 700, fontFamily: FN, color: '#FFF' }}>{fmtStopwatch(l)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex w-full" style={{ gap: 10 }}>
          <button onClick={() => { SOUND_RESET(); reset(); }} className="flex items-center justify-center active:scale-90 transition-transform"
            style={{ flex: 1, height: 56, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', fontSize: 16, fontWeight: 700, fontFamily: FL, color: '#FFF', border: 'none' }}>
            <RotateCcw className="w-5 h-5 ml-1.5" />אפס
          </button>
          {isRunning && (
            <button onClick={lapStopwatch} className="flex items-center justify-center active:scale-90 transition-transform"
              style={{ flex: 1, height: 56, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', fontSize: 16, fontWeight: 700, fontFamily: FL, color: '#FFF', border: 'none' }}>
              <Flag className="w-5 h-5 ml-1.5" />הקפה
            </button>
          )}
          {isRunning ? (
            <button onClick={() => { pause(); }} className="flex items-center justify-center active:scale-95 transition-transform"
              style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 700, fontFamily: FL, color: BRAND }}>
              <Pause className="w-6 h-6 ml-2" />השהה
            </button>
          ) : (
            <button onClick={() => { SOUND_START(); resume(); }} className="flex items-center justify-center active:scale-95 transition-transform"
              style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 700, fontFamily: FL, color: BRAND }}>
              <Play className="w-6 h-6 ml-2" />המשך
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div dir="rtl" style={{ padding: '16px 16px 100px', position: 'relative' }} className="flex flex-col items-center gap-5">
      {/* The READY screen is where a plan shortcut now lands, so it
          needs a way out. The clocks tab passes no onBack and keeps
          its own mode navigation — nothing changes there. */}
      {onBack && (
        <button
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          aria-label="חזרה"
          style={{
            position: 'absolute', top: 8, left: 8, zIndex: 5,
            width: 44, height: 44, borderRadius: 12,
            background: '#FFFFFF', border: '1px solid #F0E4D0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ChevronRight size={24} color="#1a1a1a" />
        </button>
      )}
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: C3, letterSpacing: 2, textTransform: 'uppercase', marginTop: 16 }}>STOPWATCH</div>
      {exerciseName && (
        <div style={{
          fontSize: 15, fontWeight: 700, fontFamily: FL, color: '#1a1a1a',
          textAlign: 'center', maxWidth: 320, lineHeight: 1.3, marginTop: -8,
        }}>{exerciseName}</div>
      )}
      <div className="text-center tabular-nums leading-none" style={{ fontSize: 80, fontWeight: 900, fontFamily: FN, color: '#D1D5DB' }}>00:00.00</div>
      <button onClick={() => { unlockAudio(); SOUND_START(); startStopwatch(); }} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
        style={{ height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
        <Play className="w-6 h-6 ml-2" />התחל
      </button>
    </div>
  );
}


export default StopwatchView;
