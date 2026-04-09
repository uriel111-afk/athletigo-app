-- Forms: digital signatures
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_declaration_signed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_declaration_signature text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cooperation_agreement_signed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cooperation_agreement_signature text;

-- Notifications: acknowledgment support
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS requires_acknowledgment boolean default false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- ResultsLog: baseline jump rope support
ALTER TABLE results_log ADD COLUMN IF NOT EXISTS record_type text;
ALTER TABLE results_log ADD COLUMN IF NOT EXISTS record_value numeric;
ALTER TABLE results_log ADD COLUMN IF NOT EXISTS baseline_data jsonb;
