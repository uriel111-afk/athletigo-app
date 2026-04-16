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

/* TabataRow is now inlined in TabataView to share picker state */

/* ═══ TABATA ═══ */
function TabataView() {
  const { startTabata, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase, phaseLabel, roundInfo } = useClock();
  const [workSec, setWorkSec] = useState(20);
  const [restSec, setRestSec] = useState(10);
  const [rounds, setRounds] = useState(8);
  const [sets, setSets] = useState(3);
  const [setsRestSec, setSetsRestSec] = useState(60);
  const [prepSec, setPrepSec] = useState(10);
  const [countdownSec, setCountdownSec] = useState(30);
  const [countdownRemaining, setCountdownRemaining] = useState(null);
  const countdownRef = useRef(null);
  const [countdown321, setCountdown321] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const prevPhaseRef = useRef(null);
  const active = activeClock === 'tabata';
  const showSetup = !active || phase === 'idle';
  const totalTime = (workSec + restSec) * rounds * sets + (sets > 1 ? setsRestSec * (sets - 1) : 0);

  // Parallel countdown timer
  useEffect(() => {
    if (active && isRunning && countdownRemaining !== null && countdownRemaining > 0) {
      countdownRef.current = setInterval(() => {
        setCountdownRemaining(prev => {
          if (prev <= 1) { playEndBeeps(); clearInterval(countdownRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdownRef.current);
    }
    if (!isRunning && countdownRef.current) clearInterval(countdownRef.current);
  }, [active, isRunning, countdownRemaining !== null]);

  // Detect done
  useEffect(() => {
    if (prevPhaseRef.current && prevPhaseRef.current !== 'idle' && prevPhaseRef.current !== 'done' && phase === 'done') {
      playEndBeeps();
      setShowDone(true);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  // 3-2-1-GO countdown
  const startWithCountdown = () => {
    setCountdown321(3); playBeep(660);
    setTimeout(() => { setCountdown321(2); playBeep(660); }, 1000);
    setTimeout(() => { setCountdown321(1); playBeep(660); }, 2000);
    setTimeout(() => { setCountdown321('GO'); playBeep(880, 0.3); }, 3000);
    setTimeout(() => {
      setCountdown321(null);
      setCountdownRemaining(countdownSec);
      startTabata({ workTime: workSec, restTime: restSec, rounds, sets, setRest: setsRestSec, prepareTime: prepSec });
    }, 3800);
  };

  // 3-2-1-GO overlay — orange, giant numbers
  if (countdown321 !== null) {
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center" style={{ backgroundColor: BRAND, touchAction: 'none', userSelect: 'none' }}>
        <span style={{ fontSize: countdown321 === 'GO' ? 120 : 200, fontWeight: 900, fontFamily: FN, color: '#FFF', lineHeight: 1 }}>{countdown321}</span>
      </div>
    );
  }

  // Done screen — orange
  if (showDone) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center" dir="rtl" style={{ backgroundColor: BRAND, padding: '20px 16px 100px', gap: 16 }}>
        <div style={{ fontSize: 80, color: '#FFF' }}>✓</div>
        <div style={{ fontSize: 32, fontWeight: 900, fontFamily: FL, color: '#FFF' }}>כל הכבוד! סיימת!</div>
        <div style={{ fontSize: 18, fontWeight: 500, fontFamily: FL, color: 'rgba(255,255,255,0.8)' }}>
          {sets} סטים | {rounds} מחזורים
        </div>
        <button onClick={() => { setShowDone(false); setCountdownRemaining(null); stop(); }}
          className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
          style={{ height: 60, borderRadius: 12, backgroundColor: '#FFF', fontSize: 22, fontWeight: 900, fontFamily: FL, color: BRAND }}>
          התחל מחדש
        </button>
      </div>
    );
  }

  // Settings — orange bg
  const [pickerOpen, setPickerOpen] = useState(null);
  const rng = (min, max, step) => { const a = []; for (let i = min; i <= max; i += step) a.push(i); return a; };

  const pickerConfigs = {
    prep:     { options: rng(0, 60, 1),   unit: 'שנ׳' },
    work:     { options: rng(5, 120, 5),  unit: 'שנ׳' },
    rest:     { options: rng(0, 120, 5),  unit: 'שנ׳' },
    rounds:   { options: rng(1, 30, 1),   unit: '×' },
    sets:     { options: rng(1, 10, 1),   unit: '×' },
    restBtw:  { options: rng(0, 180, 10), unit: 'שנ׳' },
    countdown:{ options: rng(0, 600, 30), unit: 'שנ׳' },
  };

  if (showSetup) {
    const totalSecs = (prepSec + (workSec + restSec) * rounds) * sets + (sets > 1 ? setsRestSec * (sets - 1) : 0);
    const mm = String(Math.floor(totalSecs / 60)).padStart(2, '0');
    const ss = String(totalSecs % 60).padStart(2, '0');

    const params = [
      { key: 'prep',     icon: '⏱', label: 'הכנה',            value: prepSec,      setter: setPrepSec,      step: 1,  lbl: 20 },
      { key: 'work',     icon: '💪', label: 'עבודה',           value: workSec,      setter: setWorkSec,      step: 5,  lbl: 20 },
      { key: 'rest',     icon: '😮', label: 'מנוחה',           value: restSec,      setter: setRestSec,      step: 5,  lbl: 20 },
      { key: 'rounds',   icon: '🔄', label: 'מחזורים',         value: rounds,       setter: setRounds,       step: 1,  lbl: 20 },
      { key: 'sets',     icon: '📋', label: 'סטים',            value: sets,         setter: setSets,         step: 1,  lbl: 20 },
      { key: 'restBtw',  icon: '⏸',  label: 'מנוחה בין סטים',  value: setsRestSec,  setter: setSetsRestSec,  step: 10, lbl: 18 },
      { key: 'countdown',icon: '🔔', label: 'ספירה לאחור',     value: countdownSec, setter: setCountdownSec, step: 30, lbl: 18 },
    ];

    return (
      <div style={{ background: '#FF6F20', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', direction: 'rtl', margin: 0, padding: 0, borderRadius: 0, width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
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
                  <span onClick={() => setPickerOpen({ value: p.value, options: cfg.options, unit: cfg.unit, onChange: p.setter })}
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
          <button onClick={startWithCountdown} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
            style={{ height: 48, borderRadius: 12, background: '#FFF', fontSize: 20, fontWeight: 900, fontFamily: FL, color: '#FF6F20' }}>
            ▶ התחל
          </button>
        </div>
        {/* Scroll Picker */}
        {pickerOpen && (
          <ScrollPicker isOpen value={pickerOpen.value} onChange={pickerOpen.onChange} onClose={() => setPickerOpen(null)}
            options={pickerOpen.options} unit={pickerOpen.unit} />
        )}
      </div>
    );
  }

  // ── Running screen — orange bg, mobile-fit ──
  const RR = 106, circR = 2 * Math.PI * RR;
  const ringProgress = totalDuration > 0 ? display / totalDuration : 0;
  const ringOffset = circR * (1 - Math.max(0, Math.min(1, ringProgress)));
  let setStr = '—', roundStr = '—';
  if (roundInfo) { roundInfo.split('•').map(x => x.trim()).forEach(p => { if (p.startsWith('סט')) setStr = p.replace('סט ', ''); if (p.startsWith('סיבוב')) roundStr = p.replace('סיבוב ', ''); }); }
  let nextLabel = '', nextDur = 0;
  if (phase === 'work') { nextLabel = 'מנוחה'; nextDur = restSec; }
  else if (phase === 'rest') { nextLabel = 'עבודה'; nextDur = workSec; }
  else if (phase === 'set_rest') { nextLabel = 'עבודה'; nextDur = workSec; }
  else if (phase === 'prepare') { nextLabel = 'עבודה'; nextDur = workSec; }
  const elapsedMs = totalDuration > 0 ? totalDuration - display : 0;
  const remainingSec = Math.max(0, totalTime - Math.floor(elapsedMs / 1000));

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center" dir="rtl"
      style={{ backgroundColor: BRAND, padding: '0 16px 90px', touchAction: 'pan-y', userSelect: 'none' }}>

      {/* Header bar */}
      <div className="w-full flex items-center justify-between" style={{ padding: '10px 20px', backgroundColor: 'rgba(0,0,0,0.15)' }}>
        <span style={{ fontSize: 18, fontWeight: 900, fontFamily: FN, color: '#FFF' }}>TABATA</span>
        {countdownRemaining !== null && countdownRemaining > 0 && (
          <span className="tabular-nums" style={{ fontSize: 13, fontFamily: FN, color: 'rgba(255,255,255,0.85)' }}>
            ספירה לאחור: {fmtTotal(countdownRemaining)}
          </span>
        )}
      </div>

      {/* Phase label */}
      <div style={{ fontSize: 40, fontWeight: 900, fontFamily: FL, color: '#FFF', marginTop: 4 }}>{phaseLabel}</div>

      {/* Ring + time — 240×240, r=106 */}
      <div className="relative flex-shrink-0" style={{ width: 240, height: 240, marginTop: 2 }}>
        <svg width="240" height="240" viewBox="0 0 240 240">
          <circle cx="120" cy="120" r={RR} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10" />
          <circle cx="120" cy="120" r={RR} fill="none" stroke="#FFF" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circR} strokeDashoffset={ringOffset} transform="rotate(-90 120 120)"
            style={{ transition: 'stroke-dashoffset 0.15s linear' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="tabular-nums leading-none" style={{ fontSize: 88, fontWeight: 900, fontFamily: FN, color: '#FFF', maxWidth: 170 }}>{fmt(display)}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex w-full" style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: '8px 16px', marginTop: 4 }}>
        {[
          { l: 'סיבוב', v: roundStr },
          { l: 'סט', v: setStr },
          { l: 'נותר', v: fmtTotal(remainingSec) },
        ].map((c, i) => (
          <div key={i} className="flex-1 flex flex-col items-center" style={{ borderRight: i > 0 ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 500, fontFamily: FL, color: 'rgba(255,255,255,0.7)' }}>{c.l}</span>
            <span className="tabular-nums" style={{ fontSize: 26, fontWeight: 900, fontFamily: FN, color: '#FFF' }}>{c.v}</span>
          </div>
        ))}
      </div>

      {/* Next phase */}
      {nextLabel && (
        <div className="flex items-center justify-between w-full" style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: '10px 16px', marginTop: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: FL, color: 'rgba(255,255,255,0.9)' }}>הבא: {nextLabel}</span>
          <span className="tabular-nums" style={{ fontSize: 26, fontWeight: 900, fontFamily: FN, color: '#FFF' }}>{nextDur} שנ׳</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex w-full" style={{ gap: 10, marginTop: 8 }}>
        <button onClick={stop} className="flex items-center justify-center active:scale-90 transition-transform"
          style={{ flex: 1, height: 56, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', fontSize: 16, fontWeight: 700, fontFamily: FL, color: '#FFF', border: 'none' }}>
          <RotateCcw className="w-4 h-4 ml-1.5" />אפס
        </button>
        {isRunning ? (
          <button onClick={pause} className="flex items-center justify-center active:scale-95 transition-transform"
            style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 900, fontFamily: FL, color: BRAND }}>
            <Pause className="w-5 h-5 ml-2" />השהה
          </button>
        ) : (
          <button onClick={resume} className="flex items-center justify-center active:scale-95 transition-transform"
            style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 900, fontFamily: FL, color: BRAND }}>
            <Play className="w-5 h-5 ml-2" />המשך
          </button>
        )}
      </div>
    </div>
  );
}

const MODES = [
  { id: 'tabata', label: 'טבטה', icon: Zap },
  { id: 'timer', label: 'טיימר', icon: Timer },
  { id: 'stopwatch', label: 'סטופר', icon: Clock },
];

export default function Clocks() {
  const [mode, setMode] = useState('tabata');
  return (
    <div dir="rtl" style={{ backgroundColor: '#FFFFFF', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: '0 -16px', width: 'calc(100% + 32px)', maxWidth: 'none', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: `0.5px solid ${BRD}` }}>
        <div className="flex" style={{ padding: '10px 12px 8px', gap: 8 }}>
          {MODES.map(m => {
            const on = mode === m.id; const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className="flex-1 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                style={{ height: 42, borderRadius: 10, backgroundColor: on ? BRAND : BG2, color: on ? '#FFF' : C2, fontWeight: 700, fontSize: 16, fontFamily: FN, border: on ? 'none' : `0.5px solid ${BRD}` }}>
                <Icon className="w-4 h-4" />{m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {mode === 'tabata' && <TabataView />}
        {mode === 'timer' && <TimerView />}
        {mode === 'stopwatch' && <StopwatchView />}
      </div>
    </div>
  );
}
