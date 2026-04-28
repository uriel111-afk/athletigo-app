import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';

export const AuthContext = createContext();

// AuthProvider sits OUTSIDE <Router>, so it CAN'T call useNavigate().
// Responsibilities are deliberately narrow: keep the auth session +
// users-row in state, expose them + a derived isOnboardingComplete
// flag, and offer a checkAppState() refresh hook. ALL routing
// decisions live in <RoutingGate /> (App.jsx), which is inside Router
// and can call navigate() directly. That separation is what keeps the
// onboarding flow from looping — the previous design used
// window.location.href / pendingRedirect to bridge the gap, and any
// stale state on either side restarted the cycle.
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

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

  // Three signals, any one is enough — kept in a single source of truth
  // so RoutingGate, Onboarding bootstrap, and any consumer can read the
  // same answer without re-deriving it.
  const isOnboardingComplete = useMemo(() => {
    if (!user) return false;
    if (user.onboarding_completed === true) return true;
    if (user.onboarding_completed_at) return true;
    if (user.client_status && user.client_status !== 'onboarding') return true;
    return false;
  }, [user?.onboarding_completed, user?.onboarding_completed_at, user?.client_status]);

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
      // Logout intentionally uses a full reload so query caches +
      // route-only state (zustand stores etc.) don't leak across
      // accounts. NEVER convert this to navigate().
      if (shouldRedirect) {
        window.location.href = '/login';
      }
    });
  };

  const navigateToLogin = (redirectUrl) => {
    const dest = redirectUrl
      ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
      : '/login';
    // Same intentional full-reload semantics as logout — preserves the
    // ?redirect= query param for the post-login bounceback.
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
