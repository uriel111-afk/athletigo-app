-- ═══════════════════════════════════════════════════════════════════
-- Personal habit tracker — richer per-day logging on focus_task_logs
-- Adds a status column ('done' | 'skipped') so a not-done day can be
-- recorded WITH a reason, plus optional documentation fields. Purely
-- additive + idempotent. Existing rows backfill to status='done' via
-- the NOT NULL default, so every historical log stays "done".
--
-- RLS: no new policy needed. The existing focus_task_logs_owner policy
--   (auth.uid() = user_id) is table-wide (FOR ALL), so it automatically
--   governs every new column — RLS is row-scoped, never column-scoped.
-- Safe to run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

alter table public.focus_task_logs
  add column if not exists status      text not null default 'done',  -- 'done' | 'skipped'
  add column if not exists summary     text,        -- short cell label, e.g. "45' חזה"
  add column if not exists note        text,        -- free-text "what I actually did"
  add column if not exists start_time  time,
  add column if not exists end_time    time,
  add column if not exists feeling     smallint,    -- 1..5
  add column if not exists improve     text,        -- "what to improve next time"
  add column if not exists reason      text;        -- not-done reason (chip key or free text)

-- Guard the status domain without a hard enum (keeps future values cheap).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'focus_task_logs_status_chk'
  ) then
    alter table public.focus_task_logs
      add constraint focus_task_logs_status_chk
      check (status in ('done', 'skipped'));
  end if;
end $$;

-- Partial index so "done rows in a range" (the matrix/streak query) stays
-- fast even as skipped rows accumulate.
create index if not exists focus_task_logs_done_idx
  on public.focus_task_logs(user_id, log_date)
  where status = 'done';

-- Sanity: confirm the existing owner policy still governs the table.
-- (No change — listed here for the reviewer.)
-- select policyname, cmd, qual from pg_policies
--   where schemaname='public' and tablename='focus_task_logs';
