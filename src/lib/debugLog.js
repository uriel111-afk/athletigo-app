// Tiny rolling log persisted to localStorage so it survives WebView
// reloads (the case we're chasing on iOS PWA). Stored under a single
// key so the on-screen Debug panel can read it back as a contiguous
// chronological sequence. Bounded to MAX entries to avoid bloat.

const KEY = 'debug-log';
const MAX = 100;

export function pushDebugLog(component, step, data = {}) {
  try {
    const raw = localStorage.getItem(KEY);
    const log = raw ? JSON.parse(raw) : [];
    log.push({ ts: new Date().toISOString(), component, step, ...data });
    if (log.length > MAX) log.splice(0, log.length - MAX);
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {}
}

export function readDebugLog() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearDebugLog() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function formatDebugLog(entries) {
  if (!entries || entries.length === 0) return '(empty)';
  return entries.map(e => {
    const { ts, component, step, ...rest } = e;
    const time = (ts || '').slice(11, 19);
    const extras = Object.keys(rest).length ? '\n  ' + JSON.stringify(rest) : '';
    return `${time} [${component}] ${step}${extras}`;
  }).join('\n\n');
}
