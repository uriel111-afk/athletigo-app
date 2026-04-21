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
