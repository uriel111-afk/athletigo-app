-- ═══════════════════════════════════════════════════════════════════
-- trainee_permissions — per-trainee feature toggles set by the coach
-- ═══════════════════════════════════════════════════════════════════
-- Each row stores the visibility/action permissions a coach has
-- granted to a single trainee. UPSERT on (coach_id, trainee_id) so
-- saving the same row twice updates instead of duplicating.
--
-- Defaults: every column starts at TRUE so existing trainees aren't
-- silently locked out of features after this table is added. The
-- coach explicitly disables what they want hidden.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trainee_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trainee_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  view_baseline   BOOLEAN NOT NULL DEFAULT TRUE,
  view_plan       BOOLEAN NOT NULL DEFAULT TRUE,
  view_progress   BOOLEAN NOT NULL DEFAULT TRUE,
  view_documents  BOOLEAN NOT NULL DEFAULT TRUE,
  edit_metrics    BOOLEAN NOT NULL DEFAULT TRUE,
  send_videos     BOOLEAN NOT NULL DEFAULT TRUE,
  send_messages   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trainee_permissions_unique_pair UNIQUE (coach_id, trainee_id)
);

CREATE INDEX IF NOT EXISTS trainee_permissions_coach_idx
  ON public.trainee_permissions (coach_id);
CREATE INDEX IF NOT EXISTS trainee_permissions_trainee_idx
  ON public.trainee_permissions (trainee_id);

-- ─── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.trainee_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trainee_permissions_coach_all ON public.trainee_permissions;
CREATE POLICY trainee_permissions_coach_all
  ON public.trainee_permissions
  FOR ALL
  USING  (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

DROP POLICY IF EXISTS trainee_permissions_trainee_read ON public.trainee_permissions;
CREATE POLICY trainee_permissions_trainee_read
  ON public.trainee_permissions
  FOR SELECT
  USING (auth.uid() = trainee_id);

-- ─── updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_trainee_permissions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_trainee_permissions ON public.trainee_permissions;
CREATE TRIGGER trg_touch_trainee_permissions
  BEFORE UPDATE ON public.trainee_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_trainee_permissions();
