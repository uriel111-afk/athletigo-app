import { useEffect } from 'react';
import confetti from 'canvas-confetti';

// Trigger via `fire` prop going truthy → shoots a burst then resets
// internally. Non-visual — renders nothing.
export default function ConfettiEffect({ fire, onDone }) {
  useEffect(() => {
    if (!fire) return;
    const orange = ['#FF6F20', '#FF8E4E', '#FFB17A'];
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: orange,
    });
    confetti({
      particleCount: 40,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: orange,
    });
    confetti({
      particleCount: 40,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: orange,
    });
    const t = setTimeout(() => onDone?.(), 1500);
    return () => clearTimeout(t);
  }, [fire, onDone]);

  return null;
}
