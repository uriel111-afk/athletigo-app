import React, { useState, useRef } from "react";
import { useClock } from "@/contexts/ClockContext";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Pause, Play, X, Zap, Timer, Clock } from "lucide-react";

function fmt(ms) {
  if (ms < 0) ms = 0;
  const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  if (m === 0) return String(s);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ICONS = { tabata: Zap, timer: Timer, stopwatch: Clock };
const COLORS = { work: '#FF6F20', prepare: '#FF6F20', rest: '#666', set_rest: '#888', running: '#FF6F20', paused: '#999' };

export default function FloatingClockBar() {
  const clock = useClock();
  const navigate = useNavigate();
  const location = useLocation();
  const [pos, setPos] = useState({ x: 16, y: null });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);
  const movedRef = useRef(false);

  if (!clock?.activeClock) return null;
  if (clock.phase === 'idle' || clock.phase === 'done') return null;
  // Show floating widget when: running + (minimized OR not on clocks page)
  const onClocksPage = location.pathname.toLowerCase().includes('clock');
  if (onClocksPage && !clock.isMinimized) return null;

  const Icon = ICONS[clock.activeClock] || Zap;
  const bg = COLORS[clock.phase] || '#FF6F20';

  const onTouchStart = (e) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX - pos.x, y: t.clientY - (pos.y ?? (window.innerHeight - 160)) };
    setDragging(true);
    movedRef.current = false;
  };
  const onTouchMove = (e) => {
    if (!dragging) return;
    movedRef.current = true;
    const t = e.touches[0];
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 170, t.clientX - startRef.current.x)),
      y: Math.max(60, Math.min(window.innerHeight - 120, t.clientY - startRef.current.y)),
    });
  };
  const onTouchEnd = () => setDragging(false);
  const handleTap = () => {
    if (!movedRef.current) {
      if (clock.maximize) clock.maximize();
      navigate(createPageUrl('Clocks'));
    }
  };

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onClick={handleTap}
      style={{
        position: 'fixed',
        left: pos.x,
        bottom: pos.y !== null ? 'auto' : 90,
        top: pos.y !== null ? pos.y : 'auto',
        zIndex: 500,
        background: bg, borderRadius: 20,
        padding: '12px 18px', minWidth: 160,
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        cursor: 'pointer', direction: 'rtl', userSelect: 'none',
        transition: dragging ? 'none' : 'left 0.1s, top 0.1s, bottom 0.1s',
      }}>
      {/* Phase + icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.9)' }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: "'Heebo', sans-serif" }}>
          {clock.phaseLabel || (clock.activeClock === 'stopwatch' ? 'סטופר' : clock.activeClock === 'timer' ? 'טיימר' : 'TABATA')}
        </span>
      </div>

      {/* Main time */}
      <div style={{ fontSize: 48, fontWeight: 900, color: '#FFF', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -2, fontFamily: "'Barlow Condensed', system-ui" }}>
        {fmt(clock.display)}
      </div>

      {/* Round info */}
      {clock.roundInfo && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontFamily: "'Heebo', sans-serif" }}>
          {clock.roundInfo}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }} onClick={e => e.stopPropagation()}>
        {clock.isRunning ? (
          <button onClick={clock.pause} style={{ width: 36, height: 36, borderRadius: '50%', background: '#FFF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Pause style={{ width: 16, height: 16, color: bg }} />
          </button>
        ) : (
          <button onClick={clock.resume} style={{ width: 36, height: 36, borderRadius: '50%', background: '#FFF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Play style={{ width: 16, height: 16, color: bg }} />
          </button>
        )}
        <button onClick={clock.stop} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X style={{ width: 16, height: 16, color: '#FFF' }} />
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>לחץ לחזרה לשעון</div>
    </div>
  );
}
