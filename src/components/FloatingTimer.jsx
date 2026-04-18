import { useState, useRef } from 'react';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useNavigate, useLocation } from 'react-router-dom';

const FloatingTimer = () => {
  const { liveTimer, setLiveTimer, setShowTabata, showTabata } = useActiveTimer();
  const navigate = useNavigate();
  const location = useLocation();
  const [pos, setPos] = useState({ x: 16, bottom: 90 });
  const drag = useRef({ active: false, startX: 0, startY: 0, initBottom: 90, moved: false });

  if (!liveTimer || showTabata) return null;

  const onTouchStart = (e) => {
    drag.current = { active: true, moved: false, startX: e.touches[0].clientX - pos.x, startY: e.touches[0].clientY, initBottom: pos.bottom };
  };
  const onTouchMove = (e) => {
    if (!drag.current.active) return;
    drag.current.moved = true;
    e.preventDefault();
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 170, e.touches[0].clientX - drag.current.startX)),
      bottom: Math.max(70, Math.min(window.innerHeight - 160, drag.current.initBottom + (drag.current.startY - e.touches[0].clientY))),
    });
  };
  const onTouchEnd = () => { drag.current.active = false; };

  const handleTap = () => {
    if (drag.current.moved) return;
    if (liveTimer?.type === 'tabata') {
      setLiveTimer(null);
      setShowTabata(true);
    } else {
      navigate('/clocks');
    }
  };

  const handleStop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLiveTimer(null);
    if (liveTimer?.type === 'tabata') {
      setShowTabata(false);
      window.dispatchEvent(new CustomEvent('tabata-reset'));
    } else {
      window.dispatchEvent(new CustomEvent('clock-reset', { detail: { type: liveTimer?.type } }));
    }
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed', left: pos.x, bottom: pos.bottom,
        zIndex: 9998, background: '#FF6F20', borderRadius: 20,
        padding: '10px 14px', minWidth: 155,
        boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        cursor: 'pointer', direction: 'rtl', userSelect: 'none', touchAction: 'none',
      }}
    >
      {/* X stop button */}
      <button onPointerDown={handleStop} style={{
        position: 'absolute', top: 6, left: 6,
        width: 22, height: 22, background: 'rgba(0,0,0,0.3)',
        border: 'none', borderRadius: '50%', color: 'white',
        fontSize: 14, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
      }}>×</button>

      <div onClick={handleTap}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>
          {liveTimer.phase}
        </div>
        <div style={{
          fontSize: 48, fontWeight: 900, color: 'white', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums', letterSpacing: -2, textAlign: 'center',
          fontFamily: "'Barlow Condensed', system-ui",
        }}>
          {liveTimer.display}
        </div>
        {liveTimer.info && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, textAlign: 'center' }}>
            {liveTimer.info}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2, textAlign: 'center' }}>
          לחץ לחזרה לשעון
        </div>
      </div>
    </div>
  );
};

export default FloatingTimer;
