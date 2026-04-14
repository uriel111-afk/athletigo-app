import React, { useState } from "react";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag, Square, Hourglass, Dumbbell, Coffee, Repeat, Layers, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClock } from "@/contexts/ClockContext";

const BRAND = '#F97316';
const PHASE_COLORS = {
  prepare: { bg: '#FEF3C7', stroke: '#F59E0B', text: '#92400E' },
  work: { bg: '#D1FAE5', stroke: '#10B981', text: '#065F46' },
  rest: { bg: '#DBEAFE', stroke: '#3B82F6', text: '#1E40AF' },
  set_rest: { bg: '#EDE9FE', stroke: '#8B5CF6', text: '#5B21B6' },
  running: { bg: '#FFF7ED', stroke: BRAND, text: '#9A3412' },
  paused: { bg: '#FEF3C7', stroke: '#F59E0B', text: '#92400E' },
  done: { bg: '#D1FAE5', stroke: '#10B981', text: '#065F46' },
  idle: { bg: '#F9FAFB', stroke: '#D1D5DB', text: '#6B7280' },
};

function fmt(ms, showMs = false) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (!showMs) return base;
  return `${base}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
}

function CircleClock({ ms, total, phase }) {
  const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
  const r = 120;
  const circ = 2 * Math.PI * r;
  const progress = total > 0 ? Math.max(0, Math.min(1, ms / total)) : 0;
  const offset = circ * (1 - progress);
  return (
    <div className="flex justify-center">
      <svg width="220" height="220" viewBox="0 0 280 280">
        <circle cx="140" cy="140" r={r} fill="none" stroke="#E5E7EB" strokeWidth="10" />
        <circle cx="140" cy="140" r={r} fill="none" stroke={c.stroke} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 140 140)" style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
        <text x="140" y="150" textAnchor="middle" fontSize="52" fontWeight="900" fontFamily="'Courier New', monospace" fill={c.text}>
          {fmt(ms)}
        </text>
      </svg>
    </div>
  );
}

function SettingRow({ icon: Icon, label, value, onChange, min = 0, max = 999, suffix }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5" style={{ color: BRAND }} />
        <span className="text-sm font-bold text-gray-800">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(min, value - (suffix === 'שנ' ? 5 : 1)))}
          className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center hover:bg-gray-200 active:scale-95">−</button>
        <div className="w-14 text-center">
          <span className="text-lg font-black text-gray-900">{value}</span>
          {suffix && <span className="text-[10px] text-gray-400 block -mt-1">{suffix}</span>}
        </div>
        <button onClick={() => onChange(Math.min(max, value + (suffix === 'שנ' ? 5 : 1)))}
          className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center hover:bg-gray-200 active:scale-95">+</button>
      </div>
    </div>
  );
}

function SetDots({ current, total }) {
  return (
    <div className="flex justify-center gap-2 mt-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`w-3 h-3 rounded-full ${i < current ? 'bg-[#F97316]' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}

function ControlButtons({ isRunning, onPause, onResume, onStop, onReset }) {
  return (
    <div className="flex gap-4 justify-center items-center mt-4">
      {onReset && (
        <button onClick={onReset} className="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200">
          <RotateCcw className="w-5 h-5" />
        </button>
      )}
      {isRunning ? (
        <button onClick={onPause} className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: BRAND }}>
          <Pause className="w-7 h-7 text-white" />
        </button>
      ) : (
        <button onClick={onResume} className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: BRAND }}>
          <Play className="w-7 h-7 text-white" />
        </button>
      )}
      {onStop && (
        <button onClick={onStop} className="w-11 h-11 rounded-full bg-gray-100 text-red-500 flex items-center justify-center hover:bg-red-50">
          <Square className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

// ═══ STOPWATCH ═══
function StopwatchView() {
  const { startStopwatch, pause, resume, reset, lapStopwatch, display, isRunning, activeClock, laps } = useClock();
  const active = activeClock === 'stopwatch';
  return (
    <div className="space-y-4">
      <CircleClock ms={display} total={0} phase={active && isRunning ? 'running' : active ? 'paused' : 'idle'} />
      <div className="text-center text-4xl font-black font-mono text-gray-900">{fmt(display, true)}</div>
      <div className="flex gap-3 justify-center items-center">
        {!active ? (
          <button onClick={startStopwatch} className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center" style={{ backgroundColor: BRAND }}>
            <Play className="w-7 h-7 text-white" />
          </button>
        ) : (
          <>
            <button onClick={reset} className="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center"><RotateCcw className="w-5 h-5" /></button>
            {isRunning ? (
              <button onClick={pause} className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center" style={{ backgroundColor: BRAND }}><Pause className="w-7 h-7 text-white" /></button>
            ) : (
              <button onClick={resume} className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center" style={{ backgroundColor: BRAND }}><Play className="w-7 h-7 text-white" /></button>
            )}
            {isRunning && <button onClick={lapStopwatch} className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"><Flag className="w-5 h-5" /></button>}
          </>
        )}
      </div>
      {laps.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto">
          {laps.map((l, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-gray-500 font-medium">הקפה {i + 1}</span>
              <span className="font-mono font-bold text-gray-900">{fmt(l, true)}</span>
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
  const [mins, setMins] = useState(1);
  const [secs, setSecs] = useState(0);
  const [prep, setPrep] = useState(3);
  const active = activeClock === 'timer';
  const showSetup = !active || phase === 'idle' || phase === 'done';

  if (showSetup) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <SettingRow icon={Timer} label="דקות" value={mins} onChange={setMins} max={59} />
          <SettingRow icon={Clock} label="שניות" value={secs} onChange={setSecs} max={59} />
          <SettingRow icon={Shield} label="הכנה" value={prep} onChange={setPrep} max={10} suffix="שנ" />
        </div>
        <div className="flex justify-center">
          <button onClick={() => startTimer((mins * 60 + secs) * 1000, prep * 1000)}
            disabled={mins === 0 && secs === 0}
            className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center disabled:opacity-40" style={{ backgroundColor: BRAND }}>
            <Play className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center text-sm font-bold" style={{ color: PHASE_COLORS[phase]?.text }}>
        {phase === 'prepare' ? 'הכנה...' : 'טיימר'}
      </div>
      <div className="rounded-2xl p-3" style={{ backgroundColor: PHASE_COLORS[phase]?.bg }}>
        <CircleClock ms={display} total={totalDuration} phase={phase} />
      </div>
      <ControlButtons isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} />
    </div>
  );
}

// ═══ TABATA ═══
function TabataView() {
  const { startTabata, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase, phaseLabel, roundInfo, setProgress } = useClock();
  const [work, setWork] = useState(20);
  const [rest, setRest] = useState(10);
  const [rounds, setRounds] = useState(8);
  const [sets, setSets] = useState(1);
  const [setRst, setSetRst] = useState(60);
  const [prep, setPrep] = useState(10);
  const active = activeClock === 'tabata';
  const showSetup = !active || phase === 'idle' || phase === 'done';

  const totalTime = (work + rest) * rounds * sets + (sets > 1 ? setRst * (sets - 1) : 0) + prep;
  const totalIntervals = rounds * sets;

  if (showSetup) {
    return (
      <div className="space-y-4">
        {/* Summary */}
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <div className="flex justify-center gap-4 text-xs font-bold text-gray-600">
            <span>{Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')} דקות</span>
            <span>•</span>
            <span>{totalIntervals} אינטרוולים</span>
            <span>•</span>
            <span>{sets} סטים</span>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-xl border border-gray-100 px-4">
          <SettingRow icon={Shield} label="הכנה" value={prep} onChange={setPrep} max={30} suffix="שנ" />
          <SettingRow icon={Dumbbell} label="עבודה" value={work} onChange={setWork} min={5} max={120} suffix="שנ" />
          <SettingRow icon={Coffee} label="מנוחה" value={rest} onChange={setRest} max={120} suffix="שנ" />
          <SettingRow icon={Repeat} label="מחזורים" value={rounds} onChange={setRounds} min={1} max={50} />
          <SettingRow icon={Layers} label="סטים" value={sets} onChange={setSets} min={1} max={10} />
          {sets > 1 && <SettingRow icon={Hourglass} label="מנוחה בין סטים" value={setRst} onChange={setSetRst} max={300} suffix="שנ" />}
        </div>

        {/* Start */}
        <div className="flex justify-center">
          <button onClick={() => startTabata({ workTime: work, restTime: rest, rounds, sets, setRest: setRst, prepareTime: prep })}
            className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center" style={{ backgroundColor: BRAND }}>
            <Play className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>
    );
  }

  // Running view
  const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-2xl font-black" style={{ color: c.text }}>{phaseLabel}</div>
        {roundInfo && <div className="text-xs font-bold text-gray-400 mt-1">{roundInfo}</div>}
      </div>
      <div className="rounded-2xl p-4" style={{ backgroundColor: c.bg }}>
        <CircleClock ms={display} total={totalDuration} phase={phase} />
      </div>
      {setProgress.total > 1 && <SetDots current={setProgress.current} total={setProgress.total} />}
      <ControlButtons isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} />
    </div>
  );
}

const MODES = [
  { id: 'stopwatch', label: 'סטופר', icon: Clock },
  { id: 'timer', label: 'טיימר', icon: Timer },
  { id: 'tabata', label: 'טבטה', icon: Zap },
];

export default function Clocks() {
  const [mode, setMode] = useState('tabata');

  return (
    <div className="min-h-screen pb-8" dir="rtl" style={{ backgroundColor: '#FAF8F3' }}>
      <div className="max-w-lg mx-auto px-4 py-4">
        <h1 className="text-2xl font-black text-gray-900 mb-4 text-right">שעונים</h1>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {MODES.map(m => {
            const active = mode === m.id;
            const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm transition-all
                  ${active ? 'text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#F97316]'}`}
                style={active ? { backgroundColor: BRAND } : {}}>
                <Icon className="w-4 h-4" />
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {mode === 'stopwatch' && <StopwatchView />}
          {mode === 'timer' && <TimerView />}
          {mode === 'tabata' && <TabataView />}
        </div>
      </div>
    </div>
  );
}
