-- In-app feedback inbox.
-- Captured from a global "נתקלת בבעיה? כתוב לנו" button visible to
-- every authenticated user. Admin (ATHLETIGO_ADMIN_UUID) triages
-- through a dedicated /feedback page.
--
-- Additive + idempotent: re-running is a no-op.
--   category — 'bug' | 'improvement' | 'other'
--   status   — 'new' | 'read' | 'done' (admin triage)
--   screen   — captured automatically (location.pathname)
--   user_id / user_name / user_role — captured from the auth context
--                                       at submit time

CREATE TABLE IF NOT EXISTS app_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,
  user_name  text,
  user_role  text,
  category   text,
  message    text NOT NULL,
  screen     text,
  status     text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_feedback_status_idx
  ON app_feedback (status);
CREATE INDEX IF NOT EXISTS app_feedback_created_at_idx
  ON app_feedback (created_at DESC);

-- RLS posture matches the rest of the project (notifications,
-- training_groups, etc.): permissive — any authenticated user may
-- insert, any authenticated user may read. The admin UI gates
-- visibility at the route level (ATHLETIGO_ADMIN_UUID); RLS is left
-- open so the column-retry budget in base44Client doesn't trip on a
-- RLS WITH CHECK error that the user can't act on.
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_feedback_insert_authenticated" ON app_feedback;
CREATE POLICY "app_feedback_insert_authenticated"
  ON app_feedback FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_feedback_select_authenticated" ON app_feedback;
CREATE POLICY "app_feedback_select_authenticated"
  ON app_feedback FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "app_feedback_update_authenticated" ON app_feedback;
CREATE POLICY "app_feedback_update_authenticated"
  ON app_feedback FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
