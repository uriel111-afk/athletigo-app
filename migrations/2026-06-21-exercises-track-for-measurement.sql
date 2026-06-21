-- Per-exercise "track for measurement" flag.
--
-- When true, this exercise is flagged as one whose results should be
-- tracked as a measurement / progress metric over time (surfaced in
-- the progress graphs / records). Default false so every existing
-- exercise keeps current behavior and is opt-in only.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS track_for_measurement BOOLEAN DEFAULT false;
