import React, { useState } from "react";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClock } from "@/contexts/ClockContext";

const PHASE_COLORS = {
  prepare: { bg: '#FEF3C7', stroke: '#F59E0B', text: '#92400E' },
  work: { bg: '#D1FAE5', stroke: '#10B981', text: '#065F46' },
  rest: { bg: '#DBEAFE', stroke: '#3B82F6', text: '#1E40AF' },
  set_rest: { bg: '#EDE9FE', stroke: '#8B5CF6', text: '#5B21B6' },
  running: { bg: '#FFF7ED', stroke: '#F97316', text: '#9A3412' },
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
  const centis = Math.floor((ms % 1000) / 10);
  return `${base}.${String(centis).padStart(2, '0')}`;
}

function CircleClock({ ms, total, phase }) {
  const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
  const r = 120;
  const circumference = 2 * Math.PI * r;
  const progress = total > 0 ? Math.max(0, Math.min(1, ms / total)) : 0;
  const offset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="240" viewBox="0 0 280 280" className="drop-shadow-sm">
        <circle cx="140" cy="140" r={r} fill="none" stroke="#E5E7EB" strokeWidth="10" />
        <circle cx="140" cy="140" r={r} fill="none" stroke={c.stroke} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 140 140)" style={{ transition: 'stroke-dashoffset 0.2s linear' }} />
        <text x="140" y="148" textAnchor="middle" fontSize="48" fontWeight="900" fontFamily="monospace" fill={c.text}>
          {fmt(ms)}
        </text>
      </svg>
    </div>
  );
}

function NumSetter({ label, value, onChange, min = 0, max = 99 }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold text-gray-400">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 font-bold text-sm flex items-center justify-center">-</button>
        <span className="w-8 text-center text-lg font-black">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 font-bold text-sm flex items-center justify-center">+</button>
      </div>
    </div>
  );
}

function StopwatchView() {
  const { startStopwatch, pause, resume, reset, lapStopwatch, display, isRunning, activeClock, laps, phase } = useClock();
  const active = activeClock === 'stopwatch';

  return (
    <div className="space-y-4">
      <CircleClock ms={display} total={0} phase={active && isRunning ? 'running' : active ? 'paused' : 'idle'} />
      <div className="text-center text-4xl font-black font-mono" style={{ color: '#1F2937' }}>{fmt(display, true)}</div>
      <div className="flex gap-3 justify-center">
        {!active || !isRunning ? (
          <Button onClick={active ? resume : startStopwatch} className="rounded-full w-14 h-14 bg-green-500 hover:bg-green-600 text-white shadow-lg">
            <Play className="w-6 h-6" />
          </Button>
        ) : (
          <Button onClick={pause} className="rounded-full w-14 h-14 bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg">
            <Pause className="w-6 h-6" />
          </Button>
        )}
        {active && isRunning && (
          <Button onClick={lapStopwatch} variant="outline" className="rounded-full w-14 h-14 border-2">
            <Flag className="w-5 h-5" />
          </Button>
        )}
        {active && !isRunning && display > 0 && (
          <Button onClick={reset} variant="outline" className="rounded-full w-14 h-14 border-2 text-red-500">
            <RotateCcw className="w-5 h-5" />
          </Button>
        )}
      </div>
      {laps.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 max-h-40 overflow-y-auto">
          {laps.map((l, i) => (
            <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="text-gray-500">הקפה {i + 1}</span>
              <span className="font-mono font-bold">{fmt(l, true)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimerView() {
  const { startTimer, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase } = useClock();
  const [mins, setMins] = useState(1);
  const [secs, setSecs] = useState(0);
  const [prep, setPrep] = useState(3);
  const active = activeClock === 'timer';
  const showSetup = !active || phase === 'idle' || phase === 'done';

  return (
    <div className="space-y-4">
      {showSetup ? (
        <div className="space-y-4">
          <div className="flex justify-center gap-6">
            <NumSetter label="דקות" value={mins} onChange={setMins} max={59} />
            <NumSetter label="שניות" value={secs} onChange={setSecs} max={59} />
            <NumSetter label="הכנה" value={prep} onChange={setPrep} max={10} />
          </div>
          <div className="flex justify-center">
            <Button onClick={() => startTimer((mins * 60 + secs) * 1000, prep * 1000)}
              disabled={mins === 0 && secs === 0}
              className="rounded-full w-14 h-14 bg-[#F97316] hover:bg-orange-600 text-white shadow-lg">
              <Play className="w-6 h-6" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-center text-sm font-bold mb-2" style={{ color: PHASE_COLORS[phase]?.text || '#6B7280' }}>
            {phase === 'prepare' ? 'הכנה...' : 'טיימר'}
          </div>
          <CircleClock ms={display} total={totalDuration} phase={phase} />
          <div className="text-center text-4xl font-black font-mono" style={{ color: PHASE_COLORS[phase]?.text }}>{fmt(display)}</div>
          <div className="flex gap-3 justify-center">
            {isRunning ? (
              <Button onClick={pause} className="rounded-full w-14 h-14 bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg">
                <Pause className="w-6 h-6" />
              </Button>
            ) : (
              <Button onClick={resume} className="rounded-full w-14 h-14 bg-green-500 hover:bg-green-600 text-white shadow-lg">
                <Play className="w-6 h-6" />
              </Button>
            )}
            <Button onClick={stop} variant="outline" className="rounded-full w-14 h-14 border-2 text-red-500">
              <Square className="w-5 h-5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function TabataView() {
  const { startTabata, pause, resume, stop, display, totalDuration, isRunning, activeClock, phase, phaseLabel, roundInfo } = useClock();
  const [work, setWork] = useState(20);
  const [rest, setRest] = useState(10);
  const [rounds, setRounds] = useState(8);
  const [sets, setSets] = useState(1);
  const [setRst, setSetRst] = useState(60);
  const [prep, setPrep] = useState(3);
  const active = activeClock === 'tabata';
  const showSetup = !active || phase === 'idle' || phase === 'done';

  return (
    <div className="space-y-4">
      {showSetup ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <NumSetter label="עבודה (שנ)" value={work} onChange={setWork} min={5} max={120} />
            <NumSetter label="מנוחה (שנ)" value={rest} onChange={setRest} max={120} />
            <NumSetter label="סיבובים" value={rounds} onChange={setRounds} min={1} max={20} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumSetter label="סטים" value={sets} onChange={setSets} min={1} max={10} />
            <NumSetter label="מנוחה סטים" value={setRst} onChange={setSetRst} max={180} />
            <NumSetter label="הכנה (שנ)" value={prep} onChange={setPrep} max={10} />
          </div>
          <div className="text-center text-xs text-gray-400">
            סה"כ: {Math.floor(((work + rest) * rounds * sets + (sets > 1 ? setRst * (sets - 1) : 0) + prep) / 60)} דקות
          </div>
          <div className="flex justify-center">
            <Button onClick={() => startTabata({ workTime: work, restTime: rest, rounds, sets, setRest: setRst, prepareTime: prep })}
              className="rounded-full w-14 h-14 bg-[#F97316] hover:bg-orange-600 text-white shadow-lg">
              <Play className="w-6 h-6" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-center space-y-1 mb-2">
            <div className="text-lg font-black" style={{ color: PHASE_COLORS[phase]?.text }}>{phaseLabel}</div>
            {roundInfo && <div className="text-xs font-bold text-gray-400">{roundInfo}</div>}
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: PHASE_COLORS[phase]?.bg }}>
            <CircleClock ms={display} total={totalDuration} phase={phase} />
          </div>
          <div className="text-center text-4xl font-black font-mono" style={{ color: PHASE_COLORS[phase]?.text }}>{fmt(display)}</div>
          <div className="flex gap-3 justify-center">
            {isRunning ? (
              <Button onClick={pause} className="rounded-full w-14 h-14 bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg">
                <Pause className="w-6 h-6" />
              </Button>
            ) : (
              <Button onClick={resume} className="rounded-full w-14 h-14 bg-green-500 hover:bg-green-600 text-white shadow-lg">
                <Play className="w-6 h-6" />
              </Button>
            )}
            <Button onClick={stop} variant="outline" className="rounded-full w-14 h-14 border-2 text-red-500">
              <Square className="w-5 h-5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

const MODES = [
  { id: 'stopwatch', label: 'סטופר', icon: Clock },
  { id: 'timer', label: 'טיימר', icon: Timer },
  { id: 'tabata', label: 'טבטה', icon: Zap },
];

export default function Clocks() {
  const [mode, setMode] = useState('stopwatch');

  return (
    <div className="min-h-screen pb-8" dir="rtl" style={{ backgroundColor: '#FAF8F3' }}>
      <div className="max-w-lg mx-auto px-4 py-4">
        <h1 className="text-2xl font-black text-gray-900 mb-4 text-center">שעונים</h1>

        {/* Mode Tabs */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {MODES.map(m => {
            const active = mode === m.id;
            const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm transition-all
                  ${active ? 'bg-[#F97316] text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#F97316]'}`}>
                <Icon className="w-4 h-4" />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {mode === 'stopwatch' && <StopwatchView />}
          {mode === 'timer' && <TimerView />}
          {mode === 'tabata' && <TabataView />}
        </div>
      </div>
    </div>
  );
}
