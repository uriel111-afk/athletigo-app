-- Section-level tracking mode.
--
-- 'full'    — existing behavior. Trainee sees set-fill rows, status pill
--             derives from per-set toggles, completion popup (control/
--             challenge) fires when the section finishes.
-- 'display' — trainee sees the section as a read-only reference (warmup,
--             mobility, etc). No fill rows, no status math, no rating
--             popup. A single "סיימתי" button at the bottom marks the
--             section done.
--
-- Default 'full' so every existing row keeps current behavior.

ALTER TABLE training_sections
  ADD COLUMN IF NOT EXISTS tracking_mode TEXT DEFAULT 'full' NOT NULL;
