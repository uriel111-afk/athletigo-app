-- ═══════════════════════════════════════════════════════════════════
-- Personal contacts — a lightweight contact log for the אישי tab's
-- "חברים ומשפחה" domain. NOT a CRM (that's the leads table) and NOT a
-- focus_node, so it never appears in the habit matrix or the business map.
-- New table only; RLS auth.uid() = user_id. Safe to run once.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.personal_contacts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  name           text not null default '',
  relation       text,                             -- relationship / free note
  last_contacted date,                             -- optional
  created_at     timestamptz not null default now()
);

create index if not exists personal_contacts_user_idx on public.personal_contacts(user_id);

alter table public.personal_contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'personal_contacts' and policyname = 'personal_contacts_owner'
  ) then
    create policy personal_contacts_owner on public.personal_contacts
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
