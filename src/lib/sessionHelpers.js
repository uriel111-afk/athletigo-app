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
