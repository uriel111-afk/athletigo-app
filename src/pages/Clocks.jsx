import React, { useState, useRef, useCallback } from "react";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag, Square, Dumbbell, Coffee, Repeat, Hourglass, PersonStanding, Armchair } from "lucide-react";
import { useClock } from "@/contexts/ClockContext";

const BRAND = '#FF6F20';

// Light theme phase styles — white/light bg, orange accents
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

// Seconds-only setting row
function SecondsSettingRow({ icon: Icon, label, value, onChange, min=1, max=500 }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <>
      <div className="flex items-center py-4 border-b border-gray-100 last:border-0 px-3">
        <div className="w-11 flex justify-center flex-shrink-0">
          <Icon className="w-6 h-6" style={{ color: BRAND }} />
        </div>
        <div className="flex-1">
          <div className="text-lg font-bold text-gray-700 mb-2 text-center" style={{ fontFamily: "'Heebo', sans-serif" }}>{label}</div>
          <div className="flex items-center justify-center gap-5">
            <HoldButton onClick={()=>onChange(Math.max(min,value-1))}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm active:scale-90 transition-transform"
              style={{backgroundColor:BRAND}}>−</HoldButton>
            <button onClick={()=>setShowPicker(true)} className="min-w-[70px] text-center">
              <span className="text-5xl font-black text-gray-900 tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</span>
              <span className="text-xs text-gray-400 block font-medium" style={{ fontFamily: "'Heebo', sans-serif" }}>שניות</span>
            </button>
            <HoldButton onClick={()=>onChange(Math.min(max,value+1))}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm active:scale-90 transition-transform"
              style={{backgroundColor:BRAND}}>+</HoldButton>
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
      <div className="flex items-center py-4 border-b border-gray-100 last:border-0 px-3">
        <div className="w-11 flex justify-center flex-shrink-0"><Icon className="w-6 h-6" style={{color:BRAND}} /></div>
        <div className="flex-1">
          <div className="text-lg font-bold text-gray-700 mb-2 text-center" style={{ fontFamily: "'Heebo', sans-serif" }}>{label}</div>
          <div className="flex items-center justify-center gap-5">
            <HoldButton onClick={()=>onChange(Math.max(min,value-1))}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm active:scale-90 transition-transform"
              style={{backgroundColor:BRAND}}>−</HoldButton>
            <button onClick={()=>setShowPicker(true)} className="min-w-[70px] text-center">
              <span className="text-5xl font-black text-gray-900 tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</span>
            </button>
            <HoldButton onClick={()=>onChange(Math.min(max,value+1))}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm active:scale-90 transition-transform"
              style={{backgroundColor:BRAND}}>+</HoldButton>
          </div>
        </div>
      </div>
      <NumberPicker isOpen={showPicker} value={value} onChange={onChange} onClose={()=>setShowPicker(false)} min={min} max={max} label={label} />
    </>
  );
}

function FullScreenRunning({ ms, phase, phaseLabel, roundInfo, isRunning, onPause, onResume, onStop, showMs = false, useMMSS = false, total }) {
  const s = PHASE_STYLE[phase] || PHASE_STYLE.idle;
  const r = 130, circ = 2 * Math.PI * r;
  const progress = total > 0 ? Math.max(0, Math.min(1, ms / total)) : (showMs ? 1 : 0);
  const offset = circ * (1 - progress);
  const displayText = showMs ? `${fmtStopwatch(ms).main}${fmtStopwatch(ms).ms}` : (useMMSS ? fmtMMSS(ms) : fmt(ms));

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-between py-6 px-4 transition-colors duration-400"
      style={{ backgroundColor: s.tint }}>

      {/* Top: phase label + round info */}
      <div className="text-center pt-4 w-full">
        <div style={{
          fontSize: 'clamp(24px, 6vw, 40px)',
          fontWeight: 900,
          fontFamily: "'Barlow Condensed', sans-serif",
          color: s.label,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {phaseLabel}
        </div>
        {roundInfo && (
          <div className="mt-1" style={{
            fontSize: 'clamp(18px, 4.5vw, 28px)',
            fontWeight: 700,
            fontFamily: "'Barlow Condensed', sans-serif",
            color: s.label,
            opacity: 0.6,
          }}>
            {roundInfo}
          </div>
        )}
      </div>

      {/* Center: ring + time */}
      <div className="relative flex items-center justify-center flex-shrink-0">
        <svg width="280" height="280" viewBox="0 0 280 280">
          <circle cx="140" cy="140" r={r} fill="none" stroke="#E5E7EB" strokeWidth="10" />
          <circle cx="140" cy="140" r={r} fill="none" stroke={s.ring} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            transform="rotate(-90 140 140)" style={{ transition: 'stroke-dashoffset 0.15s linear' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="tabular-nums text-center" style={{
            fontSize: showMs ? 'clamp(36px, 10vw, 60px)' : 'clamp(64px, 18vw, 96px)',
            fontWeight: 900,
            fontFamily: "'Barlow Condensed', system-ui, sans-serif",
            lineHeight: 1,
            color: s.text,
          }}>
            {displayText}
          </span>
        </div>
      </div>

      {/* Bottom: controls */}
      <div className="flex flex-col items-center gap-4 pb-4 w-full">
        {/* Buttons */}
        <div className="flex justify-center items-center gap-6">
          {onStop && (
            <button onClick={onStop}
              className="rounded-full flex items-center justify-center active:scale-90 transition-transform border-2"
              style={{ width: 56, height: 56, backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }}>
              <Square className="w-6 h-6 text-gray-400" />
            </button>
          )}
          {isRunning ? (
            <button onClick={onPause}
              className="rounded-full flex items-center justify-center active:scale-95 shadow-lg transition-transform"
              style={{ width: 72, height: 72, backgroundColor: s.ring }}>
              <Pause className="w-9 h-9 text-white" />
            </button>
          ) : (
            <button onClick={onResume}
              className="rounded-full flex items-center justify-center active:scale-95 shadow-lg transition-transform"
              style={{ width: 72, height: 72, backgroundColor: s.ring }}>
              <Play className="w-9 h-9 text-white" />
            </button>
          )}
        </div>
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
            style={{width:56,height:56}}>
            <Flag className="w-6 h-6" style={{ color: BRAND }} />
          </button>
        )}
      </>
    );
  }

  return (
    <div className="px-4 py-8 flex flex-col items-center">
      <div className="text-center tabular-nums mb-8" style={{
        fontSize:'clamp(60px,14vw,96px)',
        lineHeight:1,
        fontWeight:900,
        fontFamily:"'Barlow Condensed',system-ui,sans-serif",
        color:'#D1D5DB',
      }}>
        00:00.00
      </div>
      <button onClick={startStopwatch}
        className="rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        style={{backgroundColor:BRAND,width:72,height:72}}>
        <Play className="w-9 h-9 text-white" />
      </button>
      {laps.length>0 && (
        <div className="w-full bg-white rounded-xl border border-gray-100 p-3 mt-6 max-h-40 overflow-y-auto shadow-sm">
          {laps.map((l,i)=>(
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-gray-500 font-medium" style={{ fontFamily: "'Heebo', sans-serif" }}>הקפה {i+1}</span>
              <span className="font-bold text-gray-900 tabular-nums" style={{ fontFamily: "'Barlow Condensed', monospace" }}>{`${fmtStopwatch(l).main}${fmtStopwatch(l).ms}`}</span>
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
          className="w-full mt-5 h-16 rounded-xl shadow-lg flex items-center justify-center gap-2 text-white font-bold text-xl disabled:opacity-40 active:scale-[0.98] transition-transform"
          style={{backgroundColor:BRAND}}>
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
        {/* Summary bar */}
        <div className="px-4 py-3 rounded-xl mx-4 mt-2 mb-1" style={{backgroundColor: BRAND + '10', border: `1px solid ${BRAND}30`}}>
          <div className="flex justify-center gap-3 text-sm font-bold" style={{color: BRAND, fontFamily: "'Heebo', sans-serif"}}>
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
        <div className="px-4 py-4">
          <button onClick={()=>startTabata({workTime:workSec,restTime:restSec,rounds,sets,setRest:setsRestSec,prepareTime:prepSec})}
            className="w-full h-16 rounded-xl shadow-lg flex items-center justify-center gap-2 text-white font-bold text-xl active:scale-[0.98] transition-transform"
            style={{backgroundColor:BRAND}}>
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
      {/* Header + tab selector */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-2xl font-black text-center" style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            color: BRAND,
            letterSpacing: '0.03em',
          }}>
            {MODES.find(m=>m.id===mode)?.label}
          </h1>
        </div>
        {/* Tabs */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {MODES.map(m=>{
            const active=mode===m.id; const Icon=m.icon;
            return (
              <button key={m.id} onClick={()=>setMode(m.id)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-full transition-all active:scale-95"
                style={{
                  height: 44,
                  minWidth: 100,
                  backgroundColor: active ? BRAND : '#F5F5F5',
                  color: active ? '#FFFFFF' : '#6B7280',
                  fontWeight: 700,
                  fontSize: 16,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  border: active ? 'none' : '1px solid #E5E7EB',
                }}>
                <Icon className="w-4 h-4"/>{m.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Content */}
      <div className="pb-24">
        {mode==='tabata' && <TabataView/>}
        {mode==='timer' && <TimerView/>}
        {mode==='stopwatch' && <StopwatchView/>}
      </div>
    </div>
  );
}
