-- ============================================================
-- AthletiGo — Packages System V2 Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Client Services — new columns for package types
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS package_type text;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS sessions_count integer;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS frequency_per_week integer;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS duration_months integer;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS expires_at date;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS payment_schedule jsonb;

-- 2. Service Payments — scheduled/partial payment tracking
CREATE TABLE IF NOT EXISTS service_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id uuid,
  amount numeric NOT NULL,
  payment_method text,
  status text DEFAULT 'pending',
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_service_id ON service_payments(service_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON service_payments(status);
