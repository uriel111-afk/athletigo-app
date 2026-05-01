import { useState, useEffect } from 'react';

// Detects whether the app is running as an installed PWA. Listens
// for display-mode changes so a freshly-installed app flips the flag
// without a hard refresh. Three signals checked:
//   - matchMedia('(display-mode: standalone)') — Chrome/Android/desktop
//   - navigator.standalone === true — iOS Safari home-screen install
//   - document.referrer starts with 'android-app://' — Android TWA
export function useIsPWA() {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const check = () => {
      const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
      const iosStandalone = window.navigator?.standalone === true;
      const androidTWA = document.referrer?.startsWith?.('android-app://');
      setIsPWA(!!(standalone || iosStandalone || androidTWA));
    };
    check();
    const mq = window.matchMedia?.('(display-mode: standalone)');
    if (mq?.addEventListener) {
      mq.addEventListener('change', check);
      return () => mq.removeEventListener('change', check);
    }
    return undefined;
  }, []);

  return isPWA;
}

export default useIsPWA;
