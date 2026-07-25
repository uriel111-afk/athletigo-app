-- ═══════════════════════════════════════════════════════════════════
-- Contacts consolidation — ONE contacts feature on personal_contacts
-- ═══════════════════════════════════════════════════════════════════
-- Two implementations wrote to this table with two different column
-- sets, because two different CREATE TABLE definitions exist in the repo
-- and both use "if not exists" (so whichever ran first won):
--
--   A) supabase/migrations/20260425_personal.sql  (the /personal/people
--      screen — KEPT):  name, category, phone, birthday,
--      contact_frequency, last_contact_date, photo_url, notes
--      + a personal_interactions log table.
--   B) migrations/2026-07-24-personal-contacts.sql (the FriendsContacts
--      card — REMOVED):  name, relation, last_contacted
--
-- This migration converges either live shape onto (A). It is ADDITIVE and
-- IDEMPOTENT: it only adds missing columns, creates the interactions
-- table if absent, and backfills (A) from (B) where (B) exists. It never
-- drops a column and never overwrites a non-null value, so it is safe to
-- run whichever definition is currently live and safe to re-run.
--
-- Run once, manually, on Supabase (SQL editor).
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Make sure the kept (fuller) shape exists ──────────────────
create table if not exists public.personal_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  name       text not null default '',
  created_at timestamptz not null default now()
);

alter table public.personal_contacts add column if not exists category          text default 'friend';
alter table public.personal_contacts add column if not exists phone             text;
alter table public.personal_contacts add column if not exists birthday          date;
alter table public.personal_contacts add column if not exists contact_frequency text default 'monthly';
alter table public.personal_contacts add column if not exists last_contact_date date;
alter table public.personal_contacts add column if not exists photo_url         text;
alter table public.personal_contacts add column if not exists notes             text;

create index if not exists personal_contacts_user_idx on public.personal_contacts(user_id);

-- ─── 2. The interaction log the kept screen writes ────────────────
create table if not exists public.personal_interactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  contact_id uuid references public.personal_contacts(id) on delete cascade,
  date       date not null default current_date,
  type       text default 'call',
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists personal_interactions_contact_idx on public.personal_interactions(contact_id);

-- ─── 3. Backfill the removed card's data into the kept columns ────
-- Guarded on the legacy columns actually existing, so this whole block is
-- a no-op when definition (A) is the live one (nothing was ever written
-- to relation/last_contacted in that case).
--   last_contacted → last_contact_date  (only where the target is null)
--   relation       → notes              (only where the target is empty;
--                                        shown in the contact's detail
--                                        dialog so nothing is hidden)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'personal_contacts' and column_name = 'last_contacted'
  ) then
    update public.personal_contacts
       set last_contact_date = last_contacted
     where last_contacted is not null and last_contact_date is null;
    raise notice 'backfilled last_contacted → last_contact_date';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'personal_contacts' and column_name = 'relation'
  ) then
    update public.personal_contacts
       set notes = relation
     where relation is not null and relation <> '' and coalesce(notes, '') = '';
    raise notice 'backfilled relation → notes';
  end if;
end $$;

-- NOTE: the legacy columns (relation, last_contacted) are deliberately
-- LEFT IN PLACE as a safety net — the app no longer reads or writes them
-- once this has run and been verified. Optional cleanup, only after
-- verifying the backfill above:
--   alter table public.personal_contacts drop column if exists relation;
--   alter table public.personal_contacts drop column if exists last_contacted;

-- ─── 4. RLS — owner-only on both tables ───────────────────────────
alter table public.personal_contacts     enable row level security;
alter table public.personal_interactions enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['personal_contacts', 'personal_interactions']) loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = t || '_owner'
    ) then
      execute format(
        'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t || '_owner', t);
    end if;
  end loop;
end $$;
