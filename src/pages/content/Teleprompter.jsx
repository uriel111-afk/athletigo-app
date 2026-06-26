import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, X, RotateCcw, Minus, Plus, FlipHorizontal2 } from 'lucide-react';
import { useClip } from '@/api/content-api';
import { useKeepScreenAwake } from '@/hooks/useKeepScreenAwake';

const BASE_PX_PER_SEC = 55;   // scroll speed at 1x
const MIN_SPEED = 0.5, MAX_SPEED = 3, SPEED_STEP = 0.1;
const MIN_FONT = 24, MAX_FONT = 48, FONT_STEP = 2;
const HIDE_MS = 3000;

const loadNum = (key, fallback) => {
  const v = parseFloat(localStorage.getItem(key));
  return Number.isFinite(v) ? v : fallback;
};

// Full-screen teleprompter. Scrolls the clip's `script` upward at an
// adjustable speed; controls auto-hide after 3s (tap to reveal). Keeps
// the screen awake via the Wake Lock API.
export default function Teleprompter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: clip } = useClip(id);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(() => loadNum('prompter-speed', 1));
  const [font, setFont] = useState(() => loadNum('prompter-font', 32));
  const [mirror, setMirror] = useState(false);
  const [controlsOn, setControlsOn] = useState(true);
  const [activeLine, setActiveLine] = useState(0);

  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const lineOffsets = useRef([]);
  const posRef = useRef(0);
  const lastTs = useRef(null);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const hideTimer = useRef(null);

  useKeepScreenAwake(true);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { localStorage.setItem('prompter-speed', String(speed)); }, [speed]);
  useEffect(() => { localStorage.setItem('prompter-font', String(font)); }, [font]);

  const lines = useMemo(() => {
    const text = (clip?.script || '').replace(/\r/g, '');
    const arr = text.split('\n');
    // collapse a fully empty script to a hint line
    return arr.length === 1 && !arr[0] ? ['— אין תסריט לקליפ הזה —'] : arr;
  }, [clip?.script]);

  // ── Controls auto-hide ──
  const showControls = useCallback(() => {
    setControlsOn(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsOn(false), HIDE_MS);
  }, []);
  useEffect(() => { showControls(); return () => clearTimeout(hideTimer.current); }, [showControls]);

  // ── Measure line offsets (after layout, font/lines change) ──
  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const kids = content.querySelectorAll('[data-line]');
    lineOffsets.current = Array.from(kids).map((k) => k.offsetTop + k.offsetHeight / 2);
  }, []);
  useEffect(() => { measure(); }, [measure, font, lines, mirror]);

  // ── Animation loop ──
  useEffect(() => {
    let raf;
    const loop = (ts) => {
      if (lastTs.current == null) lastTs.current = ts;
      const dt = ts - lastTs.current;
      lastTs.current = ts;

      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (viewport && content) {
        if (playingRef.current) {
          posRef.current += BASE_PX_PER_SEC * speedRef.current * (dt / 1000);
          const maxPos = content.scrollHeight - viewport.clientHeight * 0.4;
          if (posRef.current >= maxPos) { posRef.current = maxPos; setPlaying(false); }
        }
        content.style.transform = `translateY(${-posRef.current}px)`;

        // active line = nearest to the viewport's reading zone (~40%)
        const focus = posRef.current + viewport.clientHeight * 0.4;
        const offs = lineOffsets.current;
        if (offs.length) {
          let best = 0, bestD = Infinity;
          for (let i = 0; i < offs.length; i++) {
            const d = Math.abs(offs[i] - focus);
            if (d < bestD) { bestD = d; best = i; }
          }
          setActiveLine((prev) => (prev === best ? prev : best));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const togglePlay = () => { showControls(); setPlaying((p) => !p); };
  const reset = () => { posRef.current = 0; setPlaying(false); showControls(); };
  const clampSpeed = (v) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(v * 10) / 10));
  const clampFont = (v) => Math.min(MAX_FONT, Math.max(MIN_FONT, v));

  return (
    <div
      dir="rtl"
      onClick={() => (controlsOn ? setControlsOn(false) : showControls())}
      style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 2000,
        overflow: 'hidden', userSelect: 'none',
      }}
    >
      {/* Reading-zone hairline */}
      <div style={{
        position: 'absolute', top: '40%', left: 0, right: 0, height: 0,
        borderTop: '1px solid rgba(255,255,255,0.08)', pointerEvents: 'none', zIndex: 1,
      }} />

      {/* Scrolling text */}
      <div ref={viewportRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div
          ref={contentRef}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            padding: '50vh 28px',
            transform: 'translateY(0px)', willChange: 'transform',
          }}
        >
          <div style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}>
            {lines.map((ln, i) => {
              const active = i === activeLine;
              return (
                <div
                  key={i}
                  data-line
                  style={{
                    fontSize: font, lineHeight: 1.8, textAlign: 'center',
                    fontWeight: active ? 800 : 500,
                    color: active ? '#ffffff' : 'rgba(255,255,255,0.42)',
                    transform: active ? 'scale(1.04)' : 'scale(1)',
                    transition: 'color .2s, transform .2s, font-weight .2s',
                    minHeight: ln ? undefined : font,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}
                >
                  {ln || ' '}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Close — always visible */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); navigate(-1); }}
        aria-label="סגור"
        style={{
          position: 'fixed', top: 'max(env(safe-area-inset-top), 12px)', insetInlineEnd: 12,
          width: 44, height: 44, borderRadius: 999, zIndex: 30, cursor: 'pointer',
          background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={24} />
      </button>

      {/* Controls overlay — auto-hide */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 25,
          padding: '18px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 18px)',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
          display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center',
          opacity: controlsOn ? 1 : 0,
          transform: controlsOn ? 'translateY(0)' : 'translateY(20px)',
          pointerEvents: controlsOn ? 'auto' : 'none',
          transition: 'opacity .25s, transform .25s',
        }}
      >
        {/* Play / Reset / Mirror */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <button type="button" onClick={reset} style={roundBtn(56)} aria-label="התחל מחדש">
            <RotateCcw size={22} color="#fff" />
          </button>
          <button type="button" onClick={togglePlay} style={{ ...roundBtn(76), background: '#FF6F20' }} aria-label={playing ? 'השהה' : 'נגן'}>
            {playing ? <Pause size={34} color="#fff" /> : <Play size={34} color="#fff" style={{ marginInlineStart: 3 }} />}
          </button>
          <button type="button" onClick={() => setMirror((m) => !m)} style={roundBtn(56, mirror)} aria-label="מצב מראה">
            <FlipHorizontal2 size={22} color={mirror ? '#FF6F20' : '#fff'} />
          </button>
        </div>

        {/* Speed */}
        <div style={rowStyle}>
          <button type="button" onClick={() => setSpeed((s) => clampSpeed(s - SPEED_STEP))} style={stepBtn} aria-label="האט"><Minus size={16} color="#fff" /></button>
          <input
            type="range" min={MIN_SPEED} max={MAX_SPEED} step={SPEED_STEP} value={speed}
            onChange={(e) => setSpeed(clampSpeed(parseFloat(e.target.value)))}
            style={{ flex: 1, accentColor: '#FF6F20' }}
          />
          <button type="button" onClick={() => setSpeed((s) => clampSpeed(s + SPEED_STEP))} style={stepBtn} aria-label="האץ"><Plus size={16} color="#fff" /></button>
          <span style={valueLabel}>{speed.toFixed(1)}x</span>
        </div>

        {/* Font size */}
        <div style={rowStyle}>
          <button type="button" onClick={() => setFont((f) => clampFont(f - FONT_STEP))} style={stepBtn} aria-label="הקטן גופן"><Minus size={16} color="#fff" /></button>
          <div style={{ flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>גודל גופן</div>
          <button type="button" onClick={() => setFont((f) => clampFont(f + FONT_STEP))} style={stepBtn} aria-label="הגדל גופן"><Plus size={16} color="#fff" /></button>
          <span style={valueLabel}>{font}px</span>
        </div>
      </div>
    </div>
  );
}

const roundBtn = (size, active) => ({
  width: size, height: size, borderRadius: 999, cursor: 'pointer',
  background: active ? 'rgba(255,111,32,0.18)' : 'rgba(255,255,255,0.14)',
  border: active ? '2px solid #FF6F20' : 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});
const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 440 };
const stepBtn = {
  width: 38, height: 38, borderRadius: 10, flexShrink: 0, cursor: 'pointer', border: 'none',
  background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const valueLabel = { width: 46, textAlign: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 };
