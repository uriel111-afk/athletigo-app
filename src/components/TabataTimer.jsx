import React, { useState, useRef, useCallback, useEffect } from "react";

// ═══ SOUNDS (outside component — stable, never recreated) ═══════════
const _ctx = () => {
  const c = new (window.AudioContext || window.webkitAudioContext)();
  c.resume();
  const m = c.createGain(); m.gain.value = 1.5; m.connect(c.destination);
  return { c, m };
};

const SND_TICK = () => {
  try {
    const { c, m } = _ctx();
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.7, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.09);
    o.start(c.currentTime); o.stop(c.currentTime + 0.09);
  } catch(e) {}
};

const SND_GO = () => {
  try {
    const { c, m } = _ctx();
    [[1100, 0, 0.11], [1600, 0.12, 0.17]].forEach(([f, d, dur]) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.7, c.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d + dur);
      o.start(c.currentTime + d); o.stop(c.currentTime + d + dur);
    });
  } catch(e) {}
};

const SND_WORK = () => {
  try {
    const { c, m } = _ctx();
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = 1350;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.7, c.currentTime + 0.01);
    g.gain.setValueAtTime(0.7, c.currentTime + 0.28);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
    o.start(c.currentTime); o.stop(c.currentTime + 0.4);
  } catch(e) {}
};

const SND_BELL = () => {
  try {
    const { c, m } = _ctx();
    [[520, 0.7, 1.5], [1040, 0.22, 0.9]].forEach(([f, gain, dur]) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(c.currentTime); o.stop(c.currentTime + dur);
    });
  } catch(e) {}
};

const SND_DOUBLE_BELL = () => { SND_BELL(); setTimeout(SND_BELL, 600); };
const SND_TRIPLE_BELL = () => { SND_BELL(); setTimeout(SND_BELL, 500); setTimeout(SND_BELL, 1000); };

const unlockAudio = () => {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    c.resume();
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
  } catch(e) {}
};

// ═══ PICKER OPTIONS ══════════════════════════════════════════════════
const PICKER = {
  prep: [0,1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,45,60],
  work: [5,10,15,20,25,30,40,45,50,60,75,90,105,120],
  rest: [0,5,10,15,20,25,30,40,45,50,60,75,90,120],
  rounds: [1,2,3,4,5,6,7,8,10,12,15,20,25,30],
  sets: [1,2,3,4,5,6,7,8,9,10],
  restBetween: [0,10,20,30,45,60,90,120,150,180],
  countdown: [0,30,60,90,120,180,240,300,360,420,480,540,600],
};

// ═══ SCROLL PICKER ═══════════════════════════════════════════════════
const ScrollPicker = ({ value, options, unit, onChange, onClose }) => {
  const listRef = useRef(null);
  useEffect(() => {
    const idx = options.indexOf(value);
    if (listRef.current && idx >= 0)
      setTimeout(() => listRef.current?.children[idx]?.scrollIntoView({ block: 'center', behavior: 'instant' }), 50);
  }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, direction: 'rtl', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>בחר {unit ? `(${unit})` : ''}</span>
          <button onClick={onClose} style={{ background: '#FF6F20', color: 'white', border: 'none', borderRadius: 10, padding: '8px 28px', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>אישור</button>
        </div>
        <div ref={listRef} style={{ overflowY: 'auto', maxHeight: 320, padding: '6px 20px', display: 'flex', flexDirection: 'column', gap: 2, WebkitOverflowScrolling: 'touch' }}>
          {options.map((v, i) => (
            <div key={i} onClick={() => { onChange(v); onClose(); }} style={{
              padding: '11px 16px', borderRadius: 10, fontSize: 22,
              fontWeight: v === value ? 900 : 500,
              color: v === value ? '#FF6F20' : '#1a1a1a',
              background: v === value ? '#FFF0E8' : 'transparent',
              border: `2px solid ${v === value ? '#FF6F20' : 'transparent'}`,
              cursor: 'pointer', textAlign: 'center',
            }}>{v}{unit ? ` ${unit}` : ''}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══ LONG PRESS HOOK ═════════════════════════════════════════════════
const useLongPress = (cb) => {
  const t = useRef(null); const iv = useRef(null);
  const start = useCallback(() => { cb(); t.current = setTimeout(() => { iv.current = setInterval(cb, 80); }, 400); }, [cb]);
  const stop = useCallback(() => { clearTimeout(t.current); clearInterval(iv.current); }, []);
  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: (e) => { e.preventDefault(); start(); }, onTouchEnd: stop, onTouchCancel: stop };
};

// ═══ FORMAT ══════════════════════════════════════════════════════════
const formatT = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ═══ MAIN COMPONENT ═════════════════════════════════════════════════
export default function TabataTimer({ onMinimize, setLiveTimer }) {
  // Load saved settings
  const saved = (() => { try { return JSON.parse(localStorage.getItem('tabata_settings') || '{}'); } catch(e) { return {}; } })();

  const [prepTime, setPrepTime] = useState(saved.prepTime ?? 10);
  const [workTime, setWorkTime] = useState(saved.workTime ?? 20);
  const [restTime, setRestTime] = useState(saved.restTime ?? 10);
  const [rounds, setRounds] = useState(saved.rounds ?? 8);
  const [sets, setSets] = useState(saved.sets ?? 3);
  const [restBetween, setRestBetween] = useState(saved.restBetween ?? 60);
  const [cdTime, setCdTime] = useState(saved.cdTime ?? saved.countdown ?? saved.countdownTime ?? 30);

  useEffect(() => {
    localStorage.setItem('tabata_settings', JSON.stringify({ prepTime, workTime, restTime, rounds, sets, restBetween, cdTime }));
  }, [prepTime, workTime, restTime, rounds, sets, restBetween, cdTime]);

  // Running state
  const [screen, setScreen] = useState('settings');
  const [phase, setPhase] = useState('עבודה');
  const [timeLeft, setTimeLeft] = useState(0);
  const [phaseDur, setPhaseDur] = useState(0);
  const [curRound, setCurRound] = useState(1);
  const [curSet, setCurSet] = useState(1);
  const [parallelCD, setParallelCD] = useState(0);
  const [cd321, setCd321] = useState(3);
  const [isRunning, setIsRunning] = useState(false);
  const [picker, setPicker] = useState(null);

  // Refs
  const intervalRef = useRef(null);
  const parallelRef = useRef(null);
  const cd321Ref = useRef(null);
  const wakeLockRef = useRef(null);
  const timeLeftRef = useRef(0);
  const phaseRef = useRef('עבודה');
  const roundRef = useRef(1);
  const setNumRef = useRef(1);
  const workRef = useRef(workTime);
  const restRef = useRef(restTime);
  const roundsRef = useRef(rounds);
  const setsRef = useRef(sets);
  const restBetRef = useRef(restBetween);
  const parallelValRef = useRef(0);

  useEffect(() => { workRef.current = workTime; }, [workTime]);
  useEffect(() => { restRef.current = restTime; }, [restTime]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { setsRef.current = sets; }, [sets]);
  useEffect(() => { restBetRef.current = restBetween; }, [restBetween]);

  // Wake lock
  const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch(e) {} };
  const releaseWakeLock = () => { wakeLockRef.current?.release().catch(() => {}); wakeLockRef.current = null; };
  useEffect(() => {
    const onVis = async () => { if (document.visibilityState === 'visible' && isRunning) await requestWakeLock(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isRunning]);

  // Core logic
  const startPhase = (newPhase, duration) => {
    timeLeftRef.current = duration;
    phaseRef.current = newPhase;
    setPhase(newPhase);
    setTimeLeft(duration);
    setPhaseDur(duration);
  };

  const startInterval = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      const t = timeLeftRef.current;
      if (t === 3 || t === 2 || t === 1) SND_TICK();
      if (t <= 0) { clearInterval(intervalRef.current); advancePhase(); }
      else setTimeLeft(t);
    }, 1000);
  };

  const advancePhase = () => {
    const p = phaseRef.current;
    const r = roundRef.current;
    const s = setNumRef.current;

    if (p === 'הכנה') {
      roundRef.current = 1; setNumRef.current = 1;
      setCurRound(1); setCurSet(1);
      SND_WORK(); startPhase('עבודה', workRef.current); startInterval();
    } else if (p === 'עבודה') {
      SND_BELL(); startPhase('מנוחה', restRef.current); startInterval();
    } else if (p === 'מנוחה') {
      if (r < roundsRef.current) {
        roundRef.current = r + 1; setCurRound(r + 1);
        SND_WORK(); startPhase('עבודה', workRef.current); startInterval();
      } else if (s < setsRef.current) {
        roundRef.current = 1; setNumRef.current = s + 1;
        setCurRound(1); setCurSet(s + 1);
        SND_DOUBLE_BELL(); startPhase('מנוחה בין סטים', restBetRef.current); startInterval();
      } else {
        clearInterval(intervalRef.current); clearInterval(parallelRef.current);
        setScreen('complete'); setIsRunning(false);
        setLiveTimer(null); SND_TRIPLE_BELL(); releaseWakeLock();
      }
    } else if (p === 'מנוחה בין סטים') {
      SND_WORK(); startPhase('עבודה', workRef.current); startInterval();
    }
  };

  const handleStart = () => {
    unlockAudio();
    setScreen('countdown321');
    let c = 3; setCd321(3); SND_TICK();
    cd321Ref.current = setInterval(() => {
      c -= 1;
      if (c > 0) { setCd321(c); SND_TICK(); }
      else {
        clearInterval(cd321Ref.current); setCd321('GO'); SND_GO();
        setTimeout(() => {
          const initPhase = prepTime > 0 ? 'הכנה' : 'עבודה';
          const initDur = prepTime > 0 ? prepTime : workRef.current;
          roundRef.current = 1; setNumRef.current = 1;
          setCurRound(1); setCurSet(1);
          setIsRunning(true); setScreen('running');
          if (initPhase === 'עבודה') SND_WORK();
          startPhase(initPhase, initDur); startInterval();
          parallelValRef.current = cdTime; setParallelCD(cdTime);
          clearInterval(parallelRef.current);
          parallelRef.current = setInterval(() => {
            parallelValRef.current -= 1; setParallelCD(parallelValRef.current);
            if (parallelValRef.current <= 0) { clearInterval(parallelRef.current); SND_DOUBLE_BELL(); }
          }, 1000);
          requestWakeLock();
        }, 800);
      }
    }, 1000);
  };

  const handlePause = () => {
    if (isRunning) {
      clearInterval(intervalRef.current); clearInterval(parallelRef.current); setIsRunning(false);
    } else {
      setIsRunning(true); startInterval();
      parallelRef.current = setInterval(() => {
        parallelValRef.current -= 1; setParallelCD(parallelValRef.current);
        if (parallelValRef.current <= 0) clearInterval(parallelRef.current);
      }, 1000);
    }
  };

  const handleReset = () => {
    clearInterval(intervalRef.current); clearInterval(parallelRef.current); clearInterval(cd321Ref.current);
    setIsRunning(false); setScreen('settings'); setLiveTimer(null); releaseWakeLock();
  };

  // Update floating widget
  useEffect(() => {
    setLiveTimer(prev => (!prev || !isRunning) ? prev : {
      ...prev, display: String(timeLeft), phase,
      info: `סיבוב ${curRound}/${rounds} • סט ${curSet}/${sets}`
    });
  }, [timeLeft]);

  useEffect(() => { setLiveTimer(null); }, []);

  useEffect(() => () => {
    clearInterval(intervalRef.current); clearInterval(parallelRef.current); clearInterval(cd321Ref.current);
    releaseWakeLock();
  }, []);

  // Long press handlers
  const incPrep = useLongPress(useCallback(() => setPrepTime(v => Math.min(60, v + 1)), []));
  const decPrep = useLongPress(useCallback(() => setPrepTime(v => Math.max(0, v - 1)), []));
  const incWork = useLongPress(useCallback(() => setWorkTime(v => Math.min(120, v + 5)), []));
  const decWork = useLongPress(useCallback(() => setWorkTime(v => Math.max(5, v - 5)), []));
  const incRest = useLongPress(useCallback(() => setRestTime(v => Math.min(120, v + 5)), []));
  const decRest = useLongPress(useCallback(() => setRestTime(v => Math.max(0, v - 5)), []));
  const incRounds = useLongPress(useCallback(() => setRounds(v => Math.min(30, v + 1)), []));
  const decRounds = useLongPress(useCallback(() => setRounds(v => Math.max(1, v - 1)), []));
  const incSets = useLongPress(useCallback(() => setSets(v => Math.min(10, v + 1)), []));
  const decSets = useLongPress(useCallback(() => setSets(v => Math.max(1, v - 1)), []));
  const incRB = useLongPress(useCallback(() => setRestBetween(v => Math.min(180, v + 10)), []));
  const decRB = useLongPress(useCallback(() => setRestBetween(v => Math.max(0, v - 10)), []));
  const incCD = useLongPress(useCallback(() => setCdTime(v => Math.min(600, v + 30)), []));
  const decCD = useLongPress(useCallback(() => setCdTime(v => Math.max(0, v - 30)), []));

  const ROWS = [
    { icon: '⏱', label: 'הכנה', value: prepTime, set: setPrepTime, pk: 'prep', unit: 'שנ׳', inc: incPrep, dec: decPrep },
    { icon: '💪', label: 'עבודה', value: workTime, set: setWorkTime, pk: 'work', unit: 'שנ׳', inc: incWork, dec: decWork },
    { icon: '😮', label: 'מנוחה', value: restTime, set: setRestTime, pk: 'rest', unit: 'שנ׳', inc: incRest, dec: decRest },
    { icon: '🔄', label: 'מחזורים', value: rounds, set: setRounds, pk: 'rounds', unit: '×', inc: incRounds, dec: decRounds },
    { icon: '📋', label: 'סטים', value: sets, set: setSets, pk: 'sets', unit: '×', inc: incSets, dec: decSets },
    { icon: '⏸', label: 'מנוחה בין סטים', value: restBetween, set: setRestBetween, pk: 'restBetween', unit: 'שנ׳', inc: incRB, dec: decRB, labelSize: 18 },
    { icon: '🔔', label: 'ספירה לאחור', value: cdTime, set: setCdTime, pk: 'countdown', unit: 'שנ׳', inc: incCD, dec: decCD, labelSize: 18 },
  ];

  const totalSecs = (prepTime + (workTime + restTime) * rounds) * sets + restBetween * (sets - 1);

  // Next phase helper
  const getNext = () => {
    if (phase === 'הכנה') return { label: 'עבודה', dur: workTime };
    if (phase === 'עבודה') return { label: 'מנוחה', dur: restTime };
    if (phase === 'מנוחה') {
      if (curRound < rounds) return { label: 'עבודה', dur: workTime };
      if (curSet < sets) return { label: 'מנוחה בין סטים', dur: restBetween };
      return { label: 'סיום', dur: 0 };
    }
    if (phase === 'מנוחה בין סטים') return { label: 'עבודה', dur: workTime };
    return { label: '', dur: 0 };
  };

  // ═══ SCREENS ═══════════════════════════════════════════════════════

  if (screen === 'countdown321') return (
    <div style={{ background: '#FF6F20', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: cd321 === 'GO' ? 110 : 200, fontWeight: 900, color: 'white', lineHeight: 1 }}>{cd321}</div>
    </div>
  );

  if (screen === 'complete') return (
    <div style={{ background: '#FF6F20', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, direction: 'rtl', padding: 20 }}>
      <div style={{ fontSize: 80, color: 'white', lineHeight: 1 }}>✓</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: 'white' }}>כל הכבוד! סיימת!</div>
      <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)' }}>{sets} סטים • {rounds} מחזורים</div>
      <button onClick={handleReset} style={{ marginTop: 20, width: '100%', height: 56, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 12, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>התחל מחדש</button>
    </div>
  );

  if (screen === 'running') {
    const next = getNext();
    return (
      <div style={{ background: '#FF6F20', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={(e) => { e.stopPropagation(); setLiveTimer({ type: 'tabata', display: String(timeLeft), phase, info: `סיבוב ${curRound}/${rounds} • סט ${curSet}/${sets}`, color: '#FF6F20' }); onMinimize(); }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
              <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
            </svg>
          </button>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'white' }}>TABATA</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>נותר לסיום</div>
            <div style={{ fontSize: 34, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{formatT(parallelCD)}</div>
          </div>
        </div>

        {/* Phase */}
        <div style={{ fontSize: 42, fontWeight: 900, color: 'white', textAlign: 'center', paddingTop: 8, flexShrink: 0 }}>{phase}</div>

        {/* Ring */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '2px 0' }}>
          <div style={{ position: 'relative', width: 'min(60vw, 240px)', height: 'min(60vw, 240px)' }}>
            <svg width="100%" height="100%" viewBox="0 0 240 240" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="120" cy="120" r="108" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10" />
              <circle cx="120" cy="120" r="108" fill="none" stroke="white" strokeWidth="10"
                strokeDasharray="678" strokeDashoffset={phaseDur > 0 ? 678 * (timeLeft / phaseDur) : 0}
                strokeLinecap="round" transform="rotate(-90 120 120)"
                style={{ transition: 'stroke-dashoffset 0.95s linear' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 'min(30vw, 114px)', fontWeight: 900, color: 'white', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -4 }}>{timeLeft}</div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 14px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 16px' }}>
            {[{ label: 'סיבוב', value: `${curRound} / ${rounds}` }, { label: 'סט', value: `${curSet} / ${sets}` }].map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
          {next.label && next.label !== 'סיום' && (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>הבא: {next.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'white' }}>{next.dur} שנ׳</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleReset} style={{ flex: 1, height: 52, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>עצור</button>
            <button onClick={handlePause} style={{ flex: 2, height: 52, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>
              {isRunning ? 'השהה ‖' : 'המשך ▶'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══ SETTINGS ══════════════════════════════════════════════════════
  return (
    <div style={{ background: '#FF6F20', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', direction: 'rtl' }}>
      <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'white' }}>TABATA</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{formatT(totalSecs)} • {rounds} סיבובים • {sets} סטים</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', overflow: 'hidden' }}>
        {ROWS.map((row) => (
          <div key={row.pk} style={{ display: 'flex', alignItems: 'center', padding: '0 14px', height: 62, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 10, flexShrink: 0, fontSize: 15 }}>{row.icon}</div>
            <div style={{ flex: 1, fontSize: row.labelSize || 20, fontWeight: 700, color: 'white' }}>{row.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button {...row.dec} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', lineHeight: 1, flexShrink: 0, touchAction: 'none' }}>−</button>
              <span onClick={() => setPicker({ value: row.value, options: PICKER[row.pk], unit: row.unit, onChange: row.set })}
                style={{ fontSize: 26, fontWeight: 900, color: 'white', minWidth: 40, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>{row.value}</span>
              <button {...row.inc} style={{ width: 34, height: 34, borderRadius: '50%', background: 'white', border: 'none', color: '#FF6F20', fontSize: 20, cursor: 'pointer', lineHeight: 1, flexShrink: 0, touchAction: 'none' }}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 14px 12px', flexShrink: 0 }}>
        <button onClick={handleStart} style={{ width: '100%', height: 52, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>▶ התחל</button>
      </div>
      {picker && <ScrollPicker value={picker.value} options={picker.options} unit={picker.unit} onChange={(v) => { picker.onChange(v); setPicker(null); }} onClose={() => setPicker(null)} />}
    </div>
  );
}
