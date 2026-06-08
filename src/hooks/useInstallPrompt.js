import { useCallback, useEffect, useState } from 'react';

// Single source of truth for the PWA install affordance. The
// `beforeinstallprompt` event is captured pre-mount in index.html and
// stashed on window.__deferredInstallPrompt, then re-broadcast via the
// 'pwa-install-available' / 'pwa-installed' custom events. This hook
// hydrates from the stash on mount and stays in sync with those events,
// so every consumer (large login bar + mini pill) shares the same prompt
// without each registering its own listener and racing the event.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(
    () => (typeof window !== 'undefined' && window.__deferredInstallPrompt) || null
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!deferredPrompt && window.__deferredInstallPrompt) {
      setDeferredPrompt(window.__deferredInstallPrompt);
    }
    const onAvailable = () => setDeferredPrompt(window.__deferredInstallPrompt || null);
    const onInstalled = () => setDeferredPrompt(null);
    window.addEventListener('pwa-install-available', onAvailable);
    window.addEventListener('pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('pwa-install-available', onAvailable);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, [deferredPrompt]);

  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua);

  const promptInstall = useCallback(async () => {
    const p = deferredPrompt;
    if (!p || typeof p.prompt !== 'function') return { outcome: 'unavailable' };
    try {
      p.prompt();
      const choice = await p.userChoice;
      window.__deferredInstallPrompt = null;
      setDeferredPrompt(null);
      return { outcome: choice?.outcome || 'dismissed' };
    } catch (err) {
      window.__deferredInstallPrompt = null;
      setDeferredPrompt(null);
      return { outcome: 'dismissed', error: err };
    }
  }, [deferredPrompt]);

  return {
    deferredPrompt,
    canInstall: !!deferredPrompt,
    isSafari,
    promptInstall,
  };
}

export default useInstallPrompt;
