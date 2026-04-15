import React, { useState, useRef, useCallback } from "react";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag, Square, Dumbbell, Coffee, Repeat, Hourglass, PersonStanding, Armchair } from "lucide-react";
import { useClock } from "@/contexts/ClockContext";

const BRAND = '#FF6F20';
const FONT_NUM = "'Barlow Condensed', system-ui, sans-serif";
const FONT_LABEL = "'Heebo', sans-serif";

const PHASE_STYLE = {
  prepare: { bg: '#FFFFFF', ring: '#FF6F20', text: '#FF6F20', label: '#FF6F20', tint: '#FFF7F0' },
  work:    { bg: '#FFFFFF', ring: '#FF6F20', text: '#1A1A1A', label: '#FF6F20', tint: '#FFFFFF' },
  rest:    { bg: '#FFF5EF', ring: '#D1D5DB', text: '#6B7280', label: '#9CA3AF', tint: '#FFF5EF' },
  set_rest:{ bg: '#FFF5EF', ring: '#FF8C42', text: '#FF8C42', label: '#FF8C42', tint: '#FFF5EF' },
  running: { bg: '#FFFFFF', ring: '#FF6F20', text: '#1A1A1A', label: '#FF6F20', tint: '#FFFFFF' },
  paused:  { bg: '#F7F7F7', ring: '#FF6F20', text: '#FF6F20', label: '#FF6F20', tint: '#F7F7F7' },
  done:    { bg: '#F0FFF4', ring: '#22C55E', text: '#22C55E', label: '#22C55E', tint: '#F0FFF4' },
  idle:    { bg: '#F7F7F7', ring: '#D1D5DB', text: '#6B7280', label: '#9CA3AF', tint: '#F7F7F7' },
};

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

function HoldButton({ onClick, children, className, style }) {
  const intRef = useRef(null), toRef = useRef(null);
  const start = useCallback(() => {
    onClick();
    toRef.current = setTimeout(() => { intRef.current = setInterval(onClick, 100); }, 300);
  }, [onClick]);
  const stop = useCallback(() => {
    if (toRef.current) { clearTimeout(toRef.current); toRef.current = null; }
    if (intRef.current) { clearInterval(intRef.current); intRef.current = null; }
  }, []);
  return <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchEnd={stop} className={className} style={style}>{children}</button>;
}

function NumberPicker({ isOpen, value, onChange, onClose, min=0, max=59, label }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[70vw] max-w-[200px] max-h-[50vh] overflow-hidden border border-gray-100" onClick={e=>e.stopPropagation()}>
        <div className="px-4 py-2.5 border-b border-gray-100 text-center font-bold text-base text-gray-800">{label}</div>
        <div className="overflow-y-auto max-h-[40vh]">
          {Array.from({length:max-min+1},(_,i)=>min+i).map(v=>(
            <button key={v} onClick={()=>{onChange(v);onClose();}}
              className={`w-full py-2.5 text-center text-xl font-bold transition-colors ${v===value?'bg-orange-50 text-[#FF6F20]':'text-gray-700 hover:bg-gray-50'}`}>{String(v).padStart(2,'0')}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SecondsSettingRow({ icon: Icon, label, value, onChange, min=1, max=500 }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <>
      <div className="flex items-center py-3 border-b border-gray-100 last:border-0 px-3">
        <div className="w-10 flex justify-center flex-shrink-0">
          <Icon className="w-5 h-5" style={{ color: BRAND }} />
        </div>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-700 mb-1.5 text-center" style={{ fontFamily: FONT_LABEL }}>{label}</div>
          <div className="flex items-center justify-center gap-4">
            <HoldButton onClick={()=>onChange(Math.max(min,value-1))}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm active:scale-90 transition-transform"
              style={{backgroundColor:BRAND}}>−</HoldButton>
            <button onClick={()=>setShowPicker(true)} className="min-w-[60px] text-center">
              <span className="text-4xl font-black text-gray-900 tabular-nums" style={{ fontFamily: FONT_NUM }}>{value}</span>
              <span className="text-[10px] text-gray-400 block font-medium" style={{ fontFamily: FONT_LABEL }}>שניות</span>
            </button>
            <HoldButton onClick={()=>onChange(Math.min(max,value+1))}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm active:scale-90 transition-transform"
              style={{backgroundColor:BRAND}}>+</HoldButton>
          </div>
        </div>
      </div>
      <NumberPicker isOpen={showPicker} value={value} onChange={onChange} onClose={()=>setShowPicker(false)} min={min} max={max} label={label} />
    </>
  );
}

function CountSettingRow({ icon: Icon, label, value, onChange, min=0, max=99 }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <>
      <div className="flex items-center py-3 border-b border-gray-100 last:border-0 px-3">
        <div className="w-10 flex justify-center flex-shrink-0"><Icon className="w-5 h-5" style={{color:BRAND}} /></div>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-700 mb-1.5 text-center" style={{ fontFamily: FONT_LABEL }}>{label}</div>
          <div className="flex items-center justify-center gap-4">
            <HoldButton onClick={()=>onChange(Math.max(min,value-1))}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm active:scale-90 transition-transform"
              style={{backgroundColor:BRAND}}>−</HoldButton>
            <button onClick={()=>setShowPicker(true)} className="min-w-[60px] text-center">
              <span className="text-4xl font-black text-gray-900 tabular-nums" style={{ fontFamily: FONT_NUM }}>{value}</span>
            </button>
            <HoldButton onClick={()=>onChange(Math.min(max,value+1))}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm active:scale-90 transition-transform"
              style={{backgroundColor:BRAND}}>+</HoldButton>
          </div>
        </div>
      </div>
      <NumberPicker isOpen={showPicker} value={value} onChange={onChange} onClose={()=>setShowPicker(false)} min={min} max={max} label={label} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FULL SCREEN RUNNING — shared by all timer modes
   Layout budget (844px iPhone 14):
     Phase label:   48px
     Ring + number: 260px
     Stats row:     56px
     Controls:      72px
     Padding:       ~60px
     Total:        ~496px — well within budget
   ═══════════════════════════════════════════════════════════════════ */
function FullScreenRunning({ ms, phase, phaseLabel, roundInfo, isRunning, onPause, onResume, onStop, showMs = false, useMMSS = false, total }) {
  const s = PHASE_STYLE[phase] || PHASE_STYLE.idle;
  const R = 112, circ = 2 * Math.PI * R;
  const progress = total > 0 ? Math.max(0, Math.min(1, ms / total)) : (showMs ? 1 : 0);
  const offset = circ * (1 - progress);
  const displayText = showMs
    ? `${fmtStopwatch(ms).main}${fmtStopwatch(ms).ms}`
    : (useMMSS ? fmtMMSS(ms) : fmt(ms));

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center transition-colors duration-300"
      style={{ backgroundColor: s.tint }}>

      {/* ── Phase label ── */}
      <div className="text-center mb-2">
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: FONT_NUM, color: s.label, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          {phaseLabel}
        </div>
      </div>

      {/* ── Ring + giant number ── */}
      <div className="relative flex items-center justify-center" style={{ width: 248, height: 248 }}>
        <svg width="248" height="248" viewBox="0 0 248 248">
          <circle cx="124" cy="124" r={R} fill="none" stroke="#E5E7EB" strokeWidth="8" />
          <circle cx="124" cy="124" r={R} fill="none" stroke={s.ring} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            transform="rotate(-90 124 124)" style={{ transition: 'stroke-dashoffset 0.15s linear' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="tabular-nums text-center leading-none" style={{
            fontSize: showMs ? 48 : 96,
            fontWeight: 900,
            fontFamily: FONT_NUM,
            color: s.text,
          }}>
            {displayText}
          </span>
        </div>
      </div>

      {/* ── Stats row ── */}
      {roundInfo && (
        <div className="mt-3 text-center" style={{ fontSize: 28, fontWeight: 700, fontFamily: FONT_NUM, color: s.label }}>
          {roundInfo}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="flex justify-center items-center gap-6 mt-6">
        {onStop && (
          <button onClick={onStop}
            className="rounded-full flex items-center justify-center active:scale-90 transition-transform border-2"
            style={{ width: 52, height: 52, backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }}>
            <Square className="w-5 h-5 text-gray-400" />
          </button>
        )}
        {isRunning ? (
          <button onClick={onPause}
            className="rounded-full flex items-center justify-center active:scale-95 shadow-lg transition-transform"
            style={{ width: 68, height: 68, backgroundColor: s.ring }}>
            <Pause className="w-8 h-8 text-white" />
          </button>
        ) : (
          <button onClick={onResume}
            className="rounded-full flex items-center justify-center active:scale-95 shadow-lg transition-transform"
            style={{ width: 68, height: 68, backgroundColor: s.ring }}>
            <Play className="w-8 h-8 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}

// ═══ STOPWATCH ═══
function StopwatchView() {
  const { startStopwatch, pause, resume, reset, lapStopwatch, display, isRunning, activeClock, laps } = useClock();
  const active = activeClock === 'stopwatch';

  if (active) {
    return (
      <>
        <FullScreenRunning ms={display} total={0} phase={isRunning ? 'running' : 'paused'} phaseLabel="סטופר" isRunning={isRunning} onPause={pause} onResume={resume} onStop={reset} showMs={true} />
        {isRunning && (
          <button onClick={lapStopwatch}
            className="fixed bottom-8 right-6 z-[91] rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center active:scale-90 transition-transform"
            style={{width:52,height:52}}>
            <Flag className="w-5 h-5" style={{ color: BRAND }} />
          </button>
        )}
      </>
    );
  }

  return (
    <div className="px-4 py-8 flex flex-col items-center">
      <div className="text-center tabular-nums mb-8" style={{ fontSize: 96, lineHeight: 1, fontWeight: 900, fontFamily: FONT_NUM, color: '#D1D5DB' }}>
        00:00<span style={{ fontSize: 48 }}>.00</span>
      </div>
      <button onClick={startStopwatch}
        className="rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        style={{backgroundColor:BRAND,width:68,height:68}}>
        <Play className="w-8 h-8 text-white" />
      </button>
      {laps.length>0 && (
        <div className="w-full bg-white rounded-xl border border-gray-100 p-3 mt-6 max-h-40 overflow-y-auto shadow-sm">
          {laps.map((l,i)=>(
            <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-gray-500 font-medium text-sm" style={{ fontFamily: FONT_LABEL }}>הקפה {i+1}</span>
              <span className="font-bold text-gray-900 tabular-nums text-lg" style={{ fontFamily: FONT_NUM }}>{`${fmtStopwatch(l).main}${fmtStopwatch(l).ms}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ TIMER ═══
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
      <div className="px-4 py-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <SecondsSettingRow icon={PersonStanding} label="הכנה" value={prepSec} onChange={setPrepSec} />
          <CountSettingRow icon={Timer} label="דקות" value={timerMin} onChange={setTimerMin} min={0} max={59} />
          <CountSettingRow icon={Clock} label="שניות" value={timerSec} onChange={setTimerSec} min={0} max={59} />
        </div>
        <button onClick={()=>startTimer(totalTimerMs,prepSec*1000)} disabled={totalTimerMs===0}
          className="w-full mt-5 rounded-xl shadow-lg flex items-center justify-center gap-2 text-white font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
          style={{backgroundColor:BRAND, height: 60, fontSize: 22, fontFamily: FONT_LABEL}}>
          <Play className="w-6 h-6"/>התחל
        </button>
      </div>
    );
  }
  return (
    <FullScreenRunning ms={display} total={totalDuration} phase={phase} phaseLabel={phase==='prepare'?'הכנה':'טיימר'} isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} useMMSS={true} />
  );
}

// ═══ TABATA ═══
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
  const totalTime = (workSec+restSec)*rounds*sets + (sets>1?setsRestSec*(sets-1):0) + prepSec;

  if (showSetup) {
    return (
      <div>
        <div className="px-4 py-2.5 rounded-xl mx-4 mt-2 mb-1" style={{backgroundColor: BRAND + '10', border: `1px solid ${BRAND}30`}}>
          <div className="flex justify-center gap-3 text-sm font-bold" style={{color: BRAND, fontFamily: FONT_LABEL}}>
            <span>{fmtTotal(totalTime)}</span>
            <span className="opacity-40">|</span>
            <span>{rounds*sets} אינטרוולים</span>
            <span className="opacity-40">|</span>
            <span>{sets} {sets===1?'סט':'סטים'}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mx-4 overflow-hidden">
          <SecondsSettingRow icon={PersonStanding} label="הכנה" value={prepSec} onChange={setPrepSec} />
          <SecondsSettingRow icon={Dumbbell} label="עבודה" value={workSec} onChange={setWorkSec} />
          <SecondsSettingRow icon={Coffee} label="מנוחה" value={restSec} onChange={setRestSec} />
          <CountSettingRow icon={Repeat} label="מחזורים" value={rounds} onChange={setRounds} min={1} max={50} />
          <CountSettingRow icon={Hourglass} label="סטים" value={sets} onChange={setSets} min={1} max={10} />
          {sets>1 && <SecondsSettingRow icon={Armchair} label="מנוחה בין סטים" value={setsRestSec} onChange={setSetsRestSec} />}
        </div>
        <div className="px-4 py-3">
          <button onClick={()=>startTabata({workTime:workSec,restTime:restSec,rounds,sets,setRest:setsRestSec,prepareTime:prepSec})}
            className="w-full rounded-xl shadow-lg flex items-center justify-center gap-2 text-white font-bold active:scale-[0.98] transition-transform"
            style={{backgroundColor:BRAND, height: 60, fontSize: 22, fontFamily: FONT_LABEL}}>
            <Play className="w-6 h-6"/>התחל
          </button>
        </div>
      </div>
    );
  }

  return (
    <FullScreenRunning ms={display} total={totalDuration} phase={phase} phaseLabel={phaseLabel} roundInfo={roundInfo} isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} />
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
    <div className="min-h-screen" dir="rtl" style={{backgroundColor:'#F7F7F7'}}>
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 pt-3 pb-1.5">
          <h1 className="text-xl font-black text-center" style={{ fontFamily: FONT_NUM, color: BRAND, letterSpacing: '0.03em' }}>
            {MODES.find(m=>m.id===mode)?.label}
          </h1>
        </div>
        <div className="flex gap-2 px-4 pb-2.5 overflow-x-auto">
          {MODES.map(m=>{
            const active=mode===m.id; const Icon=m.icon;
            return (
              <button key={m.id} onClick={()=>setMode(m.id)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-full transition-all active:scale-95"
                style={{
                  height: 40, minWidth: 90,
                  backgroundColor: active ? BRAND : '#F5F5F5',
                  color: active ? '#FFFFFF' : '#6B7280',
                  fontWeight: 700, fontSize: 15, fontFamily: FONT_NUM,
                  border: active ? 'none' : '1px solid #E5E7EB',
                }}>
                <Icon className="w-4 h-4"/>{m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pb-24">
        {mode==='tabata' && <TabataView/>}
        {mode==='timer' && <TimerView/>}
        {mode==='stopwatch' && <StopwatchView/>}
      </div>
    </div>
  );
}
