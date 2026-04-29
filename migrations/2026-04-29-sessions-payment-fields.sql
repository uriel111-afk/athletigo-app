-- Adds the columns the completion-guard flow needs on
-- public.sessions. Idempotent — safe to re-run; `ADD COLUMN IF
-- NOT EXISTS` no-ops on columns that already exist. Run in
-- Supabase SQL Editor.
--
-- Why these columns
--   • payment_status — single source of truth for "did this
--     session collect money": 'not_required' (free row), 'pending'
--     (price > 0, awaiting Grow), 'paid' (webhook landed), or
--     'override_no_payment' (coach manually flipped 'הושלם' on a
--     paid row that was never collected — e.g. coach gave the
--     session for free as a one-off).
--   • paid_at — populated by the payment-webhook on success so the
--     attendance tab can show the receipt timestamp.
--   • payment_override_reason — free-text why the coach pressed
--     "סמן הושלם בלי תשלום" on a paid session. Required by the
--     override dialog (textarea, must be > 5 chars).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_required';
COMMENT ON COLUMN public.sessions.payment_status IS
  'Values: not_required, pending, paid, refunded, override_no_payment';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS payment_override_reason TEXT;

-- Partial index — the only payment_status values worth scanning
-- frequently are 'pending' (cron / nudges) and 'paid' (financial
-- reports). 'not_required' / 'refunded' / 'override_no_payment'
-- live in the long tail and don't need their own index.
CREATE INDEX IF NOT EXISTS idx_sessions_payment_status
  ON public.sessions (payment_status)
  WHERE payment_status IN ('pending', 'paid');
