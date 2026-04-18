import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── SOUNDS (outside component — stable references) ───

const SND_TICK = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const m = ctx.createGain(); m.gain.value = 2.0; m.connect(ctx.destination);
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
    o1.connect(g1); g1.connect(m); o1.type = 'square'; o1.frequency.value = 1200;
    g1.gain.setValueAtTime(0.8, ctx.currentTime); g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    o1.start(); o1.stop(ctx.currentTime + 0.05);
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(m); o2.type = 'sine'; o2.frequency.value = 150;
    g2.gain.setValueAtTime(0.5, ctx.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o2.start(); o2.stop(ctx.currentTime + 0.08);
  } catch(e) {}
};

const SND_GO = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const m = ctx.createGain(); m.gain.value = 2.0; m.connect(ctx.destination);
    [[523,0,0.12],[659,0.1,0.14],[784,0.22,0.2],[1047,0.36,0.28]].forEach(([f,d,dur])=>{
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.7, ctx.currentTime+d); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+d+dur);
      o.start(ctx.currentTime+d); o.stop(ctx.currentTime+d+dur);
    });
  } catch(e) {}
};

const SND_WORK = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const m = ctx.createGain(); m.gain.value = 2.0; m.connect(ctx.destination);
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
    o1.connect(g1); g1.connect(m); o1.type = 'sawtooth'; o1.frequency.value = 1500;
    g1.gain.setValueAtTime(0, ctx.currentTime); g1.gain.linearRampToValueAtTime(0.8, ctx.currentTime+0.01);
    g1.gain.setValueAtTime(0.8, ctx.currentTime+0.14); g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.22);
    o1.start(); o1.stop(ctx.currentTime+0.22);
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(m); o2.type = 'sawtooth'; o2.frequency.value = 1900;
    g2.gain.setValueAtTime(0, ctx.currentTime+0.24); g2.gain.linearRampToValueAtTime(0.9, ctx.currentTime+0.25);
    g2.gain.setValueAtTime(0.9, ctx.currentTime+0.42); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.52);
    o2.start(ctx.currentTime+0.24); o2.stop(ctx.currentTime+0.52);
    const o3 = ctx.createOscillator(); const g3 = ctx.createGain();
    o3.connect(g3); g3.connect(m); o3.type = 'sine';
    o3.frequency.setValueAtTime(220, ctx.currentTime); o3.frequency.exponentialRampToValueAtTime(60, ctx.currentTime+0.18);
    g3.gain.setValueAtTime(0.7, ctx.currentTime); g3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.18);
    o3.start(); o3.stop(ctx.currentTime+0.18);
  } catch(e) {}
};

const SND_BELL = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const m = ctx.createGain(); m.gain.value = 1.8; m.connect(ctx.destination);
    [[440,1.0,2.2],[880,0.4,1.5],[1320,0.18,0.9],[220,0.3,0.6]].forEach(([f,gain,dur])=>{
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
      o.start(); o.stop(ctx.currentTime+dur);
    });
  } catch(e) {}
};

const SND_DOUBLE_BELL = () => { SND_BELL(); setTimeout(SND_BELL, 700); };
const SND_TRIPLE_BELL = () => { SND_BELL(); setTimeout(SND_BELL, 600); setTimeout(SND_BELL, 1200); };

const unlockAudio = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const b = ctx.createBuffer(1,1,22050); const s = ctx.createBufferSource();
    s.buffer=b; s.connect(ctx.destination); s.start(0);
  } catch(e) {}
};

// ─── PICKER OPTIONS (outside component) ───

const PICKER = {
  prep:        Array.from({length: 61}, (_,i) => i),
  work:        Array.from({length: 120}, (_,i) => i+1),
  rest:        Array.from({length: 121}, (_,i) => i),
  rounds:      Array.from({length: 30}, (_,i) => i+1),
  sets:        Array.from({length: 10}, (_,i) => i+1),
  restBetween: Array.from({length: 181}, (_,i) => i),
  countdown:   Array.from({length: 601}, (_,i) => i),
};

// ─── SCROLL PICKER (outside component) ───

const ScrollPicker = ({ value, options, unit, onChange, onClose }) => {
  const ref = useRef(null);
  useEffect(() => {
    const idx = options.indexOf(value);
    if (ref.current && idx >= 0) {
      setTimeout(() => {
        ref.current?.children[idx]?.scrollIntoView({ block:'center', behavior:'instant' });
      }, 60);
    }
  }, []);
  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
      zIndex:9999, display:'flex', alignItems:'flex-end'
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'white', borderRadius:'20px 20px 0 0',
        width:'100%', direction:'rtl',
        paddingBottom:'env(safe-area-inset-bottom,16px)'
      }}>
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'16px 20px', borderBottom:'1px solid #eee'
        }}>
          <span style={{fontSize:'18px',fontWeight:'700'}}>
            {unit ? `בחר (${unit})` : 'בחר ערך'}
          </span>
          <button onClick={onClose} style={{
            background:'#FF6F20', color:'white', border:'none',
            borderRadius:'10px', padding:'8px 24px',
            fontSize:'16px', fontWeight:'700', cursor:'pointer'
          }}>סגור</button>
        </div>
        <div ref={ref} style={{
          overflowY:'auto', maxHeight:'300px',
          padding:'4px 20px', WebkitOverflowScrolling:'touch'
        }}>
          {options.map((v,i) => (
            <div key={i} onClick={() => { onChange(v); onClose(); }} style={{
              padding:'11px 0', textAlign:'center', fontSize:'23px',
              fontWeight: v===value ? '900' : '400',
              color: v===value ? '#FF6F20' : '#1a1a1a',
              background: v===value ? '#FFF0E8' : 'transparent',
              borderRadius:'8px', cursor:'pointer',
              borderBottom:'1px solid #f5f5f5'
            }}>
              {v}{unit ? ` ${unit}` : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── LONG PRESS HOOK ───

const useLongPress = (cb) => {
  const t = useRef(null); const iv = useRef(null);
  const start = useCallback(() => {
    cb();
    t.current = setTimeout(() => { iv.current = setInterval(cb, 80); }, 400);
  }, [cb]);
  const stop = useCallback(() => {
    clearTimeout(t.current); clearInterval(iv.current);
  }, []);
  return {
    onMouseDown:start, onMouseUp:stop, onMouseLeave:stop,
    onTouchStart:(e)=>{ e.preventDefault(); start(); },
    onTouchEnd:stop, onTouchCancel:stop
  };
};

const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
const RING_R = 124;
const RING_C = 779; // 2*π*124

// ─── MAIN COMPONENT ───

export default function TabataTimer({ onMinimize, setLiveTimer }) {
  const navigate = useNavigate();

  const saved = (() => {
    try { return JSON.parse(localStorage.getItem('tb3')||'{}'); }
    catch(e) { return {}; }
  })();

  const [prepTime,    setPrepTime]    = useState(saved.prep    ?? 10);
  const [workTime,    setWorkTime]    = useState(saved.work    ?? 20);
  const [restTime,    setRestTime]    = useState(saved.rest    ?? 10);
  const [rounds,      setRounds]      = useState(saved.rounds  ?? 8);
  const [sets,        setSets]        = useState(saved.sets    ?? 3);
  const [restBetween, setRestBetween] = useState(saved.rb      ?? 60);
  const [cdTime,      setCdTime]      = useState(saved.cd      ?? 30);

  useEffect(() => {
    localStorage.setItem('tb3', JSON.stringify({
      prep:prepTime, work:workTime, rest:restTime,
      rounds, sets, rb:restBetween, cd:cdTime
    }));
  }, [prepTime,workTime,restTime,rounds,sets,restBetween,cdTime]);

  const [screen,    setScreen]    = useState('settings');
  const [phase,     setPhase]     = useState('עבודה');
  const [timeLeft,  setTimeLeft]  = useState(0);
  const [phaseDur,  setPhaseDur]  = useState(0);
  const [curRound,  setCurRound]  = useState(1);
  const [curSet,    setCurSet]    = useState(1);
  const [totalLeft, setTotalLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [go321,     setGo321]     = useState(3);
  const [picker,    setPicker]    = useState(null);

  const mainRef   = useRef(null);
  const totalRef  = useRef(null);
  const goRef     = useRef(null);
  const wakeLock  = useRef(null);
  const tRef      = useRef(0);
  const phRef     = useRef('עבודה');
  const rRef      = useRef(1);
  const sRef      = useRef(1);
  const wkRef     = useRef(workTime);
  const rsRef     = useRef(restTime);
  const rnRef     = useRef(rounds);
  const stRef     = useRef(sets);
  const rbRef     = useRef(restBetween);
  const totRef    = useRef(0);
  const isMinimizedRef = useRef(false);

  useEffect(()=>{ wkRef.current=workTime; },[workTime]);
  useEffect(()=>{ rsRef.current=restTime; },[restTime]);
  useEffect(()=>{ rnRef.current=rounds;   },[rounds]);
  useEffect(()=>{ stRef.current=sets;     },[sets]);
  useEffect(()=>{ rbRef.current=restBetween; },[restBetween]);

  const reqWake = async () => {
    try { if ('wakeLock' in navigator) wakeLock.current = await navigator.wakeLock.request('screen'); } catch(e) {}
  };
  const relWake = () => { wakeLock.current?.release().catch(()=>{}); wakeLock.current = null; };
  useEffect(() => {
    const fn = async () => { if (document.visibilityState === 'visible' && isRunning) await reqWake(); };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [isRunning]);

  const startPhase = (newPhase, dur) => {
    tRef.current  = dur;
    phRef.current = newPhase;
    setPhase(newPhase);
    setTimeLeft(dur);
    setPhaseDur(dur);
  };

  const startMain = () => {
    clearInterval(mainRef.current);
    mainRef.current = setInterval(() => {
      tRef.current -= 1;
      const t = tRef.current;
      // Sound FIRST — no conditions, no setState before this
      if (t === 3 || t === 2 || t === 1) SND_TICK();
      if (t <= 0) {
        clearInterval(mainRef.current);
        setTimeLeft(0); // ring animates to empty
        setTimeout(() => advance(), 950); // advance after ring transition
      } else {
        setTimeLeft(t);
        // liveTimer update AFTER sound and setState
        if (isMinimizedRef.current) {
          setLiveTimer(prev => prev ? { ...prev, display: String(t), phase: phRef.current } : null);
        }
      }
    }, 1000);
  };

  const advance = () => {
    const p = phRef.current, r = rRef.current, s = sRef.current;
    if (p === 'הכנה') {
      rRef.current=1; sRef.current=1; setCurRound(1); setCurSet(1);
      SND_WORK(); startPhase('עבודה', wkRef.current); startMain();
    } else if (p === 'עבודה') {
      const isLastRoundOfSet = r >= rnRef.current;
      const isLastSet = s >= stRef.current;
      if (isLastRoundOfSet && isLastSet) {
        // Last round of last set → COMPLETE
        clearInterval(mainRef.current); clearInterval(totalRef.current);
        isMinimizedRef.current = false; setScreen('complete'); setIsRunning(false); setLiveTimer(null);
        SND_TRIPLE_BELL(); relWake();
      } else if (isLastRoundOfSet && !isLastSet) {
        // Last round of set (not last set) → skip rest, go to restBetweenSets
        SND_DOUBLE_BELL(); startPhase('מנוחה בין סטים', rbRef.current); startMain();
      } else {
        // Normal round → go to rest
        SND_BELL(); startPhase('מנוחה', rsRef.current); startMain();
      }
    } else if (p === 'מנוחה') {
      if (r < rnRef.current) {
        rRef.current = r+1; setCurRound(r+1);
        SND_WORK(); startPhase('עבודה', wkRef.current); startMain();
      } else if (s < stRef.current) {
        rRef.current=1; sRef.current=s+1; setCurRound(1); setCurSet(s+1);
        SND_DOUBLE_BELL(); startPhase('מנוחה בין סטים', rbRef.current); startMain();
      } else {
        clearInterval(mainRef.current); clearInterval(totalRef.current);
        isMinimizedRef.current = false; setScreen('complete'); setIsRunning(false); setLiveTimer(null);
        SND_TRIPLE_BELL(); relWake();
      }
    } else if (p === 'מנוחה בין סטים') {
      SND_WORK(); startPhase('עבודה', wkRef.current); startMain();
    }
  };

  const calcTotal = () =>
    (prepTime+(workTime+restTime)*rounds)*sets + restBetween*Math.max(0,sets-1);

  const handleStart = () => {
    unlockAudio(); setScreen('go321'); setGo321(3); SND_TICK();
    let c = 3;
    goRef.current = setInterval(() => {
      c -= 1;
      if (c > 0) { setGo321(c); SND_TICK(); }
      else {
        clearInterval(goRef.current); setGo321('GO'); SND_GO();
        setTimeout(() => {
          const total = calcTotal(); totRef.current = total; setTotalLeft(total);
          rRef.current=1; sRef.current=1; setCurRound(1); setCurSet(1);
          setIsRunning(true); setScreen('running');
          const initPhase = prepTime>0 ? 'הכנה' : 'עבודה';
          const initDur   = prepTime>0 ? prepTime : wkRef.current;
          if (initPhase==='עבודה') SND_WORK();
          startPhase(initPhase, initDur); startMain();
          clearInterval(totalRef.current);
          totalRef.current = setInterval(() => {
            totRef.current -= 1;
            const tt = totRef.current;
            if (tt === 3 || tt === 2 || tt === 1) SND_TICK();
            setTotalLeft(tt);
            if (tt <= 0) { clearInterval(totalRef.current); SND_DOUBLE_BELL(); }
          }, 1000);
          reqWake();
        }, 800);
      }
    }, 1000);
  };

  const handlePause = () => {
    if (isRunning) {
      clearInterval(mainRef.current); clearInterval(totalRef.current); setIsRunning(false);
    } else {
      setIsRunning(true); startMain();
      totalRef.current = setInterval(() => {
        totRef.current -= 1;
        const tt = totRef.current;
        if (tt === 3 || tt === 2 || tt === 1) SND_TICK();
        setTotalLeft(tt);
        if (tt<=0) clearInterval(totalRef.current);
      }, 1000);
    }
  };

  const handleReset = () => {
    clearInterval(mainRef.current); clearInterval(totalRef.current); clearInterval(goRef.current);
    isMinimizedRef.current = false; setIsRunning(false); setScreen('settings'); setLiveTimer(null); relWake();
  };

  const calcRemainingTotal = () => {
    const r = rRef.current, s = sRef.current, p = phRef.current;
    let total = tRef.current;
    const roundsLeft = rnRef.current - r;
    const setsLeft = stRef.current - s;
    if (p === 'עבודה') { total += rsRef.current; total += roundsLeft * (wkRef.current + rsRef.current); }
    else if (p === 'מנוחה') { total += roundsLeft * (wkRef.current + rsRef.current); }
    total += setsLeft * (rnRef.current * (wkRef.current + rsRef.current) + rbRef.current);
    return Math.max(0, total);
  };

  const restartTotalInterval = () => {
    const newTotal = calcRemainingTotal();
    totRef.current = newTotal; setTotalLeft(newTotal);
    clearInterval(totalRef.current);
    totalRef.current = setInterval(() => {
      totRef.current -= 1; setTotalLeft(totRef.current);
      if (totRef.current <= 0) clearInterval(totalRef.current);
    }, 1000);
  };

  const goBack = () => {
    const p = phRef.current, r = rRef.current, s = sRef.current;
    clearInterval(mainRef.current); clearInterval(totalRef.current);
    if (p === 'מנוחה') {
      SND_WORK(); startPhase('עבודה', wkRef.current); startMain();
    } else if (p === 'עבודה') {
      if (r > 1) { rRef.current = r-1; setCurRound(r-1); SND_BELL(); startPhase('מנוחה', rsRef.current); startMain(); }
      else if (s > 1) { sRef.current = s-1; rRef.current = rnRef.current; setCurSet(s-1); setCurRound(rnRef.current); SND_BELL(); startPhase('מנוחה', rsRef.current); startMain(); }
    } else if (p === 'מנוחה בין סטים') {
      rRef.current = rnRef.current; setCurRound(rnRef.current); SND_WORK(); startPhase('עבודה', wkRef.current); startMain();
    }
    setTimeout(restartTotalInterval, 100);
  };

  const goNext = () => {
    clearInterval(mainRef.current); clearInterval(totalRef.current);
    tRef.current = 0; advance();
    setTimeout(restartTotalInterval, 100);
  };

  const doMinimize = useCallback(() => {
    console.log('[doMinimize] isMinimizedRef before:', isMinimizedRef.current);
    isMinimizedRef.current = true;
    console.log('[doMinimize] isMinimizedRef after:', isMinimizedRef.current);
    setLiveTimer({
      type:'tabata',
      display: String(tRef.current || 0),
      phase: phRef.current || 'טבטה',
      info: `סיבוב ${rRef.current || 1}/${rnRef.current || 8} • סט ${sRef.current || 1}/${stRef.current || 3}`,
      color:'#FF6F20'
    });
    console.log('[doMinimize] setLiveTimer called');
    setTimeout(() => onMinimize(), 50);
  }, [setLiveTimer, onMinimize]);

  useEffect(() => {
    if (!isRunning) return;
    window.history.pushState(null,'',window.location.href);
    const onPop = () => { window.history.pushState(null,'',window.location.href); doMinimize(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isRunning]);

  useEffect(() => () => {
    clearInterval(mainRef.current); clearInterval(totalRef.current); clearInterval(goRef.current);
    relWake();
  }, []);

  // Listen for remote reset (from FloatingTimer X button)
  useEffect(() => {
    const handler = () => handleReset();
    window.addEventListener('tabata-reset', handler);
    return () => window.removeEventListener('tabata-reset', handler);
  }, []);

  // Listen for remote pause/resume (from FloatingTimer ‖/▶ button)
  useEffect(() => {
    const handler = () => handlePause();
    window.addEventListener('tabata-pause-resume', handler);
    return () => window.removeEventListener('tabata-pause-resume', handler);
  }, [isRunning]);

  const incPrep   = useLongPress(useCallback(()=>setPrepTime(v=>Math.min(60,v+1)),[]));
  const decPrep   = useLongPress(useCallback(()=>setPrepTime(v=>Math.max(0,v-1)),[]));
  const incWork   = useLongPress(useCallback(()=>setWorkTime(v=>Math.min(120,v+1)),[]));
  const decWork   = useLongPress(useCallback(()=>setWorkTime(v=>Math.max(1,v-1)),[]));
  const incRest   = useLongPress(useCallback(()=>setRestTime(v=>Math.min(120,v+1)),[]));
  const decRest   = useLongPress(useCallback(()=>setRestTime(v=>Math.max(0,v-1)),[]));
  const incRounds = useLongPress(useCallback(()=>setRounds(v=>Math.min(30,v+1)),[]));
  const decRounds = useLongPress(useCallback(()=>setRounds(v=>Math.max(1,v-1)),[]));
  const incSets   = useLongPress(useCallback(()=>setSets(v=>Math.min(10,v+1)),[]));
  const decSets   = useLongPress(useCallback(()=>setSets(v=>Math.max(1,v-1)),[]));
  const incRB     = useLongPress(useCallback(()=>setRestBetween(v=>Math.min(180,v+5)),[]));
  const decRB     = useLongPress(useCallback(()=>setRestBetween(v=>Math.max(0,v-5)),[]));
  const incCD     = useLongPress(useCallback(()=>setCdTime(v=>Math.min(600,v+5)),[]));
  const decCD     = useLongPress(useCallback(()=>setCdTime(v=>Math.max(0,v-5)),[]));

  const ROWS = [
    {icon:'⏱',label:'הכנה',          pk:'prep',        unit:'שנ׳',value:prepTime,   set:setPrepTime,   inc:incPrep,  dec:decPrep  },
    {icon:'💪',label:'עבודה',         pk:'work',        unit:'שנ׳',value:workTime,   set:setWorkTime,   inc:incWork,  dec:decWork  },
    {icon:'😮',label:'מנוחה',         pk:'rest',        unit:'שנ׳',value:restTime,   set:setRestTime,   inc:incRest,  dec:decRest  },
    {icon:'🔄',label:'מחזורים',       pk:'rounds',      unit:'×',  value:rounds,     set:setRounds,     inc:incRounds,dec:decRounds},
    {icon:'📋',label:'סטים',          pk:'sets',        unit:'×',  value:sets,       set:setSets,       inc:incSets,  dec:decSets  },
    {icon:'⏸',label:'מנוחה בין סטים',pk:'restBetween', unit:'שנ׳',value:restBetween,set:setRestBetween,inc:incRB,    dec:decRB,   small:true},
    {icon:'🔔',label:'ספירה לאחור',  pk:'countdown',   unit:'שנ׳',value:cdTime,     set:setCdTime,     inc:incCD,    dec:decCD,   small:true},
  ];

  const MinBtn = (
    <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); doMinimize(); }} style={{
      background:'rgba(255,255,255,0.2)',border:'none',borderRadius:'8px',
      width:'44px',height:'44px',display:'flex',alignItems:'center',
      justifyContent:'center',cursor:'pointer',flexShrink:0,
      touchAction:'manipulation',WebkitTapHighlightColor:'transparent'
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 14 10 14 10 20"/>
        <polyline points="20 10 14 10 14 4"/>
        <line x1="10" y1="14" x2="3" y2="21"/>
        <line x1="21" y1="3" x2="14" y2="10"/>
      </svg>
    </button>
  );

  // ── SCREENS ──

  if (screen==='go321') return (
    <div style={{background:'#FF6F20',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{fontSize: go321==='GO' ? '100px' : '190px',fontWeight:'900',color:'white',lineHeight:1}}>{go321}</div>
    </div>
  );

  if (screen==='complete') return (
    <div style={{background:'#FF6F20',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'16px',direction:'rtl',padding:'24px'}}>
      <div style={{fontSize:'80px',color:'white',lineHeight:1}}>✓</div>
      <div style={{fontSize:'30px',fontWeight:'900',color:'white',textAlign:'center'}}>כל הכבוד! סיימת!</div>
      <div style={{fontSize:'16px',color:'rgba(255,255,255,0.85)'}}>{sets} סטים • {rounds} מחזורים</div>
      <button onClick={handleReset} style={{marginTop:'16px',width:'100%',height:'56px',background:'white',color:'#FF6F20',border:'none',borderRadius:'12px',fontSize:'20px',fontWeight:'900',cursor:'pointer'}}>התחל מחדש</button>
    </div>
  );

  if (screen==='running') return (
    <div style={{background:'#FF6F20',height:'100%',overflow:'hidden',display:'flex',flexDirection:'column',direction:'rtl',touchAction:'none'}}>
      <div style={{padding:'10px 14px',background:'rgba(0,0,0,0.2)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        {MinBtn}
        <div style={{fontSize:'19px',fontWeight:'900',color:'white'}}>TABATA</div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'1px'}}>
          <div style={{fontSize:'10px',color:'rgba(255,255,255,0.7)',fontWeight:'600'}}>נותר לסיום</div>
          <div style={{fontSize:'32px',fontWeight:'900',color:'white',fontVariantNumeric:'tabular-nums',lineHeight:1}}>{fmt(totalLeft)}</div>
        </div>
      </div>
      <div style={{fontSize:'40px',fontWeight:'900',color:'white',textAlign:'center',paddingTop:'8px',flexShrink:0}}>{phase}</div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',minHeight:0,padding:'2px 0'}}>
        <div style={{position:'relative',width:'min(68vw,280px)',height:'min(68vw,280px)'}}>
          <svg width="100%" height="100%" viewBox="0 0 280 280" style={{position:'absolute',inset:0}}>
            <circle cx="140" cy="140" r={RING_R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10"/>
            <circle cx="140" cy="140" r={RING_R} fill="none" stroke="white" strokeWidth="10" strokeDasharray={RING_C} strokeDashoffset={phaseDur>0 ? RING_C - RING_C*(timeLeft/phaseDur) : RING_C} strokeLinecap="round" transform="rotate(-90 140 140)" style={{transition:'stroke-dashoffset 1s linear'}}/>
          </svg>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{fontSize:'min(38vw,148px)',fontWeight:'900',color:'white',lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-4px'}}>{timeLeft > 0 ? timeLeft : ''}</div>
          </div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:'7px',padding:'0 12px 10px',flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-around',background:'rgba(0,0,0,0.2)',borderRadius:'12px',padding:'10px 0'}}>
          {[{label:'סיבוב',val:`${curRound} / ${rounds}`},{label:'סט',val:`${curSet} / ${sets}`}].map((item,i)=>(
            <div key={i} style={{textAlign:'center'}}>
              <div style={{fontSize:'11px',color:'rgba(255,255,255,0.7)',fontWeight:'600',marginBottom:'3px'}}>{item.label}</div>
              <div style={{fontSize:'24px',fontWeight:'900',color:'white',fontVariantNumeric:'tabular-nums'}}>{item.val}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:'8px',width:'100%'}}>
          <button onPointerDown={(e)=>{e.preventDefault();goBack();}} style={{flex:1,height:'44px',background:'rgba(255,255,255,0.15)',color:'white',border:'1px solid rgba(255,255,255,0.3)',borderRadius:'10px',fontSize:'14px',fontWeight:'700',cursor:'pointer',touchAction:'manipulation',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px'}}>◀ קודם</button>
          <button onPointerDown={(e)=>{e.preventDefault();goNext();}} style={{flex:1,height:'44px',background:'rgba(255,255,255,0.15)',color:'white',border:'1px solid rgba(255,255,255,0.3)',borderRadius:'10px',fontSize:'14px',fontWeight:'700',cursor:'pointer',touchAction:'manipulation',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px'}}>הבא ▶</button>
        </div>
        {(()=>{
          const nx = {'הכנה':{label:'עבודה',dur:workTime},'עבודה':{label:'מנוחה',dur:restTime},'מנוחה':curRound<rounds?{label:'עבודה',dur:workTime}:curSet<sets?{label:'מנוחה בין סטים',dur:restBetween}:null,'מנוחה בין סטים':{label:'עבודה',dur:workTime}}[phase];
          if (!nx) return null;
          return (<div style={{background:'rgba(0,0,0,0.2)',borderRadius:'12px',padding:'9px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:'15px',fontWeight:'700',color:'rgba(255,255,255,0.9)'}}>הבא: {nx.label}</div>
            <div style={{fontSize:'20px',fontWeight:'900',color:'white'}}>{nx.dur} שנ׳</div>
          </div>);
        })()}
        <div style={{display:'flex',gap:'10px'}}>
          <button onClick={handleReset} style={{flex:1,height:'52px',background:'rgba(255,255,255,0.2)',color:'white',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'700',cursor:'pointer'}}>עצור</button>
          <button onClick={handlePause} style={{flex:2,height:'52px',background:'white',color:'#FF6F20',border:'none',borderRadius:'10px',fontSize:'19px',fontWeight:'900',cursor:'pointer'}}>{isRunning ? 'השהה ‖' : 'המשך ▶'}</button>
        </div>
      </div>
    </div>
  );

  // SETTINGS
  return (
    <div style={{background:'#FF6F20',height:'100%',display:'flex',flexDirection:'column',overflow:'hidden',direction:'rtl',touchAction:'pan-x'}}>
      <div style={{padding:'9px 14px',background:'rgba(0,0,0,0.15)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div style={{fontSize:'18px',fontWeight:'900',color:'white'}}>TABATA</div>
        <div style={{fontSize:'13px',fontWeight:'700',color:'white'}}>{fmt(calcTotal())} • {rounds}× • {sets} סטים</div>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'space-evenly',overflow:'hidden'}}>
        {ROWS.map(row=>(
          <div key={row.pk} style={{display:'flex',alignItems:'center',padding:'0 12px',height:'60px',borderBottom:'1px solid rgba(255,255,255,0.15)'}}>
            <div style={{width:'30px',height:'30px',borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',marginLeft:'8px',flexShrink:0,fontSize:'14px'}}>{row.icon}</div>
            <div style={{flex:1,fontSize:row.small?'17px':'19px',fontWeight:'700',color:'white'}}>{row.label}</div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <button {...row.dec} style={{width:'34px',height:'34px',borderRadius:'50%',background:'rgba(255,255,255,0.25)',border:'none',color:'white',fontSize:'20px',cursor:'pointer',lineHeight:1,flexShrink:0,touchAction:'none'}}>−</button>
              <span onClick={()=>setPicker({value:row.value,options:PICKER[row.pk],unit:row.unit,onChange:row.set})} style={{fontSize:'24px',fontWeight:'900',color:'white',minWidth:'38px',textAlign:'center',cursor:'pointer',userSelect:'none'}}>{row.value}</span>
              <button {...row.inc} style={{width:'34px',height:'34px',borderRadius:'50%',background:'white',border:'none',color:'#FF6F20',fontSize:'20px',cursor:'pointer',lineHeight:1,flexShrink:0,touchAction:'none'}}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{padding:'8px 12px 10px',flexShrink:0}}>
        <button onClick={handleStart} style={{width:'100%',height:'52px',background:'white',color:'#FF6F20',border:'none',borderRadius:'10px',fontSize:'20px',fontWeight:'900',cursor:'pointer'}}>▶ התחל</button>
      </div>
      {picker && <ScrollPicker value={picker.value} options={picker.options} unit={picker.unit} onChange={v=>{picker.onChange(v);setPicker(null);}} onClose={()=>setPicker(null)} />}
    </div>
  );
}
