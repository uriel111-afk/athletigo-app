-- ============================================================
-- AthletiGo — Required Database Migration
-- Run this in Supabase SQL Editor (supabase.com → SQL Editor)
-- ============================================================

-- 1. client_services — 12 missing columns for service management
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS package_name text;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS billing_model text;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS sessions_per_week integer;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS base_price numeric;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS discount_type text;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS discount_value numeric;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS final_price numeric;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS next_billing_date date;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS notes_internal text;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS group_name text;

-- 2. users — client_type for paying vs casual distinction
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_type text;

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_leads_coach_id ON public.leads(coach_id);
CREATE INDEX IF NOT EXISTS idx_services_coach_id ON public.client_services(coach_id);
CREATE INDEX IF NOT EXISTS idx_sessions_coach_id ON public.sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_services_trainee_id ON public.client_services(trainee_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON public.sessions(date);
CREATE INDEX IF NOT EXISTS idx_plans_created_by ON public.training_plans(created_by);
