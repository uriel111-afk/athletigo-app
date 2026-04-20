-- Normalize client_services.status to English values
-- Review before running in Supabase SQL Editor

UPDATE client_services SET status = 'active' WHERE status = 'פעיל';
UPDATE client_services SET status = 'frozen' WHERE status = 'מושהה';
UPDATE client_services SET status = 'completed' WHERE status = 'הסתיים';
UPDATE client_services SET status = 'cancelled' WHERE status = 'בוטל';
