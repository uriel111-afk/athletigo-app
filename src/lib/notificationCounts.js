// ── Single source of truth for notification "unread" counting ──────
// Both the bell badge (NotificationBadge) and the notifications page
// (Notifications.jsx) import from here so their numbers can never
// diverge again. They already share the TanStack Query key
// ['notifications', userId]; this shares the PREDICATE too.
//
// UNREAD = not read (is_read false/null) AND not soft-deleted AND not
// already handled by the coach.

export function isUnread(n) {
  return !n?.is_read && n?.status !== 'deleted' && n?.status !== 'handled';
}

export function countUnread(rows) {
  return (rows || []).reduce((acc, n) => acc + (isUnread(n) ? 1 : 0), 0);
}

// Badge display cap — show the real magnitude up to 99, then "99+".
export const NOTIF_BADGE_CAP = 99;

export function formatBadge(count, cap = NOTIF_BADGE_CAP) {
  return count > cap ? `${cap}+` : String(count);
}
