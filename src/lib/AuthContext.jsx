import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { base44 } from '@/api/base44Client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  // Kept for API compatibility with consumers that read appPublicSettings
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  // SPA-style redirect target. AuthProvider sits OUTSIDE <Router>, so it
  // can't call useNavigate(); instead we publish a path through this state
  // and a child component inside Router (AuthRedirector) consumes it.
  // Using window.location.href forced a full page reload which restarted
  // the AuthContext from scratch — that was the engine of the redirect
  // loop after onboarding completed.
  const [pendingRedirect, setPendingRedirect] = useState(null);
  // De-dupe guard so a single auth tick can't queue the same redirect twice.
  const redirectingRef = useRef(false);

  useEffect(() => {
    // Initialise auth state from the current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
      }
    });

    // Keep state in sync when the session changes (login / logout / token refresh)
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
      // Fetch the full profile from the users table
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      let userProfile = null;
      if (profile) {
        userProfile = profile;
      } else {
        // Fallback: try matching by email
        const { data: byEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle();

        if (byEmail) {
          userProfile = byEmail;
        } else {
          // No profile at all — create a minimal one so the user isn't stuck
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
      
      setUser(userProfile);
      setIsAuthenticated(true);

      // EXPLICIT ROUTING LOGIC:
      // The casual-onboarding flow writes `client_status` + `onboarding_completed_at`,
      // not the legacy `onboarding_completed` boolean. Treat any of the three as
      // "complete" so we don't loop back to /onboarding right after the user
      // finishes — that was the redirect loop that page-reloaded forever.
      const isOnboardingComplete =
        userProfile?.onboarding_completed === true
        || userProfile?.onboarding_completed_at != null
        || (userProfile?.client_status && userProfile.client_status !== 'onboarding');
      const currentPath = window.location.pathname;
      const isCurrentlyOnOnboarding = currentPath === '/onboarding';
      const isCurrentlyOnLogin = currentPath === '/login';
      const isCurrentlyOnRoot = currentPath === '/' || currentPath === '';

      // Coaches NEVER get redirected to onboarding
      const isCoachUser = userProfile?.is_coach === true || userProfile?.role === 'coach' || userProfile?.role === 'admin';
      const LIFE_OS_COACH_ID = '67b0093d-d4ca-4059-8572-26f020bef1eb';
      const isLifeOSCoach = userProfile?.id === LIFE_OS_COACH_ID;

      const willRedirectTrainee =
        !isCoachUser && !isOnboardingComplete
        && !isCurrentlyOnOnboarding && !isCurrentlyOnLogin && !isCurrentlyOnRoot;
      const willRedirectAwayFromOnboarding = isOnboardingComplete && isCurrentlyOnOnboarding;
      const willRedirectCoachToHub = isLifeOSCoach && isOnboardingComplete && isCurrentlyOnRoot;

      console.log('[AuthContext] FULL CHECK:', {
        userId: userProfile?.id,
        clientStatus: userProfile?.client_status,
        onboardingCompletedAt: userProfile?.onboarding_completed_at,
        onboardingCompleted: userProfile?.onboarding_completed,
        isOnboardingComplete,
        isCoachUser,
        isLifeOSCoach,
        currentPath,
        willRedirectTrainee,
        willRedirectAwayFromOnboarding,
        willRedirectCoachToHub,
        redirectingRef: redirectingRef.current,
      });

      if (willRedirectTrainee) {
        // Defensive recheck — the in-memory userProfile might be stale if
        // onboarding just wrote client_status in another tab/render. Re-read
        // the live row BEFORE queueing a redirect to /onboarding so the
        // already-complete user can't get bounced back into the wizard.
        if (redirectingRef.current) {
          console.log('[AuthContext] redirect already pending, skipping');
        } else {
          redirectingRef.current = true;
          try {
            const { data: freshUser } = await supabase
              .from('users')
              .select('client_status, onboarding_completed, onboarding_completed_at')
              .eq('id', userProfile.id)
              .maybeSingle();
            const stillNeedsOnboarding =
              freshUser?.onboarding_completed !== true
              && freshUser?.onboarding_completed_at == null
              && (!freshUser?.client_status || freshUser.client_status === 'onboarding');
            console.log('[AuthContext] DB recheck:', { freshUser, stillNeedsOnboarding });
            if (stillNeedsOnboarding) {
              console.log('[AuthContext] queueing SPA redirect → /onboarding');
              setPendingRedirect('/onboarding');
            } else {
              console.log('[AuthContext] DB confirms complete — NOT redirecting');
              setUser({ ...userProfile, ...freshUser });
            }
          } catch (e) {
            console.warn('[AuthContext] DB recheck failed:', e?.message);
          } finally {
            // Reset the guard on the next tick — pendingRedirect is one-shot,
            // and resetting here lets a later genuine state change re-redirect.
            setTimeout(() => { redirectingRef.current = false; }, 600);
          }
        }
      } else if (willRedirectAwayFromOnboarding) {
        console.log('[AuthContext] queueing SPA redirect away from /onboarding');
        const dest = isCoachUser ? (isLifeOSCoach ? '/hub' : '/dashboard') : '/trainee-home';
        setPendingRedirect(dest);
      } else if (willRedirectCoachToHub) {
        console.log('[AuthContext] queueing SPA redirect → /hub (Life OS coach at root)');
        setPendingRedirect('/hub');
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setAuthError({ type: 'unknown', message: error.message || 'Failed to load profile' });
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const checkAppState = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
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

  const clearPendingRedirect = () => setPendingRedirect(null);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
      pendingRedirect,
      clearPendingRedirect,
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
