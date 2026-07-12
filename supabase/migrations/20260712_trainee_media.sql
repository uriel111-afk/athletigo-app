-- ═══════════════════════════════════════════════════════════════════
-- Trainee media gallery — visual progress documentation
-- ═══════════════════════════════════════════════════════════════════
-- Dedicated bucket + table (NOT lifeos_files) so each item carries a
-- caption, a skill tag, and an is_shareable flag (future marketing
-- share; no UI yet). RLS: a trainee owns their own rows; the linked
-- coach (users.coach_id) manages their trainees' rows.
--
-- Purely additive + idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Storage bucket — public read, 50MB cap, image + video mime types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trainee-media', 'trainee-media', true, 52428800,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime','video/3gpp'
  ]
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Table.
create table if not exists public.trainee_media (
  id           uuid primary key default gen_random_uuid(),
  trainee_id   uuid not null references public.users(id) on delete cascade,
  coach_id     uuid references public.users(id) on delete set null,
  file_url     text not null,
  media_type   text not null default 'image' check (media_type in ('image','video')),
  caption      text,
  skill_tag    text,
  is_shareable boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_trainee_media_trainee
  on public.trainee_media (trainee_id, created_at desc);
create index if not exists idx_trainee_media_skill
  on public.trainee_media (trainee_id, skill_tag);

-- 3) Row-level security.
alter table public.trainee_media enable row level security;

-- Trainee: full access to their own rows.
drop policy if exists trainee_media_owner_all on public.trainee_media;
create policy trainee_media_owner_all on public.trainee_media
  for all
  using (auth.uid() = trainee_id)
  with check (auth.uid() = trainee_id);

-- Coach: full access to rows they created OR rows of trainees linked to
-- them via users.coach_id (the multi-coach model).
drop policy if exists trainee_media_coach_all on public.trainee_media;
create policy trainee_media_coach_all on public.trainee_media
  for all
  using (
    auth.uid() = coach_id
    or exists (
      select 1 from public.users u
      where u.id = trainee_media.trainee_id and u.coach_id = auth.uid()
    )
  )
  with check (
    auth.uid() = coach_id
    or exists (
      select 1 from public.users u
      where u.id = trainee_media.trainee_id and u.coach_id = auth.uid()
    )
  );

-- 4) Storage object policies for the trainee-media bucket:
--    public read (getPublicUrl), authenticated write/delete.
drop policy if exists trainee_media_obj_read on storage.objects;
create policy trainee_media_obj_read on storage.objects
  for select using (bucket_id = 'trainee-media');

drop policy if exists trainee_media_obj_insert on storage.objects;
create policy trainee_media_obj_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'trainee-media');

drop policy if exists trainee_media_obj_update on storage.objects;
create policy trainee_media_obj_update on storage.objects
  for update to authenticated using (bucket_id = 'trainee-media');

drop policy if exists trainee_media_obj_delete on storage.objects;
create policy trainee_media_obj_delete on storage.objects
  for delete to authenticated using (bucket_id = 'trainee-media');
