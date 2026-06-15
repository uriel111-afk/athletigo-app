import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import App from '@/App.jsx'
import '@/index.css'

console.log('[MAIN] React starting...', new Date().toISOString());

// PWA Service Worker is registered automatically by vite-plugin-pwa
// (see vite.config.js → VitePWA). The manual escape hatch for stale
// SWs lives in index.html, gated on ?sw-reset.

// Native (Capacitor) only: tell the WebView to extend behind the system
// bars so env(safe-area-inset-*) actually resolves to non-zero inside the
// APK. Without this, the Android WebView is laid out beneath the status
// bar and every safe-area CSS rule resolves to 0. Dark style = dark icons
// (readable on the cream #FFF9F0 header). Errors swallowed so a missing
// plugin on web never breaks startup — Capacitor.isNativePlatform() also
// returns false in the browser, so neither call runs there anyway.
if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

// Splash dismissal — index.html listens for an `app-ready` event
// and fades the splash itself. AuthContext dispatches this once
// the profile finishes loading (or auth errors out). index.html
// also has an 8s safety timer so the user is never stuck at 90%
// even if neither path fires.

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



