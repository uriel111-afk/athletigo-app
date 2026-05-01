import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useIsPWA } from '@/hooks/useIsPWA';

// Compact install pill for the authenticated UI. Hidden when:
//   - the app is already running as a PWA (useIsPWA)
//   - the trainee dismissed it during the current session
// sessionStorage key is purged on logout (see AuthContext.signOut).
// Tapping the pill triggers the same beforeinstallprompt deferred
// event that the larger InstallPrompt uses on the login screen;
// Safari has no event so we surface a short "⎙ → הוסף למסך הבית"
// hint inside the pill instead of a clickable install action.
const SESSION_KEY = 'installPromptDismissed';

export default function MiniInstallButton() {
  const isPWA = useIsPWA();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua);

  if (isPWA || dismissed) return null;
  // Without a deferred prompt and not on Safari, there's nothing
  // useful to show — Chrome/Edge that haven't fired the event yet
  // (e.g. PWA criteria not met) shouldn't render an inert pill.
  if (!deferredPrompt && !isSafari) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const result = await deferredPrompt.userChoice;
      if (result?.outcome === 'accepted') setDismissed(true);
    } catch {}
    setDeferredPrompt(null);
  };

  const handleDismiss = (e) => {
    e?.stopPropagation?.();
    setDismissed(true);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
  };

  const isManual = !deferredPrompt;

  return (
    <button
      type="button"
      onClick={isManual ? undefined : handleInstall}
      title={isManual ? 'לחץ על ⎙ ואז "הוסף למסך הבית"' : 'הורד את האפליקציה'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 8px 0 6px',
        borderRadius: 999,
        border: '1px solid #E5E7EB',
        background: '#FFFFFF',
        color: '#1a1a1a',
        fontSize: 12,
        fontWeight: 600,
        cursor: isManual ? 'default' : 'pointer',
        fontFamily: 'inherit',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <Download size={14} color="#FF6F20" />
      <span>{isManual ? '⎙ להוסיף למסך' : 'הורד אפליקציה'}</span>
      <span
        onClick={handleDismiss}
        role="button"
        aria-label="סגור"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: 999,
          color: '#9CA3AF', cursor: 'pointer',
        }}
      >
        <X size={12} />
      </span>
    </button>
  );
}
