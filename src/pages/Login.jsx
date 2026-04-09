import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Loader2, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // If already logged in, redirect to Dashboard
  const redirectAfterLogin = (profile) => {
    const destination = profile?.role === 'trainee' ? "/TraineeHome" : "/dashboard";
    navigate(destination, { replace: true });
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          const profile = await base44.auth.me();
          redirectAfterLogin(profile);
        } catch (error) {
          navigate("/dashboard", { replace: true });
        }
      }
    });
  }, [navigate]);

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
      const profile = await base44.auth.me();
      redirectAfterLogin(profile);
    } catch (error) {
      navigate("/dashboard", { replace: true });
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#FAFAFA" }}
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: "#FF6F20" }}
          >
            <Dumbbell className="w-8 h-8 text-white" />
          </div>
          <h1
            className="text-3xl font-black"
            style={{ fontFamily: "Montserrat, Heebo, sans-serif", color: "#000000" }}
          >
            AthletiGo
          </h1>
          <p className="text-sm mt-1" style={{ color: "#7D7D7D" }}>
            כניסה למערכת מאמנים
          </p>
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
          </form>
        </div>
      </div>
    </div>
  );
}
