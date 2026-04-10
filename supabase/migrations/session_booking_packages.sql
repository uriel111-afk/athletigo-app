-- Session booking: approval flow and cancellation
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS requires_approval boolean default true;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancellation_deadline timestamptz;

-- Client services: package / card tracking
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS total_sessions integer;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS used_sessions integer default 0;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS remaining_sessions integer;

-- Auto-compute remaining_sessions view helper (optional trigger or computed)
-- remaining_sessions = total_sessions - used_sessions (updated by app logic)
