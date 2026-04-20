-- Casual trainees support
-- Uses existing users table with client_type = 'מתאמן מזדמן'
-- No separate table needed — casual trainees are regular users
-- without app access (auto-generated email, no real login)

-- Ensure client_type column exists on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_type text DEFAULT 'לקוח פעיל';

-- Index for finding casuals quickly
CREATE INDEX IF NOT EXISTS idx_users_client_type ON users (client_type) WHERE client_type = 'מתאמן מזדמן';

-- Ensure signed_documents can link to any user (already works via trainee_id)
-- No changes needed — casual trainees have a user row with trainee_id

-- Link for tracking conversion
ALTER TABLE users ADD COLUMN IF NOT EXISTS converted_from_casual boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS converted_at timestamptz;
