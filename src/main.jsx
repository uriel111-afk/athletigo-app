import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

console.log('[MAIN] React starting...', new Date().toISOString());

// PWA Service Worker is registered automatically by vite-plugin-pwa
// (see vite.config.js → VitePWA). The manual escape hatch for stale
// SWs lives in index.html, gated on ?sw-reset.

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



