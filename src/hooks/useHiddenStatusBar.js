import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

// Hide the device status bar for the lifetime of a screen.
//
// main.jsx puts the WebView BEHIND the system bars
// (setOverlaysWebView({overlay:true})), which is right for chrome-ed
// screens but means the workout sheet shares its top strip with the
// clock and the battery icon. On the trainee's workout screen that
// strip is where the exit button lives.
//
// Web is a no-op (Capacitor.isNativePlatform() is false), and every
// call is swallowed so a missing plugin can never break a screen. The
// bar is always restored on unmount, including when the screen leaves
// through an error path.
export function useHiddenStatusBar(active) {
  useEffect(() => {
    if (!active) return undefined;
    if (!Capacitor.isNativePlatform()) return undefined;

    StatusBar.hide().catch(() => {});
    return () => { StatusBar.show().catch(() => {}); };
  }, [active]);
}

export default useHiddenStatusBar;
