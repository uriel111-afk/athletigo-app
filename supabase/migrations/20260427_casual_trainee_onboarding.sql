-- ═══════════════════════════════════════════════════════════════════
-- Casual → Active trainee onboarding pipeline
-- ═══════════════════════════════════════════════════════════════════
-- Adds the schema for the "casual trainee → first session approval →
-- health declaration → confirmed session → welcome popup → active
-- client (after package sale)" flow.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Health declarations — signed Par-Q-style screening form
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Coach who owns the declaration (for RLS).
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The trainee the declaration belongs to.
  trainee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  birth_date DATE,
  -- 8 yes/no questions per spec.
  heart_disease         BOOLEAN DEFAULT false,
  blood_pressure        BOOLEAN DEFAULT false,
  joint_issues          BOOLEAN DEFAULT false,
  asthma                BOOLEAN DEFAULT false,
  medications           BOOLEAN DEFAULT false,
  medical_limitations   BOOLEAN DEFAULT false,
  recent_surgery        BOOLEAN DEFAULT false,
  feels_healthy         BOOLEAN DEFAULT true,
  additional_notes TEXT,
  -- Confirmation checkbox + signature image (data URL or storage url).
  declaration_confirmed BOOLEAN DEFAULT false,
  signature_url TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE health_declarations ENABLE ROW LEVEL SECURITY;

-- Coach can fully manage declarations they own (user_id = their auth uid).
DROP POLICY IF EXISTS "coach_manage_health" ON health_declarations;
CREATE POLICY "coach_manage_health" ON health_declarations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trainee can read + insert their own declaration.
DROP POLICY IF EXISTS "trainee_view_own_health" ON health_declarations;
CREATE POLICY "trainee_view_own_health" ON health_declarations
  FOR SELECT
  USING (auth.uid() = trainee_id);

DROP POLICY IF EXISTS "trainee_insert_own_health" ON health_declarations;
CREATE POLICY "trainee_insert_own_health" ON health_declarations
  FOR INSERT
  WITH CHECK (auth.uid() = trainee_id);

CREATE INDEX IF NOT EXISTS idx_health_declarations_trainee
  ON health_declarations (trainee_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 2. users.client_status — 'casual' | 'active' (and any legacy value)
-- ─────────────────────────────────────────────────────────────────
-- Per spec the default is 'casual'. This means *newly inserted* users
-- (e.g. via AddTraineeDialog) get 'casual' unless the form explicitly
-- writes 'active'. Existing rows that already hold a Hebrew client_status
-- ("לקוח פעיל" etc) are NOT touched — only NEW rows pick up the default.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS client_status TEXT DEFAULT 'casual';

-- ─────────────────────────────────────────────────────────────────
-- 3. sessions — pending approval gating + link to health declaration
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS requires_health_declaration BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS health_declaration_id UUID REFERENCES health_declarations(id);

CREATE INDEX IF NOT EXISTS idx_sessions_pending_approval
  ON sessions (trainee_id, status)
  WHERE status = 'pending_approval';
