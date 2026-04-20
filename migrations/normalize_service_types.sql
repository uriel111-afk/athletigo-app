-- Normalize client_services.service_type to English values
-- Review before running in Supabase SQL Editor

UPDATE client_services SET service_type = 'personal' WHERE service_type = 'אישי' OR service_type = 'אימונים אישיים';
UPDATE client_services SET service_type = 'online' WHERE service_type = 'אונליין' OR service_type = 'ליווי אונליין';
UPDATE client_services SET service_type = 'group' WHERE service_type = 'קבוצתי' OR service_type = 'פעילות קבוצתית';

-- Add deducted_from column to sessions if missing
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deducted_from_package_id uuid REFERENCES client_services(id) ON DELETE SET NULL;
