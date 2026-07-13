-- ═══════════════════════════════════════════════════════════════════
-- Lead-intake tree schema — editable copy in the DB
-- ═══════════════════════════════════════════════════════════════════
-- The bundled default (src/lib/lifeos/intake-tree-schema.js) stays the
-- fallback; once an admin saves an edit, the active tree comes from here.
-- Append-version model: every save inserts a new row (version+1) so the
-- history is kept and "restore default" is just another version. The
-- app reads the highest version. Purely additive + idempotent.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.intake_schema (
  id         uuid primary key default gen_random_uuid(),
  schema     jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create index if not exists idx_intake_schema_version on public.intake_schema (version desc);

alter table public.intake_schema enable row level security;

-- Everyone authenticated can READ the active schema (the intake screen
-- needs it — coach AND coordinator capture leads).
drop policy if exists intake_schema_read on public.intake_schema;
create policy intake_schema_read on public.intake_schema
  for select to authenticated using (true);

-- Only a coach / admin may WRITE a new version (never a coordinator).
drop policy if exists intake_schema_write on public.intake_schema;
create policy intake_schema_write on public.intake_schema
  for insert to authenticated
  with check (exists (
    select 1 from public.users u
    where u.id = auth.uid() and (u.role = 'coach' or u.role = 'admin' or u.is_coach = true)
  ));
