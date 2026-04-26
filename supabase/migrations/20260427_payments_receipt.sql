-- ═══════════════════════════════════════════════════════════════════
-- Receipt URL on payments
-- ═══════════════════════════════════════════════════════════════════
-- Once payment-webhook receives a successful Meshulam/Grow callback,
-- it stores a publicly-shareable receipt URL alongside the row so
-- both the trainee and the coach can re-open it from the app.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;
