-- ═══════════════════════════════════════════════════════════════════
-- Storage buckets for Life OS receipts + general media
-- ═══════════════════════════════════════════════════════════════════
-- Creates the two buckets that SmartCamera.uploadToStorage targets:
--   - lifeos-files (primary)
--   - media        (fallback)
--
-- Both are PUBLIC (readable via public URL) with a 5MB per-object cap
-- and an image MIME allow-list. RLS policies on storage.objects grant
-- INSERT + UPDATE to authenticated users and SELECT to anyone.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create buckets (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('lifeos-files', 'lifeos-files', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]),
  ('media',        'media',        true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[])
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS policies on storage.objects
--    INSERT — authenticated users may upload to either bucket
DROP POLICY IF EXISTS "lifeos_files_authenticated_insert" ON storage.objects;
CREATE POLICY "lifeos_files_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lifeos-files');

DROP POLICY IF EXISTS "media_authenticated_insert" ON storage.objects;
CREATE POLICY "media_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');

--    UPDATE — required because SmartCamera uploads with { upsert: true }
DROP POLICY IF EXISTS "lifeos_files_authenticated_update" ON storage.objects;
CREATE POLICY "lifeos_files_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'lifeos-files');

DROP POLICY IF EXISTS "media_authenticated_update" ON storage.objects;
CREATE POLICY "media_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media');

--    SELECT — anyone can read (matches the public=true flag)
DROP POLICY IF EXISTS "lifeos_files_public_read" ON storage.objects;
CREATE POLICY "lifeos_files_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'lifeos-files');

DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'media');

--    DELETE — only the row owner can delete (so users can remove their
--    own uploaded receipts). Uses storage.objects.owner = auth.uid().
DROP POLICY IF EXISTS "lifeos_files_owner_delete" ON storage.objects;
CREATE POLICY "lifeos_files_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'lifeos-files' AND owner = auth.uid());

DROP POLICY IF EXISTS "media_owner_delete" ON storage.objects;
CREATE POLICY "media_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'media' AND owner = auth.uid());
