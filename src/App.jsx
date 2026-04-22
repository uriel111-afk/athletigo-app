import { useCallback, useEffect } from 'react';
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
import { ClockProvider } from './contexts/ClockContext';
import { ActiveTimerProvider, useActiveTimer } from './contexts/ActiveTimerContext';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import TraineeHome from './pages/TraineeHome';
import TabataTimer from './components/TabataTimer';

// Global TabataTimer — always mounted, never unmounts
function GlobalTabata() {
  const { showTabata, setShowTabata, setLiveTimer, setIsMinimized } = useActiveTimer();
  const navigate = useNavigate();
  let user = null;
  try { const auth = useAuth(); user = auth?.user; } catch(e) {}
  const isCoach = user?.role === 'coach' || user?.is_coach === true || user?.role === 'admin';

  const handleMinimize = useCallback(() => {
    setShowTabata(false);
    setIsMinimized(true);
    navigate(isCoach ? '/dashboard' : '/traineehome', { replace: false });
  }, [isCoach, navigate, setShowTabata, setIsMinimized]);

  // Back button while overlay showing → minimize (mobile-safe)
  useEffect(() => {
    if (!showTabata) return;
    // Full-screen tabata is open → bar should not be visible.
    setIsMinimized(false);
    window.history.pushState(null, '', window.location.href);
    const onPop = () => {
      window.history.pushState(null, '', window.location.href);
      handleMinimize();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [showTabata, handleMinimize, setIsMinimized]);

  return (
    <div style={{
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
  const { isReady, progress, label, timedOut, retry, forceReady } = useDataGate(user);

  // Real-time sync — listen to Supabase changes and auto-refresh
  useRealtimeSync(user?.id);

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
      <Route path="*" element={<PageNotFound />} />
    </Routes>
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
          <VisualEditAgent />
        </ActiveTimerProvider>
        </ClockProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
