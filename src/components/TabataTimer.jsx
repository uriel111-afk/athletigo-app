import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ─────────────────────────────────────────
// RICH SOUNDS — defined outside component (stable, never recreated)
// ─────────────────────────────────────────
const _a = (vol = 2.0) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  const master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
  return { ctx, master };
};

const SND_TICK = () => {
  try {
    const { ctx, master } = _a(2.0);
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
    o1.connect(g1); g1.connect(master); o1.type = 'triangle'; o1.frequency.value = 1200;
    g1.gain.setValueAtTime(0.9, ctx.currentTime); g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    o1.start(); o1.stop(ctx.currentTime + 0.06);
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(master); o2.type = 'sine'; o2.frequency.value = 600;
    g2.gain.setValueAtTime(0.4, ctx.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o2.start(); o2.stop(ctx.currentTime + 0.08);
  } catch(e) {}
};

const SND_GO = () => {
  try {
    const { ctx, master } = _a(2.0);
    [[523,0,0.15],[659,0.14,0.15],[784,0.28,0.25]].forEach(([f,d,dur]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(master); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ctx.currentTime+d); g.gain.linearRampToValueAtTime(0.8, ctx.currentTime+d+0.01);
      g.gain.setValueAtTime(0.8, ctx.currentTime+d+dur*0.6);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+d+dur);
      o.start(ctx.currentTime+d); o.stop(ctx.currentTime+d+dur);
    });
  } catch(e) {}
};

const SND_WORK = () => {
  try {
    const { ctx, master } = _a(2.0);
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
    o1.connect(g1); g1.connect(master); o1.type = 'sawtooth'; o1.frequency.value = 1400;
    g1.gain.setValueAtTime(0, ctx.currentTime); g1.gain.linearRampToValueAtTime(0.7, ctx.currentTime+0.01);
    g1.gain.setValueAtTime(0.7, ctx.currentTime+0.12); g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.18);
    o1.start(); o1.stop(ctx.currentTime+0.18);
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(master); o2.type = 'sawtooth'; o2.frequency.value = 1700;
    g2.gain.setValueAtTime(0, ctx.currentTime+0.20); g2.gain.linearRampToValueAtTime(0.8, ctx.currentTime+0.21);
    g2.gain.setValueAtTime(0.8, ctx.currentTime+0.38); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.46);
    o2.start(ctx.currentTime+0.20); o2.stop(ctx.currentTime+0.46);
    const o3 = ctx.createOscillator(); const g3 = ctx.createGain();
    o3.connect(g3); g3.connect(master); o3.type = 'sine';
    o3.frequency.setValueAtTime(200, ctx.currentTime); o3.frequency.exponentialRampToValueAtTime(60, ctx.currentTime+0.15);
    g3.gain.setValueAtTime(0.6, ctx.currentTime); g3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.15);
    o3.start(); o3.stop(ctx.currentTime+0.15);
  } catch(e) {}
};

const SND_BELL = () => {
  try {
    const { ctx, master } = _a(2.0);
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
    o1.connect(g1); g1.connect(master); o1.type = 'sine'; o1.frequency.value = 440;
    g1.gain.setValueAtTime(0.9, ctx.currentTime); g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+2.0);
    o1.start(); o1.stop(ctx.currentTime+2.0);
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(master); o2.type = 'sine'; o2.frequency.value = 880;
    g2.gain.setValueAtTime(0.4, ctx.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+1.4);
    o2.start(); o2.stop(ctx.currentTime+1.4);
    const o3 = ctx.createOscillator(); const g3 = ctx.createGain();
    o3.connect(g3); g3.connect(master); o3.type = 'sine'; o3.frequency.value = 1320;
    g3.gain.setValueAtTime(0.2, ctx.currentTime); g3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.9);
    o3.start(); o3.stop(ctx.currentTime+0.9);
    const o4 = ctx.createOscillator(); const g4 = ctx.createGain();
    o4.connect(g4); g4.connect(master); o4.type = 'sine'; o4.frequency.value = 110;
    g4.gain.setValueAtTime(0.3, ctx.currentTime); g4.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.5);
    o4.start(); o4.stop(ctx.currentTime+0.5);
  } catch(e) {}
};

const SND_DOUBLE_BELL = () => { SND_BELL(); setTimeout(SND_BELL, 700); };
const SND_TRIPLE_BELL = () => { SND_BELL(); setTimeout(SND_BELL, 600); setTimeout(SND_BELL, 1200); };

const unlockAudio = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch(e) {}
};

// ─────────────────────────────────────────
// PICKER OPTIONS — outside component
// ─────────────────────────────────────────
const PICKER_OPTS = {
  prep: Array.from({length: 61}, (_, i) => i),
  work: Array.from({length: 24}, (_, i) => (i + 1) * 5),
  rest: [0, ...Array.from({length: 24}, (_, i) => (i + 1) * 5)],
  rounds: Array.from({length: 30}, (_, i) => i + 1),
  sets: Array.from({length: 10}, (_, i) => i + 1),
  restBetween: [0, ...Array.from({length: 36}, (_, i) => (i + 1) * 5)],
  countdown: [0, ...Array.from({length: 20}, (_, i) => (i + 1) * 30)],
};

// ─────────────────────────────────────────
// SCROLL PICKER — outside component
// ─────────────────────────────────────────
const ScrollPicker = ({ value, options, unit, onChange, onClose }) => {
  const listRef = useRef(null);
  useEffect(() => {
    if (!options?.length) return;
    const idx = options.indexOf(value);
    if (idx >= 0) setTimeout(() => { listRef.current?.children[idx]?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, 80);
  }, []);
  if (!options?.length) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', direction: 'rtl', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{unit ? `בחר (${unit})` : 'בחר ערך'}</span>
          <button onClick={onClose} style={{ background: '#FF6F20', color: 'white', border: 'none', borderRadius: 10, padding: '8px 24px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>סגור</button>
        </div>
        <div ref={listRef} style={{ overflowY: 'auto', maxHeight: 300, padding: '6px 20px', WebkitOverflowScrolling: 'touch' }}>
          {options.map((v, i) => (
            <div key={i} onClick={() => { onChange(v); onClose(); }} style={{
              padding: '12px 0', textAlign: 'center', fontSize: 24,
              fontWeight: v === value ? 900 : 400,
              color: v === value ? '#FF6F20' : '#1a1a1a',
              background: v === value ? '#FFF0E8' : 'transparent',
              borderRadius: 8, cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
            }}>{v}{unit ? ` ${unit}` : ''}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// LONG PRESS HOOK
// ─────────────────────────────────────────
const useLongPress = (cb) => {
  const timer = useRef(null); const interval = useRef(null);
  const start = useCallback(() => { cb(); timer.current = setTimeout(() => { interval.current = setInterval(cb, 80); }, 400); }, [cb]);
  const stop = useCallback(() => { clearTimeout(timer.current); clearInterval(interval.current); }, []);
  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: (e) => { e.preventDefault(); start(); }, onTouchEnd: stop, onTouchCancel: stop };
};

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const C = 679; // 2*π*108

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export default function TabataTimer({ onMinimize, setLiveTimer }) {
  const navigate = useNavigate();
  const saved = (() => { try { return JSON.parse(localStorage.getItem('tabata_v2') || '{}'); } catch(e) { return {}; } })();

  const [prepTime, setPrepTime] = useState(saved.prepTime ?? 10);
  const [workTime, setWorkTime] = useState(saved.workTime ?? 20);
  const [restTime, setRestTime] = useState(saved.restTime ?? 10);
  const [rounds, setRounds] = useState(saved.rounds ?? 8);
  const [sets, setSets] = useState(saved.sets ?? 3);
  const [restBetween, setRestBetween] = useState(saved.restBetween ?? 60);
  const [cdTime, setCdTime] = useState(saved.cdTime ?? 30);

  useEffect(() => { localStorage.setItem('tabata_v2', JSON.stringify({ prepTime, workTime, restTime, rounds, sets, restBetween, cdTime })); }, [prepTime, workTime, restTime, rounds, sets, restBetween, cdTime]);

  const [screen, setScreen] = useState('settings');
  const [phase, setPhase] = useState('עבודה');
  const [timeLeft, setTimeLeft] = useState(0);
  const [phaseDur, setPhaseDur] = useState(0);
  const [curRound, setCurRound] = useState(1);
  const [curSet, setCurSet] = useState(1);
  const [totalLeft, setTotalLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [go321Val, setGo321Val] = useState(3);
  const [picker, setPicker] = useState(null);

  const mainRef = useRef(null); const totalRef = useRef(null); const go321Ref = useRef(null); const wakeLock = useRef(null);
  const tLeftRef = useRef(0); const phaseRef = useRef('עבודה'); const roundRef = useRef(1); const setNumRef = useRef(1);
  const workR = useRef(workTime); const restR = useRef(restTime); const roundsR = useRef(rounds); const setsR = useRef(sets); const restBetR = useRef(restBetween); const totalR = useRef(0);

  useEffect(() => { workR.current = workTime; }, [workTime]);
  useEffect(() => { restR.current = restTime; }, [restTime]);
  useEffect(() => { roundsR.current = rounds; }, [rounds]);
  useEffect(() => { setsR.current = sets; }, [sets]);
  useEffect(() => { restBetR.current = restBetween; }, [restBetween]);

  const reqWake = async () => { try { if ('wakeLock' in navigator) wakeLock.current = await navigator.wakeLock.request('screen'); } catch(e) {} };
  const relWake = () => { wakeLock.current?.release().catch(() => {}); wakeLock.current = null; };
  useEffect(() => { const fn = async () => { if (document.visibilityState === 'visible' && isRunning) await reqWake(); }; document.addEventListener('visibilitychange', fn); return () => document.removeEventListener('visibilitychange', fn); }, [isRunning]);

  const startPhase = (p, dur) => { tLeftRef.current = dur; phaseRef.current = p; setPhase(p); setTimeLeft(dur); setPhaseDur(dur); };

  const startMainInterval = () => {
    clearInterval(mainRef.current);
    mainRef.current = setInterval(() => {
      tLeftRef.current -= 1;
      const t = tLeftRef.current;
      if (t === 3 || t === 2 || t === 1) SND_TICK();
      if (t <= 0) { clearInterval(mainRef.current); doAdvance(); }
      else setTimeLeft(t);
    }, 1000);
  };

  const doAdvance = () => {
    const p = phaseRef.current, r = roundRef.current, s = setNumRef.current;
    if (p === 'הכנה') { roundRef.current = 1; setNumRef.current = 1; setCurRound(1); setCurSet(1); SND_WORK(); startPhase('עבודה', workR.current); startMainInterval(); }
    else if (p === 'עבודה') { SND_BELL(); startPhase('מנוחה', restR.current); startMainInterval(); }
    else if (p === 'מנוחה') {
      if (r < roundsR.current) { roundRef.current = r + 1; setCurRound(r + 1); SND_WORK(); startPhase('עבודה', workR.current); startMainInterval(); }
      else if (s < setsR.current) { roundRef.current = 1; setNumRef.current = s + 1; setCurRound(1); setCurSet(s + 1); SND_DOUBLE_BELL(); startPhase('מנוחה בין סטים', restBetR.current); startMainInterval(); }
      else { clearInterval(mainRef.current); clearInterval(totalRef.current); setScreen('complete'); setIsRunning(false); setLiveTimer(null); SND_TRIPLE_BELL(); relWake(); }
    }
    else if (p === 'מנוחה בין סטים') { SND_WORK(); startPhase('עבודה', workR.current); startMainInterval(); }
  };

  const calcTotal = () => (prepTime + (workTime + restTime) * rounds) * sets + restBetween * Math.max(0, sets - 1);

  const handleStart = () => {
    unlockAudio(); setScreen('go321'); setGo321Val(3); SND_TICK();
    let c = 3;
    go321Ref.current = setInterval(() => {
      c -= 1;
      if (c > 0) { setGo321Val(c); SND_TICK(); }
      else {
        clearInterval(go321Ref.current); setGo321Val('GO'); SND_GO();
        setTimeout(() => {
          const total = calcTotal(); totalR.current = total; setTotalLeft(total);
          roundRef.current = 1; setNumRef.current = 1; setCurRound(1); setCurSet(1);
          setIsRunning(true); setScreen('running');
          const initP = prepTime > 0 ? 'הכנה' : 'עבודה';
          const initD = prepTime > 0 ? prepTime : workR.current;
          if (initP === 'עבודה') SND_WORK();
          startPhase(initP, initD); startMainInterval();
          clearInterval(totalRef.current);
          totalRef.current = setInterval(() => { totalR.current -= 1; setTotalLeft(totalR.current); if (totalR.current <= 0) { clearInterval(totalRef.current); SND_DOUBLE_BELL(); } }, 1000);
          reqWake();
        }, 800);
      }
    }, 1000);
  };

  const handlePauseResume = () => {
    if (isRunning) { clearInterval(mainRef.current); clearInterval(totalRef.current); setIsRunning(false); }
    else { setIsRunning(true); startMainInterval(); totalRef.current = setInterval(() => { totalR.current -= 1; setTotalLeft(totalR.current); if (totalR.current <= 0) clearInterval(totalRef.current); }, 1000); }
  };

  const handleReset = () => { clearInterval(mainRef.current); clearInterval(totalRef.current); clearInterval(go321Ref.current); setIsRunning(false); setScreen('settings'); setLiveTimer(null); relWake(); };

  const doMinimize = useCallback(() => {
    setLiveTimer({ type: 'tabata', display: String(tLeftRef.current), phase: phaseRef.current, info: `סיבוב ${roundRef.current}/${roundsR.current} • סט ${setNumRef.current}/${setsR.current}`, color: '#FF6F20' });
    onMinimize();
  }, [onMinimize, setLiveTimer]);

  useEffect(() => { setLiveTimer(prev => { if (!prev) return null; return { ...prev, display: String(timeLeft), phase, info: `סיבוב ${curRound}/${rounds} • סט ${curSet}/${sets}` }; }); }, [timeLeft]);
  useEffect(() => { setLiveTimer(null); return () => { clearInterval(mainRef.current); clearInterval(totalRef.current); clearInterval(go321Ref.current); relWake(); }; }, []);

  useEffect(() => {
    if (!isRunning) return;
    window.history.pushState(null, '', window.location.href);
    const onPop = () => { window.history.pushState(null, '', window.location.href); doMinimize(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isRunning, doMinimize]);

  const MinimizeBtn = (
    <button onClick={(e) => { e.stopPropagation(); doMinimize(); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
    </button>
  );

  const incPrep = useLongPress(useCallback(() => setPrepTime(v => Math.min(60, v+1)), []));
  const decPrep = useLongPress(useCallback(() => setPrepTime(v => Math.max(0, v-1)), []));
  const incWork = useLongPress(useCallback(() => setWorkTime(v => Math.min(120, v+5)), []));
  const decWork = useLongPress(useCallback(() => setWorkTime(v => Math.max(5, v-5)), []));
  const incRest = useLongPress(useCallback(() => setRestTime(v => Math.min(120, v+5)), []));
  const decRest = useLongPress(useCallback(() => setRestTime(v => Math.max(0, v-5)), []));
  const incRounds = useLongPress(useCallback(() => setRounds(v => Math.min(30, v+1)), []));
  const decRounds = useLongPress(useCallback(() => setRounds(v => Math.max(1, v-1)), []));
  const incSets = useLongPress(useCallback(() => setSets(v => Math.min(10, v+1)), []));
  const decSets = useLongPress(useCallback(() => setSets(v => Math.max(1, v-1)), []));
  const incRB = useLongPress(useCallback(() => setRestBetween(v => Math.min(180, v+10)), []));
  const decRB = useLongPress(useCallback(() => setRestBetween(v => Math.max(0, v-10)), []));
  const incCD = useLongPress(useCallback(() => setCdTime(v => Math.min(600, v+30)), []));
  const decCD = useLongPress(useCallback(() => setCdTime(v => Math.max(0, v-30)), []));

  const ROWS = [
    { icon:'⏱', label:'הכנה', pk:'prep', unit:'שנ׳', value:prepTime, set:setPrepTime, inc:incPrep, dec:decPrep },
    { icon:'💪', label:'עבודה', pk:'work', unit:'שנ׳', value:workTime, set:setWorkTime, inc:incWork, dec:decWork },
    { icon:'😮', label:'מנוחה', pk:'rest', unit:'שנ׳', value:restTime, set:setRestTime, inc:incRest, dec:decRest },
    { icon:'🔄', label:'מחזורים', pk:'rounds', unit:'×', value:rounds, set:setRounds, inc:incRounds, dec:decRounds },
    { icon:'📋', label:'סטים', pk:'sets', unit:'×', value:sets, set:setSets, inc:incSets, dec:decSets },
    { icon:'⏸', label:'מנוחה בין סטים', pk:'restBetween', unit:'שנ׳', value:restBetween, set:setRestBetween, inc:incRB, dec:decRB, small:true },
    { icon:'🔔', label:'ספירה לאחור', pk:'countdown', unit:'שנ׳', value:cdTime, set:setCdTime, inc:incCD, dec:decCD, small:true },
  ];

  const totalSecs = calcTotal();

  // ── SCREENS ──

  if (screen === 'go321') return (
    <div style={{ background: '#FF6F20', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: go321Val === 'GO' ? 100 : 180, fontWeight: 900, color: 'white', lineHeight: 1 }}>{go321Val}</div>
    </div>
  );

  if (screen === 'complete') return (
    <div style={{ background: '#FF6F20', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, direction: 'rtl', padding: 24 }}>
      <div style={{ fontSize: 80, color: 'white' }}>✓</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: 'white' }}>כל הכבוד! סיימת!</div>
      <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)' }}>{sets} סטים • {rounds} מחזורים</div>
      <button onClick={handleReset} style={{ marginTop: 16, width: '100%', height: 56, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 12, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>התחל מחדש</button>
    </div>
  );

  if (screen === 'running') {
    const nextMap = { 'הכנה': { l: 'עבודה', d: workTime }, 'עבודה': { l: 'מנוחה', d: restTime }, 'מנוחה': curRound < rounds ? { l: 'עבודה', d: workTime } : curSet < sets ? { l: 'מנוחה בין סטים', d: restBetween } : null, 'מנוחה בין סטים': { l: 'עבודה', d: workTime } };
    const nxt = nextMap[phase];
    return (
      <div style={{ background: '#FF6F20', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          {MinimizeBtn}
          <div style={{ fontSize: 19, fontWeight: 900, color: 'white' }}>TABATA</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>נותר לסיום</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt(totalLeft)}</div>
          </div>
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, color: 'white', textAlign: 'center', paddingTop: 8, flexShrink: 0 }}>{phase}</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '2px 0' }}>
          <div style={{ position: 'relative', width: 'min(62vw, 248px)', height: 'min(62vw, 248px)' }}>
            <svg width="100%" height="100%" viewBox="0 0 248 248" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="124" cy="124" r="108" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10"/>
              <circle cx="124" cy="124" r="108" fill="none" stroke="white" strokeWidth="10" strokeDasharray={C} strokeDashoffset={phaseDur > 0 ? C * (timeLeft / phaseDur) : 0} strokeLinecap="round" transform="rotate(-90 124 124)" style={{ transition: 'stroke-dashoffset 0.95s linear' }}/>
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 'min(29vw, 112px)', fontWeight: 900, color: 'white', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -4 }}>{timeLeft}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '0 12px 10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 0' }}>
            {[{ label: 'סיבוב', val: `${curRound} / ${rounds}` }, { label: 'סט', val: `${curSet} / ${sets}` }].map((item, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums' }}>{item.val}</div>
              </div>
            ))}
          </div>
          {nxt && <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>הבא: {nxt.l}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'white' }}>{nxt.d} שנ׳</div>
          </div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleReset} style={{ flex: 1, height: 52, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>עצור</button>
            <button onClick={handlePauseResume} style={{ flex: 2, height: 52, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 19, fontWeight: 900, cursor: 'pointer' }}>{isRunning ? 'השהה ‖' : 'המשך ▶'}</button>
          </div>
        </div>
      </div>
    );
  }

  // SETTINGS
  return (
    <div style={{ background: '#FF6F20', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', direction: 'rtl' }}>
      <div style={{ padding: '9px 14px', background: 'rgba(0,0,0,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'white' }}>TABATA</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{fmt(totalSecs)} • {rounds}× • {sets} סטים</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', overflow: 'hidden' }}>
        {ROWS.map((row) => (
          <div key={row.pk} style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: 60, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 8, flexShrink: 0, fontSize: 14 }}>{row.icon}</div>
            <div style={{ flex: 1, fontSize: row.small ? 17 : 19, fontWeight: 700, color: 'white' }}>{row.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button {...row.dec} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', lineHeight: 1, flexShrink: 0, touchAction: 'none' }}>−</button>
              <span onClick={() => setPicker({ value: row.value, options: PICKER_OPTS[row.pk], unit: row.unit, onChange: row.set })} style={{ fontSize: 24, fontWeight: 900, color: 'white', minWidth: 38, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>{row.value}</span>
              <button {...row.inc} style={{ width: 34, height: 34, borderRadius: '50%', background: 'white', border: 'none', color: '#FF6F20', fontSize: 20, cursor: 'pointer', lineHeight: 1, flexShrink: 0, touchAction: 'none' }}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 12px 10px', flexShrink: 0 }}>
        <button onClick={handleStart} style={{ width: '100%', height: 52, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>▶ התחל</button>
      </div>
      {picker && <ScrollPicker value={picker.value} options={picker.options} unit={picker.unit} onChange={(v) => { picker.onChange(v); setPicker(null); }} onClose={() => setPicker(null)} />}
    </div>
  );
}
