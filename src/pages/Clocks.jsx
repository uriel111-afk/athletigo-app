import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag } from "lucide-react";
import { useClock } from "@/contexts/ClockContext";
import { useActiveTimer } from "@/contexts/ActiveTimerContext";

const MinimizeBtn = ({ onClick }) => (
  <button onClick={onClick} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
      <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
    </svg>
  </button>
);

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

// iOS audio unlock
function unlockAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(0);
  } catch(e) {}
}

// Master-gain sound helper
const playSound = (setup) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 1.5;
    master.connect(ctx.destination);
    setup(ctx, master);
  } catch(e) {}
};

// 3-2-1 click
const playCountdownBeep = () => playSound((ctx, out) => {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(out);
  osc.type = 'sine'; osc.frequency.value = 1000;
  g.gain.setValueAtTime(0.7, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.start(); osc.stop(ctx.currentTime + 0.08);
});

// GO — two ascending tones
const playGoSound = () => playSound((ctx, out) => {
  [[1200, 0, 0.12], [1600, 0.14, 0.18]].forEach(([freq, start, dur]) => {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(out);
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.7, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
  });
});

// WORK — long referee whistle
const playWorkSound = () => playSound((ctx, out) => {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(out);
  osc.type = 'sine'; osc.frequency.value = 1400;
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.01);
  g.gain.setValueAtTime(0.7, ctx.currentTime + 0.28);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(); osc.stop(ctx.currentTime + 0.4);
});

// REST — boxing bell
const playRestSound = () => playSound((ctx, out) => {
  [[520, 1.4, 0.7], [1040, 0.6, 0.25]].forEach(([freq, dur, vol]) => {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(out);
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  });
});

// REST BETWEEN SETS — two bell hits
const playRestBetweenSetsSound = () => {
  [0, 0.5].forEach(delay => setTimeout(() => playRestSound(), delay * 1000));
};

// COMPLETE — three bell hits
const playCompleteSound = () => {
  [0, 0.45, 0.9].forEach(delay => setTimeout(() => playRestSound(), delay * 1000));
};

// START — whistle
const playStartSound = () => playWorkSound();

// STOP — descending tone
const playStopSound = () => playSound((ctx, out) => {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(out);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.4);
  g.gain.setValueAtTime(0.7, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(); osc.stop(ctx.currentTime + 0.4);
});

// Legacy aliases
const playBeep = () => playCountdownBeep();
function playEndBeeps() { playCompleteSound(); }

/* ═══ STOPWATCH ═══ */
function StopwatchView({ onMinimize }) {
  const { startStopwatch, pause, resume, reset, lapStopwatch, display, isRunning, activeClock, laps } = useClock();
  const active = activeClock === 'stopwatch';

  if (active) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center" dir="rtl"
        style={{ backgroundColor: BRAND, padding: '20px 16px 100px', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MinimizeBtn onClick={onMinimize} />
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' }}>STOPWATCH</div>
        </div>
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
            <button onClick={() => { playStopSound(); pause(); }} className="flex items-center justify-center active:scale-95 transition-transform"
              style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 700, fontFamily: FL, color: BRAND }}>
              <Pause className="w-6 h-6 ml-2" />השהה
            </button>
          ) : (
            <button onClick={() => { playStartSound(); resume(); }} className="flex items-center justify-center active:scale-95 transition-transform"
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
      <button onClick={() => { unlockAudio(); playStartSound(); startStopwatch(); }} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
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

function TimerView({ onMinimize }) {
  const { startTimer, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase } = useClock();
  const [prepSec, setPrepSec] = useState(0);
  const [timerMin, setTimerMin] = useState(0);
  const [timerSec, setTimerSec] = useState(30);
  const active = activeClock === 'timer';
  const showSetup = !active || phase === 'idle' || phase === 'done';
  const totalTimerMs = (timerMin * 60 + timerSec) * 1000;
  const lastBeepRef = useRef(-1);

  // Timer countdown beeps at 3, 2, 1 seconds + completion
  useEffect(() => {
    if (!active || !isRunning || phase === 'prepare') return;
    const secLeft = Math.ceil(display / 1000);
    if ((secLeft === 3 || secLeft === 2 || secLeft === 1) && secLeft !== lastBeepRef.current) {
      lastBeepRef.current = secLeft;
      playCountdownBeep();
    }
    if (display <= 50 && lastBeepRef.current !== 0) {
      lastBeepRef.current = 0;
      playCompleteSound();
    }
  }, [display, active, isRunning, phase]);

  // Reset beep tracker when timer resets
  useEffect(() => { if (!active) lastBeepRef.current = -1; }, [active]);

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
        <button onClick={() => { unlockAudio(); playStartSound(); startTimer(totalTimerMs, prepSec * 1000); }} disabled={totalTimerMs === 0}
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
        <button onClick={() => { playStopSound(); stop(); }} className="flex items-center justify-center active:scale-90 transition-transform"
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
function TabataView({ onRunningChange, onMinimize }) {
  const { tabata, phaseChange, startTabata, pauseTabata, resetTabata, settingsRef } = useActiveTimer();
  const { screen: tabataScreen, running: tabataRunning, phase: tabataPhase, timeLeft: tabataTimeLeft,
    phaseDuration: tabataPhaseDuration, currentRound: tabataCurrentRound, currentSet: tabataCurrentSet,
    countdown: tabataCountdown, countdown321 } = tabata;

  // Settings state — load from localStorage, fallback to context defaults
  const loadSavedSettings = () => {
    try { const s = localStorage.getItem('tabata_settings'); if (s) return JSON.parse(s); } catch(e) {}
    return null;
  };
  const saved = useRef(loadSavedSettings()).current;

  const [prepTime, setPrepTime] = useState(saved?.prepTime ?? settingsRef.current.prepTime);
  const [workTime, setWorkTime] = useState(saved?.workTime ?? settingsRef.current.workTime);
  const [restTime, setRestTime] = useState(saved?.restTime ?? settingsRef.current.restTime);
  const [rounds, setRounds] = useState(saved?.rounds ?? settingsRef.current.rounds);
  const [sets, setSets] = useState(saved?.sets ?? settingsRef.current.sets);
  const [restBetweenSets, setRestBetweenSets] = useState(saved?.restBetweenSets ?? settingsRef.current.restBetweenSets);
  const [countdownTime, setCountdownTime] = useState(saved?.countdownTime ?? settingsRef.current.countdownTime);

  // Save settings to localStorage on every change
  useEffect(() => {
    localStorage.setItem('tabata_settings', JSON.stringify({ prepTime, workTime, restTime, rounds, sets, restBetweenSets, countdownTime }));
  }, [prepTime, workTime, restTime, rounds, sets, restBetweenSets, countdownTime]);

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

  // === SOUNDS via phaseChange from context ===
  const lastPhaseChangeRef = useRef(null);
  useEffect(() => {
    if (!phaseChange || phaseChange === lastPhaseChangeRef.current) return;
    lastPhaseChangeRef.current = phaseChange;
    const p = phaseChange.phase;
    if (p === 'countdown') playCountdownBeep();
    else if (p === 'go') playGoSound();
    else if (p === 'עבודה') playWorkSound();
    else if (p === 'מנוחה') playRestSound();
    else if (p === 'מנוחה בין סטים') playRestBetweenSetsSound();
    else if (p === 'complete' || p === 'parallel_done') playCompleteSound();
    else if (p === 'tick') playCountdownBeep();
  }, [phaseChange]);

  // === HANDLERS ===
  const handleTabataStart = () => {
    unlockAudio();
    startTabata({ prepTime, workTime, restTime, rounds, sets, restBetweenSets, countdownTime });
  };

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
        <button onClick={resetTabata} style={{ marginTop: 20, width: '100%', height: 56, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: FL }}>התחל מחדש</button>
      </div>
    );
  }

  // Running
  if (tabataScreen === 'running') {
    return (
      <div style={{ background: '#FF6F20', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', direction: 'rtl', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, minHeight: 56 }}>
          <MinimizeBtn onClick={onMinimize} />
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
            <button onClick={resetTabata} style={{ flex: 1, height: 52, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: FL }}>עצור</button>
            <button onClick={pauseTabata} style={{ flex: 2, height: 52, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: FL }}>
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
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('tabata');
  const [tabataActive, setTabataActive] = useState(false);
  const clock = useClock();
  const { tabata, liveTimer, setLiveTimer, settingsRef: tabataSettingsRef } = useActiveTimer();
  const timerOrStopwatchRunning = clock?.isRunning && (clock?.activeClock === 'timer' || clock?.activeClock === 'stopwatch');
  const anyRunning = tabataActive || timerOrStopwatchRunning;

  // Format helpers for minimize
  const fmtSec = (s) => { if (!s || s <= 0) return '0'; const m = Math.floor(s / 60); const sc = s % 60; return m === 0 ? String(sc) : `${m}:${String(sc).padStart(2, '0')}`; };

  const handleMinimize = useCallback(() => {
    if (tabata.running || tabata.screen === 'running' || tabata.screen === 'countdown') {
      const { rounds, sets } = tabataSettingsRef?.current || {};
      setLiveTimer({
        type: 'tabata', display: fmtSec(tabata.timeLeft), phase: tabata.phase,
        info: `סיבוב ${tabata.currentRound}/${rounds || '?'} • סט ${tabata.currentSet}/${sets || '?'}`,
        color: '#FF6F20', isMinimized: true,
      });
    } else if (clock?.isRunning && clock?.activeClock === 'timer') {
      setLiveTimer({
        type: 'timer', display: fmt(clock.display), phase: 'טיימר',
        info: null, color: '#FF6F20', isMinimized: true,
      });
    } else if (clock?.isRunning && clock?.activeClock === 'stopwatch') {
      setLiveTimer({
        type: 'stopwatch', display: fmtStopwatch(clock.display), phase: 'סטופר',
        info: null, color: '#FF6F20', isMinimized: true,
      });
    }
    navigate(-1);
  }, [tabata, clock, setLiveTimer, navigate]);

  // Keep liveTimer updated every second while minimized
  useEffect(() => {
    if (!liveTimer?.isMinimized) return;
    if (liveTimer.type === 'tabata' && (tabata.running || tabata.screen === 'running')) {
      const { rounds, sets } = tabataSettingsRef?.current || {};
      setLiveTimer(prev => ({ ...prev, display: fmtSec(tabata.timeLeft), phase: tabata.phase,
        info: `סיבוב ${tabata.currentRound}/${rounds || '?'} • סט ${tabata.currentSet}/${sets || '?'}` }));
    } else if (liveTimer.type === 'timer' && clock?.isRunning) {
      setLiveTimer(prev => ({ ...prev, display: fmt(clock.display) }));
    } else if (liveTimer.type === 'stopwatch' && clock?.isRunning) {
      setLiveTimer(prev => ({ ...prev, display: fmtStopwatch(clock.display) }));
    }
  }, [tabata.timeLeft, clock?.display, liveTimer?.isMinimized, liveTimer?.type]);

  // Clear minimized state when returning to clocks page
  useEffect(() => { setLiveTimer(null); }, []);

  // Back button = minimize when running
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPop = () => {
      if (anyRunning) {
        window.history.pushState(null, '', window.location.href);
        handleMinimize();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [anyRunning, handleMinimize]);

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
          <TabataView onRunningChange={setTabataActive} onMinimize={handleMinimize} />
        </div>
        <div style={{ display: activeTab === 'timer' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <TimerView onMinimize={handleMinimize} />
        </div>
        <div style={{ display: activeTab === 'stopwatch' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <StopwatchView onMinimize={handleMinimize} />
        </div>
      </div>
    </div>
  );
}
