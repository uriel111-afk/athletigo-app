-- ─────────────────────────────────────────────────────────────────────
-- Migration: exercise_executions table + scheduled_at on notifications
-- ─────────────────────────────────────────────────────────────────────
-- `exercise_executions` powers the trainee-side full-screen execution
-- screen (mastery 1–10, perceived difficulty 1–4, reflection, and
-- completed-sets count) and aggregates into the per-plan score badge
-- and bar chart on MyPlan.
--
-- `notifications.scheduled_at` gates the 48-hour coach follow-up sent
-- from notifyPlanCreated → schedulePlanFollowUp. Dashboard.jsx queries
-- rows where scheduled_at <= now() AND is_read = false.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exercise_executions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_id        UUID,
  exercise_id    UUID,
  exercise_name  TEXT,
  sets_completed INTEGER DEFAULT 0,
  mastery_rating INTEGER CHECK (mastery_rating BETWEEN 0 AND 10),
  difficulty     INTEGER CHECK (difficulty BETWEEN 0 AND 4),
  reflection     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_executions_trainee
  ON exercise_executions (trainee_id);
CREATE INDEX IF NOT EXISTS idx_exercise_executions_plan
  ON exercise_executions (plan_id);
CREATE INDEX IF NOT EXISTS idx_exercise_executions_created
  ON exercise_executions (created_at DESC);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_scheduled
  ON notifications (user_id, type, is_read, scheduled_at);
