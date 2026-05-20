import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Smart-back stack: components register a close handler when they
// have transient open state (expanded section, expanded exercise,
// etc.). The header's back button pops the topmost handler first;
// only when the stack is empty does it fall through to a real
// route-level navigate(-1). LIFO — closing one layer at a time.
const SmartBackContext = createContext(null);

export function SmartBackProvider({ children }) {
  const stackRef = useRef([]);
  const idRef = useRef(0);
  const navigate = useNavigate();

  const pushHandler = useCallback((handler) => {
    idRef.current += 1;
    const id = idRef.current;
    stackRef.current.push({ id, handler });
    return id;
  }, []);

  const removeHandler = useCallback((id) => {
    stackRef.current = stackRef.current.filter((h) => h.id !== id);
  }, []);

  const triggerBack = useCallback(() => {
    if (stackRef.current.length > 0) {
      const top = stackRef.current[stackRef.current.length - 1];
      try {
        top.handler();
      } catch (e) {
        console.warn('[SmartBack] handler threw:', e?.message);
      }
      // The handler should flip its `active` flag to false, which
      // triggers the useSmartBackHandler effect cleanup and removes
      // its registration from the stack on the next render.
      return;
    }
    navigate(-1);
  }, [navigate]);

  return (
    <SmartBackContext.Provider value={{ pushHandler, removeHandler, triggerBack }}>
      {children}
    </SmartBackContext.Provider>
  );
}

// Tiny hook returning a `goBack` function. Use in the header's
// back button onClick. Safe to call outside the provider — returns
// a no-op so dev/test stubs don't crash.
export function useSmartBack() {
  const ctx = useContext(SmartBackContext);
  return ctx ? ctx.triggerBack : () => {};
}

// Register a close handler whenever `active` is true. Handler is
// popped on un-mount or when `active` flips false. The handlerRef
// pattern keeps the closure fresh so a handler reading state
// always sees the latest values, not the stale capture from when
// the handler was first registered.
export function useSmartBackHandler(active, onClose) {
  const ctx = useContext(SmartBackContext);
  const handlerRef = useRef(onClose);
  handlerRef.current = onClose;

  useEffect(() => {
    if (!active || !ctx) return undefined;
    const id = ctx.pushHandler(() => {
      if (typeof handlerRef.current === 'function') handlerRef.current();
    });
    return () => ctx.removeHandler(id);
  }, [active, ctx]);
}
