import { useState, useEffect } from 'react';

// Bottom-banner install nudge. Two surfaces:
//   • Chrome / Edge / Android — listens for beforeinstallprompt and
//     wires the deferred event through to a native install button.
//   • Safari (iOS / macOS) — no beforeinstallprompt, so we render
//     short instructions ("⎙ → הוסף למסך הבית"). Hidden when the app
//     is already running standalone or when the user dismissed.
//
// Dismissals stick for 14 days via localStorage so we don't nag.
const DISMISSED_KEY = 'install_dismissed_at';
const NAG_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Chrome/Edge install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Safari detection — no beforeinstallprompt event there. Render a
    // hint banner with manual instructions instead. Skip when already
    // running standalone (PWA already installed).
    const ua = navigator.userAgent || '';
    const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua);
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator.standalone === true;

    let dismissed = false;
    try {
      const ts = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10);
      if (ts && Date.now() - ts < NAG_COOLDOWN_MS) dismissed = true;
    } catch {}

    if (isSafari && !isStandalone && !dismissed) {
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const result = await deferredPrompt.userChoice;
      if (result?.outcome === 'accepted') setShow(false);
    } catch {}
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
  };

  if (!show) return null;

  // No deferredPrompt → Safari/manual. Otherwise → Chrome native flow.
  const isManual = !deferredPrompt;

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
