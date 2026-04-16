import React, { useState, useRef, useCallback, useEffect } from "react";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag } from "lucide-react";
import { useClock } from "@/contexts/ClockContext";

const BRAND = '#FF6F20';
const FN = "'Barlow Condensed', system-ui, sans-serif";
const FL = "'Heebo', sans-serif";
const C1 = '#1A1A1A';
const C2 = '#6B7280';
const C3 = '#9CA3AF';
const BRD = '#E5E7EB';
const BG2 = '#F5F5F5';

function fmt(ms) { if (ms < 0) ms = 0; const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60; if (m === 0) return String(s); return `${m}:${String(s).padStart(2,'0')}`; }
function fmtMMSS(ms) { if (ms < 0) ms = 0; const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function fmtStopwatch(ms) { if (ms < 0) ms = 0; const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60; const cs = Math.floor((ms % 1000) / 10); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`; }
function fmtTotal(sec) { return `${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`; }

function HoldButton({ onClick, children, className, style }) {
  const intRef = useRef(null), toRef = useRef(null);
  const start = useCallback(() => { onClick(); toRef.current = setTimeout(() => { intRef.current = setInterval(onClick, 80); }, 400); }, [onClick]);
  const stop = useCallback(() => { if (toRef.current) { clearTimeout(toRef.current); toRef.current = null; } if (intRef.current) { clearInterval(intRef.current); intRef.current = null; } }, []);
  return <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop} onTouchStart={(e) => { e.preventDefault(); start(); }} onTouchEnd={stop} onTouchCancel={stop} className={className} style={style}>{children}</button>;
}

function ScrollPicker({ isOpen, value, onChange, onClose, min = 0, max = 59, step = 1, unit = '', label = 'בחר ערך', options: propOptions }) {
  const listRef = useRef(null);

  // Build options array fresh every render — no stale ref
  const options = propOptions || (() => { const a = []; for (let i = min; i <= max; i += step) a.push(i); return a; })();

  useEffect(() => {
    if (isOpen && listRef.current && options.length > 0) {
      const idx = options.findIndex(v => v === value);
      if (idx >= 0) {
        setTimeout(() => {
          listRef.current?.children?.[idx]?.scrollIntoView({ block: 'center', behavior: 'instant' });
        }, 100);
      }
    }
  }, [isOpen, value]);

  if (!isOpen || options.length === 0) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 500, direction: 'rtl', paddingBottom: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <span style={{ fontSize: 18, fontWeight: 700, fontFamily: FL, color: C1 }}>{unit ? `בחר (${unit})` : 'בחר ערך'}</span>
          <button onClick={onClose} style={{ background: BRAND, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 28px', fontSize: 17, fontWeight: 700, fontFamily: FL, cursor: 'pointer' }}>סגור</button>
        </div>
        <div ref={listRef} style={{ overflowY: 'auto', maxHeight: 320, padding: '8px 20px', WebkitOverflowScrolling: 'touch' }}>
          {options.map((v, i) => (
            <div key={`${v}-${i}`} onClick={() => { onChange(v); onClose(); }} style={{
              padding: '12px 16px', marginBottom: 4, borderRadius: 10, fontSize: 22, fontWeight: v === value ? 900 : 500, fontFamily: FN,
              color: v === value ? BRAND : C1, background: v === value ? '#FFF0E8' : 'transparent',
              border: v === value ? `2px solid ${BRAND}` : '2px solid transparent', cursor: 'pointer', textAlign: 'center',
              minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{v} {unit || ''}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function playBeep(freq = 660, duration = 0.15) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playEndBeeps() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.4, 0.8].forEach(delay => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.3);
    });
  } catch {}
}

/* ═══ STOPWATCH ═══ */
function StopwatchView() {
  const { startStopwatch, pause, resume, reset, lapStopwatch, display, isRunning, activeClock, laps } = useClock();
  const active = activeClock === 'stopwatch';

  if (active) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center" dir="rtl"
        style={{ backgroundColor: BRAND, padding: '20px 16px 100px', gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' }}>STOPWATCH</div>
        <div className="tabular-nums leading-none" style={{ fontSize: 96, fontWeight: 900, fontFamily: FN, color: '#FFF', letterSpacing: -2 }}>
          {fmtStopwatch(display)}
        </div>
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
          <button onClick={reset} className="flex items-center justify-center active:scale-90 transition-transform"
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
            <button onClick={pause} className="flex items-center justify-center active:scale-95 transition-transform"
              style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 700, fontFamily: FL, color: BRAND }}>
              <Pause className="w-6 h-6 ml-2" />השהה
            </button>
          ) : (
            <button onClick={resume} className="flex items-center justify-center active:scale-95 transition-transform"
              style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 700, fontFamily: FL, color: BRAND }}>
              <Play className="w-6 h-6 ml-2" />המשך
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ padding: '16px 16px 100px' }} className="flex flex-col items-center gap-5">
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: C3, letterSpacing: 2, textTransform: 'uppercase', marginTop: 16 }}>STOPWATCH</div>
      <div className="text-center tabular-nums leading-none" style={{ fontSize: 80, fontWeight: 900, fontFamily: FN, color: '#D1D5DB' }}>00:00.00</div>
      <button onClick={startStopwatch} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
        style={{ height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
        <Play className="w-6 h-6 ml-2" />התחל
      </button>
    </div>
  );
}

/* ═══ TIMER ═══ */
function TimerCol({ label, value, onChange, max, step, unit }) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <HoldButton onClick={() => onChange(Math.min(max, value + 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: BRAND, color: '#FFF', fontSize: 22, fontWeight: 700, border: 'none' }}>+</HoldButton>
        <div onClick={() => setPicking(true)} className="tabular-nums" style={{ fontSize: 48, fontWeight: 900, fontFamily: FN, color: C1, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 4, textDecorationColor: '#D1D5DB' }}>{String(value).padStart(2, '0')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FL, color: C2 }}>{label}</div>
        <HoldButton onClick={() => onChange(Math.max(0, value - 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: BG2, color: C2, fontSize: 22, fontWeight: 700, border: `0.5px solid ${BRD}` }}>−</HoldButton>
      </div>
      <ScrollPicker isOpen={picking} value={value} onChange={onChange} onClose={() => setPicking(false)} min={0} max={max} step={step || 1} unit={unit || ''} label={label} />
    </>
  );
}

function TimerView() {
  const { startTimer, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase } = useClock();
  const [prepSec, setPrepSec] = useState(0);
  const [timerMin, setTimerMin] = useState(0);
  const [timerSec, setTimerSec] = useState(30);
  const active = activeClock === 'timer';
  const showSetup = !active || phase === 'idle' || phase === 'done';
  const totalTimerMs = (timerMin * 60 + timerSec) * 1000;

  if (showSetup) {
    return (
      <div dir="rtl" style={{ padding: '16px 16px 100px' }} className="flex flex-col items-center gap-5">
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: C3, letterSpacing: 2, textTransform: 'uppercase' }}>TIMER</div>
        <div className="flex items-center gap-3" dir="ltr">
          <TimerCol label="דקות" value={timerMin} onChange={setTimerMin} max={99} step={1} unit="דק׳" />
          <span className="tabular-nums" style={{ fontSize: 48, fontWeight: 900, fontFamily: FN, color: C3, marginTop: -16 }}>:</span>
          <TimerCol label="שניות" value={timerSec} onChange={setTimerSec} max={59} step={5} unit="שנ׳" />
        </div>
        {/* Prep time */}
        <div className="flex items-center gap-3 w-full justify-center" style={{ backgroundColor: BG2, borderRadius: 10, padding: '10px 16px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FL, color: C2 }}>הכנה</span>
          <HoldButton onClick={() => setPrepSec(Math.max(0, prepSec - 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#FFF', color: C2, fontSize: 18, fontWeight: 700, border: `0.5px solid ${BRD}` }}>−</HoldButton>
          <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 700, fontFamily: FN, color: C1, minWidth: 32, textAlign: 'center' }}>{prepSec}</span>
          <HoldButton onClick={() => setPrepSec(Math.min(60, prepSec + 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: BRAND, color: '#FFF', fontSize: 18, fontWeight: 700, border: 'none' }}>+</HoldButton>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: FL, color: C3 }}>שניות</span>
        </div>
        <button onClick={() => startTimer(totalTimerMs, prepSec * 1000)} disabled={totalTimerMs === 0}
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
      style={{ backgroundColor: '#FFFFFF', padding: '20px 16px 100px', gap: 16 }}>
      <div className="transition-colors duration-300" style={{ fontSize: 28, fontWeight: 700, fontFamily: FL, color: isPrep ? C2 : BRAND }}>
        {isPrep ? 'הכנה' : 'ספירה לאחור'}
      </div>
      <div className="relative flex-shrink-0" style={{ width: 280, height: 280 }}>
        <svg width="280" height="280" viewBox="0 0 280 280">
          <circle cx="140" cy="140" r={R} fill="none" stroke="#FFF0E8" strokeWidth="10" />
          <circle cx="140" cy="140" r={R} fill="none" stroke={isPrep ? '#BBBBBB' : BRAND} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 140 140)"
            className="transition-colors duration-300" style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="tabular-nums leading-none" style={{ fontSize: 88, fontWeight: 900, fontFamily: FN, color: C1, letterSpacing: -4 }}>{fmtMMSS(display)}</span>
        </div>
      </div>
      <div className="flex w-full" style={{ gap: 10 }}>
        <button onClick={stop} className="flex items-center justify-center active:scale-90 transition-transform"
          style={{ flex: 1, height: 56, borderRadius: 12, border: `1px solid ${BRD}`, backgroundColor: '#FFF', fontSize: 16, fontWeight: 700, fontFamily: FL, color: C2 }}>
          <RotateCcw className="w-5 h-5 ml-1.5" />אפס
        </button>
        {isRunning ? (
          <button onClick={pause} className="flex items-center justify-center active:scale-95 transition-transform"
            style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
            <Pause className="w-6 h-6 ml-2" />השהה
          </button>
        ) : (
          <button onClick={resume} className="flex items-center justify-center active:scale-95 transition-transform"
            style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
            <Play className="w-6 h-6 ml-2" />המשך
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══ TABATA ═══ */
function TabataView({ onRunningChange }) {
  // === DISPLAY STATE ===
  const [tabataRunning, setTabataRunning] = useState(false);
  const [tabataPhase, setTabataPhase] = useState('הכנה');
  const [tabataTimeLeft, setTabataTimeLeft] = useState(0);
  const [tabataPhaseDuration, setTabataPhaseDuration] = useState(0);
  const [tabataCurrentRound, setTabataCurrentRound] = useState(1);
  const [tabataCurrentSet, setTabataCurrentSet] = useState(1);
  const [tabataCountdown, setTabataCountdown] = useState(0);
  const [countdown321, setCountdown321] = useState(3);
  const [tabataScreen, setTabataScreen] = useState('settings');

  // Settings state
  const [prepTime, setPrepTime] = useState(10);
  const [workTime, setWorkTime] = useState(20);
  const [restTime, setRestTime] = useState(10);
  const [rounds, setRounds] = useState(8);
  const [sets, setSets] = useState(3);
  const [restBetweenSets, setRestBetweenSets] = useState(60);
  const [countdownTime, setCountdownTime] = useState(30);

  // Interval refs
  const tabataIntervalRef = useRef(null);
  const countdown321Ref = useRef(null);
  const parallelCountdownRef = useRef(null);
  const parallelCountdownVal = useRef(0);
  const wakeLockRef = useRef(null);
  const hiddenAtRef = useRef(null);

  // Refs for current phase/round/set — avoids stale closures in setInterval
  const phaseRef = useRef('הכנה');
  const timeLeftRef = useRef(0);
  const roundRef = useRef(1);
  const setNumRef = useRef(1);

  // Refs for settings — avoids stale closures
  const workTimeRef = useRef(workTime);
  const restTimeRef = useRef(restTime);
  const roundsRef = useRef(rounds);
  const setsRef = useRef(sets);
  const restBetweenRef = useRef(restBetweenSets);

  // Keep settings refs in sync
  useEffect(() => { workTimeRef.current = workTime; }, [workTime]);
  useEffect(() => { restTimeRef.current = restTime; }, [restTime]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { setsRef.current = sets; }, [sets]);
  useEffect(() => { restBetweenRef.current = restBetweenSets; }, [restBetweenSets]);

  // Picker state
  const [picker, setPicker] = useState(null);

  // === HELPERS ===
  const formatTime = (secs) => {
    if (secs === null || secs === undefined) return '0:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const getNextPhaseInfo = (phase, round, set) => {
    if (phase === 'הכנה') return { label: 'עבודה', duration: workTime };
    if (phase === 'עבודה') return { label: 'מנוחה', duration: restTime };
    if (phase === 'מנוחה') {
      if (round < rounds) return { label: 'עבודה', duration: workTime };
      if (set < sets) return { label: 'מנוחה בין סטים', duration: restBetweenSets };
      return { label: 'סיום', duration: 0 };
    }
    if (phase === 'מנוחה בין סטים') return { label: 'עבודה', duration: workTime };
    return { label: '', duration: 0 };
  };

  // === CORE INTERVAL ===
  const startInterval = useCallback(() => {
    clearInterval(tabataIntervalRef.current);
    tabataIntervalRef.current = setInterval(() => {
      setTabataTimeLeft(prev => {
        if (prev <= 1) {
          // Phase is ending — schedule transition without showing 0
          setTimeout(() => advancePhase(), 0);
          return prev; // keep showing 1 briefly
        }
        timeLeftRef.current = prev - 1;
        return prev - 1;
      });
    }, 1000);
  }, []);

  const advancePhase = useCallback(() => {
    const phase = phaseRef.current;
    const round = roundRef.current;
    const set = setNumRef.current;

    let newPhase, newTime, newRound = round, newSet = set;

    if (phase === 'הכנה') {
      newPhase = 'עבודה'; newTime = workTimeRef.current;
    } else if (phase === 'עבודה') {
      newPhase = 'מנוחה'; newTime = restTimeRef.current;
    } else if (phase === 'מנוחה') {
      if (round < roundsRef.current) {
        newRound = round + 1;
        newPhase = 'עבודה'; newTime = workTimeRef.current;
      } else if (set < setsRef.current) {
        newRound = 1; newSet = set + 1;
        newPhase = 'מנוחה בין סטים'; newTime = restBetweenRef.current;
      } else {
        // COMPLETE
        clearInterval(tabataIntervalRef.current);
        clearInterval(parallelCountdownRef.current);
        setTabataScreen('complete');
        setTabataRunning(false);
        playEndBeeps();
        releaseWakeLock();
        return;
      }
    } else if (phase === 'מנוחה בין סטים') {
      newPhase = 'עבודה'; newTime = workTimeRef.current;
    } else {
      return;
    }

    // Update refs
    phaseRef.current = newPhase;
    timeLeftRef.current = newTime;
    roundRef.current = newRound;
    setNumRef.current = newSet;

    // Update state for display
    setTabataPhase(newPhase);
    setTabataTimeLeft(newTime);
    setTabataPhaseDuration(newTime);
    setTabataCurrentRound(newRound);
    setTabataCurrentSet(newSet);

    // Restart interval for new phase
    clearInterval(tabataIntervalRef.current);
    startInterval();
  }, [startInterval]);

  // === START / PAUSE / RESET ===
  const handleTabataStart = () => {
    setTabataScreen('countdown');
    setCountdown321(3);
    playBeep(660);

    let count = 3;
    countdown321Ref.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown321(count);
        playBeep(660);
      } else {
        clearInterval(countdown321Ref.current);
        setCountdown321('GO');
        playBeep(880);
        setTimeout(() => {
          const initPhase = prepTime > 0 ? 'הכנה' : 'עבודה';
          const initTime = prepTime > 0 ? prepTime : workTime;

          // Set refs
          phaseRef.current = initPhase;
          timeLeftRef.current = initTime;
          roundRef.current = 1;
          setNumRef.current = 1;

          // Set state
          setTabataPhase(initPhase);
          setTabataTimeLeft(initTime);
          setTabataPhaseDuration(initTime);
          setTabataCurrentRound(1);
          setTabataCurrentSet(1);
          setTabataRunning(true);
          setTabataScreen('running');

          // Parallel countdown
          parallelCountdownVal.current = countdownTime;
          setTabataCountdown(countdownTime);
          parallelCountdownRef.current = setInterval(() => {
            parallelCountdownVal.current -= 1;
            setTabataCountdown(parallelCountdownVal.current);
            if (parallelCountdownVal.current <= 0) {
              clearInterval(parallelCountdownRef.current);
              playEndBeeps();
            }
          }, 1000);

          startInterval();
          requestWakeLock();
        }, 800);
      }
    }, 1000);
  };

  const handleTabataPause = () => {
    if (tabataRunning) {
      clearInterval(tabataIntervalRef.current);
      clearInterval(parallelCountdownRef.current);
      setTabataRunning(false);
    } else {
      setTabataRunning(true);
      // Sync refs from current state before restarting
      phaseRef.current = tabataPhase;
      timeLeftRef.current = tabataTimeLeft;
      roundRef.current = tabataCurrentRound;
      setNumRef.current = tabataCurrentSet;
      startInterval();
      // Resume parallel countdown
      parallelCountdownRef.current = setInterval(() => {
        parallelCountdownVal.current -= 1;
        setTabataCountdown(parallelCountdownVal.current);
        if (parallelCountdownVal.current <= 0) clearInterval(parallelCountdownRef.current);
      }, 1000);
    }
  };

  const handleTabataReset = () => {
    clearInterval(tabataIntervalRef.current);
    clearInterval(parallelCountdownRef.current);
    clearInterval(countdown321Ref.current);
    setTabataScreen('settings');
    setTabataRunning(false);
    setTabataPhase('הכנה');
    setTabataTimeLeft(0);
    setTabataCurrentRound(1);
    setTabataCurrentSet(1);
    setTabataCountdown(countdownTime);
    phaseRef.current = 'הכנה';
    timeLeftRef.current = 0;
    roundRef.current = 1;
    setNumRef.current = 1;
    releaseWakeLock();
  };

  // === WAKE LOCK ===
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) { console.log('WakeLock:', err); }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // Re-acquire on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && tabataRunning) {
        requestWakeLock();
        if (hiddenAtRef.current) {
          const elapsed = Math.floor((Date.now() - hiddenAtRef.current) / 1000);
          setTabataTimeLeft(prev => {
            const newTime = prev - elapsed;
            if (newTime <= 0) return 1; // let advancePhase handle it
            timeLeftRef.current = newTime;
            return newTime;
          });
          hiddenAtRef.current = null;
        }
      } else if (document.visibilityState === 'hidden' && tabataRunning) {
        hiddenAtRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [tabataRunning]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearInterval(tabataIntervalRef.current);
      clearInterval(parallelCountdownRef.current);
      clearInterval(countdown321Ref.current);
      releaseWakeLock();
    };
  }, []);

  // Notify parent of active state
  useEffect(() => {
    onRunningChange?.(tabataScreen === 'running' || tabataScreen === 'countdown');
  }, [tabataScreen, onRunningChange]);

  // === SCREENS ===

  // 3-2-1-GO
  if (tabataScreen === 'countdown') {
    return (
      <div style={{ background: '#FF6F20', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: countdown321 === 'GO' ? 120 : 200, fontWeight: 900, color: 'white', lineHeight: 1, fontFamily: FN }}>{countdown321}</div>
      </div>
    );
  }

  // Complete
  if (tabataScreen === 'complete') {
    return (
      <div style={{ background: '#FF6F20', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, direction: 'rtl', padding: 20 }}>
        <div style={{ fontSize: 80, color: 'white' }}>✓</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: 'white', fontFamily: FL }}>כל הכבוד! סיימת!</div>
        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', fontFamily: FL }}>{sets} סטים • {rounds} מחזורים</div>
        <button onClick={handleTabataReset} style={{ marginTop: 20, width: '100%', height: 56, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: FL }}>התחל מחדש</button>
      </div>
    );
  }

  // Running
  if (tabataScreen === 'running') {
    return (
      <div style={{ background: '#FF6F20', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', direction: 'rtl', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, minHeight: 56 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: 1 }}>TABATA</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>ספירה לאחור</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{formatTime(tabataCountdown)}</div>
          </div>
        </div>

        {/* Phase label */}
        <div style={{ fontSize: 44, fontWeight: 900, color: 'white', textAlign: 'center', paddingTop: 10, flexShrink: 0, fontFamily: FL }}>{tabataPhase}</div>

        {/* Ring — fills available space */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '4px 0' }}>
          <div style={{ position: 'relative', width: 'min(62vw, 250px)', height: 'min(62vw, 250px)' }}>
            <svg width="100%" height="100%" viewBox="0 0 250 250" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="125" cy="125" r="112" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10" />
              <circle cx="125" cy="125" r="112" fill="none" stroke="white" strokeWidth="10"
                strokeDasharray="704"
                strokeDashoffset={tabataPhaseDuration > 0 ? 704 - (704 * (tabataTimeLeft / tabataPhaseDuration)) : 0}
                strokeLinecap="round"
                transform="rotate(-90 125 125)"
                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 'min(32vw, 124px)', fontWeight: 900, color: 'white', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -4, fontFamily: FN }}>{tabataTimeLeft}</div>
            </div>
          </div>
        </div>

        {/* Bottom section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 12px', flexShrink: 0 }}>
          {/* Stats */}
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 16px' }}>
            {[
              { label: 'סיבוב', value: `${tabataCurrentRound} / ${rounds}` },
              { label: 'סט', value: `${tabataCurrentSet} / ${sets}` },
              { label: 'נותר', value: formatTime(tabataCountdown) },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', height: 40, margin: '0 12px' }} />}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 3, fontFamily: FL }}>{item.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', fontFamily: FN }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Next phase */}
          {(() => {
            const next = getNextPhaseInfo(tabataPhase, tabataCurrentRound, tabataCurrentSet);
            if (!next?.label || next.label === 'סיום') return null;
            return (
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: FL }}>הבא: {next.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'white', fontFamily: FN }}>{next.duration} שנ׳</div>
              </div>
            );
          })()}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleTabataReset} style={{ flex: 1, height: 52, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: FL }}>עצור</button>
            <button onClick={handleTabataPause} style={{ flex: 2, height: 52, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: FL }}>
              {tabataRunning ? 'השהה ‖' : 'המשך ▶'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === SETTINGS SCREEN ===
  const rng = (min, max, step) => { const a = []; for (let i = min; i <= max; i += step) a.push(i); return a; };

  const pickerConfigs = {
    prep:     { options: rng(0, 60, 1),   unit: 'שנ׳' },
    work:     { options: rng(1, 120, 1),  unit: 'שנ׳' },
    rest:     { options: rng(0, 120, 1),  unit: 'שנ׳' },
    rounds:   { options: rng(1, 30, 1),   unit: '×' },
    sets:     { options: rng(1, 10, 1),   unit: '×' },
    restBtw:  { options: rng(0, 180, 1),  unit: 'שנ׳' },
    countdown:{ options: rng(0, 600, 1),  unit: 'שנ׳' },
  };

  const totalSecs = (prepTime + (workTime + restTime) * rounds) * sets + (sets > 1 ? restBetweenSets * (sets - 1) : 0);
  const mm = String(Math.floor(totalSecs / 60)).padStart(2, '0');
  const ss = String(totalSecs % 60).padStart(2, '0');

  const params = [
    { key: 'prep',     icon: '⏱', label: 'הכנה',            value: prepTime,        setter: setPrepTime,        step: 1, lbl: 20 },
    { key: 'work',     icon: '💪', label: 'עבודה',           value: workTime,        setter: setWorkTime,        step: 1, lbl: 20 },
    { key: 'rest',     icon: '😮', label: 'מנוחה',           value: restTime,        setter: setRestTime,        step: 1, lbl: 20 },
    { key: 'rounds',   icon: '🔄', label: 'מחזורים',         value: rounds,          setter: setRounds,          step: 1, lbl: 20 },
    { key: 'sets',     icon: '📋', label: 'סטים',            value: sets,            setter: setSets,            step: 1, lbl: 20 },
    { key: 'restBtw',  icon: '⏸',  label: 'מנוחה בין סטים',  value: restBetweenSets, setter: setRestBetweenSets, step: 1, lbl: 18 },
    { key: 'countdown',icon: '🔔', label: 'ספירה לאחור',     value: countdownTime,   setter: setCountdownTime,   step: 1, lbl: 18 },
  ];

  return (
    <div style={{ background: '#FF6F20', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100%', overflow: 'hidden', direction: 'rtl', margin: 0, padding: 0, borderRadius: 0, width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 20px', background: 'rgba(0,0,0,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 900, fontFamily: FN, color: '#FFF' }}>TABATA</span>
        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>{mm}:{ss} • {rounds} סיבובים • {sets} סטים</span>
      </div>
      {/* Rows */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', overflow: 'hidden' }}>
        {params.map(p => {
          const cfg = pickerConfigs[p.key];
          return (
            <div key={p.key} style={{ height: 58, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{p.icon}</div>
                <span style={{ fontSize: p.lbl, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>{p.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <HoldButton onClick={() => p.setter(Math.max(cfg.options[0], p.value - p.step))}
                  className="flex items-center justify-center active:scale-90 transition-transform"
                  style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', color: '#FFF', fontSize: 20, fontWeight: 700, border: 'none' }}>−</HoldButton>
                <span onClick={() => setPicker({ value: p.value, options: cfg.options, unit: cfg.unit, onChange: p.setter })}
                  style={{ fontSize: 26, fontWeight: 900, fontFamily: FN, color: '#FFF', minWidth: 40, textAlign: 'center', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
                <HoldButton onClick={() => p.setter(Math.min(cfg.options[cfg.options.length - 1], p.value + p.step))}
                  className="flex items-center justify-center active:scale-90 transition-transform"
                  style={{ width: 34, height: 34, borderRadius: '50%', background: '#FFF', color: '#FF6F20', fontSize: 20, fontWeight: 700, border: 'none' }}>+</HoldButton>
              </div>
            </div>
          );
        })}
      </div>
      {/* Start */}
      <div style={{ padding: '6px 20px 10px', flexShrink: 0 }}>
        <button onClick={handleTabataStart} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
          style={{ height: 48, borderRadius: 12, background: '#FFF', fontSize: 20, fontWeight: 900, fontFamily: FL, color: '#FF6F20' }}>
          ▶ התחל
        </button>
      </div>
      {/* Scroll Picker */}
      {picker && (
        <ScrollPicker isOpen value={picker.value} onChange={picker.onChange} onClose={() => setPicker(null)}
          options={picker.options} unit={picker.unit} />
      )}
    </div>
  );
}

const MODES = [
  { id: 'tabata', label: 'טבטה', icon: Zap },
  { id: 'timer', label: 'טיימר', icon: Timer },
  { id: 'stopwatch', label: 'סטופר', icon: Clock },
];

export default function Clocks() {
  const [activeTab, setActiveTab] = useState('tabata');
  const [tabataActive, setTabataActive] = useState(false);
  const clock = useClock();
  const timerOrStopwatchRunning = clock?.isRunning && (clock?.activeClock === 'timer' || clock?.activeClock === 'stopwatch');
  const anyRunning = tabataActive || timerOrStopwatchRunning;

  // FIX 2 — Intercept back button when any timer is running
  useEffect(() => {
    if (!anyRunning) return;
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [anyRunning]);

  // FIX 3 — Unified wake lock for all timers
  const globalWakeLockRef = useRef(null);
  useEffect(() => {
    const acquireWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && !globalWakeLockRef.current) {
          globalWakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) { console.warn('Wake lock:', err.message); }
    };
    if (anyRunning) {
      acquireWakeLock();
    } else if (globalWakeLockRef.current) {
      globalWakeLockRef.current.release().catch(() => {});
      globalWakeLockRef.current = null;
    }
  }, [anyRunning]);

  // Re-acquire on visibility change
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === 'visible' && anyRunning) {
        try {
          if ('wakeLock' in navigator) {
            globalWakeLockRef.current = await navigator.wakeLock.request('screen');
          }
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [anyRunning]);

  // Release wake lock on unmount
  useEffect(() => () => {
    if (globalWakeLockRef.current) {
      globalWakeLockRef.current.release().catch(() => {});
      globalWakeLockRef.current = null;
    }
  }, []);

  return (
    <div dir="rtl" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: activeTab === 'tabata' ? '#FF6F20' : '#FFFFFF', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: `0.5px solid ${BRD}`, flexShrink: 0 }}>
        <div className="flex" style={{ padding: '10px 12px 8px', gap: 8 }}>
          {MODES.map(m => {
            const on = activeTab === m.id; const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setActiveTab(m.id)}
                className="flex-1 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                style={{ height: 42, borderRadius: 10, backgroundColor: on ? BRAND : BG2, color: on ? '#FFF' : C2, fontWeight: 700, fontSize: 16, fontFamily: FN, border: on ? 'none' : `0.5px solid ${BRD}`, position: 'relative' }}>
                <Icon className="w-4 h-4" />{m.label}
                {m.id === 'tabata' && tabataActive && !on && (
                  <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: BRAND, animation: 'pulse 1s infinite' }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: activeTab === 'tabata' ? '#FF6F20' : '#FFFFFF' }}>
        <div style={{ display: activeTab === 'tabata' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <TabataView onRunningChange={setTabataActive} />
        </div>
        <div style={{ display: activeTab === 'timer' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <TimerView />
        </div>
        <div style={{ display: activeTab === 'stopwatch' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <StopwatchView />
        </div>
      </div>
    </div>
  );
}
