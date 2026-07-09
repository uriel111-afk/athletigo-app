-- 2026-07-09 — Wave 1: lead-intake upgrade columns
--
-- Adds the 9-step sales-wizard fields to `leads` plus a client-origin
-- marker on `users`. Purely additive (ADD COLUMN IF NOT EXISTS) — safe
-- to re-run, no data loss, never touches existing columns.
--
-- NOTE: several wizard fields reuse columns that already exist and are
-- NOT re-added here: objections, sports_experience, fitness_goal,
-- interested_in, conversation_summary, close_result, lead_status_detail,
-- next_follow_up, notes, source, age, phone, name.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS for_whom          text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trainee_name      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS why_now           text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS barrier_type      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS injuries          text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS injury_level      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS background_level  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_day       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_hour      text;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS client_origin     text;
-- client_origin values: 'system' | 'personal'
