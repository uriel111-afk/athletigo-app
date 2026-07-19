-- ═══════════════════════════════════════════════════════════════════
-- Focus Map — cross-links between nodes (visual references only)
-- New table + RLS. Does NOT touch focus_nodes or any existing table.
-- Safe to run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.focus_node_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  from_node uuid not null references public.focus_nodes(id) on delete cascade,
  to_node   uuid not null references public.focus_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_node, to_node)
);

alter table public.focus_node_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'focus_node_links' and policyname = 'focus_node_links_owner'
  ) then
    create policy focus_node_links_owner on public.focus_node_links
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists focus_node_links_user_idx on public.focus_node_links(user_id);
create index if not exists focus_node_links_from_idx on public.focus_node_links(from_node);
create index if not exists focus_node_links_to_idx   on public.focus_node_links(to_node);
