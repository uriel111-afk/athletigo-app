import React, { useContext, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { isHiddenFromSelection } from '@/lib/clientStatusHelpers';
import { AuthContext } from '@/lib/AuthContext';
import { createPageUrl } from '@/utils';
import ProtectedCoachPage from '@/components/ProtectedCoachPage';
import PageSkeleton from '@/components/PageSkeleton';
import {
  TRACKS,
  TRACK_LABELS,
  buildTrackIndex,
  fetchTrackSources,
  filterByTrack,
  normalizeTrackValue,
  isActivePackageStatus,
} from '@/lib/trackHelpers';

/**
 * Pro — layer 2. The three service worlds as TABS on one screen.
 *
 * Tapping a tab never navigates into a sub-screen: it swaps the list
 * below while the tabs stay put. The url param is kept in sync so the
 * choice survives a refresh.
 *
 * Every one of the six rows points at a screen that already exists.
 * Nothing here rebuilds or reaches inside those screens.
 *
 * Coach identity comes from AuthContext and scopes every query. No coach
 * id is hardcoded in this file.
 */

const CREAM  = '#FFF9F0';
const ORANGE = '#FF6F20';
const INK    = '#3A2E24';
const SOFT   = '#8A7B6C';
const LINE   = '#EFE2CE';
const CARD   = '#FFFFFF';
const TOUCH  = 44;

// The Hebrew session_type values the Sessions screen already filters on
// via its ?type= query param.
const SESSION_TYPE_PARAM = {
  personal: 'אישי',
  group:    'קבוצתי',
  online:   'אונליין',
};

const isTrack = (v) => TRACKS.includes(v);

const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const isPaidStatus = (v) => {
  const s = (v == null ? '' : String(v)).trim().toLowerCase();
  return s === 'שולם' || s === 'paid';
};

const isOpenSession = (v) => {
  const s = (v == null ? '' : String(v)).trim().toLowerCase();
  return s === 'ממתין לאישור' || s === 'ממתין' || s === 'מתוכנן'
      || s === 'מאושר' || s === 'pending' || s === 'scheduled' || s === 'confirmed';
};

export default function Pro() {
  const navigate = useNavigate();
  const { track: trackParam } = useParams();
  const { user: coach } = useContext(AuthContext);
  const coachId = coach?.id || null;

  // Default track when none is given is the first one.
  const track = isTrack(trackParam) ? trackParam : TRACKS[0];

  // ── Roster ────────────────────────────────────────────────────────
  const { data: trainees = [], isLoading: rosterLoading } = useQuery({
    queryKey: ['pro-roster', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        // No users.avatar_url column exists — never select it.
        .select('id, full_name, phone, role, client_status, status, is_coach')
        .order('full_name');
      if (error) throw error;
      // account_deleted is NOT a column on users — selecting it 400s the
      // whole query. Archived/former trainees are excluded through the
      // app's existing client_status rule instead.
      return (data || []).filter(
        (u) => u.id !== coachId
          && u.role !== 'admin' && u.role !== 'coach' && u.is_coach !== true
          && !isHiddenFromSelection(u),
      );
    },
    staleTime: 60_000,
  });

  const traineeIds = useMemo(() => (trainees || []).map((t) => t.id), [trainees]);

  // ── Track sources: one round trip per table for the whole roster ──
  const { data: sources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['pro-track-sources', coachId, traineeIds.length],
    enabled: !!coachId && traineeIds.length > 0,
    queryFn: () => fetchTrackSources(supabase, coachId, traineeIds),
    staleTime: 60_000,
  });

  // ── Plans, for the תוכניות count. assigned_to is the trainee column
  //    on training_plans (there is no trainee_id there). ──────────────
  const { data: plans = [] } = useQuery({
    queryKey: ['pro-plans', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_plans')
        .select('id, assigned_to, status, is_template, coach_id, created_by')
        .or(`coach_id.eq.${coachId},created_by.eq.${coachId}`);
      if (error) {
        console.warn('[Pro] plans fetch failed:', error.message);
        return [];
      }
      return data || [];
    },
    staleTime: 60_000,
  });

  const trackIndex = useMemo(
    () => buildTrackIndex(traineeIds, sources || {}),
    [traineeIds, sources],
  );

  const inTrack = useMemo(
    () => filterByTrack(trainees, trackIndex, track),
    [trainees, trackIndex, track],
  );

  const inTrackIds = useMemo(() => new Set(inTrack.map((t) => t.id)), [inTrack]);

  // ── Live counts, all derived from real rows. A count that cannot be
  //    derived renders nothing rather than a fabricated number. ───────
  const counts = useMemo(() => {
    const packages = sources?.packages || [];
    const sessions = sources?.allSessions || [];
    const today = todayISO();

    const registration = inTrack.length;

    const openToday = sessions.filter(
      (s) => normalizeTrackValue(s.session_type) === track
        && s.date === today
        && s.status !== 'deleted'
        && isOpenSession(s.status),
    ).length;

    const duePayments = packages.filter(
      (p) => (normalizeTrackValue(p.service_type) || normalizeTrackValue(p.package_type) || 'personal') === track
        && isActivePackageStatus(p.status)
        && !isPaidStatus(p.payment_status),
    ).length;

    const activePlans = (plans || []).filter(
      (p) => p.assigned_to
        && inTrackIds.has(p.assigned_to)
        && p.status !== 'deleted'
        && !p.is_template,
    ).length;

    return { registration, openToday, duePayments, activePlans };
  }, [sources, plans, inTrack, inTrackIds, track]);

  const loading = rosterLoading || sourcesLoading;

  // ── The six rows. Order is fixed and identical for all three tabs. ─
  const rows = useMemo(() => [
    {
      key: 'registration',
      title: 'הרשמה',
      icon: '➕',
      // Live: how many trainees this track actually holds.
      desc: loading ? '' : `${counts.registration} מתאמנים בטראק`,
      to: `${createPageUrl('AllUsers')}?service=${track}`,
    },
    {
      key: 'attendance',
      title: 'נוכחות',
      icon: '✓',
      desc: loading ? '' : (counts.openToday > 0 ? `${counts.openToday} ממתינים לסימון היום` : 'אין מפגשים פתוחים היום'),
      // Sessions already reads ?type= and filters on session_type.
      to: `${createPageUrl('Sessions')}?type=${encodeURIComponent(SESSION_TYPE_PARAM[track])}`,
    },
    {
      key: 'payments',
      title: 'תשלומים',
      icon: '₪',
      desc: loading ? '' : (counts.duePayments > 0 ? `${counts.duePayments} חבילות ממתינות לתשלום` : 'אין חבילות פתוחות'),
      // Packages live in client_services and are opened from a trainee's
      // חבילות tab — the roster filtered to this track is that entry point.
      to: `${createPageUrl('AllUsers')}?service=${track}`,
    },
    {
      key: 'plans',
      title: 'תוכניות',
      icon: '📋',
      desc: loading ? '' : `${counts.activePlans} תוכניות פעילות`,
      to: createPageUrl('TrainingPlans'),
    },
    {
      key: 'metrics',
      title: 'מדדים',
      icon: '📐',
      // No coach-side screen aggregates measurements across a roster —
      // they are only reachable per-trainee, on the profile's מדידות tab.
      soon: true,
    },
    {
      key: 'achievements',
      title: 'הישגים',
      icon: '🏆',
      // Same as מדדים: records live only on a trainee's התקדמות tab.
      soon: true,
    },
  ], [counts, loading, track]);

  if (!coachId) {
    return <ProtectedCoachPage><PageSkeleton rows={5} /></ProtectedCoachPage>;
  }

  return (
    <ProtectedCoachPage>
      <div
        dir="rtl"
        style={{
          flex: 1,
          minHeight: 0,
          background: CREAM,
          fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
          color: INK,
          textAlign: 'right',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box', padding: '12px 16px 0' }}>

          {/* ── Row one: the three worlds, horizontal, RTL. Always
                visible; tapping one only swaps the list below. ─────── */}
          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
            {TRACKS.map((t) => {
              const active = t === track;
              return (
                <button
                  key={t}
                  type="button"
                  // replace:true — flipping tabs is not a history step, but
                  // the url still carries the choice across a refresh.
                  onClick={() => navigate(`/pro/${t}`, { replace: true })}
                  style={{
                    flex: 1,
                    minHeight: TOUCH + 4,
                    borderRadius: 12,
                    border: `1px solid ${active ? ORANGE : LINE}`,
                    background: active ? ORANGE : CARD,
                    color: active ? CREAM : INK,
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {TRACK_LABELS[t]}
                </button>
              );
            })}
          </div>

          {/* ── Row two onward: the same six rows for every tab. ───── */}
          <div style={{
            marginTop: 16,
            background: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            {rows.map((r, i) => {
              const disabled = !!r.soon;
              return (
                <button
                  key={r.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => { if (!disabled && r.to) navigate(r.to); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    boxSizing: 'border-box',
                    // Equal row heights, one line, always.
                    height: 60,
                    padding: '0 14px',
                    background: disabled ? '#FBF6EE' : CARD,
                    border: 'none',
                    borderTop: i === 0 ? 'none' : `1px solid ${LINE}`,
                    cursor: disabled ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  {/* icon → title → inline description, right to left. */}
                  <span style={{
                    flexShrink: 0,
                    width: 26,
                    fontSize: 18,
                    lineHeight: 1,
                    color: disabled ? SOFT : ORANGE,
                    opacity: disabled ? 0.45 : 1,
                  }}>
                    {r.icon}
                  </span>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: disabled ? SOFT : INK,
                  }}>
                    {r.title}
                  </span>
                  {/* Same line as the title, never at the far edge, and it
                      shrinks to an ellipsis before the row ever grows. */}
                  <span style={{
                    flexShrink: 1,
                    minWidth: 0,
                    fontSize: 13,
                    color: SOFT,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {disabled ? 'בקרוב' : r.desc}
                  </span>
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </ProtectedCoachPage>
  );
}
