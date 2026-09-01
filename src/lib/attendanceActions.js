/**
 * attendanceActions — THE canonical attendance writers.
 *
 * Step 1 of this task found four different places that write attendance.
 * Exactly two survive as writers, and both now live here:
 *
 *   saveGroupAttendance()  — group sessions. The body lifted out of
 *                            components/groups/FastAttendanceDialog.jsx.
 *   setSessionStatus()     — single sessions. The body lifted out of
 *                            pages/Sessions.jsx handleSessionStatusChange.
 *
 * Both original call sites now import from here, and so does the new
 * coach home screen. Behaviour is unchanged — this is a move, not a
 * rewrite. The other two paths (the inline markingGroupAttendance dialog
 * in Sessions.jsx and the orphaned UnifiedClientCard form) are left on
 * disk untouched and are called by nothing new.
 *
 * Nothing in this file knows a coach identity: every writer takes the
 * logged-in coach from its caller, which reads it from AuthContext.
 */

import { base44 } from '@/api/base44Client';
import { createNotification } from '@/lib/notify';
import { syncPackageStatus } from '@/lib/packageStatus';
import { invalidateDashboard, QUERY_KEYS } from '@/components/utils/queryKeys';
import { notifySessionCompleted } from '@/functions/notificationTriggers';
import {
  deductSessionFromService,
  restoreSessionToService,
  deductSessionFromAllParticipants,
  restoreSessionFromAllParticipants,
} from '@/components/hooks/useServiceDeduction';

/**
 * The status that means "this session happened". Writing this exact value
 * is what fires the package-deduction branch below — 'הושלם' does not, and
 * that asymmetry is pre-existing behaviour we are preserving, not fixing.
 */
export const SESSION_ATTENDED = 'התקיים';

/** Per-participant statuses, in the order the coach taps them. */
export const PARTICIPANT_STATUSES = ['הגיע', 'איחר', 'לא הגיע', 'ביטל'];

const lc = (v) => (v == null ? '' : String(v)).trim().toLowerCase();

/** A participant mark that means the trainee showed up. Both languages. */
export function isPresentStatus(status) {
  const v = lc(status);
  return v === 'הגיע' || v === 'attended' || v === 'present';
}

/** A session-level status that means the session already happened. */
export function isSessionDone(status) {
  const v = lc(status);
  return v === 'התקיים' || v === 'הושלם' || v === 'completed';
}

/** True once every participant has been given a real mark. */
export function isFullyMarked(session) {
  const list = Array.isArray(session?.participants) ? session.participants : [];
  if (list.length === 0) return isSessionDone(session?.status);
  return list.every((p) => p?.attendance_status && p.attendance_status !== 'ממתין');
}

// ─────────────────────────────────────────────────────────────────────────
// Group sessions
// ─────────────────────────────────────────────────────────────────────────

/**
 * saveGroupAttendance — create a group session with attendance already
 * marked, or update an existing scheduled one in place.
 *
 * Extracted verbatim from FastAttendanceDialog's createMutation.mutationFn
 * plus its onSuccess invalidations.
 *
 * @param {object|null} session  existing 'קבוצתי' row → UPDATE in place
 * @param {object|null} group    training_groups row   → CREATE a new row
 * @param {string} coachId       the logged-in coach, from AuthContext
 * @param {Array}  participants  [{ trainee_id, trainee_name, attendance_status }]
 * @param {object} queryClient   TanStack client, for cache invalidation
 */
export async function saveGroupAttendance({
  session = null,
  group = null,
  coachId,
  participants = [],
  date,
  time,
  location = 'סטודיו',
  notes = '',
  queryClient = null,
}) {
  const isEdit = !!session;

  // Any present marks the row 'התקיים' so it counts as a completed workout
  // in the trainee's surface.
  const anyPresent = participants.some((p) => p.attendance_status === 'הגיע');

  const result = isEdit
    ? await base44.entities.Session.update(session.id, {
        date,
        time,
        location,
        coach_notes: notes,
        participants,
        status: anyPresent ? SESSION_ATTENDED : (session.status || 'מתוכנן'),
      })
    : await base44.entities.Session.create({
        date,
        time,
        session_type: 'קבוצתי',
        location,
        coach_id: coachId,
        status: anyPresent ? SESSION_ATTENDED : 'מתוכנן',
        coach_notes: notes,
        participants,
        group_id: group?.id,
        group_name: group?.name,
      });

  invalidateGroupAttendance(queryClient, group?.id ?? session?.group_id ?? null);
  return result;
}

/**
 * createGroupSession — schedule a group session for a whole roster,
 * with every member seeded as 'ממתין'.
 *
 * Extracted from Sessions.jsx createGroupSessionMutation.mutationFn.
 * Sessions.jsx now calls this, and so does the /pro group work screen
 * when it needs today's session before attendance can be written.
 *
 * group_id + group_name are written here because the existing display
 * depends on them (the sessions list filters on s.group_id; the
 * attendance dialog header shows session.group_name).
 *
 * @param {object} group    training_groups row
 * @param {Array}  members  training_group_members rows for that group
 * @param {object} form     { date, time, location, notes }
 * @param {string} coachId  the logged-in coach, from AuthContext
 */
export async function createGroupSession({ group, members = [], form = {}, coachId }) {
  const participants = members.map((m) => ({
    trainee_id: m.trainee_id,
    trainee_name: m.trainee_name,
    attendance_status: 'ממתין',
  }));
  return base44.entities.Session.create({
    date: form.date,
    time: form.time,
    session_type: 'קבוצתי',
    location: form.location,
    coach_id: coachId,
    status: 'מתוכנן',
    coach_notes: form.notes,
    participants,
    group_id: group.id,
    group_name: group.name,
  });
}

export function invalidateGroupAttendance(queryClient, activeGroupId) {
  if (!queryClient) return;
  queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
  queryClient.invalidateQueries({ queryKey: ['sessions'] });
  queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
  queryClient.invalidateQueries({ queryKey: ['trainee-home'] });
  // FastAttendanceDialog's own weekly-quota / eligibility history query.
  queryClient.invalidateQueries({ queryKey: ['group-session-history', activeGroupId] });
}

/**
 * markGroupSessionAllPresent — the one-tap form used by the coach home
 * screen. Defaults every unmarked member of an ALREADY-SCHEDULED group
 * session to 'הגיע' and routes the write through saveGroupAttendance, so
 * there is still exactly one group writer.
 */
export async function markGroupSessionAllPresent({ session, coachId, queryClient }) {
  const participants = (session?.participants || []).map((p) => ({
    ...p,
    attendance_status:
      p?.attendance_status && p.attendance_status !== 'ממתין' ? p.attendance_status : 'הגיע',
  }));
  return saveGroupAttendance({
    session,
    coachId,
    participants,
    date: session?.date,
    time: session?.time,
    location: session?.location || 'סטודיו',
    notes: session?.coach_notes || '',
    queryClient,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Single sessions
// ─────────────────────────────────────────────────────────────────────────

/**
 * setSessionStatus — change a session's status and run every side effect
 * that hangs off it: trainee notification, attendance logs, package
 * deduction on completion, and credit restoration on un-completion.
 *
 * Extracted verbatim from Sessions.jsx handleSessionStatusChange, minus the
 * payment-override interception at the top: that opens a dialog, so it is
 * UI and stays at the call site. Sessions.jsx still performs its
 * requiresPayment() check before calling in, exactly as before.
 *
 * @param {object}   session
 * @param {string}   newStatus
 * @param {object}   coach        the logged-in coach from AuthContext
 * @param {Function} updateSession async (id, data) => void. Injected so the
 *                   Sessions page can keep using its own mutation (with the
 *                   toasts and dialog resets it already has) while other
 *                   callers pass a plain write.
 * @param {Array}    trainees     optional cache for the attendance log lookup
 * @param {object}   queryClient
 * @returns {{ deducted: boolean, restored: boolean }}
 */
export async function setSessionStatus({
  session,
  newStatus,
  coach,
  updateSession,
  trainees = [],
  queryClient = null,
}) {
  const write = typeof updateSession === 'function'
    ? updateSession
    : (id, data) => base44.entities.Session.update(id, data);

  // 1. Update session status
  await write(session.id, { status: newStatus });

  // Best-effort trainee notification so changes surface on the trainee's
  // notification feed without polling. Failure here doesn't undo the
  // status change above.
  if (session.trainee_id) {
    try {
      const dateLabel = session.date ? new Date(session.date).toLocaleDateString('he-IL') : '';
      await createNotification({
        userId: session.trainee_id,
        type: 'session_status_changed',
        message: `הסטטוס של המפגש ב-${dateLabel} שונה ל-${newStatus}`,
      });
    } catch (e) {
      console.warn('[attendanceActions] status-change trainee notif failed:', e?.message);
    }
  }

  // 2. Handle automatic logic (deduction / restoration).
  if (newStatus === SESSION_ATTENDED) {
    for (const participant of session.participants || []) {
      // Skip if already marked as attended to avoid double deduction.
      if (isPresentStatus(participant.attendance_status)) continue;

      await logAttendanceForParticipant({
        participantId: participant.trainee_id,
        session,
        status: 'attended',
        coach,
        trainees,
      });

      // Deduct credit ONLY for personal training.
      if (session.session_type === 'אישי') {
        try {
          const activeServices = await base44.entities.ClientService.filter({
            trainee_id: participant.trainee_id, status: 'פעיל', coach_id: coach?.id,
          });
          const personalService = activeServices.find(
            (s) => s.service_type === 'אימונים אישיים' || s.service_type.includes('אישי'),
          );
          if (personalService) {
            await base44.entities.ClientService.update(personalService.id, {
              used_sessions: (personalService.used_sessions || 0) + 1,
            });
            await syncPackageStatus(personalService.id);
          }
        } catch (error) {
          console.error('Error deducting session for mass update', error);
        }
      }
    }

    // Service-based deduction (if session linked to a package).
    if (session.service_id) await deductSessionFromService(session, coach?.id);
    // Additional participants — each deducts against their own package.
    await deductSessionFromAllParticipants(session, coach?.id);

    for (const participant of session.participants || []) {
      if (participant.trainee_id) {
        try {
          await notifySessionCompleted({
            traineeId: participant.trainee_id,
            sessionDate: session.date,
            sessionType: session.session_type || 'אימון',
            coachName: coach?.full_name || 'המאמן',
          });
        } catch {}
      }
    }

    invalidateAfterAttendance(queryClient, { notifications: true });
    return { deducted: true, restored: false };
  }

  if (isSessionDone(session.status) && newStatus !== SESSION_ATTENDED) {
    for (const participant of session.participants || []) {
      // Only restore if they were marked as attended.
      if (!isPresentStatus(participant.attendance_status)) continue;
      if (session.session_type !== 'אישי') continue;
      try {
        const activeServices = await base44.entities.ClientService.filter({
          trainee_id: participant.trainee_id, status: 'פעיל', coach_id: coach?.id,
        });
        const personalService = activeServices.find(
          (s) => s.service_type === 'אימונים אישיים' || s.service_type.includes('אישי'),
        );
        if (personalService) {
          await base44.entities.ClientService.update(personalService.id, {
            used_sessions: Math.max(0, (personalService.used_sessions || 0) - 1),
          });
          await syncPackageStatus(personalService.id);
        }
      } catch (error) {
        console.error('Error restoring session for mass update', error);
      }
    }

    if (session.service_id) await restoreSessionToService(session, coach?.id);
    await restoreSessionFromAllParticipants(session, coach?.id);

    invalidateAfterAttendance(queryClient);
    return { deducted: false, restored: true };
  }

  return { deducted: false, restored: false };
}

export function invalidateAfterAttendance(queryClient, { notifications = false } = {}) {
  if (!queryClient) return;
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
  // Trainee profile package tab reads its own key.
  queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
  invalidateDashboard(queryClient);
  if (notifications) queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

/**
 * logAttendanceForParticipant — writes the attendance_log row.
 * Lifted from Sessions.jsx; the `trainees` array is an optional in-memory
 * cache so the common case costs no extra round trip.
 */
export async function logAttendanceForParticipant({
  participantId, session, status, coach, trainees = [], notes = '',
}) {
  try {
    let userDetails = (trainees || []).find((t) => t.id === participantId) || null;

    if (!userDetails) {
      try {
        const users = await base44.entities.User.filter({ id: participantId });
        if (users.length > 0) {
          userDetails = users[0];
        } else {
          const leads = await base44.entities.Lead.filter({ id: participantId });
          if (leads.length > 0) userDetails = leads[0];
        }
      } catch (e) {
        console.error('Error fetching user for log', e);
      }
    }

    if (!userDetails) return;

    await base44.entities.AttendanceLog.create({
      userId: participantId,
      fullName: userDetails.full_name,
      dob: userDetails.birth_date
        ? new Date(userDetails.birth_date).toISOString().split('T')[0]
        : null,
      age: userDetails.age || 0,
      parentName: userDetails.parent_name || null,
      serviceType: session.session_type,
      sessionId: session.id,
      location: session.location,
      time: session.time,
      date: session.date,
      trainerId: coach?.id,
      status,
      notes,
      isTemp: !!userDetails.parent_name,
    });
  } catch (err) {
    console.error('Error creating attendance log', err);
  }
}
