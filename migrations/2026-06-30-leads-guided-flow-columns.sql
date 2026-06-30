-- 2026-06-30 — Guided lead flow columns
--
-- The lifeos guided sales flow (src/components/lifeos/GuidedLeadFlow.jsx)
-- writes ~20 columns the classic `leads` table never had. base44's
-- create() only strips 6 unknown columns before throwing
-- "exhausted column-retry budget" — so on step 1 the very first save
-- failed and the "הבא" button never advanced past step 1.
--
-- This adds every column GuidedLeadFlow.buildPayload() / lifeos-api
-- can send. ADD COLUMN IF NOT EXISTS makes it safe to re-run and a
-- no-op for any column that already exists. No data is lost.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sports_experience    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS current_training     text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS fitness_goal         text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS fear_barrier         text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ladder_match         text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS yes_answers          jsonb   DEFAULT '[]'::jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS session_price        numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS package_sessions     integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS package_price        numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS offered_discount     boolean DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS discount_deadline    date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS objections           text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS close_result         text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS payment_method       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS payment_amount       numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS product_sold         text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS receipt_issued       boolean DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_status_detail   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS conversation_summary text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_follow_up       date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS content_sent         jsonb   DEFAULT '[]'::jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS interested_in        text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_contact_date    timestamptz;

-- Income-sync fields written by updateLead() when a lead converts.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS revenue_if_converted numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at         timestamptz;
