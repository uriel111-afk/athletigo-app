// Role-aware home/dashboard path — the single place that decides where
// "back to dashboard" and the app-exit check land. Coordinator is
// parked on the leads screen; coach/admin on the dashboard; everyone
// else (trainee) on the trainee home.
export function homePathForUser(user) {
  const role = user?.role;
  if (role === 'coordinator') return '/lifeos/leads';
  if (role === 'coach' || role === 'admin' || user?.is_coach === true) return '/dashboard';
  return '/trainee-home';
}
