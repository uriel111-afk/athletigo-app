import { useCallback, useEffect, useState } from 'react';
import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLoader from '@/components/AppLoader';
import { useDataGate } from '@/components/hooks/useDataGate';
import Login from './pages/Login';
import CoachHub from './pages/CoachHub';
import LifeOSDashboard from './pages/lifeos/LifeOSDashboard';
import LifeOSExpenses from './pages/lifeos/Expenses';
import LifeOSIncome from './pages/lifeos/Income';
import LifeOSRecurring from './pages/lifeos/RecurringPayments';
import LifeOSInstallments from './pages/lifeos/Installments';
import LifeOSDocuments from './pages/lifeos/DocumentVault';
import LifeOSCashFlow from './pages/lifeos/CashFlow';
import LifeOSBusinessPlan from './pages/lifeos/BusinessPlan';
import LifeOSTasks from './pages/lifeos/Tasks';
import LifeOSLeads from './pages/lifeos/Leads';
import LifeOSContent from './pages/lifeos/ContentCalendar';
import LifeOSCommunity from './pages/lifeos/Community';
import LifeOSSettings from './pages/lifeos/LifeOSSettings';
import { COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';
import { ClockProvider } from './contexts/ClockContext';
import { ActiveTimerProvider, useActiveTimer } from './contexts/ActiveTimerContext';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import TraineeHome from './pages/TraineeHome';
import TabataTimer from './components/TabataTimer';
import LastSessionAlert from './components/LastSessionAlert';
import BirthdayBlessingPopup from './components/BirthdayBlessingPopup';
import NotificationPopup from './components/NotificationPopup';
import { supabase } from '@/lib/supabaseClient';

// Global TabataTimer — always mounted, never unmounts
function GlobalTabata() {
  const { showTabata, setShowTabata, setLiveTimer, setIsMinimized } = useActiveTimer();
  const navigate = useNavigate();
  let user = null;
  try { const auth = useAuth(); user = auth?.user; } catch(e) {}
  const isCoach = user?.role === 'coach' || user?.is_coach === true || user?.role === 'admin';

  const handleMinimize = useCallback(() => {
    // Use replace:true so we don't push a duplicate history entry on top
    // of /clocks. Without replace, the phone back-button from /dashboard
    // would pop back to /clocks → Clocks.jsx's popstate handler kicks in
    // and stops the timer.
    navigate(isCoach ? '/dashboard' : '/trainee-home', { replace: true });
  }, [isCoach, navigate]);

  // When the full-screen tabata opens, ensure the bar is hidden.
  // Phone back-button handling lives in Clocks.jsx (double-tap = minimize)
  // — we no longer register a single-tap popstate handler here, which
  // used to conflict with the double-tap requirement.
  useEffect(() => {
    if (!showTabata) return;
    setIsMinimized(false);
  }, [showTabata, setIsMinimized]);

  // Block every variety of pointer/click event at the full-screen Tabata
  // wrapper so taps on the Tabata never reach the document-level
  // pointer-down listener that Radix DismissableLayer uses to decide
  // whether a Dialog should close. The data-timer-bar marker is also
  // recognized by DialogContent's isFromTimerBar() guard, so even if an
  // event does escape, any dialog will still refuse to close.
  const stopTimerEvents = (e) => {
    e.stopPropagation();
    if (typeof e.nativeEvent?.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  return (
    <div
      data-timer-bar="true"
      onClick={stopTimerEvents}
      onPointerDown={stopTimerEvents}
      onPointerUp={stopTimerEvents}
      onMouseDown={stopTimerEvents}
      onMouseUp={stopTimerEvents}
      onTouchStart={stopTimerEvents}
      onTouchEnd={stopTimerEvents}
      style={{
        display: showTabata ? 'flex' : 'none',
        position: 'fixed', inset: 0, zIndex: 10000,
        flexDirection: 'column', background: '#FF6F20'
      }}>
      <TabataTimer
        onMinimize={handleMinimize}
        setLiveTimer={setLiveTimer}
      />
    </div>
  );
}

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isReady, progress, label, timedOut, retry, forceReady } = useDataGate(user);

  // Real-time sync — listen to Supabase changes and auto-refresh
  useRealtimeSync(user?.id);

  // Life OS coach lands on /hub instead of the root. Every other user
  // keeps the existing behavior untouched.
  useEffect(() => {
    if (!user?.id) return;
    if (user.id !== COACH_USER_ID) return;
    if (location.pathname === '/' || location.pathname === '') {
      navigate('/hub', { replace: true });
    }
  }, [user?.id, location.pathname, navigate]);

  // ── Realtime notification popup (coach only) ──────────────────────
  const [popupNotif, setPopupNotif] = useState(null);
  const isCoachUser = user?.role === 'coach' || user?.is_coach === true || user?.role === 'admin';

  const showNotificationPopup = useCallback((n) => {
    setPopupNotif(n);

    // Browser notification — fires even when tab is backgrounded
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('AthletiGo', {
          body: n.message || n.title || 'התראה חדשה',
          icon: '/icon-192.png',
          tag: 'athletigo-notif-' + n.id,
          requireInteraction: false,
        });
      } catch (e) {}
    }

    // Short chime
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 800;
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        setTimeout(() => ctx.close(), 500);
      }
    } catch (e) {}

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([100, 50, 100]); } catch (e) {}
    }
  }, []);

  // Request browser notification permission once for coaches
  useEffect(() => {
    if (!isCoachUser) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }
  }, [isCoachUser]);

  // Subscribe to INSERT events on notifications table for this coach
  useEffect(() => {
    if (!user?.id || !isCoachUser) return;
    const ch = supabase
      .channel('coach_notifications_popup')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new;
          if (n && !n.is_read) showNotificationPopup(n);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, isCoachUser, showNotificationPopup]);

  // Show branded loading screen while auth is initializing
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoader progress={5} label="מתחבר..." />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Block app until data is ready (shows progress loading screen)
  if (isAuthenticated && !isReady) {
    if (timedOut) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" dir="rtl" style={{ backgroundColor: '#FDF8F3' }}>
          <h1 className="text-xl font-black text-gray-800">לא הצלחנו לטעון את כל הנתונים</h1>
          <p className="text-sm text-gray-500">האפליקציה עלולה להיות חלקית</p>
          <div className="flex gap-3">
            <button onClick={retry} className="px-6 py-3 rounded-xl font-bold text-white" style={{ backgroundColor: '#FF6F20' }}>נסה שוב</button>
            <button onClick={forceReady} className="px-6 py-3 rounded-xl font-bold text-gray-600 border border-gray-300">המשך בכל זאת</button>
          </div>
        </div>
      );
    }
    return <AppLoader progress={progress} label={label} />;
  }

  const isCoach = user?.role === 'coach' || user?.is_coach === true || user?.role === 'admin';
  const isTrainee = user?.role === 'trainee' || user?.role === 'user';
  const traineeOnlyPages = new Set(['TraineeHome', 'TraineeSessions', 'MyPlan', 'MyWorkoutLog', 'Progress', 'MyAttendance', 'Forms']);
  const sharedPages = new Set(['Notifications', 'Onboarding', 'Home', 'TraineeProfile', 'Clocks']);

  const PageRouteGuard = ({ pageKey, children }) => {
    if (isLoadingAuth) {
      return (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
        </div>
      );
    }

    if (!isAuthenticated) {
      navigateToLogin(location.pathname);
      return null;
    }

    if (authError?.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }

    if (isCoach && traineeOnlyPages.has(pageKey)) {
      return <Navigate to={createPageUrl('Dashboard')} replace />;
    }

    if (isTrainee && !traineeOnlyPages.has(pageKey) && !sharedPages.has(pageKey)) {
      return <Navigate to="/trainee-home" replace />;
    }

    return children;
  };

  // Render the main app
  return (
    <>
    <NotificationPopup
      notification={popupNotif}
      onDismiss={() => setPopupNotif(null)}
      onTap={() => navigate('/notifications')}
    />
    <Routes>
      <Route path="/" element={
        <PageRouteGuard pageKey={mainPageKey}>
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        </PageRouteGuard>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path.toLowerCase()}`}
          element={
            <PageRouteGuard pageKey={path}>
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            </PageRouteGuard>
          }
        />
      ))}
      <Route
        path="/trainee-home"
        element={
          <PageRouteGuard pageKey="TraineeHome">
            <LayoutWrapper currentPageName="TraineeHome">
              <TraineeHome />
            </LayoutWrapper>
          </PageRouteGuard>
        }
      />

      {/* ── Life OS (coach hub + financial OS) ─────────────────── */}
      {/* These screens render without the app-wide Layout — they use */}
      {/* their own LifeOSLayout (CoachHub has a custom shell). */}
      <Route path="/hub"                 element={<PageRouteGuard pageKey="CoachHub"><CoachHub /></PageRouteGuard>} />
      <Route path="/lifeos"              element={<PageRouteGuard pageKey="LifeOS"><LifeOSDashboard /></PageRouteGuard>} />
      <Route path="/lifeos/expenses"     element={<PageRouteGuard pageKey="LifeOS"><LifeOSExpenses /></PageRouteGuard>} />
      <Route path="/lifeos/income"       element={<PageRouteGuard pageKey="LifeOS"><LifeOSIncome /></PageRouteGuard>} />
      <Route path="/lifeos/recurring"    element={<PageRouteGuard pageKey="LifeOS"><LifeOSRecurring /></PageRouteGuard>} />
      <Route path="/lifeos/installments" element={<PageRouteGuard pageKey="LifeOS"><LifeOSInstallments /></PageRouteGuard>} />
      <Route path="/lifeos/documents"    element={<PageRouteGuard pageKey="LifeOS"><LifeOSDocuments /></PageRouteGuard>} />
      <Route path="/lifeos/cashflow"     element={<PageRouteGuard pageKey="LifeOS"><LifeOSCashFlow /></PageRouteGuard>} />
      <Route path="/lifeos/plan"         element={<PageRouteGuard pageKey="LifeOS"><LifeOSBusinessPlan /></PageRouteGuard>} />
      <Route path="/lifeos/tasks"        element={<PageRouteGuard pageKey="LifeOS"><LifeOSTasks /></PageRouteGuard>} />
      <Route path="/lifeos/leads"        element={<PageRouteGuard pageKey="LifeOS"><LifeOSLeads /></PageRouteGuard>} />
      <Route path="/lifeos/content"      element={<PageRouteGuard pageKey="LifeOS"><LifeOSContent /></PageRouteGuard>} />
      <Route path="/lifeos/community"    element={<PageRouteGuard pageKey="LifeOS"><LifeOSCommunity /></PageRouteGuard>} />
      <Route path="/lifeos/settings"     element={<PageRouteGuard pageKey="LifeOS"><LifeOSSettings /></PageRouteGuard>} />

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </>
  );
};


function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ClockProvider>
        <ActiveTimerProvider>
          <Router>
            <NavigationTracker />
            <GlobalTabata />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<AuthenticatedApp />} />
            </Routes>
          </Router>
          <Toaster />
          <LastSessionAlert />
          <BirthdayBlessingPopup />
          <VisualEditAgent />
        </ActiveTimerProvider>
        </ClockProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
