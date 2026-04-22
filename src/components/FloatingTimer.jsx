import { useState, useRef, useEffect } from 'react';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useNavigate } from 'react-router-dom';

const POSITION_KEY = 'timer_bubble_position';

const loadPosition = () => {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return { x: 16, bottom: 90 };
    const p = JSON.parse(raw);
    return {
      x: typeof p.x === 'number' ? p.x : 16,
      bottom: typeof p.bottom === 'number' ? p.bottom : 90,
    };
  } catch { return { x: 16, bottom: 90 }; }
};

const FloatingTimer = () => {
  const { liveTimer, setLiveTimer, showTabata, setShowTabata } = useActiveTimer();
  const navigate = useNavigate();
  const [pos, setPos] = useState(loadPosition);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, initBottom: pos.bottom });

  useEffect(() => {
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(pos)); } catch {}
  }, [pos]);

  if (!liveTimer) return null;
  if (showTabata) return null;

  const onTouchStart = (e) => {
    drag.current = { active: true, moved: false, startX: e.touches[0].clientX - pos.x, startY: e.touches[0].clientY, initBottom: pos.bottom };
  };
  const onTouchMove = (e) => {
    if (!drag.current.active) return;
    e.preventDefault(); drag.current.moved = true;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 175, e.touches[0].clientX - drag.current.startX)),
      bottom: Math.max(70, Math.min(window.innerHeight - 180, drag.current.initBottom + (drag.current.startY - e.touches[0].clientY)))
    });
  };

  // Mouse drag — mirrors the touch behavior. Move/up listeners live on
  // window so the drag keeps tracking even if the cursor leaves the bubble.
  const onMouseDown = (e) => {
    // Ignore drags initiated on interactive children (X / pause buttons)
    if (e.target.closest('button')) return;
    e.preventDefault();
    drag.current = { active: true, moved: false, startX: e.clientX - pos.x, startY: e.clientY, initBottom: pos.bottom };
    const onMove = (ev) => {
      if (!drag.current.active) return;
      ev.preventDefault();
      drag.current.moved = true;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 175, ev.clientX - drag.current.startX)),
        bottom: Math.max(70, Math.min(window.innerHeight - 180, drag.current.initBottom + (drag.current.startY - ev.clientY)))
      });
    };
    const onUp = () => {
      drag.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleExpand = () => {
    if (drag.current.moved) return;
    if (liveTimer.type === 'tabata') {
      setLiveTimer(null);
      setShowTabata(true);
    } else {
      setLiveTimer(null);
      navigate('/clocks');
    }
  };

  const handleStop = (e) => {
    e.preventDefault(); e.stopPropagation();
    const type = liveTimer?.type;
    setLiveTimer(null);
    if (type === 'tabata') { setShowTabata(false); window.dispatchEvent(new CustomEvent('tabata-reset')); }
    else window.dispatchEvent(new CustomEvent('clock-reset', { detail: { type } }));
  };

  const handlePauseResume = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (liveTimer.type === 'tabata') window.dispatchEvent(new CustomEvent('tabata-pause-resume'));
    else window.dispatchEvent(new CustomEvent('clock-pause-resume', { detail: { type: liveTimer.type } }));
    setLiveTimer(prev => prev ? { ...prev, paused: !prev.paused } : null);
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { drag.current.active = false; }}
      onMouseDown={onMouseDown}
      style={{ position: 'fixed', left: pos.x, bottom: pos.bottom, zIndex: 1000, cursor: 'grab',
        background: liveTimer.paused ? '#CC5500' : '#FF6F20', borderRadius: 18,
        minWidth: 155, boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        direction: 'rtl', userSelect: 'none', touchAction: 'none', overflow: 'hidden' }}>

      {/* Row 1: phase + X */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px 2px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {liveTimer.paused && <span style={{ fontSize: 11 }}>⏸</span>}
          {liveTimer.phase}
        </div>
        <button onPointerDown={handleStop} style={{
          width: 22, height: 22, background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: '50%',
          color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', lineHeight: 1, touchAction: 'manipulation', flexShrink: 0
        }}>×</button>
      </div>

      {/* Row 2: large digits */}
      <div onClick={handleExpand} style={{ padding: '0 12px 2px', cursor: 'pointer', textAlign: 'center' }}>
        <div style={{ fontSize: 52, fontWeight: 900, color: 'white', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -2 }}>
          {liveTimer.display}
        </div>
        {liveTimer.info && (
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 1 }}>{liveTimer.info}</div>
        )}
      </div>

      {/* Row 3: hint + pause */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px 8px' }}>
        <div onClick={handleExpand} style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>הקש להגדלה</div>
        <button onPointerDown={handlePauseResume} style={{
          background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 8,
          color: 'white', fontSize: 16, fontWeight: 700, width: 36, height: 28,
          cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>{liveTimer.paused ? '▶' : '‖'}</button>
      </div>
    </div>
  );
};

export default FloatingTimer;
