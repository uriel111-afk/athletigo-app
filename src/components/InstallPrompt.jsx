import { useState } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

// Bottom-banner install nudge shown on the Login screen. Two surfaces:
//   • Chrome / Edge / Android — the deferred beforeinstallprompt event
//     (captured early in index.html, surfaced via useInstallPrompt) drives
//     a native install button.
//   • Safari (iOS / macOS) — no beforeinstallprompt, so render short
//     instructions ("⎙ → הוסף למסך הבית"). Login.jsx already gates this
//     component on !isPWA, so we don't re-check standalone here.
//
// Dismissals stick for 14 days via localStorage so we don't nag.
const DISMISSED_KEY = 'install_dismissed_at';
const NAG_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export default function InstallPrompt() {
  const { canInstall, isSafari, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      const ts = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10);
      return !!(ts && Date.now() - ts < NAG_COOLDOWN_MS);
    } catch { return false; }
  });

  const handleInstall = async () => {
    const result = await promptInstall();
    if (result?.outcome === 'accepted') setDismissed(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
  };

  if (dismissed) return null;
  if (!canInstall && !isSafari) return null;

  const isManual = !canInstall && isSafari;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, right: 16,
      background: '#1a1a1a', borderRadius: 16, padding: 16,
      display: 'flex', alignItems: 'center', gap: 12,
      zIndex: 9999, direction: 'rtl',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <img src="/icon-192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>התקן את AthletiGo</div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
          {isManual ? 'לחץ על ⎙ ואז "הוסף למסך הבית"' : 'גישה מהירה מהמסך הראשי'}
        </div>
      </div>
      {!isManual && (
        <button onClick={handleInstall} style={{
          background: '#FF6F20', color: 'white', border: 'none',
          borderRadius: 10, padding: '8px 16px', fontSize: 13,
          fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        }}>התקן</button>
      )}
      <button onClick={handleDismiss} style={{
        background: 'none', border: 'none', color: '#666',
        fontSize: 18, cursor: 'pointer', padding: 4, flexShrink: 0,
      }}>✕</button>
    </div>
  );
}
