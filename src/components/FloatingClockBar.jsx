import React from "react";
import { useClock } from "@/contexts/ClockContext";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Pause, Play, X, Zap, Timer, Clock } from "lucide-react";

function fmt(ms) {
  if (ms < 0) ms = 0;
  const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  if (m === 0) return String(s);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const ICONS = { tabata: Zap, timer: Timer, stopwatch: Clock };

export default function FloatingClockBar() {
  const clock = useClock();
  const navigate = useNavigate();
  const location = useLocation();

  if (!clock?.activeClock) return null;
  if (clock.phase === 'idle' || clock.phase === 'done') return null;
  if (location.pathname.toLowerCase().includes('clock')) return null;

  const Icon = ICONS[clock.activeClock] || Zap;

  return (
    <div onClick={() => navigate(createPageUrl('Clocks'))}
      style={{
        position: 'fixed', bottom: 80, left: 16, zIndex: 500,
        background: '#FF6F20', borderRadius: 24,
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 4px 16px rgba(255,111,32,0.4)', cursor: 'pointer',
        direction: 'rtl',
      }}>
      <Icon style={{ width: 18, height: 18, color: '#FFF' }} />
      <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Barlow Condensed', system-ui", color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>
        {fmt(clock.display)}
      </span>
      {clock.phaseLabel && (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{clock.phaseLabel}</span>
      )}
      <div style={{ display: 'flex', gap: 6, marginRight: 4 }} onClick={e => e.stopPropagation()}>
        {clock.isRunning ? (
          <button onClick={clock.pause} style={{ width: 32, height: 32, borderRadius: '50%', background: '#FFF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Pause style={{ width: 14, height: 14, color: '#FF6F20' }} />
          </button>
        ) : (
          <button onClick={clock.resume} style={{ width: 32, height: 32, borderRadius: '50%', background: '#FFF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Play style={{ width: 14, height: 14, color: '#FF6F20' }} />
          </button>
        )}
        <button onClick={clock.stop} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X style={{ width: 14, height: 14, color: '#FFF' }} />
        </button>
      </div>
    </div>
  );
}
