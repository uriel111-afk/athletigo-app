import React, { useState, useRef, useCallback } from "react";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag, Square, Dumbbell, Coffee, Repeat, Hourglass, PersonStanding, Armchair } from "lucide-react";
import { useClock } from "@/contexts/ClockContext";

const BRAND = '#FF6F20';
const FN = "'Barlow Condensed', system-ui, sans-serif";
const FL = "'Heebo', sans-serif";
const C1 = '#1A1A1A';   // text-primary
const C2 = '#6B7280';   // text-secondary
const C3 = '#9CA3AF';   // text-tertiary
const BRD = '#E5E7EB';  // border
const BG2 = '#F5F5F5';  // bg-secondary

const PS = {
  prepare: { ring: BRAND, text: BRAND, label: BRAND, bg: '#FFFFFF' },
  work:    { ring: BRAND, text: C1,    label: BRAND, bg: '#FFFFFF' },
  rest:    { ring: '#BBBBBB', text: C2, label: C3, bg: '#FAFAFA' },
  set_rest:{ ring: '#FF8C42', text: '#FF8C42', label: '#FF8C42', bg: '#FAFAFA' },
  running: { ring: BRAND, text: C1,    label: BRAND, bg: '#FFFFFF' },
  paused:  { ring: BRAND, text: BRAND, label: BRAND, bg: '#FAFAFA' },
  done:    { ring: '#22C55E', text: '#22C55E', label: '#22C55E', bg: '#F0FFF4' },
  idle:    { ring: '#D1D5DB', text: C2, label: C3, bg: BG2 },
};

/* ── Formatters (unchanged) ── */
function fmt(ms) {
  if (ms < 0) ms = 0;
  const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  if (m === 0) return String(s);
  return `${m}:${String(s).padStart(2,'0')}`;
}
function fmtMMSS(ms) {
  if (ms < 0) ms = 0;
  const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function fmtStopwatch(ms) {
  if (ms < 0) ms = 0;
  const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return { main: `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, ms: `.${String(cs).padStart(2,'0')}` };
}
function fmtTotal(sec) { return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }

/* ── Shared UI helpers (logic unchanged) ── */
function HoldButton({ onClick, children, className, style }) {
  const intRef = useRef(null), toRef = useRef(null);
  const start = useCallback(() => { onClick(); toRef.current = setTimeout(() => { intRef.current = setInterval(onClick, 100); }, 300); }, [onClick]);
  const stop = useCallback(() => { if (toRef.current) { clearTimeout(toRef.current); toRef.current = null; } if (intRef.current) { clearInterval(intRef.current); intRef.current = null; } }, []);
  return <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchEnd={stop} className={className} style={style}>{children}</button>;
}

function NumberPicker({ isOpen, value, onChange, onClose, min=0, max=59, label }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[70vw] max-w-[200px] max-h-[50vh] overflow-hidden" style={{ border: `0.5px solid ${BRD}` }} onClick={e=>e.stopPropagation()}>
        <div className="px-4 py-2.5 text-center font-bold text-base" style={{ borderBottom: `0.5px solid ${BRD}`, color: C1 }}>{label}</div>
        <div className="overflow-y-auto max-h-[40vh]">
          {Array.from({length:max-min+1},(_,i)=>min+i).map(v=>(
            <button key={v} onClick={()=>{onChange(v);onClose();}}
              className={`w-full py-2.5 text-center text-xl font-medium transition-colors ${v===value?'bg-orange-50 text-[#FF6F20]':'hover:bg-gray-50'}`} style={{ color: v===value?BRAND:C1 }}>{String(v).padStart(2,'0')}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SecondsSettingRow({ icon: Icon, label, value, onChange, min=1, max=500 }) {
  const [p, setP] = useState(false);
  return (
    <>
      <div className="flex items-center py-3 px-3" style={{ borderBottom: `0.5px solid ${BRD}` }}>
        <div className="w-9 flex justify-center flex-shrink-0"><Icon className="w-5 h-5" style={{ color: BRAND }} /></div>
        <div className="flex-1">
          <div className="text-sm font-medium mb-1 text-center" style={{ fontFamily: FL, color: C2 }}>{label}</div>
          <div className="flex items-center justify-center gap-4">
            <HoldButton onClick={()=>onChange(Math.max(min,value-1))} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-medium active:scale-90 transition-transform" style={{backgroundColor:BRAND}}>−</HoldButton>
            <button onClick={()=>setP(true)} className="min-w-[56px] text-center">
              <span className="tabular-nums" style={{ fontSize: 36, fontWeight: 900, fontFamily: FN, color: C1 }}>{value}</span>
              <span className="block text-[10px] font-medium" style={{ fontFamily: FL, color: C3 }}>שניות</span>
            </button>
            <HoldButton onClick={()=>onChange(Math.min(max,value+1))} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-medium active:scale-90 transition-transform" style={{backgroundColor:BRAND}}>+</HoldButton>
          </div>
        </div>
      </div>
      <NumberPicker isOpen={p} value={value} onChange={onChange} onClose={()=>setP(false)} min={min} max={max} label={label} />
    </>
  );
}

function CountSettingRow({ icon: Icon, label, value, onChange, min=0, max=99 }) {
  const [p, setP] = useState(false);
  return (
    <>
      <div className="flex items-center py-3 px-3" style={{ borderBottom: `0.5px solid ${BRD}` }}>
        <div className="w-9 flex justify-center flex-shrink-0"><Icon className="w-5 h-5" style={{color:BRAND}} /></div>
        <div className="flex-1">
          <div className="text-sm font-medium mb-1 text-center" style={{ fontFamily: FL, color: C2 }}>{label}</div>
          <div className="flex items-center justify-center gap-4">
            <HoldButton onClick={()=>onChange(Math.max(min,value-1))} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-medium active:scale-90 transition-transform" style={{backgroundColor:BRAND}}>−</HoldButton>
            <button onClick={()=>setP(true)} className="min-w-[56px] text-center">
              <span className="tabular-nums" style={{ fontSize: 36, fontWeight: 900, fontFamily: FN, color: C1 }}>{value}</span>
            </button>
            <HoldButton onClick={()=>onChange(Math.min(max,value+1))} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-medium active:scale-90 transition-transform" style={{backgroundColor:BRAND}}>+</HoldButton>
          </div>
        </div>
      </div>
      <NumberPicker isOpen={p} value={value} onChange={onChange} onClose={()=>setP(false)} min={min} max={max} label={label} />
    </>
  );
}

/* ── Bordered stats row ── */
function StatsRow({ cells }) {
  return (
    <div className="flex w-full" style={{ border: `0.5px solid ${BRD}`, borderRadius: 10, overflow: 'hidden' }}>
      {cells.map((c, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-center py-2" style={{ borderRight: i > 0 ? `0.5px solid ${BRD}` : 'none' }}>
          <span style={{ fontSize: 13, fontWeight: 500, fontFamily: FL, color: C2 }}>{c.label}</span>
          <span className="tabular-nums" style={{ fontSize: 30, fontWeight: 500, fontFamily: FN, color: C1 }}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FULL SCREEN RUNNING — the running view for all timers
   ═══════════════════════════════════════════════════════════════════ */
function FullScreenRunning({
  ms, phase, phaseLabel, roundInfo, isRunning, onPause, onResume, onStop,
  showMs = false, useMMSS = false, total,
  statsCells = null, nextPhaseText = null, headerLabel = null,
  bigNumber = false,
}) {
  const s = PS[phase] || PS.idle;
  const ringSize = bigNumber ? 300 : 280;
  const R = bigNumber ? 137 : 127;
  const circ = 2 * Math.PI * R;
  const progress = total > 0 ? Math.max(0, Math.min(1, ms / total)) : (showMs ? 1 : 0);
  const offset = circ * (1 - progress);
  const timeStr = showMs ? `${fmtStopwatch(ms).main}${fmtStopwatch(ms).ms}` : (useMMSS ? fmtMMSS(ms) : fmt(ms));

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center transition-colors duration-300" dir="rtl"
      style={{ backgroundColor: s.bg, padding: '36px 32px 28px' }}>

      {/* Header label */}
      {headerLabel && (
        <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase', fontFamily: FN, color: C2 }}>
          {headerLabel}
        </div>
      )}

      {/* Phase label */}
      <div className="transition-colors duration-300" style={{ fontSize: 38, fontWeight: 500, fontFamily: FL, color: s.label, marginTop: headerLabel ? 4 : 0 }}>
        {phaseLabel}
      </div>

      {/* Spacer */}
      <div style={{ flex: '1 0 8px', maxHeight: 20 }} />

      {/* Ring + number */}
      <div className="relative flex-shrink-0" style={{ width: ringSize, height: ringSize }}>
        <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
          <circle cx={ringSize/2} cy={ringSize/2} r={R} fill="none" stroke="#F0F0F0" strokeWidth="13" />
          <circle cx={ringSize/2} cy={ringSize/2} r={R} fill="none" stroke={s.ring} strokeWidth="13" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            transform={`rotate(-90 ${ringSize/2} ${ringSize/2})`} className="transition-colors duration-300"
            style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="tabular-nums leading-none transition-colors duration-300" style={{
            fontSize: showMs ? 44 : (bigNumber ? 108 : 86),
            fontWeight: 900,
            fontFamily: FN,
            color: s.text,
          }}>
            {timeStr}
          </span>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: '1 0 8px', maxHeight: 20 }} />

      {/* Stats row */}
      {statsCells && <StatsRow cells={statsCells} />}

      {/* Next phase preview */}
      {nextPhaseText && (
        <div className="w-full text-center" style={{ marginTop: 12, backgroundColor: BG2, padding: '10px 20px', borderRadius: 10, fontSize: 16, fontWeight: 500, fontFamily: FL, color: C2 }}>
          {nextPhaseText}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center w-full" style={{ marginTop: 16, gap: 10 }}>
        {onStop && (
          <button onClick={onStop} className="flex items-center justify-center active:scale-90 transition-transform"
            style={{ height: 60, padding: '0 22px', borderRadius: 14, border: `1px solid ${BRD}`, backgroundColor: '#FFFFFF', fontSize: 15, fontWeight: 500, fontFamily: FL, color: C2 }}>
            <RotateCcw className="w-4 h-4 ml-1.5" />איפוס
          </button>
        )}
        {isRunning ? (
          <button onClick={onPause} className="flex-1 flex items-center justify-center active:scale-95 transition-transform"
            style={{ height: 60, borderRadius: 14, backgroundColor: s.ring, fontSize: 20, fontWeight: 500, fontFamily: FL, color: '#FFFFFF' }}>
            <Pause className="w-5 h-5 ml-2" />השהה
          </button>
        ) : (
          <button onClick={onResume} className="flex-1 flex items-center justify-center active:scale-95 transition-transform"
            style={{ height: 60, borderRadius: 14, backgroundColor: s.ring, fontSize: 20, fontWeight: 500, fontFamily: FL, color: '#FFFFFF' }}>
            <Play className="w-5 h-5 ml-2" />המשך
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══ STOPWATCH ═══ */
function StopwatchView() {
  const { startStopwatch, pause, resume, reset, lapStopwatch, display, isRunning, activeClock, laps } = useClock();
  const active = activeClock === 'stopwatch';
  const sw = fmtStopwatch(display);

  if (active) {
    const t = Math.floor(display / 1000), m = Math.floor(t / 60), s = t % 60, cs = Math.floor((display % 1000) / 10);
    return (
      <>
        <FullScreenRunning ms={display} total={0} phase={isRunning ? 'running' : 'paused'}
          phaseLabel="סטופר" headerLabel="STOPWATCH"
          isRunning={isRunning} onPause={pause} onResume={resume} onStop={reset} showMs
          statsCells={[
            { label: 'דקות', value: String(m).padStart(2,'0') },
            { label: 'שניות', value: String(s).padStart(2,'0') },
            { label: 'מאיות', value: String(cs).padStart(2,'0') },
          ]} />
        {isRunning && (
          <button onClick={lapStopwatch} className="fixed bottom-28 left-8 z-[91] rounded-full bg-white shadow-md flex items-center justify-center active:scale-90 transition-transform"
            style={{ width: 52, height: 52, border: `1px solid ${BRD}` }}>
            <Flag className="w-5 h-5" style={{ color: BRAND }} />
          </button>
        )}
      </>
    );
  }

  return (
    <div style={{ padding: '36px 32px' }} className="flex flex-col items-center gap-5">
      <div className="text-center tabular-nums leading-none" style={{ fontSize: 86, fontWeight: 900, fontFamily: FN, color: '#D1D5DB' }}>
        00:00<span style={{ fontSize: 44 }}>.00</span>
      </div>
      <button onClick={startStopwatch} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
        style={{ height: 60, borderRadius: 14, backgroundColor: BRAND, fontSize: 20, fontWeight: 500, fontFamily: FL, color: '#FFFFFF' }}>
        <Play className="w-5 h-5 ml-2" />התחל
      </button>
      {laps.length > 0 && (
        <div className="w-full rounded-xl p-3 max-h-40 overflow-y-auto" style={{ border: `0.5px solid ${BRD}`, backgroundColor: '#FFFFFF' }}>
          {laps.map((l,i) => (
            <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: i < laps.length-1 ? `0.5px solid ${BRD}` : 'none' }}>
              <span style={{ fontSize: 14, fontWeight: 500, fontFamily: FL, color: C2 }}>הקפה {i+1}</span>
              <span className="tabular-nums" style={{ fontSize: 18, fontWeight: 500, fontFamily: FN, color: C1 }}>{`${fmtStopwatch(l).main}${fmtStopwatch(l).ms}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ TIMER ═══ */
function TimerView() {
  const { startTimer, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase } = useClock();
  const [prepSec, setPrepSec] = useState(3);
  const [timerMin, setTimerMin] = useState(0);
  const [timerSec, setTimerSec] = useState(30);
  const active = activeClock === 'timer';
  const showSetup = !active || phase === 'idle' || phase === 'done';
  const totalTimerMs = (timerMin * 60 + timerSec) * 1000;

  if (showSetup) {
    return (
      <div style={{ padding: '16px 32px 32px' }}>
        <div className="bg-white overflow-hidden" style={{ borderRadius: 10, border: `0.5px solid ${BRD}` }}>
          <SecondsSettingRow icon={PersonStanding} label="הכנה" value={prepSec} onChange={setPrepSec} />
          <CountSettingRow icon={Timer} label="דקות" value={timerMin} onChange={setTimerMin} min={0} max={59} />
          <CountSettingRow icon={Clock} label="שניות" value={timerSec} onChange={setTimerSec} min={0} max={59} />
        </div>
        <button onClick={()=>startTimer(totalTimerMs, prepSec*1000)} disabled={totalTimerMs===0}
          className="w-full flex items-center justify-center disabled:opacity-40 active:scale-[0.98] transition-transform"
          style={{ marginTop: 16, height: 60, borderRadius: 14, backgroundColor: BRAND, fontSize: 20, fontWeight: 500, fontFamily: FL, color: '#FFFFFF' }}>
          <Play className="w-5 h-5 ml-2" />התחל
        </button>
      </div>
    );
  }

  const elapsed = totalDuration > 0 ? totalDuration - display : 0;
  return (
    <FullScreenRunning ms={display} total={totalDuration} phase={phase}
      phaseLabel={phase==='prepare' ? 'הכנה' : 'ספירה לאחור'} headerLabel="COUNTDOWN"
      isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} useMMSS
      statsCells={[
        { label: 'זמן שהוגדר', value: fmtMMSS(totalTimerMs) },
        { label: 'זמן שעבר', value: fmtMMSS(elapsed) },
        { label: 'נותר', value: fmtMMSS(display) },
      ]} />
  );
}

/* ═══ TABATA ═══ */
function TabataView() {
  const { startTabata, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase, phaseLabel, roundInfo } = useClock();
  const [workSec, setWorkSec] = useState(20);
  const [restSec, setRestSec] = useState(10);
  const [rounds, setRounds] = useState(8);
  const [sets, setSets] = useState(1);
  const [setsRestSec, setSetsRestSec] = useState(60);
  const [prepSec, setPrepSec] = useState(10);
  const active = activeClock === 'tabata';
  const showSetup = !active || phase === 'idle' || phase === 'done';
  const totalTime = (workSec+restSec)*rounds*sets + (sets>1 ? setsRestSec*(sets-1) : 0) + prepSec;

  if (showSetup) {
    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <div className="flex justify-center gap-3 py-2 mb-2" style={{ fontSize: 14, fontWeight: 500, fontFamily: FL, color: BRAND, backgroundColor: BRAND+'0D', borderRadius: 10, padding: '10px 20px', border: `0.5px solid ${BRAND}30` }}>
          <span>{fmtTotal(totalTime)}</span><span style={{ opacity: 0.3 }}>|</span>
          <span>{rounds*sets} אינטרוולים</span><span style={{ opacity: 0.3 }}>|</span>
          <span>{sets} {sets===1?'סט':'סטים'}</span>
        </div>
        <div className="bg-white overflow-hidden" style={{ borderRadius: 10, border: `0.5px solid ${BRD}` }}>
          <SecondsSettingRow icon={PersonStanding} label="הכנה" value={prepSec} onChange={setPrepSec} />
          <SecondsSettingRow icon={Dumbbell} label="עבודה" value={workSec} onChange={setWorkSec} />
          <SecondsSettingRow icon={Coffee} label="מנוחה" value={restSec} onChange={setRestSec} />
          <CountSettingRow icon={Repeat} label="מחזורים" value={rounds} onChange={setRounds} min={1} max={50} />
          <CountSettingRow icon={Hourglass} label="סטים" value={sets} onChange={setSets} min={1} max={10} />
          {sets > 1 && <SecondsSettingRow icon={Armchair} label="מנוחה בין סטים" value={setsRestSec} onChange={setSetsRestSec} />}
        </div>
        <button onClick={()=>startTabata({workTime:workSec,restTime:restSec,rounds,sets,setRest:setsRestSec,prepareTime:prepSec})}
          className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
          style={{ marginTop: 16, height: 60, borderRadius: 14, backgroundColor: BRAND, fontSize: 20, fontWeight: 500, fontFamily: FL, color: '#FFFFFF' }}>
          <Play className="w-5 h-5 ml-2" />התחל
        </button>
      </div>
    );
  }

  // Parse roundInfo: "סט 1/1 • סיבוב 3/8"
  let setStr = '—', roundStr = '—';
  if (roundInfo) {
    const parts = roundInfo.split('•').map(s => s.trim());
    parts.forEach(p => { if (p.startsWith('סט')) setStr = p.replace('סט ',''); if (p.startsWith('סיבוב')) roundStr = p.replace('סיבוב ',''); });
  }

  // Compute remaining total time (counts DOWN)
  const totalTabataMs = totalTime * 1000;
  const elapsedMs = totalDuration > 0 ? totalDuration - display : 0;
  const remainingSec = Math.max(0, totalTime - Math.floor(elapsedMs / 1000));

  // Next phase preview
  let nextText = null;
  if (phase === 'work') nextText = `הבא: מנוחה — ${restSec} שניות`;
  else if (phase === 'rest') nextText = `הבא: עבודה — ${workSec} שניות`;
  else if (phase === 'set_rest') nextText = `הבא: סט חדש — עבודה ${workSec} שניות`;
  else if (phase === 'prepare') nextText = `הבא: עבודה — ${workSec} שניות`;

  return (
    <FullScreenRunning ms={display} total={totalDuration} phase={phase}
      phaseLabel={phaseLabel} headerLabel="TABATA" bigNumber
      isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop}
      statsCells={[
        { label: 'סיבוב', value: roundStr },
        { label: 'סט', value: setStr },
        { label: 'נותר לסיום', value: fmtTotal(remainingSec) },
      ]}
      nextPhaseText={nextText} />
  );
}

/* ═══ Mode tabs + page ═══ */
const MODES = [
  { id: 'tabata', label: 'טבטה', icon: Zap },
  { id: 'timer', label: 'טיימר', icon: Timer },
  { id: 'stopwatch', label: 'סטופר', icon: Clock },
];

export default function Clocks() {
  const [mode, setMode] = useState('tabata');
  return (
    <div className="min-h-screen" dir="rtl" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Tab bar */}
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: `0.5px solid ${BRD}` }}>
        <div className="flex" style={{ padding: '12px 32px 10px', gap: 10 }}>
          {MODES.map(m => {
            const on = mode === m.id; const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className="flex-1 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                style={{
                  height: 42, borderRadius: 10,
                  backgroundColor: on ? BRAND : BG2,
                  color: on ? '#FFFFFF' : C2,
                  fontWeight: 500, fontSize: 16, fontFamily: FN,
                  border: on ? 'none' : `0.5px solid ${BRD}`,
                }}>
                <Icon className="w-4 h-4" />{m.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Content */}
      <div className="pb-24">
        {mode === 'tabata' && <TabataView />}
        {mode === 'timer' && <TimerView />}
        {mode === 'stopwatch' && <StopwatchView />}
      </div>
    </div>
  );
}
