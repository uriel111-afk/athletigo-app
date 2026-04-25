import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import { useTraineePermissions } from '@/hooks/useTraineePermissions';

// Wraps a trainee-facing screen and hides it if the coach turned the
// matching permission off. Coaches always see the screen (no gate).
// While permissions are still loading we render the children so a
// quick auth flicker doesn't show the blocked card.
export default function PermGate({ permission, children, label }) {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const isCoach = user?.role === 'coach' || user?.is_coach === true || user?.role === 'admin';
  const { perms, loaded } = useTraineePermissions(user?.id);

  if (isCoach || !loaded) return children;
  if (perms?.[permission] === false) {
    return (
      <div dir="rtl" style={{
        minHeight: '60vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}>
        <div style={{
          backgroundColor: '#FFFFFF', borderRadius: 14,
          border: '1px solid #F0E4D0',
          padding: 28, textAlign: 'center', maxWidth: 360,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            backgroundColor: '#FFF0E4',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Lock size={26} color="#FF6F20" />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>
            המסך לא זמין
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 16 }}>
            המאמן עדיין לא פתח עבורך {label || 'את המסך הזה'}.
            צרי איתו קשר כדי לאפשר גישה.
          </div>
          <button
            onClick={() => navigate('/trainee-home')}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              backgroundColor: '#FF6F20', color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            חזרה לדף הבית
          </button>
        </div>
      </div>
    );
  }
  return children;
}
