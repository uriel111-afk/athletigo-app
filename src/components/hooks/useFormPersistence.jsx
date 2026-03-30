import { useState, useEffect, useRef } from "react";

export function useFormPersistence(key, defaultValues) {
  const isInitialized = useRef(false);

  // Initialize state from localStorage or defaultValues
  const [values, setValues] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(key);
        if (saved) {
          return JSON.parse(saved);
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
        setValues(JSON.parse(saved));
      } else {
        setValues(defaultValues);
      }
    } catch (e) {
      setValues(defaultValues);
    }
  }, [key]); // We intentionally ignore defaultValues changes to avoid overrides

  // Save to localStorage on every change
  useEffect(() => {
    if (key && typeof window !== "undefined") {
      localStorage.setItem(key, JSON.stringify(values));
    }
  }, [key, values]);

  // Clear draft (for explicit cancel or successful submit)
  const clearDraft = () => {
    if (key && typeof window !== "undefined") {
      localStorage.removeItem(key);
    }
    setValues(defaultValues);
  };

  return [values, setValues, clearDraft];
}