import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { createPageUrl } from '@/utils';
import AddTraineeDialog from '@/components/forms/AddTraineeDialog';
import { requiresPayment } from '@/lib/sessionHelpers';
import { getRemainingSessions } from '@/lib/packageStatus';
import {
  getTrainedTracks,
  isActivePackageStatus,
  normalizeTrackValue,
} from '@/lib/trackHelpers';
import {
  createPersonalSession,
  setPersonalAttendance,
  findTodaySession,
  firstRow,
  isPresentStatus,
  isSessionDone,
} from '@/lib/attendanceActions';

/**
 * PersonalTrackBoard — the אישי track.
 *
 * Two of the six rows are WORK ROWS the coach uses daily: הרשמה opens
 * the personal roster in place, נוכחות opens one-tap attendance in
 * place. Neither navigates. The other four rows keep the navigation
 * behaviour Pro.jsx already gave them, untouched.
 *
 * Only one row is ever expanded at a time.
 *
 * Every attendance write goes through src/lib/attendanceActions.js —
 * the single writer — and package deduction is left entirely to the
 * existing deductSessionFromService / restoreSessionToService pair that
 * setSessionStatus already calls. Nothing here reimplements deduction,
 * and nothing bypasses it.
 *
 * Coach identity arrives as a prop, read from AuthContext by the parent.
 * No coach id is hardcoded here.
 */

const CREAM  = '#FFF9F0';
const ORANGE = '#FF6F20';
const INK    = '#3A2E24';
const SOFT   = '#8A7B6C';
const LINE   = '#EFE2CE';
const CARD   = '#FFFFFF';
const GREEN  = '#2E8B57';
const TOUCH  = 44;

const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const nowHHMM = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const isPaidStatus = (v) => {
  const s = (v == null ? '' : String(v)).trim().toLowerCase();
  return s === 'שולם' || s === 'paid';
};

const rowBase = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', boxSizing: 'border-box',
  background: 'transparent', border: 'none',
  fontFamily: 'inherit', textAlign: 'right',
  whiteSpace: 'nowrap', overflow: 'hidden',
};

export default function PersonalTrackBoard({ coach, trainees = [], sources, rows = [] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const coachId = coach?.id || null;

  // Only one row expanded at a time.
  const [openKey, setOpenKey] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showAddTrainee, setShowAddTrainee] = useState(false);
  // { trainee, packages } while the multi-package picker is open.
  const [pickerFor, setPickerFor] = useState(null);

  const packages = sources?.packages || [];
  const groupSessions = sources?.groupSessions || [];

  // ── Today's personal sessions, one round trip ──────────────────────
  const { data: todaySessions = [] } = useQuery({
    queryKey: ['personal-track-today', coachId, todayISO()],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, date, time, session_type, status, location, coach_notes, participants, trainee_id, trainee_name, service_id, was_deducted, price, is_paid, payment_status')
        .eq('coach_id', coachId)
        .eq('date', todayISO());
      if (error) throw error;
      return (data || []).filter(
        (s) => normalizeTrackValue(s.session_type) === 'personal' && s.status !== 'deleted',
      );
    },
    staleTime: 15_000,
  });

  // ── The personal roster, derived with getTrainedTracks ─────────────
  const roster = useMemo(() => (trainees || [])
    .filter((t) => getTrainedTracks(t.id, packages, groupSessions, sources?.subs).includes('personal'))
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'he')),
  [trainees, packages, groupSessions, sources]);

  /** Active packages per trainee, newest-looking first. */
  const activePackagesFor = useCallback((traineeId) => (packages || []).filter(
    (p) => p.trainee_id === traineeId
      && isActivePackageStatus(p.status)
      && (normalizeTrackValue(p.service_type) || normalizeTrackValue(p.package_type) || 'personal') === 'personal',
  ), [packages]);

  const sessionFor = useCallback(
    (traineeId) => findTodaySession(todaySessions, todayISO(), { traineeId }),
    [todaySessions],
  );

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['personal-track-today', coachId, todayISO()] }),
    [queryClient, coachId],
  );

  /**
   * Today's personal session for a trainee, created on demand.
   * Mirrors ensureTodaySession on the group board and goes through the
   * same shared findTodaySession / firstRow helpers.
   */
  const ensureTodaySession = useCallback(async (trainee, serviceId) => {
    const existing = sessionFor(trainee.id);
    if (existing) return existing;
    const created = await createPersonalSession({
      trainee,
      form: { date: todayISO(), time: nowHHMM(), location: 'סטודיו', notes: '' },
      coachId,
      serviceId: serviceId || null,
    });
    return firstRow(created);
  }, [sessionFor, coachId]);

  /** The write itself, once the package question is settled. */
  const writeAttendance = useCallback(async (trainee, serviceId) => {
    setBusyId(trainee.id);
    try {
      const session = await ensureTodaySession(trainee, serviceId);
      if (!session) throw new Error('לא ניתן ליצור מפגש להיום');

      // Unchanged guard: a paid-but-unpaid row still has to go through
      // the override dialog on the Sessions screen. Never bypassed.
      if (requiresPayment(session)) {
        toast.error('המפגש דורש הסדרת תשלום — פותח את מסך המפגשים');
        navigate(`${createPageUrl('Sessions')}?type=${encodeURIComponent('אישי')}`);
        return;
      }

      const participant = (session.participants || [])
        .find((p) => p?.trainee_id === trainee.id);
      const present = isPresentStatus(participant?.attendance_status) || isSessionDone(session.status);

      // Toggle. Deduction (or restoration) is automatic inside
      // setSessionStatus — the coach is never asked to confirm it.
      await setPersonalAttendance({
        session,
        traineeId: trainee.id,
        present: !present,
        coach,
        trainees,
        queryClient,
      });
      await refresh();
    } catch (e) {
      console.error('[PersonalTrackBoard] attendance write failed:', e);
      toast.error('❌ שמירת הנוכחות נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setBusyId(null);
    }
  }, [ensureTodaySession, navigate, coach, trainees, queryClient, refresh]);

  /**
   * Toggle entry point. Asks which package to deduct from ONLY when the
   * trainee has more than one active package and today's session does
   * not already name one. Zero or one active package never prompts.
   */
  const toggleTrainee = useCallback(async (trainee) => {
    if (busyId) return;
    const existing = sessionFor(trainee.id);
    // An existing session already carries its service_id, and un-marking
    // must restore from that same package — never re-ask.
    if (existing) { writeAttendance(trainee, existing.service_id); return; }

    const active = activePackagesFor(trainee.id);
    if (active.length > 1) { setPickerFor({ trainee, packages: active }); return; }
    writeAttendance(trainee, active[0]?.id || null);
  }, [busyId, sessionFor, activePackagesFor, writeAttendance]);

  const renderRoster = () => (
    <div style={{ background: '#FCFAF6', borderTop: `1px solid ${LINE}` }}>
      {roster.length === 0 ? (
        <div style={{ ...rowBase, height: 52, padding: '0 14px', fontSize: 13, color: SOFT }}>
          אין מתאמנים במסלול האישי
        </div>
      ) : roster.map((t, i) => {
        const active = activePackagesFor(t.id);
        const pkg = active[0] || null;
        const detail = pkg
          ? `${pkg.package_name || pkg.service_type || 'חבילה'} · ${getRemainingSessions(pkg)} נותרו`
          : 'אין חבילה פעילה';
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(`${createPageUrl('TraineeProfile')}?userId=${encodeURIComponent(t.id)}`)}
            style={{
              ...rowBase,
              height: 52,
              padding: '0 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${LINE}`,
              cursor: 'pointer',
            }}
          >
            <span style={{ flexShrink: 0, fontSize: 15, fontWeight: 600, color: INK }}>
              {t.full_name || 'מתאמן'}
            </span>
            {/* Inline, same line, ellipsis before the row ever grows. */}
            <span style={{
              flexShrink: 1, minWidth: 0, fontSize: 13, color: SOFT,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {detail}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => setShowAddTrainee(true)}
        style={{
          ...rowBase,
          height: 52,
          padding: '0 14px',
          borderTop: `1px solid ${LINE}`,
          cursor: 'pointer',
        }}
      >
        <span style={{ flexShrink: 0, width: 22, fontSize: 20, lineHeight: 1, color: ORANGE }}>+</span>
        <span style={{ flexShrink: 0, fontSize: 15, fontWeight: 700, color: INK }}>
          הוסף מתאמן
        </span>
      </button>
    </div>
  );

  const renderAttendance = () => (
    <div style={{ background: '#FCFAF6', borderTop: `1px solid ${LINE}` }}>
      {roster.length === 0 ? (
        <div style={{ ...rowBase, height: 52, padding: '0 14px', fontSize: 13, color: SOFT }}>
          אין מתאמנים במסלול האישי
        </div>
      ) : roster.map((t, i) => {
        const session = sessionFor(t.id);
        const participant = (session?.participants || [])
          .find((p) => p?.trainee_id === t.id);
        const present = isPresentStatus(participant?.attendance_status)
          || (!!session && isSessionDone(session.status));
        const busy = busyId === t.id;
        const active = activePackagesFor(t.id);
        const unpaid = active.some((p) => !isPaidStatus(p.payment_status));
        const note = active.length === 0
          ? 'אין חבילה'
          : (unpaid ? 'תשלום פתוח'
            : (active.length > 1 ? `${active.length} חבילות` : ''));

        return (
          <div
            key={t.id}
            style={{
              ...rowBase,
              height: 52,
              padding: '0 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${LINE}`,
            }}
          >
            {/* Round toggle at the row's RIGHT edge — the side that
                carries meaning in RTL. */}
            <button
              type="button"
              onClick={() => toggleTrainee(t)}
              disabled={!!busyId}
              aria-pressed={present}
              aria-label={present ? 'בטל נוכחות' : 'סמן נוכחות'}
              style={{
                flexShrink: 0,
                width: TOUCH, height: TOUCH,
                borderRadius: '50%',
                border: `1px solid ${present ? '#8FCB9B' : LINE}`,
                background: present ? GREEN : CARD,
                color: present ? '#FFFFFF' : SOFT,
                fontSize: 18, fontWeight: 700, lineHeight: 1,
                cursor: busyId ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              {busy ? '…' : '✓'}
            </button>
            <span style={{
              flexShrink: 1, minWidth: 0,
              fontSize: 15, fontWeight: 600,
              color: present ? SOFT : INK,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {t.full_name || 'מתאמן'}
            </span>
            {note && (
              <span style={{
                flexShrink: 0, fontSize: 12, color: SOFT,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {note}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div style={{
        marginTop: 16,
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {rows.map((r, i) => {
          // הרשמה and נוכחות expand in place. The other four keep the
          // navigation behaviour Pro.jsx defined for them.
          const expandable = r.key === 'registration' || r.key === 'attendance';
          const disabled = !!r.soon;
          const open = expandable && openKey === r.key;
          const desc = expandable
            ? (r.key === 'registration'
                ? `${roster.length} מתאמנים בטראק`
                : (r.desc || ''))
            : (disabled ? 'בקרוב' : r.desc);

          return (
            <div key={r.key} style={{ borderTop: i === 0 ? 'none' : `1px solid ${LINE}` }}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  if (expandable) setOpenKey(open ? null : r.key);
                  else if (r.to) navigate(r.to);
                }}
                style={{
                  ...rowBase,
                  height: 60,
                  padding: '0 14px',
                  background: open ? '#FDF6EC' : (disabled ? '#FBF6EE' : CARD),
                  cursor: disabled ? 'default' : 'pointer',
                }}
              >
                <span style={{
                  flexShrink: 0, width: 26, fontSize: 18, lineHeight: 1,
                  color: disabled ? SOFT : ORANGE, opacity: disabled ? 0.45 : 1,
                }}>
                  {r.icon}
                </span>
                <span style={{
                  flexShrink: 0, fontSize: 16, fontWeight: 700,
                  color: disabled ? SOFT : INK,
                }}>
                  {r.title}
                </span>
                <span style={{
                  flexShrink: 1, minWidth: 0, fontSize: 13, color: SOFT,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {desc}
                </span>
              </button>

              {open && r.key === 'registration' && renderRoster()}
              {open && r.key === 'attendance' && renderAttendance()}
            </div>
          );
        })}
      </div>

      {/* The existing add-trainee dialog — no new dialog was built. */}
      <AddTraineeDialog
        open={showAddTrainee}
        onClose={() => {
          setShowAddTrainee(false);
          queryClient.invalidateQueries({ queryKey: ['pro-roster', coachId] });
          queryClient.invalidateQueries({ queryKey: ['pro-track-sources', coachId] });
        }}
      />

      {/* Package picker — the ONE case the app cannot guess: more than
          one active package. Zero or one never reaches this. */}
      {pickerFor && (
        <div
          dir="rtl"
          onClick={() => setPickerFor(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(58,46,36,0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520,
              background: CREAM,
              borderTopLeftRadius: 16, borderTopRightRadius: 16,
              padding: '16px 16px calc(16px + env(safe-area-inset-bottom))',
              fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginBottom: 4 }}>
              מאיזו חבילה לקזז?
            </div>
            <div style={{ fontSize: 13, color: SOFT, marginBottom: 12 }}>
              {pickerFor.trainee.full_name} · {pickerFor.packages.length} חבילות פעילות
            </div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
              {pickerFor.packages.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    const t = pickerFor.trainee;
                    setPickerFor(null);
                    writeAttendance(t, p.id);
                  }}
                  style={{
                    ...rowBase,
                    height: 52,
                    padding: '0 14px',
                    borderTop: i === 0 ? 'none' : `1px solid ${LINE}`,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ flexShrink: 0, fontSize: 15, fontWeight: 600, color: INK }}>
                    {p.package_name || p.service_type || 'חבילה'}
                  </span>
                  <span style={{
                    flexShrink: 1, minWidth: 0, fontSize: 13, color: SOFT,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {getRemainingSessions(p)} נותרו
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPickerFor(null)}
              style={{
                width: '100%', minHeight: TOUCH, marginTop: 10,
                borderRadius: 12, border: `1px solid ${LINE}`,
                background: CARD, color: INK,
                fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </>
  );
}
