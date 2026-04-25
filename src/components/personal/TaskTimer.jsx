import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Pause, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

const fmt = (sec) => {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Single sustained beep using WebAudio — no asset shipping needed.
function playEndBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.18;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 700);
  } catch {}
}

// Countdown timer overlay. Driven by the consumer:
//   <TaskTimer
//     isOpen={...}
//     title="ניקיון מטבח"
//     emoji="🧹"
//     durationMinutes={15}
//     onClose={() => setOpen(false)}
//     onComplete={() => markDone()}
//   />
// Behavior:
//  - Green while running, orange in the last 30s, red when finished
//  - Vibrates + beeps on finish
//  - "+ דקה" adds 60s, "סיימתי" calls onComplete and closes
export default function TaskTimer({
  isOpen, onClose, onComplete,
  title = 'משימה',
  emoji = '⏱️',
  durationMinutes = 10,
}) {
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60);
  const [running, setRunning] = useState(true);
  const [finished, setFinished] = useState(false);
  const finishedRef = useRef(false);

  // Reset when opened.
  useEffect(() => {
    if (!isOpen) return;
    setSecondsLeft(durationMinutes * 60);
    setRunning(true);
    setFinished(false);
    finishedRef.current = false;
  }, [isOpen, durationMinutes]);

  useEffect(() => {
    if (!isOpen || !running) return;
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        const next = prev - 1;
        if (next <= 0 && !finishedRef.current) {
          finishedRef.current = true;
          setFinished(true);
          try { navigator.vibrate?.([200, 100, 200, 100, 200]); } catch {}
          playEndBeep();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, running]);

  const addMinute = () => {
    setSecondsLeft(prev => prev + 60);
    if (finishedRef.current) {
      finishedRef.current = false;
      setFinished(false);
      setRunning(true);
    }
  };

  const handleDone = () => {
    onComplete?.();
    onClose?.();
  };

  // Color: green normally, orange last 30s, red when finished.
  let color = '#16A34A';
  if (finished) color = '#DC2626';
  else if (secondsLeft <= 30) color = '#F59E0B';

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        style={{ padding: 24 }}
      >
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <button onClick={onClose} aria-label="סגור" style={{
            position: 'absolute', top: -10, left: -10,
            width: 32, height: 32, borderRadius: 999,
            border: 'none', background: 'transparent',
            color: PERSONAL_COLORS.textSecondary, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} />
          </button>

          <div style={{ fontSize: 48, marginBottom: 4 }}>{emoji}</div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: PERSONAL_COLORS.textPrimary,
            marginBottom: 18,
          }}>
            {title}
          </div>

          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 64, fontWeight: 800,
            color, lineHeight: 1, letterSpacing: 2,
            marginBottom: 6,
          }}>
            {finished ? '00:00' : fmt(Math.max(0, secondsLeft))}
          </div>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: finished ? '#DC2626' : PERSONAL_COLORS.textSecondary,
            marginBottom: 20,
          }}>
            {finished ? 'הזמן נגמר 🔔' : running ? 'זמן רץ' : 'מושהה'}
          </div>

          {!finished && (
            <button onClick={() => setRunning(r => !r)} style={{
              width: 56, height: 56, borderRadius: 999, border: 'none',
              backgroundColor: PERSONAL_COLORS.bg, color: PERSONAL_COLORS.textPrimary,
              cursor: 'pointer', marginBottom: 16,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }} aria-label={running ? 'השהה' : 'המשך'}>
              {running ? <Pause size={22} /> : <Play size={22} />}
            </button>
          )}

          <button onClick={handleDone} style={{
            width: '100%', padding: '14px 18px', borderRadius: 12, border: 'none',
            backgroundColor: '#16A34A', color: '#FFFFFF',
            fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8,
          }}>
            סיימתי ✓
          </button>
          <button onClick={addMinute} style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            border: `1px solid ${PERSONAL_COLORS.border}`,
            backgroundColor: '#FFFFFF', color: PERSONAL_COLORS.textPrimary,
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            + עוד דקה
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
