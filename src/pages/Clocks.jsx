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

function HoldButton({ onClick, children, className, style }) {
  const intRef = useRef(null), toRef = useRef(null);
  const start = useCallback(() => { onClick(); toRef.current = setTimeout(() => { intRef.current = setInterval(onClick, 80); }, 400); }, [onClick]);
  const stop = useCallback(() => { if (toRef.current) { clearTimeout(toRef.current); toRef.current = null; } if (intRef.current) { clearInterval(intRef.current); intRef.current = null; } }, []);
  return <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop} onTouchStart={(e) => { e.preventDefault(); start(); }} onTouchEnd={stop} onTouchCancel={stop} className={className} style={style}>{children}</button>;
}

function ScrollPicker({ isOpen, value, onChange, onClose, min = 0, max = 59, step = 1, unit = '', options: propOptions }) {
  const listRef = useRef(null);
  const options = propOptions || (() => { const a = []; for (let i = min; i <= max; i += step) a.push(i); return a; })();
  useEffect(() => {
    if (isOpen && listRef.current && options.length > 0) {
      const idx = options.findIndex(v => v === value);
      if (idx >= 0) setTimeout(() => listRef.current?.children?.[idx]?.scrollIntoView({ block: 'center', behavior: 'instant' }), 100);
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

// ═══ SOUNDS (Timer & Stopwatch) ═══
const unlockAudio = () => {
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const b = ctx.createBuffer(1,1,22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch(e) {}
};
const clockTone = (freq, dur, delay = 0, vol = 1.8) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(master); o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.8, ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
    o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + dur);
  } catch(e) {}
};
const SOUND_START = () => { clockTone(660, 0.08, 0); clockTone(880, 0.09, 0.09); clockTone(1100, 0.12, 0.18); };
const SOUND_PAUSE = () => { clockTone(1100, 0.08, 0); clockTone(880, 0.08, 0.09); clockTone(660, 0.10, 0.18); };
const SOUND_RESET = () => { clockTone(1100, 0.08, 0); clockTone(880, 0.08, 0.09); clockTone(660, 0.10, 0.18); };
const SOUND_TICK = () => { clockTone(1200, 0.06, 0); clockTone(600, 0.08, 0); };
const SOUND_ALERT = () => { clockTone(1200, 0.06, 0); clockTone(1200, 0.06, 0.15); };
const SOUND_TRIPLE_BELL = () => { [0, 0.5, 1.0].forEach(d => { clockTone(440, 1.5, d, 1.8); clockTone(880, 1.0, d, 0.6); }); };

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
        <div className="tabular-nums leading-none" style={{ fontSize: 96, fontWeight: 900, fontFamily: FN, color: '#FFF', letterSpacing: -2 }}>{fmtStopwatch(display)}</div>
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
            <button onClick={() => { SOUND_PAUSE(); pause(); }} className="flex items-center justify-center active:scale-95 transition-transform"
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
    <div dir="rtl" style={{ padding: '16px 16px 100px' }} className="flex flex-col items-center gap-5">
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: C3, letterSpacing: 2, textTransform: 'uppercase', marginTop: 16 }}>STOPWATCH</div>
      <div className="text-center tabular-nums leading-none" style={{ fontSize: 80, fontWeight: 900, fontFamily: FN, color: '#D1D5DB' }}>00:00.00</div>
      <button onClick={() => { unlockAudio(); SOUND_START(); startStopwatch(); }} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
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
      <ScrollPicker isOpen={picking} value={value} onChange={onChange} onClose={() => setPicking(false)} min={0} max={max} step={step || 1} unit={unit || ''} />
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

  useEffect(() => {
    if (!active || !isRunning || phase === 'prepare') return;
    const secLeft = Math.ceil(display / 1000);
    if (secLeft === 10 && lastBeepRef.current !== 10) { lastBeepRef.current = 10; SOUND_ALERT(); }
    if ((secLeft === 3 || secLeft === 2 || secLeft === 1) && secLeft !== lastBeepRef.current) { lastBeepRef.current = secLeft; SOUND_TICK(); }
    if (display <= 50 && lastBeepRef.current !== 0) { lastBeepRef.current = 0; SOUND_TRIPLE_BELL(); }
  }, [display, active, isRunning, phase]);
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
        <div className="flex items-center gap-3 w-full justify-center" style={{ backgroundColor: BG2, borderRadius: 10, padding: '10px 16px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FL, color: C2 }}>הכנה</span>
          <HoldButton onClick={() => setPrepSec(Math.max(0, prepSec - 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#FFF', color: C2, fontSize: 18, fontWeight: 700, border: `0.5px solid ${BRD}` }}>−</HoldButton>
          <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 700, fontFamily: FN, color: C1, minWidth: 32, textAlign: 'center' }}>{prepSec}</span>
          <HoldButton onClick={() => setPrepSec(Math.min(60, prepSec + 1))} className="flex items-center justify-center active:scale-90 transition-transform" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: BRAND, color: '#FFF', fontSize: 18, fontWeight: 700, border: 'none' }}>+</HoldButton>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: FL, color: C3 }}>שניות</span>
        </div>
        <button onClick={() => { unlockAudio(); SOUND_START(); startTimer(totalTimerMs, prepSec * 1000); }} disabled={totalTimerMs === 0}
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
        <button onClick={() => { SOUND_RESET(); stop(); }} className="flex items-center justify-center active:scale-90 transition-transform"
          style={{ flex: 1, height: 56, borderRadius: 12, border: `1px solid ${BRD}`, backgroundColor: '#FFF', fontSize: 16, fontWeight: 700, fontFamily: FL, color: C2 }}>
          <RotateCcw className="w-5 h-5 ml-1.5" />אפס
        </button>
        {isRunning ? (
          <button onClick={() => { SOUND_PAUSE(); pause(); }} className="flex items-center justify-center active:scale-95 transition-transform"
            style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
            <Pause className="w-6 h-6 ml-2" />השהה
          </button>
        ) : (
          <button onClick={() => { SOUND_START(); resume(); }} className="flex items-center justify-center active:scale-95 transition-transform"
            style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
            <Play className="w-6 h-6 ml-2" />המשך
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══ CLOCKS PAGE ═══ */
const MODES = [
  { id: 'tabata', label: 'טבטה', icon: Zap },
  { id: 'timer', label: 'טיימר', icon: Timer },
  { id: 'stopwatch', label: 'סטופר', icon: Clock },
];

export default function Clocks() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('tabata');
  const clock = useClock();
  const { setLiveTimer, setShowTabata } = useActiveTimer();
  const timerOrStopwatchRunning = clock?.isRunning && (clock?.activeClock === 'timer' || clock?.activeClock === 'stopwatch');
  const anyRunning = timerOrStopwatchRunning;
  const lastBackPress = useRef(0);

  // Minimize — NEVER stops intervals
  const minimizeTimer = useCallback(() => {
    console.log('minimizeTimer called → navigate(-1)');
    if (clock?.isRunning && clock?.activeClock === 'timer') {
      setLiveTimer({ type: 'timer', display: fmt(clock.display), phase: 'טיימר', info: null });
    } else if (clock?.isRunning && clock?.activeClock === 'stopwatch') {
      setLiveTimer({ type: 'stopwatch', display: fmtStopwatch(clock.display), phase: 'סטופר', info: null });
    }
    navigate(-1);
  }, [clock, setLiveTimer, navigate]);

  // Update floating widget every tick (timer/stopwatch from ClockContext)
  useEffect(() => {
    setLiveTimer(prev => {
      if (!prev) return prev;
      if (prev.type === 'timer' && clock?.isRunning) return { ...prev, display: fmt(clock.display) };
      if (prev.type === 'stopwatch' && clock?.isRunning) return { ...prev, display: fmtStopwatch(clock.display) };
      return prev;
    });
  }, [clock?.display]);

  // When returning to clocks page — hide floating widget (only if nothing running)
  // Do NOT clear liveTimer on mount — it must persist after minimize

  // Back button: single = minimize, double (400ms) = dashboard
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPop = () => {
      const now = Date.now();
      const isDouble = now - lastBackPress.current < 400;
      if (anyRunning) {
        window.history.pushState(null, '', window.location.href);
        if (isDouble) { minimizeTimer(); navigate('/'); }
        else { lastBackPress.current = now; minimizeTimer(); }
      } else {
        if (isDouble) navigate('/');
        else { lastBackPress.current = now; navigate(-1); }
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [anyRunning, minimizeTimer]);

  // Wake lock
  const globalWakeLockRef = useRef(null);
  useEffect(() => {
    const acquire = async () => { try { if ('wakeLock' in navigator && !globalWakeLockRef.current) globalWakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {} };
    if (anyRunning) acquire();
    else if (globalWakeLockRef.current) { globalWakeLockRef.current.release().catch(() => {}); globalWakeLockRef.current = null; }
  }, [anyRunning]);
  useEffect(() => {
    const onVis = async () => { if (document.visibilityState === 'visible' && anyRunning) { try { if ('wakeLock' in navigator) globalWakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {} } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [anyRunning]);
  useEffect(() => () => { globalWakeLockRef.current?.release().catch(() => {}); globalWakeLockRef.current = null; }, []);

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
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: activeTab === 'tabata' ? '#FF6F20' : '#FFFFFF' }}>
        <div style={{ display: activeTab === 'tabata' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',background:'#FF6F20',gap:'16px'}}>
            <div style={{fontSize:'60px'}}>⏱</div>
            <button onClick={() => setShowTabata(true)} style={{background:'white',color:'#FF6F20',border:'none',borderRadius:'12px',padding:'16px 40px',fontSize:'22px',fontWeight:'900',cursor:'pointer'}}>▶ פתח טבטה</button>
          </div>
        </div>
        <div style={{ display: activeTab === 'timer' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <TimerView onMinimize={minimizeTimer} />
        </div>
        <div style={{ display: activeTab === 'stopwatch' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <StopwatchView onMinimize={minimizeTimer} />
        </div>
      </div>
    </div>
  );
}
