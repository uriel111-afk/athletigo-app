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

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // If already logged in, redirect to Dashboard
  const redirectAfterLogin = (profile) => {
    const isCoach = profile?.role === 'coach' || profile?.isCoach === true || profile?.role === 'admin';
    const isTrainee = profile?.role === 'trainee' || profile?.role === 'user';
    const destination = isTrainee
      ? '/trainee-home'
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

      if (!profile.onboarding_completed) {
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
      style={{ backgroundColor: "#FAFAFA" }}
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        {/* Brand — single combined logoR asset (triangle + wordmark). */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <img
            src="/logoR.png"
            alt="AthletiGo"
            style={{ width: 200, height: 'auto', objectFit: 'contain' }}
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
    </div>
  );
}
