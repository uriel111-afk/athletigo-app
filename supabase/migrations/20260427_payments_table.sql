-- ═══════════════════════════════════════════════════════════════════
-- Payments — audit log for every Meshulam/Grow checkout
-- ═══════════════════════════════════════════════════════════════════
-- Each row is one checkout attempt. payment-create inserts as
-- 'pending'; payment-webhook flips to 'completed' / 'failed' /
-- 'cancelled' depending on the Grow callback.
--
-- session_id links back to the session being paid for, so the
-- webhook can flip sessions.payment_status='paid' atomically.
--
-- Safe to re-run — IF NOT EXISTS on every statement.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- coach who owns the row (RLS); = the coach the trainee belongs to
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trainee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  amount DECIMAL NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  -- Meshulam process identifiers — process_id comes back from
  -- createPaymentProcess; transaction_id arrives in the webhook.
  process_id TEXT,
  transaction_id TEXT,
  payment_type TEXT,
  raw_callback JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_user
  ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_session
  ON payments (session_id);
CREATE INDEX IF NOT EXISTS idx_payments_process_id
  ON payments (process_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Coach can read + manage their own payment rows.
DROP POLICY IF EXISTS "coach_manage_payments" ON payments;
CREATE POLICY "coach_manage_payments" ON payments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trainee can read their own payments (e.g. to show "שולם ✓" badge).
DROP POLICY IF EXISTS "trainee_view_own_payments" ON payments;
CREATE POLICY "trainee_view_own_payments" ON payments
  FOR SELECT
  USING (auth.uid() = trainee_id);
