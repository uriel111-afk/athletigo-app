import { supabase } from '@/lib/supabaseClient';

export const PACKAGE_STATUS = {
  active: "פעיל",
  frozen: "מושהה",
  completed: "הסתיים",
  ended: "הסתיים",
  cancelled: "בוטל",
};

const ACTIVE_STATUSES = ['active', 'פעיל'];
const COMPLETED_STATUSES = ['completed', 'הסתיים'];

function flipToCompleted(currentStatus) {
  return currentStatus === 'פעיל' ? 'הסתיים' : 'completed';
}
function flipToActive(currentStatus) {
  return currentStatus === 'הסתיים' ? 'פעיל' : 'active';
}

// Called after any change to a package's used_sessions. Flips the
// package status between active ↔ completed based on usage, then
// syncs users.status on the trainee.
export async function syncPackageStatus(packageId) {
  if (!packageId) return;

  const { data: pkg, error } = await supabase
    .from('client_services')
    .select('id, trainee_id, status, total_sessions, used_sessions')
    .eq('id', packageId)
    .single();

  if (error || !pkg) return;

  const total = pkg.total_sessions ?? 0;
  const used = pkg.used_sessions ?? 0;
  const pkgIsActive = ACTIVE_STATUSES.includes(pkg.status);
  const pkgIsCompleted = COMPLETED_STATUSES.includes(pkg.status);

  if (total > 0 && used >= total && pkgIsActive) {
    await supabase
      .from('client_services')
      .update({ status: flipToCompleted(pkg.status) })
      .eq('id', packageId);
  } else if (total > 0 && used < total && pkgIsCompleted) {
    await supabase
      .from('client_services')
      .update({ status: flipToActive(pkg.status) })
      .eq('id', packageId);
  }

  await syncTraineeUserStatus(pkg.trainee_id);
}

// users.status is English-only by existing convention.
export async function syncTraineeUserStatus(traineeId) {
  if (!traineeId) return;

  const { count } = await supabase
    .from('client_services')
    .select('*', { count: 'exact', head: true })
    .eq('trainee_id', traineeId)
    .in('status', ACTIVE_STATUSES);

  const newStatus = (count && count > 0) ? 'active' : 'inactive';

  await supabase
    .from('users')
    .update({ status: newStatus })
    .eq('id', traineeId);
}

/**
 * Sessions left on a package — THE single source of truth.
 *
 * Always computed as total_sessions - used_sessions. The stored
 * `sessions_remaining` column is deliberately NOT read here.
 *
 * Why (audit, 2026-09-01, 13 live rows): the two disagreed on 10 of the
 * 12 comparable rows. Scored against the session ledger — sessions
 * linked by service_id with a completed status — used_sessions matched
 * exactly 5 times and sessions_remaining once, and that once was a
 * package with zero linked sessions where both read 0. Total absolute
 * error was 12 for used_sessions against 42 for the stored column. Two
 * *completed* packages still claimed 12 and 8 remaining. The stored
 * column also errs in the unsafe direction: it under-counts what has
 * been consumed, so it shows credit that was already spent.
 *
 * The root cause is write asymmetry — 24 code paths write
 * used_sessions, only 11 also write sessions_remaining. Task 3 brought
 * those into sync, but this function no longer depends on that holding.
 *
 * A packageless / group row (total_sessions null) correctly yields 0;
 * group packages are time-based and deduct nothing.
 */
export function getRemainingSessions(pkg) {
  if (!pkg) return 0;
  return Math.max(0, (Number(pkg.total_sessions) || 0) - (Number(pkg.used_sessions) || 0));
}

/**
 * The value to write into the stored `sessions_remaining` column
 * alongside any used_sessions write, so the two can never diverge again.
 * Same arithmetic as getRemainingSessions, expressed over raw numbers.
 *
 * Returns null when there is no session count at all (group packages),
 * matching what PackageFormDialog already writes for that case.
 */
export function remainingFor(totalSessions, usedSessions) {
  const total = Number(totalSessions);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, total - (Number(usedSessions) || 0));
}

/** Session statuses that mean the session actually happened. Both languages. */
const DONE_SESSION_STATUSES = ['הושלם', 'התקיים', 'completed', 'present', 'הגיע'];

export function isDoneSessionStatus(value) {
  return DONE_SESSION_STATUSES.includes(String(value ?? '').trim().toLowerCase())
    || DONE_SESSION_STATUSES.includes(String(value ?? '').trim());
}

/**
 * sessionOrdinalLabel — "מפגש 7 מתוך 12".
 *
 * Computed at read time; nothing is stored and no column is added. The
 * ordinal is this session's 1-based position among the COMPLETED sessions
 * sharing its service_id, ordered by date ascending (time breaks ties).
 * The denominator is total_sessions on the package.
 *
 * Returns null — render nothing, never guess — when the session has no
 * service_id, when the package is unknown or has no total_sessions
 * (group packages are time-based), or when this session is not itself
 * completed and so has no position in that order.
 *
 * @param {object} session   the session being rendered
 * @param {Array}  sessions  candidate sessions (any superset; filtered here)
 * @param {object} pkg       the client_services row for session.service_id
 */
export function sessionOrdinalLabel(session, sessions, pkg) {
  if (!session?.service_id || !pkg) return null;
  const total = Number(pkg.total_sessions) || 0;
  if (total <= 0) return null;
  if (!isDoneSessionStatus(session.status)) return null;

  const siblings = (sessions || [])
    .filter((s) => s?.service_id === session.service_id
      && s.status !== 'deleted'
      && isDoneSessionStatus(s.status))
    .sort((a, b) => {
      const d = String(a.date || '').localeCompare(String(b.date || ''));
      return d !== 0 ? d : String(a.time || '').localeCompare(String(b.time || ''));
    });

  const idx = siblings.findIndex((s) => s.id === session.id);
  if (idx < 0) return null;
  return `מפגש ${idx + 1} מתוך ${total}`;
}

export function isActive(status) {
  return status === 'פעיל' || status === 'active';
}

export function getStatusLabel(status) {
  return PACKAGE_STATUS[status] || status;
}

export function getStatusColor(status) {
  const colors = {
    active: "#16a34a",
    "פעיל": "#16a34a",
    frozen: "#eab308",
    "מושהה": "#eab308",
    completed: "#6b7280",
    ended: "#6b7280",
    "הסתיים": "#6b7280",
    cancelled: "#ef4444",
    "בוטל": "#ef4444",
  };
  return colors[status] || "#6b7280";
}
