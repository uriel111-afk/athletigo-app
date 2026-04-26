-- BaselineFormDialog now persists the highest single-round value as
-- best_round on the baselines table, alongside total_jumps,
-- average_jumps, baseline_score. Used by the "שיא" stat cell in the
-- form's summary row + future "personal record" detection.
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS best_round INTEGER;
