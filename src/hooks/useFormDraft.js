import { useEffect, useState, useRef, useCallback } from 'react';

const PREFIX = 'athletigo_draft_';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Draft persistence hook.
//   - Writes the current form state to localStorage on every change,
//     synchronously (no debounce) so even a 1-second-open form survives.
//   - On re-open of a fresh draft (< 24h), surfaces `hasDraft=true` so
//     the consumer can prompt "resume / new / discard". Drafts older
//     than 7 days are purged silently.
//   - Stores trainee context alongside the data so the resume prompt
//     can show "draft for <traineeName>" and downstream code can
//     re-select the right trainee after restore.
//
// `context` is an optional { traineeId, traineeName } object. Saving it
// is a no-op when callers don't pass it — legacy forms still work.
export function useFormDraft(dialogKey, scopeKey, open, initialData, context) {
  const storageKey = `${PREFIX}${dialogKey}_${scopeKey ?? 'global'}`;
  const [data, setData] = useState(initialData);
  const [draftContext, setDraftContext] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [decided, setDecided] = useState(false);
  const firstMount = useRef(true);

  // Keep a ref to the live context so the save effect can pick it up
  // without re-running when only the trainee identity changes.
  const contextRef = useRef(context);
  useEffect(() => { contextRef.current = context; }, [context]);

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
          if (age > MAX_AGE) {
            localStorage.removeItem(storageKey);
            setHasDraft(false); setDecided(true); setData(initialData); setDraftContext(null);
            return;
          }
        }
        if (parsed?._draftData && typeof parsed._draftData === 'object') {
          setData(parsed._draftData);
          setDraftContext(parsed._context || null);
          setHasDraft(true);
          return;
        }
      }
    } catch {}
    setHasDraft(false);
    setDecided(true);
    setData(initialData);
    setDraftContext(null);
  }, [open, storageKey]);

  // Auto-save on EVERY change — no debounce. Even a 1s-open form must
  // persist the latest field values before it closes.
  useEffect(() => {
    if (!open || !decided) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        _draftData: data,
        _context: contextRef.current || null,
        _savedAt: new Date().toISOString(),
      }));
    } catch {}
  }, [data, open, decided, storageKey]);

  const keepDraft = useCallback(() => { setHasDraft(false); setDecided(true); }, []);
  const discardDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch {}
    setData(initialData);
    setDraftContext(null);
    setHasDraft(false);
    setDecided(true);
  }, [storageKey, initialData]);
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch {}
    setHasDraft(false);
    setDraftContext(null);
  }, [storageKey]);

  return {
    data, setData,
    hasDraft, keepDraft, discardDraft, clearDraft,
    draftContext,       // { traineeId, traineeName } or null
    storageKey,         // exposed so callers can peek/delete if they want
  };
}
