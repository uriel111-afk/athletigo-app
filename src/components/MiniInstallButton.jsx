import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, X } from 'lucide-react';
import { useIsPWA } from '@/hooks/useIsPWA';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

// Compact install pill for the authenticated UI. Three visibility branches
// once we've passed the isPWA / dismissed gates:
//   (a) canInstall   — Chrome/Edge/Android, real beforeinstallprompt deferred
//                       event is available. Click triggers the native flow.
//   (b) isSafari     — iOS/macOS Safari, no native event. Pill is inert and
//                       surfaces the "⎙ → הוסף למסך הבית" hint via title.
//   (c) fallback     — desktop browser that suppressed the event but the app
//                       is still installable from the browser menu. Pill
//                       click toggles an inline tooltip with instructions.
// sessionStorage key is purged on logout (see AuthContext.signOut).
const SESSION_KEY = 'installPromptDismissed';

export default function MiniInstallButton() {
  // Never render inside a Capacitor native shell — the floating pill
  // sits at top-left and would cover the header inside the APK. Guard
  // placed above every hook so nothing surfaces on Android/iOS native.
  if (Capacitor.isNativePlatform()) return null;

  const isPWA = useIsPWA();
  const { canInstall, isSafari, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  });
  const [showHint, setShowHint] = useState(false);

  if (isPWA || dismissed) return null;

  const mode = canInstall ? 'prompt' : isSafari ? 'safari' : 'fallback';
  const label = mode === 'safari' ? '⎙ להוסיף למסך' : 'הורד אפליקציה';
  const title = mode === 'prompt'  ? 'הורד את האפליקציה'
              : mode === 'safari'  ? 'לחץ על ⎙ ואז "הוסף למסך הבית"'
              :                       'לחץ להוראות התקנה';

  const handleClick = async () => {
    if (mode === 'prompt') {
      const result = await promptInstall();
      if (result?.outcome === 'accepted') setDismissed(true);
    } else if (mode === 'fallback') {
      setShowHint(v => !v);
    }
  };

  const handleDismiss = (e) => {
    e?.stopPropagation?.();
    setDismissed(true);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={handleClick}
        title={title}
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
          cursor: mode === 'safari' ? 'default' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <Download size={14} color="#FF6F20" />
        <span>{label}</span>
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
      {mode === 'fallback' && showHint && (
        <div
          style={{
            position: 'absolute',
            top: 38,
            insetInlineStart: 0,
            maxWidth: 260,
            padding: '8px 10px',
            background: '#1a1a1a',
            color: '#FFFFFF',
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.45,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 1200,
            direction: 'rtl',
          }}
        >
          פתח את תפריט הדפדפן (⋮) ובחר <strong>"התקן אפליקציה"</strong> או <strong>"הוסף למסך הבית"</strong>.
        </div>
      )}
    </div>
  );
}
