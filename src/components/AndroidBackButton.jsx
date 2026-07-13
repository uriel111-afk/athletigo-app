import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { toast } from 'sonner';
import { useSmartBack } from '@/hooks/useSmartBack';
import { useAuth } from '@/lib/AuthContext';
import { homePathForUser } from '@/lib/homePath';

// The ONE Android hardware back-button handler for the whole app.
// Registered a single time at the App level (never per-screen) and kept
// in sync with the router via refs, so its native-listener closure is
// always fresh. Hierarchy (default back behaviour is cancelled — the
// listener fully owns the press):
//   1. SmartBack stack non-empty → close the top open layer: modal /
//      wizard / generator / form (its onClose runs the SAME path as a
//      normal exit, incl. pending-lead save), expanded section, or a
//      running-exercise guard.
//   2. On the home/dashboard screen → first press shows a toast, a
//      second press within 2s exits the app (App.exitApp).
//   3. Any other internal screen → navigate to the dashboard.
export default function AndroidBackButton() {
  const triggerBack = useSmartBack();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Fresh-value refs for the once-registered listener.
  const homePathRef = useRef('/dashboard');
  const pathRef = useRef(location.pathname);
  const triggerRef = useRef(triggerBack);
  const navRef = useRef(navigate);
  const lastBackAtRef = useRef(0);

  useEffect(() => { homePathRef.current = homePathForUser(user); }, [user]);
  useEffect(() => { pathRef.current = location.pathname; }, [location.pathname]);
  useEffect(() => { triggerRef.current = triggerBack; }, [triggerBack]);
  useEffect(() => { navRef.current = navigate; }, [navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;

    // Route-level fallback — runs only when no open layer handled the
    // press (SmartBack stack was empty).
    const routeFallback = () => {
      // Generic close for any open Radix modal (dialogs not wired into
      // the SmartBack stack, e.g. AddTraineeDialog) — dispatch Escape,
      // which runs their normal onOpenChange(false) close path.
      const openModal = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      );
      if (openModal) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return;
      }
      const path = pathRef.current;
      const home = homePathRef.current;
      const onHome = path === home || path === '/';
      if (onHome) {
        const now = Date.now();
        if (now - lastBackAtRef.current < 2000) {
          CapApp.exitApp();
        } else {
          lastBackAtRef.current = now;
          toast('לחץ שוב ליציאה');
        }
      } else {
        navRef.current(home);
      }
    };

    CapApp.addListener('backButton', () => {
      triggerRef.current(routeFallback);
    }).then((h) => { handle = h; });

    return () => { if (handle) handle.remove(); };
  }, []);

  return null;
}
