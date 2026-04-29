import { supabase } from '@/lib/supabaseClient';

// Single source of truth for the five client_status values that
// live on users.client_status. Keys are the canonical English
// strings stored in the DB; the metadata is for rendering only.
//
// Why not Hebrew keys: legacy rows already use 'מזדמן' / 'פעיל'
// alongside 'casual' / 'active' in some installs, so we route
// Hebrew labels through `.label` and write English to the column.

export const STATUS_CONFIG = {
  onboarding: {
    label:   'אונבורדינג',
    bg:      '#FEF3C7',
    color:   '#92400E',
    border:  '#FDE68A',
    icon:    '🔄',
  },
  casual: {
    label:   'מזדמן',
    bg:      '#E0E7FF',
    color:   '#3730A3',
    border:  '#C7D2FE',
    icon:    '⏳',
  },
  active: {
    label:   'פעיל',
    bg:      '#D1FAE5',
    color:   '#065F46',
    border:  '#86EFAC',
    icon:    '✓',
  },
  suspended: {
    label:   'מושעה',
    bg:      '#FEE2E2',
    color:   '#991B1B',
    border:  '#FCA5A5',
    icon:    '⏸',
  },
  former: {
    label:   'בוגר/לשעבר',
    bg:      '#E5E7EB',
    color:   '#4B5563',
    border:  '#D1D5DB',
    icon:    '×',
  },
};

// onboarding is intentionally excluded from the manual list — that
// status is set by the wizard and cleared automatically when the
// trainee finishes step 6. A coach manually flipping someone back
// to onboarding would re-trigger the wizard, which is rarely what
// they want; the rare case where it IS wanted should go through a
// separate "send to onboarding" action with explicit confirmation.
export const SELECTABLE_STATUSES = ['casual', 'active', 'suspended', 'former'];

// Lightweight write — no side effects beyond the column update +
// updated_at touch. Use this from surfaces that only care about
// the label flipping (UnifiedClientCard, AllUsers row picker).
//
// For the trainee profile, prefer the existing handleStatusChange
// in TraineeProfile.jsx — it cascades to trainee_permissions and
// freezes/unfreezes packages on the suspended toggle, which this
// helper deliberately doesn't touch.
export const updateClientStatus = async (userId, newStatus) => {
  if (!SELECTABLE_STATUSES.includes(newStatus)) {
    console.warn('[clientStatus] invalid status:', newStatus);
    return false;
  }
  if (!userId) {
    console.warn('[clientStatus] missing userId');
    return false;
  }
  try {
    const { error } = await supabase
      .from('users')
      .update({
        client_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) {
      console.error('[clientStatus] update failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[clientStatus] update threw:', e?.message);
    return false;
  }
};

// Read-only suggestion of where this trainee SHOULD sit based on
// activity signals. Doesn't write anything — meant for a future
// nightly job or a "sync status" admin button.
//
// Heuristic
//   • Stay on onboarding if that's the current status — wizard owns it.
//   • active  — has at least one client_services row that's active
//               with remaining sessions, OR has a session in the
//               last 30 days.
//   • casual  — everything else (default fallback).
//   • suspended / former — never auto-suggested; those are human
//               decisions and we won't override them silently.
export const evaluateAutomaticStatus = async (userId) => {
  if (!userId) return null;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('client_status')
      .eq('id', userId)
      .maybeSingle();
    if (!user) return null;
    if (user.client_status === 'onboarding') return 'onboarding';
    if (user.client_status === 'suspended' || user.client_status === 'former') {
      return user.client_status;
    }

    const { data: pkgs } = await supabase
      .from('client_services')
      .select('id, status, remaining_sessions, total_sessions, used_sessions')
      .eq('trainee_id', userId)
      .neq('status', 'deleted');
    const hasActivePkg = (pkgs || []).some((p) => {
      const statusOk = p.status === 'active' || p.status === 'פעיל';
      const remaining = Number(
        p.remaining_sessions != null
          ? p.remaining_sessions
          : (Number(p.total_sessions || 0) - Number(p.used_sessions || 0))
      );
      return statusOk && remaining > 0;
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const { data: recentSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('trainee_id', userId)
      .gte('date', thirtyDaysAgo)
      .neq('status', 'deleted')
      .limit(1);
    const hasRecentActivity = (recentSessions || []).length > 0;

    if (hasActivePkg || hasRecentActivity) return 'active';
    return 'casual';
  } catch (e) {
    console.warn('[clientStatus] evaluate threw:', e?.message);
    return null;
  }
};
