import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

console.log('[MAIN] React starting...', new Date().toISOString());

// One-time service-worker reset: unregister any stale SW from previous
// PWA installs so the user picks up the new skipWaiting/clientsClaim
// build. Gated by localStorage flag so it only runs once per device.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (!localStorage.getItem('sw_reset_v2')) {
      regs.forEach((reg) => reg.unregister());
      localStorage.setItem('sw_reset_v2', '1');
      if (regs.length > 0) {
        console.log('[MAIN] Unregistered', regs.length, 'stale SW(s) — reloading');
        setTimeout(() => window.location.reload(), 500);
      }
    }
  });
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

// PWA Service Worker is registered automatically by vite-plugin-pwa

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



