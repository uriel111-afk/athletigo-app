import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react';
import { useClock } from '@/contexts/ClockContext';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import ScrollPickerPopup, { PREP_OPTIONS } from '@/components/ScrollPickerPopup';
import {
  BRAND, FN, FL, C1, C2, C3, BRD, BG2,
  fmt, fmtMMSS, HoldButton, MIN_COL_OPTIONS, SEC_COL_OPTIONS,
  SOUND_RESET, SOUND_TICK, SOUND_ALERT, SOUND_TRIPLE_BELL,
  unlockAudio, playSoftBreath,
} from './clockUi';

/**
 * TimerView — the countdown clock, MOVED here verbatim from
 * src/pages/Clocks.jsx. Not rewritten: the setup columns, the prep
 * control, the ring, the beep schedule, the pause/resume/reset row and
 * every constant are the originals.
 *
 * It is a file of its own so the SAME component can render in two
 * places — the clocks tab, which still imports it, and the global
 * overlay the plan screen raises. One component, one face, one set of
 * controls, wherever it appears.
 *
 * Two things were ADDED, both optional and both inert for the clocks
 * tab, which passes neither:
 *
 *   onBack          replaces the hard-wired navigate('/clocks') in the
 *                   running screen's back button. A plan run closes
 *                   the overlay and returns to the sheet IN PLACE
 *                   instead of navigating anywhere.
 *   initialSeconds  seeds the setup columns and the prep control from
 *   initialPrepSec  the exercise's own values. Local component state,
 *                   exactly like a trainee turning the wheels by hand,
 *                   so nothing is persisted to their saved settings.
 *   bigDigits       raises the running figure for the overlay.
 */
function TimerCol({ label, value, onChange, max, options, title }) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <HoldButton onClick={() => onChange(Math.min(max, value + 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: BRAND, color: '#FFF', fontSize: 22, fontWeight: 700, border: 'none' }}>+</HoldButton>
        <div onClick={() => setPicking(true)} className="tabular-nums" style={{ fontSize: 48, fontWeight: 900, fontFamily: FN, color: C1, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 4, textDecorationColor: '#D1D5DB' }}>{String(value).padStart(2, '0')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FL, color: C2 }}>{label}</div>
        <HoldButton onClick={() => onChange(Math.max(0, value - 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: BG2, color: C2, fontSize: 22, fontWeight: 700, border: `0.5px solid ${BRD}` }}>−</HoldButton>
      </div>
      <ScrollPickerPopup isOpen={picking} value={value} options={options} onSelect={onChange} onClose={() => setPicking(false)} title={title || label} />
    </>
  );
}

export default function TimerView({
  onMinimize, onBack, initialSeconds = null, initialPrepSec = null,
  exerciseName = null, bigDigits = false,
}) {
  const navigate = useNavigate();
  const { startTimer, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase } = useClock();
  const { setLiveTimer: setLiveTimerAT, setIsMinimized: setIsMinimizedAT, isMinimized: isMinimizedAT } = useActiveTimer();
  const [prepSec, setPrepSec] = useState(initialPrepSec ?? 0);
  const [timerMin, setTimerMin] = useState(
    initialSeconds != null ? Math.floor(initialSeconds / 60) : 0,
  );
  const [timerSec, setTimerSec] = useState(
    initialSeconds != null ? initialSeconds % 60 : 30,
  );
  const [prepPicking, setPrepPicking] = useState(false);
  // A new exercise re-seeds the wheels. Plain component state — the
  // trainee can turn them from here and nothing is persisted, exactly
  // as if they had set them by hand on the clocks tab.
  const seedRef = useRef(null);
  const seedKey = `${initialSeconds}:${initialPrepSec}`;
  useEffect(() => {
    if (initialSeconds == null || seedRef.current === seedKey) return;
    seedRef.current = seedKey;
    setTimerMin(Math.floor(initialSeconds / 60));
    setTimerSec(initialSeconds % 60);
    if (initialPrepSec != null) setPrepSec(initialPrepSec);
  }, [initialSeconds, initialPrepSec, seedKey]);
  // Gate the full-screen overlay on the *bar* minimize flag so that
  // TimerFooterBar.handleExpand (which flips this flag back to false)
  // returns the user to the running overlay — not the setup screen.
  const active = activeClock === 'timer' && !isMinimizedAT;
  const showSetup = !active || phase === 'idle' || phase === 'done';

  // Mirror minimizeTimer (Clocks.jsx) state writes EXACTLY so the bar
  // gets the same snapshot the proven minimize button writes. Only the
  // navigation destination differs — back goes to /clocks, the original
  // minimize button goes to the role home.
  const handleClockBack = (e) => {
    e.stopPropagation();
    // From the SETUP screen no clock is running, so skip the snapshot
    // write — it would surface a phantom footer bar. TabataTimer's back
    // button follows the same rule.
    if (activeClock === 'timer') {
      setLiveTimerAT({ type: 'timer', display: fmt(display), phase: 'טיימר', info: null, paused: !isRunning });
      setIsMinimizedAT(true);
    }
    // A plan run closes its overlay and stays on the sheet. Only the
    // clocks tab falls through to the original navigate.
    if (onBack) { onBack(); return; }
    navigate('/clocks');
  };
  const totalTimerMs = (timerMin * 60 + timerSec) * 1000;
  const lastBeepRef = useRef(-1);

  useEffect(() => {
    if (!active || !isRunning || phase === 'prepare') return;
    const secLeft = Math.ceil(display / 1000);
    if (secLeft === 10 && lastBeepRef.current !== 10) { lastBeepRef.current = 10; SOUND_ALERT(); }
    // Countdown beeps on 3, 2, 1 only — match Tabata's `secs >= 1 && secs <= 3`.
    // `display > 50` ensures the tick can't re-fire inside the bell zone
    // (where lastBeepRef is reset to 0 by SOUND_TRIPLE_BELL and would
    // otherwise allow secLeft===1 to retrigger as 1 !== 0).
    if ((secLeft === 3 || secLeft === 2 || secLeft === 1) && secLeft !== lastBeepRef.current && display > 50) { lastBeepRef.current = secLeft; SOUND_TICK(); }
    if (display <= 50 && lastBeepRef.current !== 0) { lastBeepRef.current = 0; SOUND_TRIPLE_BELL(); }
  }, [display, active, isRunning, phase]);
  useEffect(() => { if (!active) lastBeepRef.current = -1; }, [active]);

  if (showSetup) {
    return (
      <div dir="rtl" style={{ padding: '16px 16px 100px', position: 'relative' }} className="flex flex-col items-center gap-5">
        {/* The SETUP screen is where a plan shortcut now lands — the
            clock opens ready and waits — so it needs a way out. The
            clocks tab passes no onBack and keeps its own mode
            navigation; nothing changes there. */}
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
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: C3, letterSpacing: 2, textTransform: 'uppercase' }}>TIMER</div>
        {exerciseName && (
          <div style={{
            fontSize: 15, fontWeight: 700, fontFamily: FL, color: C1,
            textAlign: 'center', maxWidth: 320, lineHeight: 1.3, marginTop: -8,
          }}>{exerciseName}</div>
        )}
        <div className="flex items-center gap-3" dir="ltr">
          <TimerCol label="דקות" value={timerMin} onChange={setTimerMin} max={99} options={MIN_COL_OPTIONS} title="בחר דקות" />
          <span className="tabular-nums" style={{ fontSize: 48, fontWeight: 900, fontFamily: FN, color: C3, marginTop: -16 }}>:</span>
          <TimerCol label="שניות" value={timerSec} onChange={setTimerSec} max={59} options={SEC_COL_OPTIONS} title="בחר שניות" />
        </div>
        <div className="flex items-center gap-3 w-full justify-center" style={{ backgroundColor: BG2, borderRadius: 10, padding: '10px 16px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FL, color: C2 }}>הכנה</span>
          <HoldButton onClick={() => setPrepSec(Math.max(0, prepSec - 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#FFF', color: C2, fontSize: 18, fontWeight: 700, border: `0.5px solid ${BRD}` }}>−</HoldButton>
          <span
            onClick={() => setPrepPicking(true)}
            className="tabular-nums"
            style={{ fontSize: 24, fontWeight: 700, fontFamily: FN, color: C1, minWidth: 32, textAlign: 'center', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3, textDecorationColor: '#D1D5DB' }}
          >{prepSec}</span>
          <HoldButton onClick={() => setPrepSec(Math.min(60, prepSec + 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: BRAND, color: '#FFF', fontSize: 18, fontWeight: 700, border: 'none' }}>+</HoldButton>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: FL, color: C3 }}>שניות</span>
        </div>
        <ScrollPickerPopup isOpen={prepPicking} value={prepSec} options={PREP_OPTIONS} onSelect={setPrepSec} onClose={() => setPrepPicking(false)} title="זמן הכנה (שניות)" />
        <button onClick={() => { unlockAudio(); playSoftBreath(); startTimer(totalTimerMs, prepSec * 1000); }} disabled={totalTimerMs === 0}
          className="w-full flex items-center justify-center disabled:opacity-40 active:scale-[0.98] transition-transform"
          style={{ height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
          <Play className="w-6 h-6 ml-2" />התחל
        </button>
      </div>
    );
  }

  const isPrep = phase === 'prepare';
  const R = 128, circ = 2 * Math.PI * R;
  const progress = totalDuration > 0 ? display / totalDuration : 0;
  const offset = circ * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center" dir="rtl"
      style={{ backgroundColor: '#FFFFFF', padding: '20px 16px 100px', gap: 16, position: 'fixed' }}>
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
      {exerciseName && (
        <div style={{
          fontSize: 24, fontWeight: 700, fontFamily: FL, color: C1,
          textAlign: 'center', lineHeight: 1.3, maxWidth: 460,
          overflowWrap: 'anywhere', padding: '0 8px',
        }}>{exerciseName}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onMinimize} style={{ background: '#FFF0E8', border: 'none', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round">
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
            <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
          </svg>
        </button>
        <div className="transition-colors duration-300" style={{ fontSize: 28, fontWeight: 700, fontFamily: FL, color: isPrep ? C2 : BRAND }}>
          {isPrep ? 'הכנה' : 'ספירה לאחור'}
        </div>
      </div>
      {/* Ring fills ~88% of the viewport width (capped 460px for tablets).
          The SVG keeps its 0 0 280 280 viewBox, so cx/cy/r and the 10-unit
          stroke all scale proportionally with the rendered size. */}
      <div className="relative flex-shrink-0" style={{ width: 'min(88vw, 460px)', aspectRatio: '1 / 1' }}>
        <svg width="100%" height="100%" viewBox="0 0 280 280">
          <circle cx="140" cy="140" r={R} fill="none" stroke="#FFF0E8" strokeWidth="10" />
          <circle cx="140" cy="140" r={R} fill="none" stroke={isPrep ? '#BBBBBB' : BRAND} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 140 140)"
            className="transition-colors duration-300" style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Digits styled to match the Tabata running screen: Barlow
              Condensed (FN), weight 800, tabular-nums, letterSpacing -2,
              lineHeight 1 — clamp sized to fit the MM:SS inside the ring. */}
          <span className="tabular-nums leading-none" style={{ fontSize: bigDigits ? 'clamp(88px, 22vw, 132px)' : 'clamp(64px, 18vw, 116px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontFamily: FN, color: C1, letterSpacing: -2, lineHeight: 1 }}>{fmtMMSS(display)}</span>
        </div>
      </div>
      <div className="flex w-full" style={{ gap: 10 }}>
        <button onClick={() => { SOUND_RESET(); stop(); }} className="flex items-center justify-center active:scale-90 transition-transform"
          style={{ flex: 1, height: 56, borderRadius: 12, border: `1px solid ${BRD}`, backgroundColor: '#FFF', fontSize: 16, fontWeight: 700, fontFamily: FL, color: C2 }}>
          <RotateCcw className="w-5 h-5 ml-1.5" />אפס
        </button>
        {isRunning ? (
          <button onClick={() => { pause(); }} className="flex items-center justify-center active:scale-95 transition-transform"
            style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
            <Pause className="w-6 h-6 ml-2" />השהה
          </button>
        ) : (
          <button onClick={() => { playSoftBreath(); resume(); }} className="flex items-center justify-center active:scale-95 transition-transform"
            style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
            <Play className="w-6 h-6 ml-2" />המשך
          </button>
        )}
      </div>
    </div>
  );
}

