-- Baseline Jump Rope columns for measurements table
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS baseline_rounds integer;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS baseline_duration_seconds integer;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS baseline_round_results jsonb;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS baseline_total_jumps integer;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS baseline_total_misses integer;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS baseline_average_jumps numeric;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS baseline_average_misses numeric;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS baseline_jump_rate_per_second numeric;
