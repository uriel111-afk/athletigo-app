-- training_groups: add optional columns the comprehensive create-group
-- dialog (src/components/groups/CreateGroupDialog.jsx) wires up.
-- Additive + idempotent — every column is nullable and guarded by
-- IF NOT EXISTS so a re-run is a no-op.
--
-- After running this in the Supabase SQL editor, the dialog stores:
--   location_name      — studio / venue label
--   location_address   — free-text address
--   contact_name       — person to contact at the venue
--   contact_phone      — direct phone (tel)
--   contact_role       — 'בעלים' / 'אחראי משמרת' / etc.
--   active_days        — JSONB array of weekday keys ["sun","tue",…]
--   session_time       — HH:MM string
--   color              — hex (e.g. '#FF6F20') for the group's brand swatch
--   icon               — short icon name for the group avatar
--   notes              — free-form coach note
--
-- Nothing here drops or rewrites existing columns; the legacy app
-- continues to read the original (id, name, description, coach_id,
-- coach_name, created_at) without change.

ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS location_name    text;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS location_address text;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS contact_name     text;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS contact_phone    text;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS contact_role     text;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS active_days      jsonb;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS session_time     text;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS color            text;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS icon             text;
ALTER TABLE training_groups ADD COLUMN IF NOT EXISTS notes            text;
