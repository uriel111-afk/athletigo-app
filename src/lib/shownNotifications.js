// ────────────────────────────────────────────────────────────────
// "Already popped this one" register.
//
// A notification popup that re-fires every time its screen remounts is
// worse than no popup: the user learns to dismiss without reading. The
// per-component Set that used to hold this state died with the
// component, so navigating away and back re-popped the same reminder.
//
// This register lives above the component tree and is mirrored into
// sessionStorage, so it survives a remount, a route change and a
// reload — and is gone on the next browser session, which is the right
// lifetime for "I already saw this a minute ago".
// ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'athletigo_shown_notifications';

let shown = null;

function load() {
  if (shown) return shown;
  shown = new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) for (const id of arr) shown.add(String(id));
    }
  } catch { /* private mode — in-memory only */ }
  return shown;
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...load()]));
  } catch { /* quota / private mode — in-memory only */ }
}

export function wasShown(id) {
  if (id == null) return false;
  return load().has(String(id));
}

export function markShown(id) {
  if (id == null) return;
  load().add(String(id));
  persist();
}

// Only for tests / an explicit "show me everything again".
export function resetShown() {
  shown = new Set();
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
