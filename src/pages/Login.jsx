import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { COACH_USER_ID } from "@/lib/lifeos/lifeos-constants";
import InstallPrompt from "@/components/InstallPrompt";
import { useIsPWA } from "@/hooks/useIsPWA";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const isPWA = useIsPWA();

  // If already logged in, redirect based on role. The Life OS coach
  // (uriel111@gmail.com) lands on /hub — the two-card entry screen —
  // rather than going straight to /dashboard, which is now reachable
  // only via the "מקצועי" card on the hub.
  const redirectAfterLogin = (profile) => {
    const isCoach = profile?.role === 'coach' || profile?.isCoach === true || profile?.role === 'admin';
    const isTrainee = profile?.role === 'trainee' || profile?.role === 'user';
    const isLifeOSCoach = profile?.id === COACH_USER_ID;
    const destination = isTrainee
      ? '/trainee-home'
      : isLifeOSCoach
        ? '/hub'
        : isCoach
          ? createPageUrl('Dashboard')
          : createPageUrl('Dashboard');
    navigate(destination, { replace: true });
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          const profile = await base44.auth.me();
          redirectAfterLogin(profile);
        } catch (error) {
          await supabase.auth.signOut();
          navigate('/login', { replace: true });
        }
      }
    });
  }, [navigate]);

  // Self-serve password reset is intentionally disabled — only the
  // coach can reset a trainee's password (via the Edge Function
  // `reset-password` invoked from the trainee profile page).
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError("אימייל או סיסמה שגויים. נסה שוב.");
      setIsLoading(false);
      return;
    }

    try {
      // Try to load existing profile
      let profile = null;
      try {
        profile = await base44.auth.me();
      } catch (profileError) {
        // Profile missing — fetch the auth user and route to onboarding
        // AuthContext will auto-create the profile on next load
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          navigate('/onboarding', { replace: true });
          return;
        }
        throw profileError;
      }

      // Three independent completion signals — any one of them is enough.
      // The legacy `onboarding_completed` boolean is never written by the
      // casual-onboarding flow, which uses `client_status` + `onboarding_completed_at`.
      const onboardingDone = profile?.onboarding_completed === true
        || profile?.onboarding_completed_at != null
        || (profile?.client_status && profile.client_status !== 'onboarding');
      if (!onboardingDone) {
        navigate('/onboarding', { replace: true });
        return;
      }

      redirectAfterLogin(profile);
    } catch (error) {
      console.error("[Login] Login error:", error);
      setError("שגיאה בטעינת הפרופיל. נסה שוב.");
      await supabase.auth.signOut();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      // paddingBottom: 120 keeps the centered login card clear of the
      // fixed bottom-banner InstallPrompt (≈76px tall + 80px offset
      // from the viewport bottom = 156px footprint). Without this,
      // the install pill covered the submit button + 'forgot password'
      // link on shorter viewports.
      style={{ backgroundColor: "#FAFAFA", paddingBottom: 120 }}
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        {/* Brand — single combined logoR asset (triangle + wordmark). */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <img
            src="/logoR.png"
            alt="AthletiGo"
            style={{ width: 130, height: 'auto', objectFit: 'contain', marginBottom: 24, filter: 'brightness(0)' }}
          />
          <div style={{ fontSize: 14, color: '#888', marginTop: 16, fontWeight: 500 }}>
            כניסה למערכת מאמנים ומתאמנים
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E0E0E0",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="font-bold text-sm" style={{ color: "#000000" }}>
                אימייל
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 rounded-xl text-right"
                style={{ border: "1px solid #E0E0E0", direction: "ltr" }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="font-bold text-sm" style={{ color: "#000000" }}>
                סיסמה
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 rounded-xl"
                style={{ border: "1px solid #E0E0E0", direction: "ltr" }}
              />
            </div>

            {error && (
              <p
                className="text-sm font-medium text-center py-2 px-3 rounded-lg"
                style={{ backgroundColor: "#FFF0F0", color: "#D32F2F", border: "1px solid #FFCDD2" }}
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl font-bold text-white text-base"
              style={{ backgroundColor: "#FF6F20" }}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "כניסה"
              )}
            </Button>

            <div className="text-center" style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              שכחת סיסמה? פנה למאמן שלך
            </div>
          </form>
        </div>
      </div>
      {/* Install banner — only on the unauthenticated login screen,
          and only when the app is NOT already installed as a PWA. */}
      {!isPWA && <InstallPrompt />}
    </div>
  );
}
