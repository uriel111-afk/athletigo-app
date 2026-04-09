-- Group Training tables
-- Run this in Supabase SQL editor

create table if not exists training_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  coach_id uuid references users(id) on delete cascade,
  coach_name text,
  created_at timestamptz default now()
);

create table if not exists training_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references training_groups(id) on delete cascade,
  trainee_id uuid references users(id) on delete cascade,
  trainee_name text,
  created_at timestamptz default now(),
  unique(group_id, trainee_id)
);

-- Enable RLS
alter table training_groups enable row level security;
alter table training_group_members enable row level security;

-- Allow all authenticated users to read/write (adjust as needed)
create policy "allow_all_training_groups" on training_groups for all using (auth.role() = 'authenticated');
create policy "allow_all_training_group_members" on training_group_members for all using (auth.role() = 'authenticated');
