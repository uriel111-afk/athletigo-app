import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';

// ─── PICKER OPTIONS (outside component) ───
const PICKER_OPTS = {
  prep:        Array.from({length: 61}, (_, i) => i),
  work:        Array.from({length: 120}, (_, i) => i + 1),
  rest:        Array.from({length: 121}, (_, i) => i),
  rounds:      Array.from({length: 30}, (_, i) => i + 1),
  sets:        Array.from({length: 10}, (_, i) => i + 1),
  restBetween: Array.from({length: 181}, (_, i) => i),
  countdown:   Array.from({length: 601}, (_, i) => i),
};

// ─── SCROLL PICKER (outside component) ───
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
              fontWeight: v === value ? 900 : 400, color: v === value ? '#FF6F20' : '#1a1a1a',
              background: v === value ? '#FFF0E8' : 'transparent', borderRadius: 8,
              cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
            }}>{v}{unit ? ` ${unit}` : ''}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── LONG PRESS HOOK ───
const useLongPress = (cb) => {
  const timer = useRef(null); const interval = useRef(null);
  const start = useCallback(() => { cb(); timer.current = setTimeout(() => { interval.current = setInterval(cb, 80); }, 400); }, [cb]);
  const stop = useCallback(() => { clearTimeout(timer.current); clearInterval(interval.current); }, []);
  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: (e) => { e.preventDefault(); start(); }, onTouchEnd: stop, onTouchCancel: stop };
};

const fmt = (s) => s == null || s < 0 ? '0:00' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const C = 679;

// ─── iOS UNLOCK ───
const unlockAudio = () => {
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const b = ctx.createBuffer(1,1,22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch(e) {}
};

// ═══ MAIN COMPONENT — reads ALL state from ActiveTimerContext ═══
export default function TabataTimer({ onMinimize }) {
  const navigate = useNavigate();
  const { tabata, settingsRef, startTabata, pauseTabata, resetTabata, setLiveTimer } = useActiveTimer();
  const { screen, running, phase, timeLeft, phaseDuration, currentRound, currentSet, countdown, countdown321 } = tabata;

  // Local settings (for settings screen only — synced to context on start)
  const saved = (() => { try { return JSON.parse(localStorage.getItem('tabata_v2') || '{}'); } catch(e) { return {}; } })();
  const [prepTime, setPrepTime] = useState(saved.prepTime ?? 10);
  const [workTime, setWorkTime] = useState(saved.workTime ?? 20);
  const [restTime, setRestTime] = useState(saved.restTime ?? 10);
  const [rounds, setRounds] = useState(saved.rounds ?? 8);
  const [sets, setSets] = useState(saved.sets ?? 3);
  const [restBetween, setRestBetween] = useState(saved.restBetween ?? 60);
  const [cdTime, setCdTime] = useState(saved.cdTime ?? 30);
  const [picker, setPicker] = useState(null);

  useEffect(() => { localStorage.setItem('tabata_v2', JSON.stringify({ prepTime, workTime, restTime, rounds, sets, restBetween, cdTime })); }, [prepTime, workTime, restTime, rounds, sets, restBetween, cdTime]);

  // Handlers delegate to context
  const handleStart = () => {
    unlockAudio();
    startTabata({ prepTime, workTime, restTime, rounds, sets, restBetweenSets: restBetween, countdownTime: cdTime });
  };

  // Minimize — set liveTimer from context refs (always current)
  const doMinimize = useCallback(() => {
    const state = {
      type: 'tabata',
      display: String(tabata?.timeLeft ?? 0),
      phase: tabata?.phase ?? 'טבטה',
      info: `סיבוב ${tabata?.currentRound ?? 1}/${tabata?.rounds ?? 8} • סט ${tabata?.currentSet ?? 1}/${tabata?.sets ?? 3}`,
      color: '#FF6F20'
    };
    console.log('MINIMIZE → setLiveTimer:', state);
    setLiveTimer(state);
    setTimeout(() => {
      console.log('MINIMIZE → navigating');
      onMinimize();
    }, 100);
  }, [tabata, setLiveTimer, onMinimize]);

  // Update liveTimer every tick
  useEffect(() => {
    setLiveTimer(prev => {
      if (!prev) return null;
      const { rounds: r, sets: s } = settingsRef.current;
      return { ...prev, display: String(timeLeft), phase, info: `סיבוב ${currentRound}/${r} • סט ${currentSet}/${s}` };
    });
  }, [timeLeft]);

  // liveTimer is managed by doMinimize and context — never cleared on mount

  // Back button = minimize
  useEffect(() => {
    if (!running) return;
    window.history.pushState(null, '', window.location.href);
    const onPop = () => { window.history.pushState(null, '', window.location.href); doMinimize(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [running, doMinimize]);

  // Long press handlers
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

  const totalSecs = (prepTime + (workTime + restTime) * rounds) * sets + restBetween * Math.max(0, sets - 1);

  const getNext = () => {
    if (phase === 'הכנה') return { l: 'עבודה', d: workTime };
    if (phase === 'עבודה') return { l: 'מנוחה', d: restTime };
    if (phase === 'מנוחה') {
      if (currentRound < rounds) return { l: 'עבודה', d: workTime };
      if (currentSet < sets) return { l: 'מנוחה בין סטים', d: restBetween };
      return null;
    }
    if (phase === 'מנוחה בין סטים') return { l: 'עבודה', d: workTime };
    return null;
  };

  const MinimizeBtn = (
    <button onClick={(e) => { e.stopPropagation(); doMinimize(); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
    </button>
  );

  // ── SCREENS ──

  if (screen === 'countdown') return (
    <div style={{ background: '#FF6F20', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: countdown321 === 'GO' ? 100 : 180, fontWeight: 900, color: 'white', lineHeight: 1 }}>{countdown321}</div>
    </div>
  );

  if (screen === 'complete') return (
    <div style={{ background: '#FF6F20', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, direction: 'rtl', padding: 24 }}>
      <div style={{ fontSize: 80, color: 'white' }}>✓</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: 'white' }}>כל הכבוד! סיימת!</div>
      <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)' }}>{sets} סטים • {rounds} מחזורים</div>
      <button onClick={resetTabata} style={{ marginTop: 16, width: '100%', height: 56, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 12, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>התחל מחדש</button>
    </div>
  );

  if (screen === 'running') {
    const nxt = getNext();
    return (
      <div style={{ background: '#FF6F20', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          {MinimizeBtn}
          <div style={{ fontSize: 19, fontWeight: 900, color: 'white' }}>TABATA</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>נותר לסיום</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt(countdown)}</div>
          </div>
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, color: 'white', textAlign: 'center', paddingTop: 8, flexShrink: 0 }}>{phase}</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '2px 0' }}>
          <div style={{ position: 'relative', width: 'min(62vw, 248px)', height: 'min(62vw, 248px)' }}>
            <svg width="100%" height="100%" viewBox="0 0 248 248" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="124" cy="124" r="108" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10"/>
              <circle cx="124" cy="124" r="108" fill="none" stroke="white" strokeWidth="10" strokeDasharray={C} strokeDashoffset={phaseDuration > 0 ? C * (timeLeft / phaseDuration) : 0} strokeLinecap="round" transform="rotate(-90 124 124)" style={{ transition: 'stroke-dashoffset 0.95s linear' }}/>
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 'min(29vw, 112px)', fontWeight: 900, color: 'white', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -4 }}>{timeLeft}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '0 12px 10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 0' }}>
            {[{ label: 'סיבוב', val: `${currentRound} / ${rounds}` }, { label: 'סט', val: `${currentSet} / ${sets}` }].map((item, i) => (
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
            <button onClick={resetTabata} style={{ flex: 1, height: 52, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>עצור</button>
            <button onClick={pauseTabata} style={{ flex: 2, height: 52, background: 'white', color: '#FF6F20', border: 'none', borderRadius: 10, fontSize: 19, fontWeight: 900, cursor: 'pointer' }}>{running ? 'השהה ‖' : 'המשך ▶'}</button>
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
