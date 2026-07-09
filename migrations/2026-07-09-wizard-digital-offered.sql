-- 2026-07-09 — Step-8 offer ladder: digital add-on flag.
-- 'yes' when the coordinator ticks "הוצעה הדרכה דיגיטלית".
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS digital_offered text;
