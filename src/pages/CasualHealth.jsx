import React, { useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import HealthDeclarationForm from '@/components/forms/HealthDeclarationForm';
import PageLoader from '@/components/PageLoader';

/**
 * CasualHealth — the ONLY screen a restricted (מזדמן) trainee sees.
 *
 * A drop-in attendee gets an account so they can sign a health
 * declaration on their own device, and nothing else: no dashboard, no
 * plans, no sessions, no menu. This route is registered OUTSIDE
 * LayoutWrapper in App.jsx, so there is no header and no bottom nav to
 * navigate away with.
 *
 * This is NOT a second onboarding wizard. It is one screen that mounts
 * the existing HealthDeclarationForm, and a confirmation once signed.
 * The regular trainee wizard in Onboarding.jsx is untouched.
 *
 * The moment the coach moves this user off 'casual' (or onboarding is
 * completed), the guard in AuthContext stops matching and the full
 * trainee experience opens with no further action here.
 */

const CREAM  = '#FFF9F0';
const ORANGE = '#FF6F20';
const INK    = '#3A2E24';
const SOFT   = '#8A7B6C';
const LINE   = '#EFE2CE';
const CARD   = '#FFFFFF';
const TOUCH  = 44;

export default function CasualHealth() {
  const { user, isLoadingAuth } = useContext(AuthContext);
  const [signed, setSigned] = useState(null);   // null = still checking
  const [formOpen, setFormOpen] = useState(false);

  // health_declaration_signed is the single source of truth (see
  // packageStatus-style consolidation in HealthDeclarationForm).
  // health_declarations is consulted only as a backstop for rows signed
  // before the flag column existed.
  const check = useCallback(async () => {
    if (!user?.id) return;
    if (user.health_declaration_signed === true) { setSigned(true); return; }
    try {
      const { data, error } = await supabase
        .from('health_declarations')
        .select('id')
        .eq('trainee_id', user.id)
        .limit(1);
      if (error) throw error;
      setSigned((data || []).length > 0);
    } catch (e) {
      console.warn('[CasualHealth] declaration lookup failed:', e?.message);
      setSigned(false);
    }
  }, [user?.id, user?.health_declaration_signed]);

  useEffect(() => { check(); }, [check]);

  if (isLoadingAuth || signed === null) return <PageLoader />;

  const wrap = {
    minHeight: '100dvh',
    background: CREAM,
    direction: 'rtl',
    textAlign: 'right',
    fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
    color: INK,
    padding: 'calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  };
  const card = {
    width: '100%', maxWidth: 480, boxSizing: 'border-box',
    background: CARD, border: `1px solid ${LINE}`,
    borderRadius: 16, padding: 20,
  };

  // ── Signed: a short confirmation and nothing else. ─────────────────
  if (signed) {
    return (
      <div dir="rtl" style={wrap}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>
            הצהרת הבריאות נשמרה
          </div>
          <div style={{ fontSize: 14, color: SOFT, lineHeight: 1.6 }}>
            תודה{user?.full_name ? `, ${user.full_name}` : ''}. אין צורך בפעולה נוספת.
          </div>
        </div>
      </div>
    );
  }

  // ── Not signed: one call to action. ────────────────────────────────
  return (
    <div dir="rtl" style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>
          הצהרת בריאות
        </div>
        <div style={{ fontSize: 14, color: SOFT, lineHeight: 1.6, marginBottom: 16 }}>
          לפני האימון יש למלא ולחתום על הצהרת בריאות. זה לוקח פחות מדקה.
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          style={{
            width: '100%', minHeight: TOUCH + 6,
            borderRadius: 14, border: 'none',
            background: ORANGE, color: CREAM,
            fontSize: 17, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          מילוי הצהרת בריאות
        </button>
      </div>

      {/* The EXISTING form — no new one was built. */}
      <HealthDeclarationForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        trainee={user}
        coachId={user?.coach_id || null}
        autoConfirmSession={false}
        onSigned={async () => {
          setFormOpen(false);
          setSigned(true);
          await check();
        }}
      />
    </div>
  );
}
