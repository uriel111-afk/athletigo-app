-- ============================================================
-- AthletiGo — Services & Packages System Migration
-- Run this in Supabase SQL Editor BEFORE using the packages feature
-- ============================================================

-- 1. Sessions: link to package + deduction tracking
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS service_id uuid;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS was_deducted boolean DEFAULT false;

-- 2. Client Services: auto-deduct flag + unit type
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS auto_deduct_enabled boolean DEFAULT true;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS unit_type text DEFAULT 'sessions';

-- 3. Service Transactions: audit trail for balance changes
CREATE TABLE IF NOT EXISTS service_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id uuid,
  session_id uuid,
  action_type text NOT NULL,
  units_changed integer NOT NULL DEFAULT 0,
  previous_remaining integer,
  new_remaining integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_service ON service_transactions(service_id);
CREATE INDEX IF NOT EXISTS idx_transactions_session ON service_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_service_id ON sessions(service_id);
