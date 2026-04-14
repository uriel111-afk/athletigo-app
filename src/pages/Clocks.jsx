import React, { useState, useRef, useCallback } from "react";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag, Square, Dumbbell, Coffee, Repeat, Hourglass, PersonStanding, Armchair } from "lucide-react";
import { useClock } from "@/contexts/ClockContext";

const BRAND = '#F97316';

// AthletiGo brand-only colors: orange, cream, white, black, gray
const PHASE_STYLE = {
  prepare: { bg: '#FFF7ED', accent: '#EA580C', text: '#EA580C' },
  work:    { bg: '#F97316', accent: '#FFFFFF', text: '#FFFFFF' },
  rest:    { bg: '#FFFFFF', accent: '#F97316', text: '#EA580C' },
  set_rest:{ bg: '#FFEDD5', accent: '#C2410C', text: '#C2410C' },
  running: { bg: '#F97316', accent: '#FFFFFF', text: '#FFFFFF' },
  paused:  { bg: '#FFF7ED', accent: '#F97316', text: '#9A3412' },
  done:    { bg: '#FFF7ED', accent: '#F97316', text: '#9A3412' },
  idle:    { bg: '#FAF8F3', accent: '#9CA3AF', text: '#6B7280' },
};

function fmt(ms, showMs = false) {
  if (ms < 0) ms = 0;
  const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  if (showMs) return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(Math.floor((ms%1000)/10)).padStart(2,'0')}`;
  if (m === 0) return String(s);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtTotal(sec) { return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }

function CircleClock({ ms, total, phase }) {
  const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
  const r = 170, circ = 2 * Math.PI * r;
  const progress = total > 0 ? Math.max(0, Math.min(1, ms / total)) : (phase === 'running' ? 1 : 0);
  return (
    <div className="flex justify-center">
      <svg className="w-full" style={{ maxWidth: 340, maxHeight: 340 }} viewBox="0 0 400 400">
        <circle cx="200" cy="200" r={r} fill="none" stroke="#F3F4F6" strokeWidth="12" />
        <circle cx="200" cy="200" r={r} fill="none" stroke={c.stroke} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ*(1-progress)} transform="rotate(-90 200 200)" style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
        <text x="200" y="215" textAnchor="middle" fontSize="90" fontWeight="900" fontFamily="'Courier New',monospace" fill={c.text}>{fmt(ms)}</text>
      </svg>
    </div>
  );
}

// Long-press: starts after 300ms delay, then 1 per 100ms
function HoldButton({ onClick, children, className, style }) {
  const intRef = useRef(null), toRef = useRef(null);
  const start = useCallback(() => {
    onClick();
    toRef.current = setTimeout(() => {
      intRef.current = setInterval(onClick, 100);
    }, 300);
  }, [onClick]);
  const stop = useCallback(() => {
    if (toRef.current) { clearTimeout(toRef.current); toRef.current = null; }
    if (intRef.current) { clearInterval(intRef.current); intRef.current = null; }
  }, []);
  return <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchEnd={stop} className={className} style={style}>{children}</button>;
}

// Number picker modal
function NumberPicker({ isOpen, value, onChange, onClose, min=0, max=59, label }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[70vw] max-w-[200px] max-h-[50vh] overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="px-4 py-2 border-b border-gray-100 text-center font-bold text-base text-gray-800">{label}</div>
        <div className="overflow-y-auto max-h-[40vh]">
          {Array.from({length:max-min+1},(_,i)=>min+i).map(v=>(
            <button key={v} onClick={()=>{onChange(v);onClose();}}
              className={`w-full py-2.5 text-center text-xl font-bold ${v===value?'bg-orange-50 text-[#F97316]':'text-gray-700 hover:bg-gray-50'}`}>{String(v).padStart(2,'0')}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Seconds-only setting row
function SecondsSettingRow({ icon: Icon, label, value, onChange, min=1, max=500 }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <>
      <div className="flex items-center py-4 border-b border-gray-100 last:border-0 px-2">
        <div className="w-12 flex justify-center flex-shrink-0">
          <Icon className="w-7 h-7" style={{ color: BRAND }} />
        </div>
        <div className="flex-1">
          <div className="text-xl font-semibold text-gray-700 mb-2 text-center">{label}</div>
          <div className="flex items-center justify-center gap-5">
            <HoldButton onClick={()=>onChange(Math.max(min,value-1))} className="w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow active:scale-90" style={{backgroundColor:BRAND}}>−</HoldButton>
            <button onClick={()=>setShowPicker(true)} className="min-w-[70px] text-center"><span className="text-5xl font-black text-gray-900 tabular-nums">{value}</span><span className="text-sm text-gray-400 block">שניות</span></button>
            <HoldButton onClick={()=>onChange(Math.min(max,value+1))} className="w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow active:scale-90" style={{backgroundColor:BRAND}}>+</HoldButton>
          </div>
        </div>
      </div>
      <NumberPicker isOpen={showPicker} value={value} onChange={onChange} onClose={()=>setShowPicker(false)} min={min} max={max} label={label} />
    </>
  );
}

// Count setting row: single number
function CountSettingRow({ icon: Icon, label, value, onChange, min=0, max=99 }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <>
      <div className="flex items-center py-4 border-b border-gray-100 last:border-0 px-2">
        <div className="w-12 flex justify-center flex-shrink-0"><Icon className="w-7 h-7" style={{color:BRAND}} /></div>
        <div className="flex-1">
          <div className="text-xl font-semibold text-gray-700 mb-2 text-center">{label}</div>
          <div className="flex items-center justify-center gap-5">
            <HoldButton onClick={()=>onChange(Math.max(min,value-1))} className="w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow active:scale-90" style={{backgroundColor:BRAND}}>−</HoldButton>
            <button onClick={()=>setShowPicker(true)} className="min-w-[70px] text-center"><span className="text-5xl font-black text-gray-900 tabular-nums">{value}</span></button>
            <HoldButton onClick={()=>onChange(Math.min(max,value+1))} className="w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow active:scale-90" style={{backgroundColor:BRAND}}>+</HoldButton>
          </div>
        </div>
      </div>
      <NumberPicker isOpen={showPicker} value={value} onChange={onChange} onClose={()=>setShowPicker(false)} min={min} max={max} label={label} />
    </>
  );
}

function SetDots({ current, total }) {
  if (total <= 1) return null;
  return <div className="flex justify-center gap-2 mt-3">{Array.from({length:total},(_,i)=><div key={i} className={`w-3.5 h-3.5 rounded-full ${i<=current?'bg-[#F97316]':'bg-gray-200'}`}/>)}</div>;
}

function FullScreenRunning({ ms, phase, phaseLabel, roundInfo, isRunning, onPause, onResume, onStop, showMs = false }) {
  const s = PHASE_STYLE[phase] || PHASE_STYLE.idle;
  const numSize = showMs ? 'clamp(60px, 15vw, 120px)' : 'clamp(240px, 55vw, 480px)';
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center" style={{ backgroundColor: s.bg }}>
      {/* Phase name */}
      <div className="font-black text-center" style={{ fontSize: 'clamp(32px, 10vw, 64px)', color: s.accent }}>
        {phaseLabel}
      </div>

      {/* Giant number */}
      <div className="font-black text-center tabular-nums" style={{ fontSize: numSize, lineHeight: 1, fontFamily: 'system-ui, sans-serif', color: s.text }}>
        {fmt(ms, showMs)}
      </div>

      {/* Round info */}
      {roundInfo && (
        <div className="font-bold text-center mt-2" style={{ fontSize: 'clamp(20px, 5vw, 40px)', color: s.accent, opacity: 0.7 }}>
          {roundInfo}
        </div>
      )}

      {/* Controls at bottom */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8">
        {onStop && (
          <button onClick={onStop} className="rounded-full flex items-center justify-center active:scale-90 shadow-md" style={{ width: 56, height: 56, backgroundColor: '#F3F4F6' }}>
            <Square className="w-7 h-7 text-gray-500" />
          </button>
        )}
        {isRunning ? (
          <button onClick={onPause} className="rounded-full flex items-center justify-center active:scale-95 shadow-lg" style={{ width: 80, height: 80, backgroundColor: s.accent }}>
            <Pause className="w-10 h-10 text-white" />
          </button>
        ) : (
          <button onClick={onResume} className="rounded-full flex items-center justify-center active:scale-95 shadow-lg" style={{ width: 80, height: 80, backgroundColor: s.accent }}>
            <Play className="w-10 h-10 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}

function ControlRow({ isRunning, onPause, onResume, onStop }) {
  return (
    <div className="flex gap-6 justify-center items-center mt-6">
      {onStop && <button onClick={onStop} className="rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 active:scale-90" style={{width:60,height:60}}><Square className="w-7 h-7"/></button>}
      {isRunning
        ? <button onClick={onPause} className="rounded-full flex items-center justify-center shadow-lg active:scale-95" style={{backgroundColor:BRAND,width:84,height:84}}><Pause className="w-10 h-10 text-white"/></button>
        : <button onClick={onResume} className="rounded-full flex items-center justify-center shadow-lg active:scale-95" style={{backgroundColor:BRAND,width:84,height:84}}><Play className="w-10 h-10 text-white"/></button>
      }
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
        <FullScreenRunning ms={display} phase={isRunning ? 'running' : 'paused'} phaseLabel="סטופר" isRunning={isRunning} onPause={pause} onResume={resume} onStop={reset} showMs={true} />
        {isRunning && (
          <button onClick={lapStopwatch} className="fixed bottom-8 right-6 z-[91] rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center active:scale-90" style={{width:56,height:56}}>
            <Flag className="w-7 h-7 text-white" />
          </button>
        )}
      </>
    );
  }

  return (
    <div className="px-4 py-8 flex flex-col items-center">
      <div className="text-center font-black text-gray-300 tabular-nums mb-8" style={{fontSize:'clamp(60px,15vw,120px)',lineHeight:1,fontFamily:'system-ui,sans-serif'}}>00:00.00</div>
      <button onClick={startStopwatch} className="rounded-full shadow-lg flex items-center justify-center active:scale-95" style={{backgroundColor:BRAND,width:80,height:80}}>
        <Play className="w-10 h-10 text-white" />
      </button>
      {laps.length>0 && <div className="w-full bg-gray-50 rounded-xl p-3 mt-6 max-h-40 overflow-y-auto">{laps.map((l,i)=><div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0"><span className="text-gray-500 font-medium">הקפה {i+1}</span><span className="font-mono font-bold text-gray-900">{fmt(l,true)}</span></div>)}</div>}
    </div>
  );
}

// ═══ TIMER ═══
function TimerView() {
  const { startTimer, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase } = useClock();
  const [prepSec, setPrepSec] = useState(3);
  const [timerSec, setTimerSec] = useState(60);
  const active = activeClock === 'timer';
  const showSetup = !active || phase === 'idle' || phase === 'done';

  if (showSetup) {
    return (
      <div className="px-4 py-4">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <SecondsSettingRow icon={PersonStanding} label="הכנה" value={prepSec} onChange={setPrepSec} />
          <SecondsSettingRow icon={Timer} label="טיימר" value={timerSec} onChange={setTimerSec} />
        </div>
        <button onClick={()=>startTimer(timerSec*1000,prepSec*1000)} disabled={timerSec===0}
          className="w-full mt-5 py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 text-white font-bold text-xl disabled:opacity-40 active:scale-[0.98]" style={{backgroundColor:BRAND}}>
          <Play className="w-6 h-6"/>התחל
        </button>
      </div>
    );
  }
  return (
    <FullScreenRunning ms={display} phase={phase} phaseLabel={phase==='prepare'?'הכנה':'טיימר'} isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} />
  );
}

// ═══ TABATA ═══
function TabataView() {
  const { startTabata, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase, phaseLabel, roundInfo, setProgress } = useClock();
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
        <div className="px-4 py-3 text-center" style={{backgroundColor:BRAND}}>
          <div className="flex justify-center gap-3 text-white text-lg font-bold">
            <span>{fmtTotal(totalTime)}</span><span className="opacity-50">•</span>
            <span>{rounds*sets} אינטרוולים</span><span className="opacity-50">•</span>
            <span>{sets} {sets===1?'סט':'סטים'}</span>
          </div>
        </div>
        <div className="bg-white">
          <SecondsSettingRow icon={PersonStanding} label="הכנה" value={prepSec} onChange={setPrepSec} />
          <SecondsSettingRow icon={Dumbbell} label="עבודה" value={workSec} onChange={setWorkSec} />
          <SecondsSettingRow icon={Coffee} label="מנוחה" value={restSec} onChange={setRestSec} />
          <CountSettingRow icon={Repeat} label="מחזורים" value={rounds} onChange={setRounds} min={1} max={50} />
          <CountSettingRow icon={Hourglass} label="סטים" value={sets} onChange={setSets} min={1} max={10} />
          {sets>1 && <SecondsSettingRow icon={Armchair} label="מנוחה בין סטים" value={setsRestSec} onChange={setSetsRestSec} />}
        </div>
        <div className="px-4 py-4">
          <button onClick={()=>startTabata({workTime:workSec,restTime:restSec,rounds,sets,setRest:setsRestSec,prepareTime:prepSec})}
            className="w-full py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 text-white font-bold text-xl active:scale-[0.98]" style={{backgroundColor:BRAND}}>
            <Play className="w-6 h-6"/>התחל
          </button>
        </div>
      </div>
    );
  }

  return (
    <FullScreenRunning ms={display} phase={phase} phaseLabel={phaseLabel} roundInfo={roundInfo} isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} />
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
    <div className="min-h-screen" dir="rtl" style={{backgroundColor:'#FAF8F3'}}>
      <div style={{backgroundColor:BRAND}}>
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-3xl font-black text-white text-center">{MODES.find(m=>m.id===mode)?.label}</h1>
        </div>
        <div className="flex">
          {MODES.map(m=>{
            const active=mode===m.id; const Icon=m.icon;
            return <button key={m.id} onClick={()=>setMode(m.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-lg font-bold transition-all ${active?'text-white':'text-white/50'}`}
              style={{borderBottom:active?'3px solid white':'3px solid transparent'}}>
              <Icon className="w-5 h-5"/>{m.label}
            </button>;
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
