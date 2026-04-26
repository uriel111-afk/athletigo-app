-- ═══════════════════════════════════════════════════════════════════
-- Soft-delete column for sessions
-- ═══════════════════════════════════════════════════════════════════
-- Coaches now have two destructive actions on a session:
--   * Cancel  → status='cancelled', row stays visible with a gray badge
--                so the audit trail is preserved.
--   * Delete  → status='deleted', deleted_at=NOW(), row hidden from
--                every coach/trainee list. Still recoverable from DB.
--
-- Hard DELETE FROM sessions is never used.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at
  ON sessions (deleted_at)
  WHERE deleted_at IS NOT NULL;
