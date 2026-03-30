import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Shield } from "lucide-react";

export default function ProtectedCoachPage({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error("[ProtectedCoachPage] Error loading user:", error);
      } finally {
        setLoading(false);
      }
    };
    checkAccess();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  const AUTHORIZED_EMAILS = ['uriel111@gmail.com', 'athletigo@gmail.com'];
  const isAuthorized = user?.email && AUTHORIZED_EMAILS.includes(user.email.toLowerCase());

  if (!user?.isCoach && !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-md text-center">
          <div className="p-6 rounded-2xl mb-6" style={{ backgroundColor: '#FFEBEE', border: '2px solid #f44336' }}>
            <Shield className="w-16 h-16 mx-auto mb-4" style={{ color: '#f44336' }} />
            <h2 className="text-2xl font-black mb-3" style={{ color: '#000000' }}>
              🚫 אין הרשאת גישה
            </h2>
            <p className="text-lg mb-2" style={{ color: '#7D7D7D' }}>
              דף זה זמין למאמנים בלבד
            </p>
            <p className="text-sm" style={{ color: '#7D7D7D' }}>
              אם אתה מאמן, פנה למנהל המערכת להפעלת הרשאות
            </p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-3 rounded-xl font-bold text-white"
            style={{ backgroundColor: '#FF6F20' }}
          >
            ← חזור לדף הקודם
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}