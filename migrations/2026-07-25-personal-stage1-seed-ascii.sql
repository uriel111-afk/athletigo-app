-- ===================================================================
-- Personal tab rebuild -- STAGE 1 SEED  (ASCII-ONLY TWIN)
-- ===================================================================
-- Behaviourally identical to 2026-07-25-personal-stage1-seed.sql. The ONLY
-- difference: every Hebrew string is written as a Postgres unicode escape
-- string (the U-ampersand form, one backslash + 4 hex digits per character)
-- instead of the literal characters, and every comment is plain ASCII. Nothing
-- in this file is above U+007F, so it cannot be mangled by bidirectional text
-- reordering on the way to the SQL Editor.
--
-- Requires standard_conforming_strings = on (the Supabase default). Verify with
--   show standard_conforming_strings;   -- expected: on
--
-- RUN 2026-07-25-personal-stage1.sql FIRST -- this script writes the columns it
-- adds (task_kind, measure_mode, weekly_target, life_impact, net_minutes,
-- extra_data) and the focus_modes table.
--
-- The WHOLE script is one DO block = ONE statement = one implicit transaction.
-- The safety gate therefore protects everything: if any node in scope has even
-- one focus_task_logs (or focus_executions) row, it RAISES and NOTHING is
-- deleted or inserted.
--
-- What it does, in order:
--   1. locate the personal arm (title "ha-chayim sheli"); abort if missing
--   2. skip entirely if extra_data.stage1_seeded is already true (re-run safe)
--   3. count logs for every branch under the arm + all descendants, abort if >0
--   4. delete those branches (cascade takes their habits; the inspiration
--      container is node_type='task' under the arm, so it is NOT in scope)
--   5. seed 6 branches (goal on the branch: metric_target/unit/cycle_*),
--      22 habits, 68 bank items, 3 modes
--   6. mark the arm extra_data.stage1_seeded = true
--
-- Every habit is written frequency='daily' + tags [board_tag, 'w:<target>'] so
-- the EXISTING matrix renders all 22 rows with correct weekly-N maths and needs
-- no changes. Bank items keep the existing bank tag and no frequency.
-- ===================================================================

do $$
declare
  v_user  uuid := '67b0093d-d4ca-4059-8572-26f020bef1eb';
  v_arm   uuid;
  v_logs  bigint := 0;
  v_execs bigint := 0;
  v_del   bigint;
  v_b     bigint;
  v_h     bigint;
  v_k     bigint;
  v_m     bigint;
  v_cyc_s date := '2026-07-25';
  v_cyc_e date := '2026-10-23';
begin
  -- -- 1. the personal arm ------------------------------------------
  select id into v_arm
    from public.focus_nodes
   where user_id = v_user and title = U&'\05D4\05D7\05D9\05D9\05DD \05E9\05DC\05D9' and node_type <> 'task'
   order by created_at
   limit 1;
  if v_arm is null then
    raise exception 'ABORT: personal arm not found for user %', v_user;
  end if;

  -- -- 2. already seeded? -------------------------------------------
  if coalesce((select extra_data->>'stage1_seeded' from public.focus_nodes where id = v_arm), 'false') = 'true' then
    raise notice 'Stage 1 already seeded (extra_data.stage1_seeded = true) -- nothing to do.';
    return;
  end if;

  -- -- 3. SAFETY GATE -- zero history required ----------------------
  with recursive scope as (
    select n.id
      from public.focus_nodes n
     where n.user_id = v_user and n.parent_id = v_arm and n.node_type <> 'task'
    union all
    select c.id
      from public.focus_nodes c
      join scope s on c.parent_id = s.id
  )
  select count(*) into v_logs
    from public.focus_task_logs l
   where l.node_id in (select id from scope);

  if to_regclass('public.focus_executions') is not null then
    with recursive scope as (
      select n.id
        from public.focus_nodes n
       where n.user_id = v_user and n.parent_id = v_arm and n.node_type <> 'task'
      union all
      select c.id
        from public.focus_nodes c
        join scope s on c.parent_id = s.id
    )
    select count(*) into v_execs
      from public.focus_executions e
     where e.node_id in (select id from scope);
  end if;

  if v_logs > 0 or v_execs > 0 then
    raise exception
      'ABORT: history exists under the branches in scope (% focus_task_logs row(s), % focus_executions row(s)). Nothing deleted, nothing seeded.',
      v_logs, v_execs;
  end if;
  raise notice 'Safety gate passed: 0 focus_task_logs and 0 focus_executions rows in scope.';

  -- -- 4. delete the old tree (branches only; cascade takes children)
  with doomed as (
    delete from public.focus_nodes
     where user_id = v_user and parent_id = v_arm and node_type <> 'task'
     returning 1
  )
  select count(*) into v_del from doomed;
  raise notice 'Deleted % branch(es) under the arm (their habits went with the cascade).', v_del;

  -- -- 5a. six branches, goal fields on the branch node -------------
  insert into public.focus_nodes (
    user_id, parent_id, node_type, title, note,
    metric_target, metric_unit, metric_current, cycle_start, cycle_end, sort_order)
  select v_user, v_arm, 'branch', b.title, b.goal,
         b.target, b.unit, 0, v_cyc_s, v_cyc_e, b.ord
    from (values
      (U&'\05D2\05D5\05E3',                          U&'65 \05D0\05D9\05DE\05D5\05E0\05D9\05DD \05D1\05DE\05D7\05D6\05D5\05E8',                  65, U&'\05D0\05D9\05DE\05D5\05E0\05D9\05DD',  10),
      (U&'\05D9\05E6\05D9\05E8\05D4',                U&'36 \05E1\05E8\05D8\05D5\05E0\05D9\05DD \05E9\05E4\05D5\05E8\05E1\05DE\05D5 \05D1\05DE\05D7\05D6\05D5\05E8', 36, U&'\05E1\05E8\05D8\05D5\05E0\05D9\05DD',  20),
      (U&'\05D9\05D5\05D6\05DE\05D4 \05D5\05DE\05DB\05D9\05E8\05D4', U&'65 \05E9\05D9\05D7\05D5\05EA \05E2\05DD \05DC\05D9\05D3\05D9\05DD \05D1\05DE\05D7\05D6\05D5\05E8', 65, U&'\05E9\05D9\05D7\05D5\05EA',            30),
      (U&'\05D1\05D9\05EA',                          U&'\05E9\05D9\05E9\05D4 \05D9\05DE\05D9 \05E1\05D3\05E8 \05D1\05E9\05D1\05D5\05E2',          6, U&'\05D9\05DE\05D9\05DD',                 40),
      (U&'\05D7\05D1\05E8\05D4 \05D5\05DE\05E9\05E4\05D7\05D4', U&'\05D7\05DE\05D9\05E9\05D4 \05D0\05E0\05E9\05D9\05DD \05D1\05E7\05E9\05E8 \05D1\05DB\05DC \05E9\05D1\05D5\05E2',  5, U&'\05D0\05E0\05E9\05D9\05DD',            50),
      (U&'\05E0\05E4\05E9 \05D5\05DC\05DE\05D9\05D3\05D4', U&'45 \05E9\05E2\05D5\05EA \05EA\05E8\05D2\05D5\05DC \05DE\05E6\05D8\05D1\05E8\05D5\05EA \05D1\05DE\05D7\05D6\05D5\05E8', 45, U&'\05E9\05E2\05D5\05EA',                 60)
    ) as b(title, goal, target, unit, ord);
  get diagnostics v_b = row_count;

  -- -- 5b. 22 habits -----------------------------------------------
  -- net_minutes = 0 is a CONTRACT, not just a duration: "tracked only, never
  -- proposed". A habit with net_minutes 0 is a passive STATE, not an action --
  -- it is scored and shown on the board like any other habit, but
  -- pickNextMove() excludes it and it can never appear in a mode card. The
  -- seven-hours-sleep habit is the marker case; the exclusion lives in
  -- src/lib/lifeos/priority-engine.js, never in a board-side filter.
  insert into public.focus_nodes (
    user_id, parent_id, node_type, title, frequency, tags,
    task_kind, measure_mode, weekly_target, life_impact, net_minutes, sort_order)
  select v_user, br.id, 'task', h.title, 'daily',
         array[U&'\05DC\05D5\05D7', 'w:' || h.wtarget::text],
         'recurring', h.mode, h.wtarget, h.impact, h.minutes, h.ord
    from (values
      -- branch, habit, measure_mode, weekly_target, life_impact, net_minutes, sort
      (U&'\05D2\05D5\05E3',                          U&'\05D0\05D9\05DE\05D5\05DF \05DB\05D5\05D7',                'count',  5, 4, 60, 10),
      (U&'\05D2\05D5\05E3',                          U&'\05D0\05D9\05DE\05D5\05DF \05E1\05D9\05D1\05D5\05DC\05EA', 'count',  2, 3, 30, 20),
      (U&'\05D2\05D5\05E3',                          U&'\05E9\05D9\05E0\05D4 \05E9\05D1\05E2 \05E9\05E2\05D5\05EA', 'days',   5, 5,  0, 30),
      (U&'\05D2\05D5\05E3',                          U&'\05EA\05D6\05D5\05E0\05D4',                                'days',   6, 4, 20, 40),
      (U&'\05D9\05E6\05D9\05E8\05D4',                U&'\05E6\05D9\05DC\05D5\05DD \05EA\05D5\05DB\05DF',           'count',  3, 5, 45, 10),
      (U&'\05D9\05E6\05D9\05E8\05D4',                U&'\05E2\05E8\05D9\05DB\05D4 \05D5\05E4\05E8\05E1\05D5\05DD', 'count',  3, 4, 60, 20),
      (U&'\05D9\05E6\05D9\05E8\05D4',                U&'\05DB\05EA\05D9\05D1\05EA \05EA\05E1\05E8\05D9\05D8',      'count',  2, 3, 30, 30),
      (U&'\05D9\05E6\05D9\05E8\05D4',                U&'\05D1\05E0\05D9\05D9\05EA \05DE\05D5\05E6\05E8',           'count',  2, 4, 60, 40),
      (U&'\05D9\05D5\05D6\05DE\05D4 \05D5\05DE\05DB\05D9\05E8\05D4', U&'\05E9\05D9\05D7\05D5\05EA \05E2\05DD \05DC\05D9\05D3\05D9\05DD', 'count',  5, 5, 15, 10),
      (U&'\05D9\05D5\05D6\05DE\05D4 \05D5\05DE\05DB\05D9\05E8\05D4', U&'\05E4\05E0\05D9\05D9\05D4 \05D9\05D6\05D5\05DE\05D4',      'count',  2, 4, 15, 20),
      (U&'\05D9\05D5\05D6\05DE\05D4 \05D5\05DE\05DB\05D9\05E8\05D4', U&'\05E1\05D2\05D9\05E8\05D4',                                'count',  1, 5, 20, 30),
      (U&'\05D9\05D5\05D6\05DE\05D4 \05D5\05DE\05DB\05D9\05E8\05D4', U&'\05D1\05E7\05E9\05EA \05D4\05E4\05E0\05D9\05D4',           'count',  1, 3, 10, 40),
      (U&'\05D1\05D9\05EA',                          U&'\05E1\05D3\05E8 \05D5\05E0\05D9\05E7\05D9\05D5\05DF',      'days',   6, 2, 20, 10),
      (U&'\05D1\05D9\05EA',                          U&'\05E7\05E0\05D9\05D5\05EA',                                'count',  1, 2, 45, 20),
      (U&'\05D1\05D9\05EA',                          U&'\05DB\05D1\05D9\05E1\05D4',                                'count',  2, 2, 15, 30),
      (U&'\05D1\05D9\05EA',                          U&'\05EA\05D7\05D6\05D5\05E7\05D4',                           'count',  1, 2, 30, 40),
      (U&'\05D7\05D1\05E8\05D4 \05D5\05DE\05E9\05E4\05D7\05D4', U&'\05E7\05E9\05E8 \05D9\05D6\05D5\05DD',                     'count',  5, 3, 15, 10),
      (U&'\05D7\05D1\05E8\05D4 \05D5\05DE\05E9\05E4\05D7\05D4', U&'\05DE\05E4\05D2\05E9 \05E4\05E0\05D9\05DD \05D0\05DC \05E4\05E0\05D9\05DD', 'count',  1, 4, 90, 20),
      (U&'\05E0\05E4\05E9 \05D5\05DC\05DE\05D9\05D3\05D4', U&'\05EA\05E4\05D9\05DC\05D4',                                'days',   7, 4, 15, 10),
      (U&'\05E0\05E4\05E9 \05D5\05DC\05DE\05D9\05D3\05D4', U&'\05EA\05E8\05D2\05D5\05DC \05E9\05E4\05D4',                'count',  5, 3, 30, 20),
      (U&'\05E0\05E4\05E9 \05D5\05DC\05DE\05D9\05D3\05D4', U&'\05EA\05E8\05D2\05D5\05DC \05DE\05D5\05D6\05D9\05E7\05D4', 'count',  5, 3, 30, 30),
      (U&'\05E0\05E4\05E9 \05D5\05DC\05DE\05D9\05D3\05D4', U&'\05D6\05DE\05DF \05E9\05E7\05D8',                          'count',  3, 3, 30, 40)
    ) as h(branch, title, mode, wtarget, impact, minutes, ord)
    join public.focus_nodes br
      on br.user_id = v_user and br.parent_id = v_arm
     and br.node_type = 'branch' and br.title = h.branch;
  get diagnostics v_h = row_count;

  -- -- 5c. 68 bank items (children of their habit, bank tag) -------
  insert into public.focus_nodes (user_id, parent_id, node_type, title, tags, sort_order)
  select v_user, hb.id, 'task', k.title, array[U&'\05D1\05E0\05E7'], k.ord
    from (values
      (U&'\05D0\05D9\05DE\05D5\05DF \05DB\05D5\05D7',                U&'\05D0\05D9\05DE\05D5\05DF \05D3\05D7\05D9\05E4\05D4',                                    10),
      (U&'\05D0\05D9\05DE\05D5\05DF \05DB\05D5\05D7',                U&'\05D0\05D9\05DE\05D5\05DF \05DE\05E9\05D9\05DB\05D4',                                    20),
      (U&'\05D0\05D9\05DE\05D5\05DF \05DB\05D5\05D7',                U&'\05D0\05D9\05DE\05D5\05DF \05E8\05D2\05DC\05D9\05D9\05DD',                               30),
      (U&'\05D0\05D9\05DE\05D5\05DF \05DB\05D5\05D7',                U&'\05D0\05D9\05DE\05D5\05DF \05D8\05D1\05E2\05D5\05EA',                                    40),
      (U&'\05D0\05D9\05DE\05D5\05DF \05DB\05D5\05D7',                U&'\05D0\05D9\05DE\05D5\05DF \05D2\05D5\05E3 \05DE\05DC\05D0 \05E7\05E6\05E8',              50),
      (U&'\05D0\05D9\05DE\05D5\05DF \05E1\05D9\05D1\05D5\05DC\05EA', U&'\05D7\05D1\05DC \05E7\05E4\05D9\05E6\05D4',                                              10),
      (U&'\05D0\05D9\05DE\05D5\05DF \05E1\05D9\05D1\05D5\05DC\05EA', U&'\05E8\05D9\05E6\05D4',                                                                   20),
      (U&'\05D0\05D9\05DE\05D5\05DF \05E1\05D9\05D1\05D5\05DC\05EA', U&'\05D0\05D9\05E0\05D8\05E8\05D5\05D5\05DC\05D9\05DD \05E7\05E6\05E8\05D9\05DD',           30),
      (U&'\05EA\05D6\05D5\05E0\05D4',                                U&'\05D4\05DB\05E0\05EA \05D0\05D5\05DB\05DC \05DC\05DE\05D7\05E8',                         10),
      (U&'\05EA\05D6\05D5\05E0\05D4',                                U&'\05E1\05D2\05D9\05E8\05EA \05D7\05DC\05D1\05D5\05DF \05D9\05D5\05DE\05D9\05EA',          20),
      (U&'\05EA\05D6\05D5\05E0\05D4',                                U&'\05D0\05E8\05D5\05D7\05D4 \05DE\05E1\05D5\05D3\05E8\05EA \05D1\05D1\05D9\05EA',          30),
      (U&'\05E6\05D9\05DC\05D5\05DD \05EA\05D5\05DB\05DF',           U&'\05D4\05D3\05D2\05DE\05EA \05EA\05E8\05D2\05D9\05DC',                                    10),
      (U&'\05E6\05D9\05DC\05D5\05DD \05EA\05D5\05DB\05DF',           U&'\05D3\05D9\05D1\05D5\05E8 \05DC\05DE\05E6\05DC\05DE\05D4',                               20),
      (U&'\05E6\05D9\05DC\05D5\05DD \05EA\05D5\05DB\05DF',           U&'\05E6\05D9\05DC\05D5\05DD \05DE\05D5\05E6\05E8',                                         30),
      (U&'\05E6\05D9\05DC\05D5\05DD \05EA\05D5\05DB\05DF',           U&'\05E1\05E8\05D8\05D5\05DF \05DC\05E4\05E0\05D9 \05D5\05D0\05D7\05E8\05D9',               40),
      (U&'\05E2\05E8\05D9\05DB\05D4 \05D5\05E4\05E8\05E1\05D5\05DD', U&'\05E2\05E8\05D9\05DB\05EA \05E1\05E8\05D8\05D5\05DF',                                    10),
      (U&'\05E2\05E8\05D9\05DB\05D4 \05D5\05E4\05E8\05E1\05D5\05DD', U&'\05DB\05EA\05D9\05D1\05EA \05DB\05D9\05EA\05D5\05D1',                                    20),
      (U&'\05E2\05E8\05D9\05DB\05D4 \05D5\05E4\05E8\05E1\05D5\05DD', U&'\05E4\05E8\05E1\05D5\05DD \05D1\05D0\05D9\05E0\05E1\05D8\05D2\05E8\05DD',                30),
      (U&'\05E2\05E8\05D9\05DB\05D4 \05D5\05E4\05E8\05E1\05D5\05DD', U&'\05E4\05E8\05E1\05D5\05DD \05D1\05D8\05D9\05E7\05D8\05D5\05E7',                          40),
      (U&'\05DB\05EA\05D9\05D1\05EA \05EA\05E1\05E8\05D9\05D8',      U&'\05E4\05EA\05D9\05D7 \05DE\05E4\05EA\05D9\05E2',                                         10),
      (U&'\05DB\05EA\05D9\05D1\05EA \05EA\05E1\05E8\05D9\05D8',      U&'\05E8\05E9\05D9\05DE\05EA \05E0\05E7\05D5\05D3\05D5\05EA',                               20),
      (U&'\05DB\05EA\05D9\05D1\05EA \05EA\05E1\05E8\05D9\05D8',      U&'\05DE\05D1\05E0\05D4 \05E9\05DC\05D1 \05D0\05D7\05E8 \05E9\05DC\05D1',                   30),
      (U&'\05D1\05E0\05D9\05D9\05EA \05DE\05D5\05E6\05E8',           U&'\05DB\05EA\05D9\05D1\05EA \05E4\05E8\05E7 \05D1\05E7\05D5\05E8\05E1',                    10),
      (U&'\05D1\05E0\05D9\05D9\05EA \05DE\05D5\05E6\05E8',           U&'\05D4\05E7\05DC\05D8\05EA \05E9\05D9\05E2\05D5\05E8',                                    20),
      (U&'\05D1\05E0\05D9\05D9\05EA \05DE\05D5\05E6\05E8',           U&'\05D1\05E0\05D9\05D9\05EA \05D3\05E3 \05DE\05DB\05D9\05E8\05D4',                         30),
      (U&'\05D1\05E0\05D9\05D9\05EA \05DE\05D5\05E6\05E8',           U&'\05EA\05DE\05D7\05D5\05E8 \05D4\05E6\05E2\05D4 \05D7\05D3\05E9\05D4',                    40),
      (U&'\05E9\05D9\05D7\05D5\05EA \05E2\05DD \05DC\05D9\05D3\05D9\05DD', U&'\05E9\05D9\05D7\05D4 \05E2\05DD \05DC\05D9\05D3 \05D7\05D3\05E9',                        10),
      (U&'\05E9\05D9\05D7\05D5\05EA \05E2\05DD \05DC\05D9\05D3\05D9\05DD', U&'\05DE\05E2\05E7\05D1 \05D0\05D7\05E8\05D9 \05DC\05D9\05D3 \05D9\05E9\05DF',              20),
      (U&'\05E9\05D9\05D7\05D5\05EA \05E2\05DD \05DC\05D9\05D3\05D9\05DD', U&'\05D4\05D7\05D6\05E8\05EA \05E9\05D9\05D7\05D4 \05E9\05DC\05D0 \05E0\05E2\05E0\05EA\05D4', 30),
      (U&'\05E9\05D9\05D7\05D5\05EA \05E2\05DD \05DC\05D9\05D3\05D9\05DD', U&'\05E9\05DC\05D9\05D7\05EA \05D4\05E6\05E2\05D4',                                         40),
      (U&'\05E4\05E0\05D9\05D9\05D4 \05D9\05D6\05D5\05DE\05D4',      U&'\05E4\05E0\05D9\05D9\05D4 \05DC\05D7\05E0\05D5\05EA \05E1\05E4\05D5\05E8\05D8',          10),
      (U&'\05E4\05E0\05D9\05D9\05D4 \05D9\05D6\05D5\05DE\05D4',      U&'\05E9\05D9\05D7\05D4 \05E2\05DD \05DE\05D0\05DE\05DF \05DC\05D4\05E6\05D8\05E8\05E4\05D5\05EA \05DC\05E8\05E9\05EA', 20),
      (U&'\05E4\05E0\05D9\05D9\05D4 \05D9\05D6\05D5\05DE\05D4',      U&'\05E4\05E0\05D9\05D9\05D4 \05DC\05DE\05E8\05E6\05D4 \05D0\05D5 \05DE\05DB\05D5\05DF \05D4\05DB\05E9\05E8\05D4', 30),
      (U&'\05E4\05E0\05D9\05D9\05D4 \05D9\05D6\05D5\05DE\05D4',      U&'\05E4\05E0\05D9\05D9\05D4 \05DC\05DE\05E7\05D5\05DD \05DC\05E7\05D1\05D5\05E6\05D4 \05D7\05D3\05E9\05D4', 40),
      (U&'\05E1\05D2\05D9\05E8\05D4',                                U&'\05E9\05D9\05D7\05EA \05E1\05D2\05D9\05E8\05D4',                                         10),
      (U&'\05E1\05D2\05D9\05E8\05D4',                                U&'\05E9\05DC\05D9\05D7\05EA \05E7\05D9\05E9\05D5\05E8 \05EA\05E9\05DC\05D5\05DD',          20),
      (U&'\05E1\05D2\05D9\05E8\05D4',                                U&'\05E7\05DC\05D9\05D8\05EA \05DE\05EA\05D0\05DE\05DF \05D7\05D3\05E9',                    30),
      (U&'\05D1\05E7\05E9\05EA \05D4\05E4\05E0\05D9\05D4',           U&'\05D1\05E7\05E9\05D4 \05DE\05DE\05EA\05D0\05DE\05DF \05DE\05E8\05D5\05E6\05D4',          10),
      (U&'\05D1\05E7\05E9\05EA \05D4\05E4\05E0\05D9\05D4',           U&'\05D1\05E7\05E9\05D4 \05DE\05DE\05D9\05E9\05D4\05D5 \05E9\05E1\05D9\05D9\05DD \05EA\05D4\05DC\05D9\05DA', 20),
      (U&'\05E1\05D3\05E8 \05D5\05E0\05D9\05E7\05D9\05D5\05DF',      U&'\05E1\05D9\05D3\05D5\05E8 \05D4\05E1\05DC\05D5\05DF',                                    10),
      (U&'\05E1\05D3\05E8 \05D5\05E0\05D9\05E7\05D9\05D5\05DF',      U&'\05DE\05D8\05D1\05D7 \05D5\05DB\05DC\05D9\05DD',                                         20),
      (U&'\05E1\05D3\05E8 \05D5\05E0\05D9\05E7\05D9\05D5\05DF',      U&'\05E9\05D8\05D9\05E4\05EA \05E8\05E6\05E4\05D4',                                         30),
      (U&'\05E1\05D3\05E8 \05D5\05E0\05D9\05E7\05D9\05D5\05DF',      U&'\05D7\05D3\05E8 \05E9\05D9\05E0\05D4',                                                   40),
      (U&'\05E1\05D3\05E8 \05D5\05E0\05D9\05E7\05D9\05D5\05DF',      U&'\05E1\05D9\05D3\05D5\05E8 \05D4\05DE\05D7\05E1\05DF',                                    50),
      (U&'\05E7\05E0\05D9\05D5\05EA',                                U&'\05E7\05E0\05D9\05D9\05D4 \05E9\05D1\05D5\05E2\05D9\05EA',                               10),
      (U&'\05E7\05E0\05D9\05D5\05EA',                                U&'\05D4\05E9\05DC\05DE\05D5\05EA',                                                         20),
      (U&'\05E7\05E0\05D9\05D5\05EA',                                U&'\05D4\05D6\05DE\05E0\05D4 \05D0\05D5\05E0\05DC\05D9\05D9\05DF',                          30),
      (U&'\05DB\05D1\05D9\05E1\05D4',                                U&'\05D4\05E4\05E2\05DC\05EA \05DB\05D1\05D9\05E1\05D4',                                    10),
      (U&'\05DB\05D1\05D9\05E1\05D4',                                U&'\05E7\05D9\05E4\05D5\05DC \05D5\05E1\05D9\05D3\05D5\05E8',                               20),
      (U&'\05EA\05D7\05D6\05D5\05E7\05D4',                           U&'\05EA\05D9\05E7\05D5\05DF \05E7\05D8\05DF',                                              10),
      (U&'\05EA\05D7\05D6\05D5\05E7\05D4',                           U&'\05D8\05D9\05E4\05D5\05DC \05D1\05D2\05D9\05E0\05D4',                                    20),
      (U&'\05EA\05D7\05D6\05D5\05E7\05D4',                           U&'\05D4\05D7\05D6\05E8\05EA \05E6\05D9\05D5\05D3 \05DC\05DE\05E7\05D5\05DD',               30),
      (U&'\05E7\05E9\05E8 \05D9\05D6\05D5\05DD',                     U&'\05E9\05D9\05D7\05D4 \05E2\05DD \05D7\05D1\05E8',                                        10),
      (U&'\05E7\05E9\05E8 \05D9\05D6\05D5\05DD',                     U&'\05E9\05D9\05D7\05D4 \05E2\05DD \05D1\05DF \05DE\05E9\05E4\05D7\05D4',                   20),
      (U&'\05E7\05E9\05E8 \05D9\05D6\05D5\05DD',                     U&'\05D4\05D5\05D3\05E2\05EA \05D9\05D5\05DD \05D4\05D5\05DC\05D3\05EA',                    30),
      (U&'\05E7\05E9\05E8 \05D9\05D6\05D5\05DD',                     U&'\05D4\05D5\05D3\05E2\05D4 \05DC\05DE\05D9\05E9\05D4\05D5 \05E9\05DC\05D0 \05D3\05D9\05D1\05E8\05EA\05D9 \05D0\05D9\05EA\05D5 \05DE\05D6\05DE\05DF', 40),
      (U&'\05DE\05E4\05D2\05E9 \05E4\05E0\05D9\05DD \05D0\05DC \05E4\05E0\05D9\05DD', U&'\05E7\05E4\05D4 \05E2\05DD \05D7\05D1\05E8',                                             10),
      (U&'\05DE\05E4\05D2\05E9 \05E4\05E0\05D9\05DD \05D0\05DC \05E4\05E0\05D9\05DD', U&'\05D0\05E8\05D5\05D7\05D4 \05DE\05E9\05E4\05D7\05EA\05D9\05EA',                          20),
      (U&'\05DE\05E4\05D2\05E9 \05E4\05E0\05D9\05DD \05D0\05DC \05E4\05E0\05D9\05DD', U&'\05D4\05D2\05E2\05D4 \05DC\05D0\05D9\05E8\05D5\05E2',                                    30),
      (U&'\05EA\05E8\05D2\05D5\05DC \05E9\05E4\05D4',                U&'\05E9\05DC\05D5\05E9\05D9\05DD \05D3\05E7\05D5\05EA \05EA\05E8\05D2\05D5\05DC',          10),
      (U&'\05EA\05E8\05D2\05D5\05DC \05E9\05E4\05D4',                U&'\05E9\05D9\05D7\05D4',                                                                   20),
      (U&'\05EA\05E8\05D2\05D5\05DC \05E9\05E4\05D4',                U&'\05D0\05D5\05E6\05E8 \05DE\05D9\05DC\05D9\05DD',                                         30),
      (U&'\05EA\05E8\05D2\05D5\05DC \05DE\05D5\05D6\05D9\05E7\05D4', U&'\05E9\05DC\05D5\05E9\05D9\05DD \05D3\05E7\05D5\05EA \05E0\05D2\05D9\05E0\05D4',          10),
      (U&'\05EA\05E8\05D2\05D5\05DC \05DE\05D5\05D6\05D9\05E7\05D4', U&'\05E9\05D9\05E8 \05D7\05D3\05E9',                                                        20),
      (U&'\05EA\05E8\05D2\05D5\05DC \05DE\05D5\05D6\05D9\05E7\05D4', U&'\05EA\05E8\05D2\05D9\05DC \05D8\05DB\05E0\05D9\05E7\05D4',                               30),
      (U&'\05D6\05DE\05DF \05E9\05E7\05D8',                          U&'\05E7\05E8\05D9\05D0\05D4',                                                              10),
      (U&'\05D6\05DE\05DF \05E9\05E7\05D8',                          U&'\05D4\05DC\05D9\05DB\05D4 \05D1\05DC\05D9 \05D8\05DC\05E4\05D5\05DF',                    20),
      (U&'\05D6\05DE\05DF \05E9\05E7\05D8',                          U&'\05DB\05EA\05D9\05D1\05D4 \05D0\05D9\05E9\05D9\05EA',                                    30)
    ) as k(habit, title, ord)
    join public.focus_nodes hb
      on hb.user_id = v_user and hb.node_type = 'task' and hb.title = k.habit
     and hb.parent_id in (
       select id from public.focus_nodes
        where user_id = v_user and parent_id = v_arm and node_type = 'branch');
  get diagnostics v_k = row_count;

  -- -- 5d. three modes ---------------------------------------------
  -- Ramp/main names resolve to TASK nodes inside this arm only, and never to an
  -- inspiration item, so the prayer name can only be the habit.
  insert into public.focus_modes (user_id, name, main_node_id, ramp_node_ids, sort_order, active)
  select v_user, m.name,
         (select n.id from public.focus_nodes n
           where n.user_id = v_user and n.node_type = 'task' and n.title = m.main
             and not (n.tags && array[U&'\05D4\05E9\05E8\05D0\05D4']) limit 1),
         (select coalesce(jsonb_agg(x.id order by x.ord), '[]'::jsonb)
            from (
              select r.ord,
                     (select n.id::text from public.focus_nodes n
                       where n.user_id = v_user and n.node_type = 'task' and n.title = r.title
                         and not (n.tags && array[U&'\05D4\05E9\05E8\05D0\05D4']) limit 1) as id
                from unnest(m.ramp) with ordinality as r(title, ord)
            ) x
           where x.id is not null),
         m.ord, true
    from (values
      (U&'\05DE\05E6\05D1 \05E6\05D9\05DC\05D5\05DD', array[U&'\05E1\05D9\05D3\05D5\05E8 \05D4\05E1\05DC\05D5\05DF', U&'\05EA\05E4\05D9\05DC\05D4', U&'\05D0\05D9\05DE\05D5\05DF \05D2\05D5\05E3 \05DE\05DC\05D0 \05E7\05E6\05E8'], U&'\05E6\05D9\05DC\05D5\05DD \05EA\05D5\05DB\05DF', 10),
      (U&'\05DE\05E6\05D1 \05DE\05DB\05D9\05E8\05D4', array[U&'\05EA\05E4\05D9\05DC\05D4'], U&'\05E9\05D9\05D7\05D5\05EA \05E2\05DD \05DC\05D9\05D3\05D9\05DD', 20),
      (U&'\05DE\05E6\05D1 \05D9\05E6\05D9\05E8\05D4 \05E9\05E7\05D8\05D4', array[U&'\05E1\05D9\05D3\05D5\05E8 \05D4\05E1\05DC\05D5\05DF'], U&'\05DB\05EA\05D9\05D1\05EA \05EA\05E1\05E8\05D9\05D8', 30)
    ) as m(name, ramp, main, ord);
  get diagnostics v_m = row_count;

  -- -- 6. mark the arm so the legacy seeders stay out --------------
  update public.focus_nodes
     set extra_data = coalesce(extra_data, '{}'::jsonb)
                      || jsonb_build_object('stage1_seeded', true,
                                            'stage1_seeded_on', to_char(now(), 'YYYY-MM-DD'))
   where id = v_arm;

  raise notice 'Seeded: % branches, % habits, % bank items, % modes. Arm marked stage1_seeded.',
    v_b, v_h, v_k, v_m;
  if v_b <> 6 or v_h <> 22 or v_k <> 68 or v_m <> 3 then
    raise exception 'ABORT: expected 6/22/68/3 but inserted %/%/%/% -- rolled back.', v_b, v_h, v_k, v_m;
  end if;
end $$;

-- ===================================================================
-- VERIFY -- run these after, and paste the output back
-- ===================================================================

-- 1. the whole new tree, branch by branch
with arm as (
  select id from public.focus_nodes
   where user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
     and title = U&'\05D4\05D7\05D9\05D9\05DD \05E9\05DC\05D9' and node_type <> 'task' limit 1
)
select coalesce(gp.title, p.title, '(arm)') as grandparent,
       p.title  as parent,
       n.node_type, n.title, n.frequency, n.tags,
       n.task_kind, n.measure_mode, n.weekly_target, n.life_impact, n.net_minutes
  from public.focus_nodes n
  left join public.focus_nodes p  on p.id  = n.parent_id
  left join public.focus_nodes gp on gp.id = p.parent_id
 where n.user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
   and (n.parent_id = (select id from arm)
     or p.parent_id = (select id from arm)
     or gp.parent_id = (select id from arm))
 order by p.sort_order nulls first, p.title, n.sort_order, n.title;

-- 2. counts + the goal row on each branch
select b.title, b.metric_target, b.metric_unit, b.cycle_start, b.cycle_end, b.note,
       (select count(*) from public.focus_nodes h where h.parent_id = b.id) as habits,
       (select count(*) from public.focus_nodes k
         where k.parent_id in (select id from public.focus_nodes h2 where h2.parent_id = b.id)) as bank_items
  from public.focus_nodes b
 where b.user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
   and b.node_type = 'branch'
   and b.parent_id = (select id from public.focus_nodes
                       where user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
                         and title = U&'\05D4\05D7\05D9\05D9\05DD \05E9\05DC\05D9' and node_type <> 'task' limit 1)
 order by b.sort_order;

-- 3. modes with their resolved names
select m.name,
       (select title from public.focus_nodes n where n.id = m.main_node_id) as main_task,
       (select string_agg(n.title, ' -> ' order by r.ord)
          from jsonb_array_elements_text(m.ramp_node_ids) with ordinality as r(id, ord)
          join public.focus_nodes n on n.id = r.id::uuid) as ramp,
       jsonb_array_length(m.ramp_node_ids) as ramp_len
  from public.focus_modes m
 where m.user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
 order by m.sort_order;

-- 4. the arm marker + that the inspiration list survived
select title, node_type, extra_data
  from public.focus_nodes
 where user_id = '67b0093d-d4ca-4059-8572-26f020bef1eb'
   and (title = U&'\05D4\05D7\05D9\05D9\05DD \05E9\05DC\05D9' or title = U&'\05E8\05E9\05D9\05DE\05EA \05D4\05E9\05E8\05D0\05D4');
