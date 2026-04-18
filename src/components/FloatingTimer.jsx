import { useState, useRef } from 'react';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useNavigate } from 'react-router-dom';

const FloatingTimer = () => {
  const { liveTimer, setLiveTimer, showTabata, setShowTabata } = useActiveTimer();
  const navigate = useNavigate();
  const [pos, setPos] = useState({ x: 16, bottom: 90 });
  const drag = useRef({ active: false, startX: 0, startY: 0, initBottom: 90 });

  if (!liveTimer) return null;
  if (showTabata) return null;

  const onTouchStart = (e) => {
    drag.current = {
      active: true,
      startX: e.touches[0].clientX - pos.x,
      startY: e.touches[0].clientY,
      initBottom: pos.bottom
    };
  };

  const onTouchMove = (e) => {
    if (!drag.current.active) return;
    e.preventDefault();
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 170, e.touches[0].clientX - drag.current.startX)),
      bottom: Math.max(70, Math.min(window.innerHeight - 160, drag.current.initBottom + (drag.current.startY - e.touches[0].clientY)))
    });
  };

  const handleTap = () => {
    if (liveTimer.type === 'tabata') {
      setShowTabata(true);
      setLiveTimer(null);
    } else {
      navigate('/clocks');
    }
  };

  const handleStop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const type = liveTimer?.type;
    setLiveTimer(null);
    if (type === 'tabata') {
      setShowTabata(false);
      window.dispatchEvent(new CustomEvent('tabata-reset'));
    } else {
      window.dispatchEvent(new CustomEvent('clock-reset', { detail: { type } }));
    }
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => { drag.current.active = false; }}
      style={{
        position: 'fixed', left: pos.x, bottom: pos.bottom,
        zIndex: 9998, background: '#FF6F20', borderRadius: 20,
        padding: '10px 16px 10px 12px', minWidth: 160,
        boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        direction: 'rtl', userSelect: 'none', touchAction: 'none'
      }}
    >
      {/* X stop button */}
      <button onPointerDown={handleStop} style={{
        position: 'absolute', top: 6, left: 8,
        width: 24, height: 24, background: 'rgba(0,0,0,0.35)',
        border: 'none', borderRadius: '50%', color: 'white',
        fontSize: 16, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', zIndex: 1
      }}>×</button>

      {/* Content — tap to expand */}
      <div onClick={handleTap} style={{ cursor: 'pointer', paddingTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>
          {liveTimer.phase}
        </div>
        <div style={{
          fontSize: 44, fontWeight: 900, color: 'white', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums', letterSpacing: -2,
          fontFamily: "'Barlow Condensed', system-ui"
        }}>
          {liveTimer.display}
        </div>
        {liveTimer.info && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, marginTop: 2 }}>
            {liveTimer.info}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
          לחץ לחזרה לשעון
        </div>
      </div>
    </div>
  );
};

export default FloatingTimer;
