import { useEffect, useState, useRef, useCallback } from 'react';

const PREFIX = 'athletigo_draft_';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useFormDraft(dialogKey, scopeKey, open, initialData) {
  const storageKey = `${PREFIX}${dialogKey}_${scopeKey ?? 'global'}`;
  const [data, setData] = useState(initialData);
  const [hasDraft, setHasDraft] = useState(false);
  const [decided, setDecided] = useState(false);
  const firstMount = useRef(true);

  // Load on open
  useEffect(() => {
    if (!open) { firstMount.current = true; setDecided(false); return; }
    if (!firstMount.current) return;
    firstMount.current = false;

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?._savedAt) {
          const age = Date.now() - new Date(parsed._savedAt).getTime();
          if (age > MAX_AGE) { localStorage.removeItem(storageKey); setHasDraft(false); setDecided(true); setData(initialData); return; }
        }
        if (parsed?._draftData && typeof parsed._draftData === 'object') {
          setData(parsed._draftData);
          setHasDraft(true);
          return;
        }
      }
    } catch {}
    setHasDraft(false);
    setDecided(true);
    setData(initialData);
  }, [open, storageKey]);

  // Auto-save on EVERY change — no debounce. Even a 1s-open form must
  // persist the latest field values before it closes.
  useEffect(() => {
    if (!open || !decided) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ _draftData: data, _savedAt: new Date().toISOString() }));
    } catch {}
  }, [data, open, decided, storageKey]);

  const keepDraft = useCallback(() => { setHasDraft(false); setDecided(true); }, []);
  const discardDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch {}
    setData(initialData);
    setHasDraft(false);
    setDecided(true);
  }, [storageKey, initialData]);
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch {}
    setHasDraft(false);
  }, [storageKey]);

  return { data, setData, hasDraft, keepDraft, discardDraft, clearDraft };
}
