-- ═══════════════════════════════════════════════════════════════════
-- Focus Map (מפת מיקוד) — mind map + list + calendar + today
-- New tables ONLY. RLS auth.uid() = user_id. Does NOT touch any
-- existing table (sessions/users/etc. are read-only from this feature).
-- Safe to run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── focus_nodes ──────────────────────────────────────────────────
create table if not exists public.focus_nodes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  parent_id      uuid references public.focus_nodes(id) on delete cascade,
  node_type      text not null default 'task',   -- 'root' | 'branch' | 'task'
  title          text not null default '',
  note           text,
  is_fear_task   boolean not null default false,
  priority       int not null default 0,          -- 0 רגיל, 1 דחוף, 2 קריטי
  tags           text[] not null default '{}',
  frequency      text,                             -- 'daily' | 'weekly' | 'monthly' | null
  day_of_week    int,                              -- 0..6 (0 = Sunday / ראשון)
  task_date      date,
  task_time      time,
  due_date       date,
  contact_name   text,
  metric_target  numeric,
  metric_current numeric default 0,
  metric_unit    text,
  cycle_start    date,
  cycle_end      date,
  pos_x          numeric,                          -- null = auto layout on the map
  pos_y          numeric,
  status         text not null default 'active',   -- 'active' | 'done' | 'parked'
  done_at        timestamptz,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists focus_nodes_user_idx      on public.focus_nodes(user_id);
create index if not exists focus_nodes_parent_idx    on public.focus_nodes(parent_id);
create index if not exists focus_nodes_user_status   on public.focus_nodes(user_id, status);

-- ─── focus_node_notes (the "מה מתרחש?" feed) ──────────────────────
create table if not exists public.focus_node_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  node_id     uuid not null references public.focus_nodes(id) on delete cascade,
  content     text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists focus_node_notes_node_idx on public.focus_node_notes(node_id);
create index if not exists focus_node_notes_user_idx on public.focus_node_notes(user_id);

-- ─── focus_task_logs (per-day completion for recurring tasks) ─────
create table if not exists public.focus_task_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  node_id       uuid not null references public.focus_nodes(id) on delete cascade,
  log_date      date not null,
  completed_at  timestamptz not null default now(),
  unique (node_id, log_date)
);
create index if not exists focus_task_logs_user_idx on public.focus_task_logs(user_id);
create index if not exists focus_task_logs_node_idx on public.focus_task_logs(node_id);

-- ─── idea_inbox (quick capture) ───────────────────────────────────
create table if not exists public.idea_inbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  content     text not null default '',
  status      text not null default 'inbox',       -- 'inbox' | 'archived' | 'converted'
  created_at  timestamptz not null default now()
);
create index if not exists idea_inbox_user_idx on public.idea_inbox(user_id, status);

-- ═══════════════════════════════════════════════════════════════════
-- RLS — enable on the NEW tables only; policy auth.uid() = user_id
-- ═══════════════════════════════════════════════════════════════════
alter table public.focus_nodes      enable row level security;
alter table public.focus_node_notes enable row level security;
alter table public.focus_task_logs  enable row level security;
alter table public.idea_inbox       enable row level security;

do $$
begin
  -- focus_nodes
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='focus_nodes' and policyname='focus_nodes_owner') then
    create policy focus_nodes_owner on public.focus_nodes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  -- focus_node_notes
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='focus_node_notes' and policyname='focus_node_notes_owner') then
    create policy focus_node_notes_owner on public.focus_node_notes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  -- focus_task_logs
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='focus_task_logs' and policyname='focus_task_logs_owner') then
    create policy focus_task_logs_owner on public.focus_task_logs
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  -- idea_inbox
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='idea_inbox' and policyname='idea_inbox_owner') then
    create policy idea_inbox_owner on public.idea_inbox
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 3 — SEED: SKELETON ONLY (5 nodes, nothing else)
-- Idempotent: only seeds when this user has zero focus_nodes.
-- ═══════════════════════════════════════════════════════════════════
do $$
declare
  v_user   uuid := '67b0093d-d4ca-4059-8572-26f020bef1eb';
  v_root   uuid;
  v_prod   uuid;
begin
  if exists (select 1 from public.focus_nodes where user_id = v_user) then
    raise notice 'focus_nodes already seeded for %, skipping.', v_user;
    return;
  end if;

  insert into public.focus_nodes (user_id, parent_id, node_type, title, sort_order)
    values (v_user, null, 'root', 'אתלטיגו', 0)
    returning id into v_root;

  insert into public.focus_nodes (user_id, parent_id, node_type, title, sort_order)
    values (v_user, v_root, 'branch', 'מוצרים', 0)
    returning id into v_prod;

  insert into public.focus_nodes (user_id, parent_id, node_type, title, sort_order) values
    (v_user, v_prod, 'branch', 'מוצרים פיזיים',    0),
    (v_user, v_prod, 'branch', 'מוצרים דיגיטליים', 1),
    (v_user, v_root, 'branch', 'שירותים',          1);
end $$;
