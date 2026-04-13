import React, { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { Pen, RotateCcw } from "lucide-react";

const SignatureCanvas = forwardRef(function SignatureCanvas({ disabled }, ref) {
  const canvasRef = useRef(null);
  const [hasSignature, setHasSignature] = useState(false);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);

  useImperativeHandle(ref, () => ({
    getSignature: () => {
      if (!hasSignature) return null;
      return canvasRef.current?.toDataURL('image/png') ?? null;
    },
    clear: () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
      }
    },
    hasSignature: () => hasSignature,
  }));

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };

  const startDraw = (e) => {
    if (disabled) return;
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
  };

  const moveDraw = (e) => {
    if (!isDrawing.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSignature(true);
  };

  const stopDraw = () => { isDrawing.current = false; lastPos.current = null; };

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          border: `2px solid ${disabled ? '#E0E0E0' : '#FF6F20'}`,
          backgroundColor: disabled ? '#FAFAFA' : '#FFFFFF',
          cursor: disabled ? 'not-allowed' : 'crosshair',
        }}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={150}
          className="w-full touch-none block"
          onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={stopDraw}
        />
        {!hasSignature && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm font-medium flex items-center gap-2" style={{ color: '#CCCCCC' }}>
              <Pen className="w-4 h-4" /> חתום/י כאן
            </span>
          </div>
        )}
      </div>
      {!disabled && hasSignature && (
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) {
              canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
              setHasSignature(false);
            }
          }}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ color: '#7D7D7D', border: '1px solid #E0E0E0' }}
        >
          <RotateCcw className="w-3.5 h-3.5" /> נקה חתימה
        </button>
      )}
    </div>
  );
});

export default SignatureCanvas;
