import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

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
        console.log('[AuthContext] Loaded user profile:', {
          id: userProfile.id,
          email: userProfile.email,
          onboarding_completed: userProfile.onboarding_completed
        });
      } else {
        // Fallback to email lookup, then bare auth user
        const { data: byEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle();
        userProfile = byEmail || { id: authUser.id, email: authUser.email, onboarding_completed: false };
        console.log('[AuthContext] User profile created/fallback:', {
          id: userProfile.id,
          email: userProfile.email,
          onboarding_completed: userProfile.onboarding_completed
        });
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
      
      // If they need to onboard and aren't already on onboarding/login, redirect them
      if (!isOnboardingComplete && !isCurrentlyOnOnboarding && !isCurrentlyOnLogin && !isCurrentlyOnRoot) {
        console.log('[AuthContext] User needs onboarding, redirecting to /onboarding');
        setTimeout(() => {
          window.location.href = '/onboarding';
        }, 300);
      } else if (isOnboardingComplete && isCurrentlyOnOnboarding) {
        console.log('[AuthContext] User already completed onboarding but is on /onboarding page, redirecting to /dashboard');
        setTimeout(() => {
          window.location.href = '/dashboard';
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
