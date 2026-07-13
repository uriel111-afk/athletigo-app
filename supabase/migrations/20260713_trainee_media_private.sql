-- ═══════════════════════════════════════════════════════════════════
-- Privacy hardening #1 — trainee-media becomes a PRIVATE bucket
-- ═══════════════════════════════════════════════════════════════════
-- Before: bucket public=true + a role-less SELECT policy → anyone with
-- the URL (incl. anon) could view any trainee's progress photos/videos,
-- and ANY authenticated user could overwrite/delete any file.
--
-- After: bucket is private; objects are read via short-lived signed URLs
-- (the app now calls createSignedUrls at render time). Storage object
-- access is scoped by the FIRST path segment, which is always the
-- trainee_id (upload path = '<trainee_id>/<timestamp>-<rand>.<ext>',
-- see TraineeGallery.saveStaged):
--   • the trainee reads/writes their own folder, OR
--   • the linked coach (public.users.coach_id = auth.uid()) manages it.
-- This mirrors the row-level policy already on public.trainee_media.
--
-- Idempotent — safe to re-run. No data is moved; existing files keep
-- their paths and load through the new signed-URL render path.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Flip the bucket to private. getPublicUrl() links stop resolving;
--    the app renders signed URLs instead.
update storage.buckets
   set public = false
 where id = 'trainee-media';

-- 2) Replace the old permissive object policies with owner/coach-scoped
--    ones. The predicate is identical across all four verbs.
drop policy if exists trainee_media_obj_read   on storage.objects;
drop policy if exists trainee_media_obj_insert on storage.objects;
drop policy if exists trainee_media_obj_update on storage.objects;
drop policy if exists trainee_media_obj_delete on storage.objects;

-- Also drop the new names first so a re-run cleanly recreates them.
drop policy if exists trainee_media_read   on storage.objects;
drop policy if exists trainee_media_insert on storage.objects;
drop policy if exists trainee_media_update on storage.objects;
drop policy if exists trainee_media_delete on storage.objects;

-- SELECT — needed for createSignedUrl to succeed.
create policy trainee_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'trainee-media'
    and (
      ((storage.foldername(name))[1])::uuid = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = ((storage.foldername(name))[1])::uuid
          and u.coach_id = auth.uid()
      )
    )
  );

-- INSERT — trainee uploads to own folder, or coach to their trainee's.
create policy trainee_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trainee-media'
    and (
      ((storage.foldername(name))[1])::uuid = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = ((storage.foldername(name))[1])::uuid
          and u.coach_id = auth.uid()
      )
    )
  );

-- UPDATE
create policy trainee_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'trainee-media'
    and (
      ((storage.foldername(name))[1])::uuid = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = ((storage.foldername(name))[1])::uuid
          and u.coach_id = auth.uid()
      )
    )
  )
  with check (
    bucket_id = 'trainee-media'
    and (
      ((storage.foldername(name))[1])::uuid = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = ((storage.foldername(name))[1])::uuid
          and u.coach_id = auth.uid()
      )
    )
  );

-- DELETE
create policy trainee_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'trainee-media'
    and (
      ((storage.foldername(name))[1])::uuid = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = ((storage.foldername(name))[1])::uuid
          and u.coach_id = auth.uid()
      )
    )
  );

-- ── Pre-flight sanity check (run manually, optional) ───────────────
-- Any object whose first path segment is NOT a uuid would make the
-- ::uuid cast raise for that row. Uploads always use '<trainee_id>/…',
-- so this should return zero rows. If it doesn't, fix those paths first.
--   select name from storage.objects
--    where bucket_id = 'trainee-media'
--      and (storage.foldername(name))[1] !~
--          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
