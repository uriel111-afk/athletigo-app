-- Per-member weekly eligibility on training_group_members.
-- Additive + idempotent: every column is nullable and guarded by
-- IF NOT EXISTS so re-running is a no-op.
--
-- Semantics consumed by FastAttendanceDialog + the create/edit flows:
--   allowed_days  jsonb   — array of weekday keys (sun..sat) on which
--                            the member is entitled to attend. null /
--                            empty array = any day is allowed.
--   weekly_quota  integer — max sessions per ISO week. null = unlimited.
--   both null     → no restriction (the current behaviour for legacy
--                    rows — they keep working without any data change).
--   both set      → AND-combined: only on allowed_days AND up to
--                    weekly_quota per ISO week.
--
-- "Used this week" is derived at runtime from the existing sessions
-- table (filter on group_id + ISO week + participant attendance_status
-- counted by countsAsAttendance) — no new column needed for the count.

ALTER TABLE training_group_members ADD COLUMN IF NOT EXISTS allowed_days jsonb;
ALTER TABLE training_group_members ADD COLUMN IF NOT EXISTS weekly_quota integer;
