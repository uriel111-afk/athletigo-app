import React, { useState, useRef } from "react";
import { useActiveTimer } from "@/contexts/ActiveTimerContext";
import { useNavigate, useLocation } from "react-router-dom";

export default function FloatingTimer() {
  const { liveTimer, setLiveTimer } = useActiveTimer();
  const navigate = useNavigate();
  const location = useLocation();
  const [pos, setPos] = useState({ x: 16, bottom: 90 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, moved: false });

  // Hide on clocks page or when not minimized
  if (!liveTimer?.isMinimized) return null;
  if (location.pathname.toLowerCase().includes('clock')) return null;

  const handleTouchStart = (e) => {
    dragRef.current = {
      dragging: true, moved: false,
      startX: e.touches[0].clientX - pos.x,
      startY: e.touches[0].clientY,
    };
  };
  const handleTouchMove = (e) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.moved = true;
    const newX = Math.max(0, Math.min(window.innerWidth - 160, e.touches[0].clientX - dragRef.current.startX));
    const newBottom = Math.max(70, Math.min(window.innerHeight - 120, window.innerHeight - e.touches[0].clientY - 60));
    setPos({ x: newX, bottom: newBottom });
  };
  const handleTouchEnd = () => { dragRef.current.dragging = false; };
  const handleTap = () => {
    if (dragRef.current.moved) return;
    setLiveTimer(prev => prev ? { ...prev, isMinimized: false } : null);
    navigate('/clocks');
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
      style={{
        position: 'fixed',
        left: pos.x,
        bottom: pos.bottom,
        zIndex: 999,
        background: liveTimer.color || '#FF6F20',
        borderRadius: 20,
        padding: '10px 16px',
        minWidth: 150,
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: 'pointer',
        direction: 'rtl',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
        {liveTimer.phase}
      </div>
      <div style={{
        fontSize: 48, fontWeight: 900, color: 'white',
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        letterSpacing: -2, fontFamily: "'Barlow Condensed', system-ui",
      }}>
        {liveTimer.display}
      </div>
      {liveTimer.info && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
          {liveTimer.info}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
        לחץ לחזרה
      </div>
    </div>
  );
}
