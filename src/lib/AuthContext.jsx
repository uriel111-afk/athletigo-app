import React, { createContext, useState, useContext, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

console.log('[AUTH] AuthContext module loaded', new Date().toISOString());

export const AuthContext = createContext();

// AuthProvider lives INSIDE <Router> (see App.jsx) so it can call
// useNavigate() directly. The routing decision is a SINGLE useEffect
// gated by routingDoneRef — fires AT MOST ONCE per provider mount.
// No pendingRedirect, no window.location, no counters/cooldowns.
export const AuthProvider = ({ children }) => {
  console.log('[AUTH] AuthProvider mounting...', new Date().toISOString());
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  // One-shot guard: once the routing useEffect navigates, it never
  // navigates again from this provider mount. Subsequent moves are
  // handled by individual pages calling navigate() themselves.
  const routingDoneRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (authUser) => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      let userProfile = null;
      if (profile) {
        userProfile = profile;
      } else {
        const { data: byEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle();

        if (byEmail) {
          userProfile = byEmail;
        } else {
          const { data: created, error: createErr } = await supabase
            .from('users')
            .insert({
              id: authUser.id,
              email: authUser.email,
              full_name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
              role: 'trainee',
              onboarding_completed: false,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (createErr || !created) {
            console.error('[AuthContext] Could not create fallback profile:', createErr);
            setAuthError({ type: 'user_not_registered', message: 'User not registered' });
            setUser(null);
            setIsAuthenticated(false);
            setIsLoadingAuth(false);
            return;
          }
          console.log('[AuthContext] Created fallback profile for', authUser.email);
          userProfile = created;
        }
      }

      console.log('[AuthContext] Loaded profile:', {
        id: userProfile?.id,
        role: userProfile?.role,
        client_status: userProfile?.client_status,
        onboarding_completed: userProfile?.onboarding_completed,
        onboarding_completed_at: userProfile?.onboarding_completed_at,
      });
      setUser(userProfile);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('[AuthContext] Failed to load user profile:', error);
      setAuthError({ type: 'unknown', message: error.message || 'Failed to load profile' });
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const isOnboardingComplete = useMemo(() => {
    if (!user) return false;
    if (user.onboarding_completed === true) return true;
    if (user.onboarding_completed_at) return true;
    if (user.client_status && user.client_status !== 'onboarding') return true;
    return false;
  }, [user?.onboarding_completed, user?.onboarding_completed_at, user?.client_status]);

  // Single routing effect — fires at most once per provider mount.
  useEffect(() => {
    if (isLoadingAuth) return;
    if (!user || !isAuthenticated) return;
    if (routingDoneRef.current) return;

    const path = window.location.pathname;
    const isCoach = user.role === 'coach' || user.is_coach === true || user.role === 'admin';
    const LIFE_OS_COACH_ID = '67b0093d-d4ca-4059-8572-26f020bef1eb';
    const isLifeOSCoach = user.id === LIFE_OS_COACH_ID;

    console.log('[AuthContext] ONE-TIME route:', {
      path, isCoach, isLifeOSCoach,
      onboardingDone: isOnboardingComplete,
      clientStatus: user.client_status,
      onboardingCompletedAt: user.onboarding_completed_at,
    });

    if (path === '/login') {
      routingDoneRef.current = true;
      const dest = isCoach
        ? (isLifeOSCoach ? '/hub' : '/dashboard')
        : (isOnboardingComplete ? '/trainee-home' : '/onboarding');
      navigate(dest, { replace: true });
      return;
    }

    if (!isCoach && !isOnboardingComplete && path !== '/onboarding') {
      routingDoneRef.current = true;
      navigate('/onboarding', { replace: true });
      return;
    }

    if (!isCoach && isOnboardingComplete && path === '/onboarding') {
      routingDoneRef.current = true;
      navigate('/trainee-home', { replace: true });
      return;
    }

    if (isLifeOSCoach && (path === '/' || path === '')) {
      routingDoneRef.current = true;
      navigate('/hub', { replace: true });
      return;
    }
  }, [user, isAuthenticated, isLoadingAuth, isOnboardingComplete, navigate]);

  const checkAppState = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Reset the one-shot so a post-onboarding refresh CAN re-route.
      routingDoneRef.current = false;
      await loadUserProfile(session.user);
    } else {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const logout = (shouldRedirect = true) => {
    supabase.auth.signOut().then(() => {
      setUser(null);
      setIsAuthenticated(false);
      // Clear session-scoped UI dismissals so the next sign-in (which
      // may be a different user on the same device) sees the install
      // pill again instead of the previous user's dismissed state.
      try { sessionStorage.removeItem('installPromptDismissed'); } catch {}
      // Logout intentionally uses a full reload so query caches +
      // route-only state don't leak across accounts.
      if (shouldRedirect) {
        window.location.href = '/login';
      }
    });
  };

  const navigateToLogin = (redirectUrl) => {
    const dest = redirectUrl
      ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
      : '/login';
    window.location.href = dest;
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      isOnboardingComplete,
      logout,
      navigateToLogin,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
