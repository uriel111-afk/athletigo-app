// Field lists for the sessions table. Trainee-facing SELECTs
// must use SESSION_FIELDS_TRAINEE so coach_private_notes never
// reaches the wire on a trainee request — even if the row's
// RLS policy would otherwise allow it. Coach-facing surfaces
// can keep using '*' for simplicity.
export const SESSION_FIELDS_COACH = '*';
export const SESSION_FIELDS_TRAINEE =
  'id, coach_id, trainee_id, date, time, status, type, session_type, ' +
  'location, price, notes, payment_status, duration, ' +
  'service_id, package_name, completed_at, created_at, updated_at';

// Session-status helpers used by the completion-guard flow.
//
// requiresPayment(session)
//   Returns true when the coach pressing "הושלם" on this row should
//   first land in the override dialog. Three signals must align:
//     1. price > 0          — there's actual money on the table
//     2. NOT 'paid'         — the webhook hasn't already settled it
//     3. NOT 'override_no_payment' — the coach hasn't already
//        explicitly waived this row before
//
// isPaid(session)
//   Webhook landed → status === 'paid'. Used by badges + filters.
//
// wasOverridden(session)
//   The coach manually marked this row complete without collecting.
//   Renders the red "! ללא תשלום" badge so the financial state stays
//   visible at a glance.

export const requiresPayment = (session) =>
  Number(session?.price) > 0 &&
  session?.payment_status !== 'paid' &&
  session?.payment_status !== 'override_no_payment';

export const isPaid = (session) => session?.payment_status === 'paid';

export const wasOverridden = (session) =>
  session?.payment_status === 'override_no_payment';
