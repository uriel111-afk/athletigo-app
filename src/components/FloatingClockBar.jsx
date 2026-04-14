import React from "react";
import { useClock } from "@/contexts/ClockContext";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Pause, Play, X } from "lucide-react";

function fmt(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const LABELS = { stopwatch: 'סטופר', timer: 'טיימר', tabata: 'טבטה' };

export default function FloatingClockBar() {
  const clock = useClock();
  const navigate = useNavigate();
  const location = useLocation();

  if (!clock?.activeClock) return null;
  if (clock.phase === 'idle' || clock.phase === 'done') return null;
  // Don't show on the Clocks page itself
  if (location.pathname.toLowerCase().includes('clock')) return null;

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-[#F97316] text-white text-sm font-bold z-40 flex-shrink-0"
      style={{ minHeight: 40 }}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-base">{fmt(clock.display)}</span>
        <span className="text-[10px] opacity-80">{clock.phaseLabel || LABELS[clock.activeClock]}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => navigate(createPageUrl('Clocks'))}
          className="px-2 py-1 rounded-lg bg-white/20 text-[11px] font-bold hover:bg-white/30">פתח</button>
        {clock.isRunning ? (
          <button onClick={clock.pause} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30">
            <Pause className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={clock.resume} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30">
            <Play className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={clock.stop} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
