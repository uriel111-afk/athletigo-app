import React, { useState, useRef, useCallback, useEffect } from "react";

// ═══ SOUNDS (outside component — stable, never recreated) ═══════════
const createCtx = () => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  const m = ctx.createGain(); m.gain.value = 1.4; m.connect(ctx.destination);
  return { ctx, m };
};

const TICK = () => {
  try {
    const { ctx, m } = createCtx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.65, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o.start(); o.stop(ctx.currentTime + 0.08);
  } catch(e) {}
};

const WHISTLE = () => {
  try {
    const { ctx, m } = createCtx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = 1350;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.65, ctx.currentTime + 0.01);
    g.gain.setValueAtTime(0.65, ctx.currentTime + 0.28);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    o.start(); o.stop(ctx.currentTime + 0.38);
  } catch(e) {}
};

const BELL = () => {
  try {
    const { ctx, m } = createCtx();
    [[520, 0.65, 1.5], [1040, 0.2, 0.9]].forEach(([freq, gain, dur]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.start(); o.stop(ctx.currentTime + dur);
    });
  } catch(e) {}
};

const GO_SOUND = () => {
  try {
    const { ctx, m } = createCtx();
    [[1100, 0, 0.10], [1600, 0.11, 0.15]].forEach(([freq, delay, dur]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.65, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
      o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + dur);
    });
  } catch(e) {}
};

const DOUBLE_BELL = () => { BELL(); setTimeout(BELL, 600); };
const TRIPLE_BELL = () => { BELL(); setTimeout(BELL, 500); setTimeout(BELL, 1000); };

const unlockAudio = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource(); s.buffer = b;
    s.connect(ctx.destination); s.start(0);
  } catch(e) {}
};

// ═══ CONSTANTS ═══════════════════════════════════════════════════════
const FN = "'Barlow Condensed', system-ui, sans-serif";
const FL = "'Heebo', sans-serif";

const PICKER_OPTIONS = {
  prep: [0,1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,45,60],
  work: [5,10,15,20,25,30,40,45,50,60,75,90,105,120],
  rest: [0,5,10,15,20,25,30,40,45,50,60,75,90,120],
  rounds: [1,2,3,4,5,6,7,8,10,12,15,20,25,30],
  sets: [1,2,3,4,5,6,7,8,9,10],
  restBetween: [0,10,20,30,45,60,90,120,150,180],
  countdown: [0,30,60,90,120,180,240,300,360,420,480,540,600],
};

const PARAMS = [
  { key: 'prep', icon: '⏱', label: 'הכנה', unit: 'שנ׳' },
  { key: 'work', icon: '💪', label: 'עבודה', unit: 'שנ׳' },
  { key: 'rest', icon: '😮', label: 'מנוחה', unit: 'שנ׳' },
  { key: 'rounds', icon: '🔄', label: 'מחזורים', unit: '×' },
  { key: 'sets', icon: '📋', label: 'סטים', unit: '×' },
  { key: 'restBetween', icon: '⏸', label: 'מנוחה בין סטים', unit: 'שנ׳' },
  { key: 'countdown', icon: '🔔', label: 'ספירה לאחור', unit: 'שנ׳' },
];

const fmtTime = (secs) => {
  if (secs === null || secs === undefined || secs < 0) return '0:00';
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ═══ SUB-COMPONENTS ══════════════════════════════════════════════════

function ScrollPicker({ value, options, unit, onChange, onClose }) {
  const listRef = useRef(null);
  useEffect(() => {
    if (listRef.current) {
      const idx = options.findIndex(v => v === value);
      if (idx >= 0) setTimeout(() => listRef.current?.children?.[idx]?.scrollIntoView({ block: 'center', behavior: 'instant' }), 100);
    }
  }, [value, options]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 500, direction: 'rtl', paddingBottom: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <span style={{ fontSize: 18, fontWeight: 700, fontFamily: FL }}>{unit ? `בחר (${unit})` : 'בחר ערך'}</span>
          <button onClick={onClose} style={{ background: '#FF6F20', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 28px', fontSize: 17, fontWeight: 700, fontFamily: FL, cursor: 'pointer' }}>סגור</button>
        </div>
        <div ref={listRef} style={{ overflowY: 'auto', maxHeight: 320, padding: '8px 20px', WebkitOverflowScrolling: 'touch' }}>
          {options.map((v, i) => (
            <div key={`${v}-${i}`} onClick={() => { onChange(v); onClose(); }} style={{
              padding: '12px 16px', marginBottom: 4, borderRadius: 10, fontSize: 22, fontWeight: v === value ? 900 : 500, fontFamily: FN,
              color: v === value ? '#FF6F20' : '#1A1A1A', background: v === value ? '#FFF0E8' : 'transparent',
              border: v === value ? '2px solid #FF6F20' : '2px solid transparent', cursor: 'pointer', textAlign: 'center',
              minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{v} {unit || ''}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

const useLongPress = (cb) => {
  const t = useRef(null); const i = useRef(null);
  const start = useCallback(() => { cb(); t.current = setTimeout(() => { i.current = setInterval(cb, 80); }, 400); }, [cb]);
  const stop = useCallback(() => { clearTimeout(t.current); clearInterval(i.current); }, []);
  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: (e) => { e.preventDefault(); start(); }, onTouchEnd: stop, onTouchCancel: stop };
};

// ═══ MAIN COMPONENT ═════════════════════════════════════════════════

export default function TabataTimer({ onMinimize, setLiveTimer }) {
  // --- Settings (localStorage) ---
  const loadSaved = () => { try { const s = localStorage.getItem('tabata_settings'); if (s) return JSON.parse(s); } catch(e) {} return null; };
  const savedRef = useRef(loadSaved());
  const saved = savedRef.current;

  const [prepTime, setPrepTime] = useState(saved?.prepTime ?? 10);
  const [workTime, setWorkTime] = useState(saved?.workTime ?? 20);
  const [restTime, setRestTime] = useState(saved?.restTime ?? 10);
  const [rounds, setRounds] = useState(saved?.rounds ?? 8);
  const [sets, setSets] = useState(saved?.sets ?? 3);
  const [restBetween, setRestBetween] = useState(saved?.restBetween ?? saved?.restBetweenSets ?? 60);
  const [countdown, setCountdown] = useState(saved?.countdown ?? saved?.countdownTime ?? 30);

  useEffect(() => {
    localStorage.setItem('tabata_settings', JSON.stringify({ prepTime, workTime, restTime, rounds, sets, restBetween, countdown }));
  }, [prepTime, workTime, restTime, rounds, sets, restBetween, countdown]);

  // --- Running state ---
  const [screen, setScreen] = useState('settings');
  const [phase, setPhase] = useState('עבודה');
  const [timeLeft, setTimeLeft] = useState(0);
  const [phaseDuration, setPhaseDuration] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentSet, setCurrentSet] = useState(1);
  const [parallelCountdown, setParallelCountdown] = useState(0);
  const [countdown321, setCountdown321State] = useState(3);
  const [isRunning, setIsRunning] = useState(false);

  // --- Refs ---
  const intervalRef = useRef(null);
  const parallelRef = useRef(null);
  const countdown321Ref = useRef(null);
  const wakeLockRef = useRef(null);
  const timeLeftRef = useRef(0);
  const phaseRef = useRef('עבודה');
  const roundRef = useRef(1);
  const setRef = useRef(1);
  const workRef = useRef(workTime);
  const restRef = useRef(restTime);
  const roundsRef = useRef(rounds);
  const setsRef = useRef(sets);
  const restBetweenRef = useRef(restBetween);
  const parallelValRef = useRef(0);

  useEffect(() => { workRef.current = workTime; }, [workTime]);
  useEffect(() => { restRef.current = restTime; }, [restTime]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { setsRef.current = sets; }, [sets]);
  useEffect(() => { restBetweenRef.current = restBetween; }, [restBetween]);

  // --- Picker ---
  const [picker, setPicker] = useState(null);

  // --- Core logic ---
  const startPhase = (newPhase, duration) => {
    timeLeftRef.current = duration;
    phaseRef.current = newPhase;
    setPhase(newPhase);
    setTimeLeft(duration);
    setPhaseDuration(duration);
  };

  const startInterval = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      const t = timeLeftRef.current;
      if (t === 3 || t === 2 || t === 1) TICK();
      if (t <= 0) { clearInterval(intervalRef.current); advancePhase(); }
      else setTimeLeft(t);
    }, 1000);
  };

  const advancePhase = () => {
    const p = phaseRef.current;
    const r = roundRef.current;
    const s = setRef.current;

    if (p === 'הכנה') {
      roundRef.current = 1; setRef.current = 1;
      setCurrentRound(1); setCurrentSet(1);
      WHISTLE();
      startPhase('עבודה', workRef.current);
      startInterval();
    } else if (p === 'עבודה') {
      BELL();
      startPhase('מנוחה', restRef.current);
      startInterval();
    } else if (p === 'מנוחה') {
      if (r < roundsRef.current) {
        roundRef.current = r + 1; setCurrentRound(r + 1);
        WHISTLE();
        startPhase('עבודה', workRef.current);
        startInterval();
      } else if (s < setsRef.current) {
        roundRef.current = 1; setRef.current = s + 1;
        setCurrentRound(1); setCurrentSet(s + 1);
        DOUBLE_BELL();
        startPhase('מנוחה בין סטים', restBetweenRef.current);
        startInterval();
      } else {
        clearInterval(intervalRef.current);
        clearInterval(parallelRef.current);
        setScreen('complete');
        setIsRunning(false);
        setLiveTimer?.(null);
        TRIPLE_BELL();
        releaseWakeLock();
      }
    } else if (p === 'מנוחה בין סטים') {
      WHISTLE();
      startPhase('עבודה', workRef.current);
      startInterval();
    }
  };

  const handleStart = () => {
    unlockAudio();
    setScreen('countdown321');
    let c = 3;
    setCountdown321State(3);
    TICK();

    countdown321Ref.current = setInterval(() => {
      c -= 1;
      if (c > 0) { setCountdown321State(c); TICK(); }
      else {
        clearInterval(countdown321Ref.current);
        setCountdown321State('GO');
        GO_SOUND();
        setTimeout(() => {
          setIsRunning(true);
          setScreen('running');
          setCurrentRound(1); setCurrentSet(1);
          roundRef.current = 1; setRef.current = 1;

          const initPhase = prepTime > 0 ? 'הכנה' : 'עבודה';
          const initDuration = prepTime > 0 ? prepTime : workRef.current;
          if (initPhase === 'עבודה') WHISTLE();
          startPhase(initPhase, initDuration);
          startInterval();

          parallelValRef.current = countdown;
          setParallelCountdown(countdown);
          clearInterval(parallelRef.current);
          parallelRef.current = setInterval(() => {
            parallelValRef.current -= 1;
            setParallelCountdown(parallelValRef.current);
            if (parallelValRef.current <= 0) { clearInterval(parallelRef.current); DOUBLE_BELL(); }
          }, 1000);

          requestWakeLock();
        }, 800);
      }
    }, 1000);
  };

  const handlePause = () => {
    if (isRunning) {
      clearInterval(intervalRef.current);
      clearInterval(parallelRef.current);
      setIsRunning(false);
    } else {
      setIsRunning(true);
      startInterval();
      parallelRef.current = setInterval(() => {
        parallelValRef.current -= 1;
        setParallelCountdown(parallelValRef.current);
        if (parallelValRef.current <= 0) clearInterval(parallelRef.current);
      }, 1000);
    }
  };

  const handleReset = () => {
    clearInterval(intervalRef.current);
    clearInterval(parallelRef.current);
    clearInterval(countdown321Ref.current);
    setIsRunning(false);
    setScreen('settings');
    setLiveTimer?.(null);
    releaseWakeLock();
  };

  const requestWakeLock = async () => {
    try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch(e) {}
  };
  const releaseWakeLock = () => { wakeLockRef.current?.release().catch(() => {}); wakeLockRef.current = null; };

  // Keep liveTimer updated
  useEffect(() => {
    setLiveTimer?.(prev => (!prev || !isRunning) ? prev : {
      ...prev, display: String(timeLeft), phase,
      info: `סיבוב ${currentRound}/${rounds} • סט ${currentSet}/${sets}`
    });
  }, [timeLeft]);

  // Clear liveTimer on mount (returning to clocks page)
  useEffect(() => { setLiveTimer?.(null); }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(intervalRef.current);
    clearInterval(parallelRef.current);
    clearInterval(countdown321Ref.current);
    releaseWakeLock();
  }, []);

  // --- Next phase helper ---
  const getNextPhase = () => {
    if (phase === 'הכנה') return { label: 'עבודה', duration: workTime };
    if (phase === 'עבודה') return { label: 'מנוחה', duration: restTime };
    if (phase === 'מנוחה') {
      if (currentRound < rounds) return { label: 'עבודה', duration: workTime };
      if (currentSet < sets) return { label: 'מנוחה בין סטים', duration: restBetween };
      return { label: 'סיום', duration: 0 };
    }
    if (phase === 'מנוחה בין סטים') return { label: 'עבודה', duration: workTime };
    return { label: '', duration: 0 };
  };

  // --- Long press handlers (stable, outside render) ---
  const incPrep = useLongPress(useCallback(() => setPrepTime(v => Math.min(60, v + 1)), []));
  const decPrep = useLongPress(useCallback(() => setPrepTime(v => Math.max(0, v - 1)), []));
  const incWork = useLongPress(useCallback(() => setWorkTime(v => Math.min(120, v + 1)), []));
  const decWork = useLongPress(useCallback(() => setWorkTime(v => Math.max(1, v - 1)), []));
  const incRest = useLongPress(useCallback(() => setRestTime(v => Math.min(120, v + 1)), []));
  const decRest = useLongPress(useCallback(() => setRestTime(v => Math.max(0, v - 1)), []));
  const incRounds = useLongPress(useCallback(() => setRounds(v => Math.min(30, v + 1)), []));
  const decRounds = useLongPress(useCallback(() => setRounds(v => Math.max(1, v - 1)), []));
  const incSets = useLongPress(useCallback(() => setSets(v => Math.min(10, v + 1)), []));
  const decSets = useLongPress(useCallback(() => setSets(v => Math.max(1, v - 1)), []));
  const incRestBtw = useLongPress(useCallback(() => setRestBetween(v => Math.min(180, v + 1)), []));
  const decRestBtw = useLongPress(useCallback(() => setRestBetween(v => Math.max(0, v - 1)), []));
  const incCountdown = useLongPress(useCallback(() => setCountdown(v => Math.min(600, v + 1)), []));
  const decCountdown = useLongPress(useCallback(() => setCountdown(v => Math.max(0, v - 1)), []));

  const longPressMap = {
    prep: { inc: incPrep, dec: decPrep },
    work: { inc: incWork, dec: decWork },
    rest: { inc: incRest, dec: decRest },
    rounds: { inc: incRounds, dec: decRounds },
    sets: { inc: incSets, dec: decSets },
    restBetween: { inc: incRestBtw, dec: decRestBtw },
    countdown: { inc: incCountdown, dec: decCountdown },
  };

  const settingsMap = {
    prep: [prepTime, setPrepTime], work: [workTime, setWorkTime],
    rest: [restTime, setRestTime], rounds: [rounds, setRounds],
    sets: [sets, setSets], restBetween: [restBetween, setRestBetween],
    countdown: [countdown, setCountdown],
  };

  // ═══ RENDER ════════════════════════════════════════════════════════

  // --- 3-2-1-GO ---
  if (screen === 'countdown321') {
    return (
      <div style={{ background: '#FF6F20', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: countdown321 === 'GO' ? 120 : 200, fontWeight: 900, color: 'white', lineHeight: 1, fontFamily: FN }}>{countdown321}</div>
      </div>
    );
  }

  // --- Complete ---
  if (screen === 'complete') {
    return (
      <div style={{ background: '#FF6F20', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, direction: 'rtl', padding: 20 }}>
        <div style={{ fontSize: 80, color: 'white' }}>✓</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: 'white', fontFamily: FL }}>כל הכבוד! סיימת!</div>
        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', fontFamily: FL }}>{sets} סטים • {rounds} מחזורים</div>
        <button onClick={handleReset} style={{ marginTop: 20, width: '100%', height: 56, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: FL }}>התחל מחדש</button>
      </div>
    );
  }

  // --- Running ---
  if (screen === 'running') {
    const next = getNextPhase();
    return (
      <div style={{ background: '#FF6F20', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', direction: 'rtl', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, minHeight: 56 }}>
          <button onClick={onMinimize} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
              <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
            </svg>
          </button>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: 1 }}>TABATA</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>ספירה לאחור</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtTime(parallelCountdown)}</div>
          </div>
        </div>

        {/* Phase label */}
        <div style={{ fontSize: 44, fontWeight: 900, color: 'white', textAlign: 'center', paddingTop: 10, flexShrink: 0, fontFamily: FL }}>{phase}</div>

        {/* Ring */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '4px 0' }}>
          <div style={{ position: 'relative', width: 'min(62vw, 250px)', height: 'min(62vw, 250px)' }}>
            <svg width="100%" height="100%" viewBox="0 0 250 250" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="125" cy="125" r="112" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10" />
              <circle cx="125" cy="125" r="112" fill="none" stroke="white" strokeWidth="10"
                strokeDasharray="704"
                strokeDashoffset={phaseDuration > 0 ? 704 * (timeLeft / phaseDuration) : 0}
                strokeLinecap="round" transform="rotate(-90 125 125)"
                style={{ transition: 'stroke-dashoffset 0.95s linear' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 'min(32vw, 124px)', fontWeight: 900, color: 'white', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -4, fontFamily: FN }}>{timeLeft}</div>
            </div>
          </div>
        </div>

        {/* Bottom section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 12px', flexShrink: 0 }}>
          {/* Stats */}
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 16px' }}>
            {[{ label: 'סיבוב', value: `${currentRound} / ${rounds}` }, { label: 'סט', value: `${currentSet} / ${sets}` }, { label: 'נותר', value: fmtTime(parallelCountdown) }].map((item, i) => (
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
          {next.label && next.label !== 'סיום' && (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: FL }}>הבא: {next.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'white', fontFamily: FN }}>{next.duration} שנ׳</div>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleReset} style={{ flex: 1, height: 52, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: FL }}>עצור</button>
            <button onClick={handlePause} style={{ flex: 2, height: 52, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: FL }}>
              {isRunning ? 'השהה ‖' : 'המשך ▶'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Settings ---
  const totalSecs = (prepTime + (workTime + restTime) * rounds) * sets + (sets > 1 ? restBetween * (sets - 1) : 0);
  const mm = String(Math.floor(totalSecs / 60)).padStart(2, '0');
  const ss = String(totalSecs % 60).padStart(2, '0');

  return (
    <div style={{ background: '#FF6F20', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100%', overflow: 'hidden', direction: 'rtl', margin: 0, padding: 0, width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ padding: '8px 20px', background: 'rgba(0,0,0,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 900, fontFamily: FN, color: '#FFF' }}>TABATA</span>
        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>{mm}:{ss} • {rounds} סיבובים • {sets} סטים</span>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', overflow: 'hidden' }}>
        {PARAMS.map(p => {
          const [val] = settingsMap[p.key];
          const opts = PICKER_OPTIONS[p.key];
          const lp = longPressMap[p.key];
          return (
            <div key={p.key} style={{ height: 58, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{p.icon}</div>
                <span style={{ fontSize: p.key === 'restBetween' || p.key === 'countdown' ? 18 : 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>{p.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button {...lp.dec} className="flex items-center justify-center active:scale-90 transition-transform"
                  style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', color: '#FFF', fontSize: 20, fontWeight: 700, border: 'none' }}>−</button>
                <span onClick={() => setPicker({ value: val, options: opts, unit: p.unit, onChange: settingsMap[p.key][1] })}
                  style={{ fontSize: 26, fontWeight: 900, fontFamily: FN, color: '#FFF', minWidth: 40, textAlign: 'center', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                <button {...lp.inc} className="flex items-center justify-center active:scale-90 transition-transform"
                  style={{ width: 34, height: 34, borderRadius: '50%', background: '#FFF', color: '#FF6F20', fontSize: 20, fontWeight: 700, border: 'none' }}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Start */}
      <div style={{ padding: '6px 20px 10px', flexShrink: 0 }}>
        <button onClick={handleStart} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
          style={{ height: 48, borderRadius: 12, background: '#FFF', fontSize: 20, fontWeight: 900, fontFamily: FL, color: '#FF6F20' }}>
          ▶ התחל
        </button>
      </div>

      {/* Picker */}
      {picker && <ScrollPicker value={picker.value} options={picker.options} unit={picker.unit} onChange={picker.onChange} onClose={() => setPicker(null)} />}
    </div>
  );
}
