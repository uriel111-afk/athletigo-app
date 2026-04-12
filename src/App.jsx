import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLoader from '@/components/AppLoader';
import Login from './pages/Login';
import TraineeHome from './pages/TraineeHome';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin, user } = useAuth();
  const location = useLocation();

  // Show branded loading screen while auth is initializing
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoader />;
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

  const isCoach = user?.role === 'coach' || user?.isCoach === true || user?.role === 'admin';
  const isTrainee = user?.role === 'trainee' || user?.role === 'user';
  const traineeOnlyPages = new Set(['TraineeHome', 'MyPlan', 'MyWorkoutLog', 'Progress', 'MyAttendance', 'Forms']);
  const sharedPages = new Set(['Notifications', 'Onboarding', 'Home', 'TraineeProfile']);

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
        <Router>
          <NavigationTracker />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
