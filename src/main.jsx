import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

// Remove the boot splash (#splash in index.html) once the app has
// committed its first paint. Two rAFs gets us past the React commit
// and the browser's paint, so the user never sees a blank frame
// between splash and app. The bar finishes to 100% before fading
// out — matches the "0 → 30 → 60 → 85 → 100" choreography.
{
  const finishSplash = () => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    const bar = document.getElementById('splash-bar');
    const pct = document.getElementById('splash-percent');
    if (bar) bar.style.width = '100%';
    if (pct) pct.textContent = '100%';
    setTimeout(() => {
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 400);
    }, 250);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(finishSplash));
  } else {
    setTimeout(finishSplash, 100);
  }
}

// PWA Service Worker is registered automatically by vite-plugin-pwa

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



