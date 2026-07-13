import React, { useRef, useState } from 'react';

// Reusable signature canvas — same draw/clear UX as the health
// declaration form, extracted so photo consent (and any future
// signing surface) can reuse it WITHOUT touching HealthDeclarationForm.
// Emits the PNG data URL (or null when cleared) via onChange.
export default function SignaturePad({ onChange, height = 140 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasSig, setHasSig] = useState(false);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    return {
      x: (clientX - rect.left) * (c.width / rect.width),
      y: (clientY - rect.top) * (c.height / rect.height),
    };
  };

  const start = (e) => {
    e.preventDefault?.();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f2937';
    drawing.current = true;
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault?.();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasSig) setHasSig(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    try { onChange?.(canvasRef.current.toDataURL('image/png')); } catch { /* best-effort */ }
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHasSig(false);
    onChange?.(null);
  };

  // Double the internal resolution on retina so the line isn't blurry.
  const setup = (node) => {
    canvasRef.current = node;
    if (!node) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    node.width = Math.round(node.clientWidth * dpr);
    node.height = Math.round(node.clientHeight * dpr);
  };

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid var(--ag-border)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          type="button"
          onClick={clear}
          style={{
            padding: '4px 10px', borderRadius: 8, border: '1px solid #E5E7EB',
            background: 'transparent', color: '#6B7280', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >נקה</button>
      </div>
      <canvas
        ref={setup}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        style={{
          width: '100%', height,
          borderRadius: 10, border: '1px dashed #C4C4C4', background: '#FAFAFA',
          cursor: 'crosshair', touchAction: 'none', display: 'block',
        }}
      />
      {!hasSig && (
        <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 6 }}>
          חתום/חתמי כאן באצבע או בעכבר
        </div>
      )}
    </div>
  );
}
