import React, { useState } from "react";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag, Square, Dumbbell, Coffee, Repeat, Hourglass, PersonStanding, Armchair } from "lucide-react";
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

function fmtTotal(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function CircleClock({ ms, total, phase, size = 220 }) {
  const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
  const r = 120;
  const circ = 2 * Math.PI * r;
  const progress = total > 0 ? Math.max(0, Math.min(1, ms / total)) : (phase === 'running' ? 1 : 0);
  const offset = circ * (1 - progress);
  return (
    <div className="flex justify-center">
      <svg width={size} height={size} viewBox="0 0 280 280">
        <circle cx="140" cy="140" r={r} fill="none" stroke="#F3F4F6" strokeWidth="10" />
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

// ─── Tabata Setting Row ───
function SettingRow({ icon: Icon, label, value, onChange, min = 0, max = 999, step = 1 }) {
  return (
    <div className="flex items-center py-4 border-b border-gray-100 last:border-0">
      <div className="w-12 flex justify-center flex-shrink-0">
        <Icon className="w-6 h-6" style={{ color: BRAND }} />
      </div>
      <div className="flex-1 text-center">
        <div className="text-xs font-bold text-gray-500 mb-1">{label}</div>
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => onChange(Math.max(min, value - step))}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm active:scale-90" style={{ backgroundColor: BRAND }}>
            −
          </button>
          <span className="text-3xl font-black text-gray-900 w-16 text-center tabular-nums">{value}</span>
          <button onClick={() => onChange(Math.min(max, value + step))}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm active:scale-90" style={{ backgroundColor: BRAND }}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function SetDots({ current, total }) {
  if (total <= 1) return null;
  return (
    <div className="flex justify-center gap-2 mt-3">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`w-3 h-3 rounded-full transition-colors ${i <= current ? 'bg-[#F97316]' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}

function ControlRow({ isRunning, onPause, onResume, onStop, onReset }) {
  return (
    <div className="flex gap-5 justify-center items-center mt-5">
      {onStop && (
        <button onClick={onStop} className="w-12 h-12 rounded-full bg-gray-100 text-red-500 flex items-center justify-center hover:bg-red-50 active:scale-90">
          <Square className="w-5 h-5" />
        </button>
      )}
      {isRunning ? (
        <button onClick={onPause} className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95" style={{ backgroundColor: BRAND }}>
          <Pause className="w-8 h-8 text-white" />
        </button>
      ) : (
        <button onClick={onResume} className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95" style={{ backgroundColor: BRAND }}>
          <Play className="w-8 h-8 text-white" />
        </button>
      )}
      {onReset && (
        <button onClick={onReset} className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 active:scale-90">
          <RotateCcw className="w-5 h-5" />
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
    <div>
      <div className="py-4">
        <CircleClock ms={display} total={0} phase={active && isRunning ? 'running' : active ? 'paused' : 'idle'} />
        <div className="text-center text-4xl font-black font-mono text-gray-900 mt-2">{fmt(display, true)}</div>
      </div>
      <div className="flex gap-4 justify-center items-center">
        {!active ? (
          <button onClick={startStopwatch} className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center active:scale-95" style={{ backgroundColor: BRAND }}>
            <Play className="w-8 h-8 text-white" />
          </button>
        ) : (
          <>
            <button onClick={reset} className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center"><RotateCcw className="w-5 h-5" /></button>
            {isRunning ? (
              <button onClick={pause} className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center active:scale-95" style={{ backgroundColor: BRAND }}><Pause className="w-8 h-8 text-white" /></button>
            ) : (
              <button onClick={resume} className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center active:scale-95" style={{ backgroundColor: BRAND }}><Play className="w-8 h-8 text-white" /></button>
            )}
            {isRunning && <button onClick={lapStopwatch} className="w-12 h-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"><Flag className="w-5 h-5" /></button>}
          </>
        )}
      </div>
      {laps.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-3 mt-4 max-h-40 overflow-y-auto">
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
      <div>
        <div className="px-2">
          <SettingRow icon={Timer} label="דקות" value={mins} onChange={setMins} max={59} />
          <SettingRow icon={Clock} label="שניות" value={secs} onChange={setSecs} max={59} />
          <SettingRow icon={PersonStanding} label="הכנה (שניות)" value={prep} onChange={setPrep} max={10} />
        </div>
        <div className="flex justify-center mt-6">
          <button onClick={() => startTimer((mins * 60 + secs) * 1000, prep * 1000)}
            disabled={mins === 0 && secs === 0}
            className="px-10 py-4 rounded-full shadow-lg flex items-center gap-2 text-white font-bold text-lg disabled:opacity-40 active:scale-95" style={{ backgroundColor: BRAND }}>
            <Play className="w-6 h-6" />התחל
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-center text-sm font-bold mb-1" style={{ color: PHASE_COLORS[phase]?.text }}>
        {phase === 'prepare' ? 'הכנה...' : 'טיימר'}
      </div>
      <div className="rounded-2xl p-4" style={{ backgroundColor: PHASE_COLORS[phase]?.bg }}>
        <CircleClock ms={display} total={totalDuration} phase={phase} />
      </div>
      <ControlRow isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} />
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
      <div>
        {/* Summary header */}
        <div className="rounded-xl px-4 py-3 mb-4 text-center" style={{ backgroundColor: BRAND }}>
          <div className="flex justify-center gap-3 text-white text-sm font-bold">
            <span>{fmtTotal(totalTime)}</span>
            <span className="opacity-60">•</span>
            <span>{totalIntervals} אינטרוולים</span>
            <span className="opacity-60">•</span>
            <span>{sets} {sets === 1 ? 'סט' : 'סטים'}</span>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <SettingRow icon={PersonStanding} label="הכנה" value={prep} onChange={setPrep} max={30} step={5} />
          <SettingRow icon={Dumbbell} label="עבודה" value={work} onChange={setWork} min={5} max={120} step={5} />
          <SettingRow icon={Coffee} label="מנוחה" value={rest} onChange={setRest} max={120} step={5} />
          <SettingRow icon={Repeat} label="מחזורים" value={rounds} onChange={setRounds} min={1} max={50} />
          <SettingRow icon={Hourglass} label="סטים" value={sets} onChange={setSets} min={1} max={10} />
          {sets > 1 && <SettingRow icon={Armchair} label="מנוחה בין סטים" value={setRst} onChange={setSetRst} max={300} step={10} />}
        </div>

        {/* Start */}
        <div className="flex justify-center mt-6">
          <button onClick={() => startTabata({ workTime: work, restTime: rest, rounds, sets, setRest: setRst, prepareTime: prep })}
            className="px-10 py-4 rounded-full shadow-lg flex items-center gap-2 text-white font-bold text-lg active:scale-95" style={{ backgroundColor: BRAND }}>
            <Play className="w-6 h-6" />התחל
          </button>
        </div>
      </div>
    );
  }

  // Running view
  const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
  return (
    <div>
      <div className="text-center mb-2">
        <div className="text-2xl font-black" style={{ color: c.text }}>{phaseLabel}</div>
        {roundInfo && <div className="text-xs font-bold text-gray-400 mt-1">{roundInfo}</div>}
      </div>
      <div className="rounded-2xl p-4 mb-2" style={{ backgroundColor: c.bg }}>
        <CircleClock ms={display} total={totalDuration} phase={phase} />
      </div>
      <SetDots current={setProgress?.current || 0} total={setProgress?.total || 0} />
      <ControlRow isRunning={isRunning} onPause={pause} onResume={resume} onStop={stop} />
    </div>
  );
}

// ═══ MODE TABS ═══
const MODES = [
  { id: 'tabata', label: 'טבטה', icon: Zap },
  { id: 'timer', label: 'טיימר', icon: Timer },
  { id: 'stopwatch', label: 'סטופר', icon: Clock },
];

export default function Clocks() {
  const [mode, setMode] = useState('tabata');

  return (
    <div className="min-h-screen" dir="rtl" style={{ backgroundColor: '#FAF8F3' }}>
      <div className="max-w-md mx-auto">
        {/* Top Tabs */}
        <div className="flex bg-white border-b border-gray-200">
          {MODES.map(m => {
            const active = mode === m.id;
            const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold transition-all border-b-2
                  ${active ? 'border-[#F97316] text-[#F97316]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <Icon className="w-4 h-4" />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-4 py-4 pb-24">
          {mode === 'tabata' && <TabataView />}
          {mode === 'timer' && <TimerView />}
          {mode === 'stopwatch' && <StopwatchView />}
        </div>
      </div>
    </div>
  );
}
