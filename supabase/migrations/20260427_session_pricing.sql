-- ═══════════════════════════════════════════════════════════════════
-- Session pricing + payment status
-- ═══════════════════════════════════════════════════════════════════
-- Coach can attach a price to any session. When the trainee opens
-- the session in /TraineeHome, an unpaid + priced session shows a
-- "שלם 💳" button that calls the payment-create Edge Function. On
-- a successful payment, the webhook flips payment_status='paid'
-- (and typically status='confirmed' as well).
--
-- Schema choices:
--   price          DECIMAL — null = free / no price set
--   payment_status TEXT    — 'unpaid' | 'pending' | 'paid' | 'refunded'
--                            null also tolerated; UI treats null as
--                            "free" when price is null.
--   payment_id     UUID    — joins to a payments row when the
--                            payment provider (Grow) returns a
--                            transaction id. Nullable, optional.
--
-- Safe to re-run — every column uses ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS price          DECIMAL,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS payment_id     UUID;

-- Index used by the trainee's "ממתין לתשלום" badge query and the
-- coach's payment-status filter on the sessions list.
CREATE INDEX IF NOT EXISTS idx_sessions_payment_status
  ON sessions (payment_status)
  WHERE payment_status IS NOT NULL;
