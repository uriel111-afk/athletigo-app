/* global __GIT_HASH__ __BUILD_TIME__ */
import { toast } from 'sonner';

// Injected at build time by Vite (see vite.config.js → define).
export const GIT_HASH = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

// 'DD.MM HH:MM' of the build instant (rendered in the viewer's locale).
function buildStamp() {
  try {
    const d = new Date(BUILD_TIME);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}

// e.g. 'גרסה a1b2c3 · 23.07 14:05'
export const versionLabel = () => `גרסה ${GIT_HASH} · ${buildStamp()}`;

// Log the running version to the console once on boot.
export function logVersion() {
  // eslint-disable-next-line no-console
  console.log(`%c[AthletiGo] ${versionLabel()}`, 'color:#888');
}

// Service worker is autoUpdate + skipWaiting + clientsClaim (vite.config.js),
// so a new build's SW installs and takes control on its own. We surface that
// to the user with a small "refresh" toast instead of a silent swap.
export function initVersionToast() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // A brand-new install also fires controllerchange once (initial claim);
  // skip that so the toast only appears for a genuine UPDATE.
  let skipFirst = !navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (skipFirst) { skipFirst = false; return; }
    toast('גרסה חדשה זמינה · רענן', {
      duration: Infinity,
      action: { label: 'רענן', onClick: () => window.location.reload() },
    });
  });
}
