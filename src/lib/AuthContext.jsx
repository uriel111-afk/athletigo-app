import React, { createContext, useState, useContext, useEffect } from 'react';
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
      // If onboarding_completed === true, they can go anywhere (will go to dashboard from home)
      // If onboarding_completed === false or null/undefined, MUST go to /onboarding
      const isOnboardingComplete = userProfile?.onboarding_completed === true;
      const isCurrentlyOnOnboarding = window.location.pathname === '/onboarding';
      const isCurrentlyOnLogin = window.location.pathname === '/login';
      const isCurrentlyOnRoot = window.location.pathname === '/' || window.location.pathname === '';
      
      console.log('[AuthContext] Routing check:', {
        isOnboardingComplete,
        currentPath: window.location.pathname,
        isCurrentlyOnOnboarding,
        isCurrentlyOnLogin
      });
      
      // Coaches NEVER get redirected to onboarding
      const isCoachUser = userProfile?.is_coach === true || userProfile?.role === 'coach' || userProfile?.role === 'admin';

      if (!isCoachUser && !isOnboardingComplete && !isCurrentlyOnOnboarding && !isCurrentlyOnLogin && !isCurrentlyOnRoot) {
        console.log('[AuthContext] Trainee needs onboarding, redirecting to /onboarding');
        setTimeout(() => {
          window.location.href = '/onboarding';
        }, 300);
      } else if (isOnboardingComplete && isCurrentlyOnOnboarding) {
        console.log('[AuthContext] User already completed onboarding, redirecting away');
        // The Life OS coach (uriel111@gmail.com) lands on /hub; every
        // other coach keeps going to /dashboard as before.
        const LIFE_OS_COACH_ID = '67b0093d-d4ca-4059-8572-26f020bef1eb';
        const coachHome = userProfile?.id === LIFE_OS_COACH_ID ? '/hub' : '/dashboard';
        setTimeout(() => {
          window.location.href = isCoachUser ? coachHome : '/trainee-home';
        }, 300);
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
