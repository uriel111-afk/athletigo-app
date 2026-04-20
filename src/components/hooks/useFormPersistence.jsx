import { useState, useEffect, useRef } from "react";

const MAX_DRAFT_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useFormPersistence(key, defaultValues) {
  const isInitialized = useRef(false);

  // Initialize state from localStorage or defaultValues
  const [values, setValues] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          // Check for expiry (if saved with timestamp wrapper)
          if (parsed?._savedAt) {
            const age = Date.now() - new Date(parsed._savedAt).getTime();
            if (age > MAX_DRAFT_AGE) { localStorage.removeItem(key); return defaultValues; }
            return parsed._data || defaultValues;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error("Error parsing draft form data", e);
    }
    return defaultValues;
  });

  // If key changes (e.g. switching from 'new' to 'edit'), re-sync
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      return;
    }

    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        setValues(parsed?._data || parsed);
      } else {
        setValues(defaultValues);
      }
    } catch (e) {
      setValues(defaultValues);
    }
  }, [key]); // We intentionally ignore defaultValues changes to avoid overrides

  // Save to localStorage on every change (with timestamp for expiry)
  useEffect(() => {
    if (key && typeof window !== "undefined") {
      try {
        localStorage.setItem(key, JSON.stringify({ _data: values, _savedAt: new Date().toISOString() }));
      } catch {}
    }
  }, [key, values]);

  // Clear draft (for explicit cancel or successful submit)
  const clearDraft = () => {
    if (key && typeof window !== "undefined") {
      localStorage.removeItem(key);
    }
    setValues(defaultValues);
  };

  // Check if draft exists (different from default values)
  const draftExists = (() => {
    if (key && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          const data = parsed?._data || parsed;
          return JSON.stringify(data) !== JSON.stringify(defaultValues);
        }
      } catch {}
    }
    return false;
  })();

  // Check if form has been modified from defaults (for close confirmation)
  const hasChanges = (() => {
    try {
      return JSON.stringify(values) !== JSON.stringify(defaultValues);
    } catch { return false; }
  })();

  return [values, setValues, clearDraft, draftExists, hasChanges];
}