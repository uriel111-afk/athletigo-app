-- ===================================================================
-- Two social habits for the seeded personal tree  (ASCII-ONLY)
-- ===================================================================
-- Same technique as 2026-07-25-personal-stage1-seed-ascii.sql: every Hebrew
-- string is a Postgres unicode escape string (the U-ampersand form, one
-- backslash + 4 hex digits per character) and every comment is plain ASCII.
-- Nothing in this file is above U+007F, so bidirectional text reordering
-- cannot mangle it on the way into the SQL Editor.
--
-- Requires standard_conforming_strings = on (the Supabase default). Verify:
--   show standard_conforming_strings;   -- expected: on
--
-- RUN 2026-07-25-personal-stage1.sql AND the stage 1 seed FIRST -- this script
-- writes the columns the first adds (task_kind, measure_mode, weekly_target,
-- life_impact, net_minutes) and joins on the branches the second creates.
--
-- ADDITIVE AND IDEMPOTENT. There is no delete, no update and no safety gate,
-- because nothing existing is touched: each insert carries a NOT EXISTS on
-- (parent_id, title), so a habit or bank item that is already there is skipped
-- and a second run inserts zero rows. Existing history is therefore never at
-- risk -- unlike the stage 1 seed, this script cannot remove anything.
--
-- What it adds:
--   branch "yetsira"          -> habit "story yomi"      + 6 bank items
--   branch "yozma u-mekhira"  -> habit "maane le-hodaot" + 4 bank items
--
-- Both habits are written frequency='daily' + tags [board_tag, 'w:<target>']
-- so the EXISTING matrix renders them with correct weekly-N maths and needs no
-- change. Bank items keep the bank tag and no frequency, exactly like the
-- stage 1 seed's 68 items.
--
-- Note on measure_mode: habit 1 is 'days' (six DIFFERENT days -- posting six
-- stories in one evening is not the point), habit 2 is 'count' (five replies,
-- however they fall across the week). See src/lib/lifeos/week-math.js.
-- ===================================================================

do $$
declare
  v_user   uuid := '67b0093d-d4ca-4059-8572-26f020bef1eb';
  v_arm    uuid;
  v_br1    uuid;
  v_br2    uuid;
  v_h      bigint;
  v_k      bigint;
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

  -- -- 2. both target branches must exist ---------------------------
  -- Aborting here is deliberate. Without it a renamed or missing branch would
  -- make the joins below match nothing and the script would report "0 rows
  -- inserted" as if everything were already in place.
  select id into v_br1
    from public.focus_nodes
   where user_id = v_user and parent_id = v_arm and node_type = 'branch'
     and title = U&'\05D9\05E6\05D9\05E8\05D4'
   limit 1;
  if v_br1 is null then
    raise exception 'ABORT: branch "yetsira" not found under the personal arm';
  end if;

  select id into v_br2
    from public.focus_nodes
   where user_id = v_user and parent_id = v_arm and node_type = 'branch'
     and title = U&'\05D9\05D5\05D6\05DE\05D4 \05D5\05DE\05DB\05D9\05E8\05D4'
   limit 1;
  if v_br2 is null then
    raise exception 'ABORT: branch "yozma u-mekhira" not found under the personal arm';
  end if;

  -- -- 3. the two habits --------------------------------------------
  insert into public.focus_nodes (
    user_id, parent_id, node_type, title, frequency, tags,
    task_kind, measure_mode, weekly_target, life_impact, net_minutes, sort_order)
  select v_user, h.branch_id, 'task', h.title, 'daily',
         array[U&'\05DC\05D5\05D7', 'w:' || h.wtarget::text],
         'recurring', h.mode, h.wtarget, h.impact, h.minutes, h.ord
    from (values
      -- branch_id, habit title, measure_mode, weekly_target, life_impact, net_minutes, sort
      (v_br1::uuid, U&'\05E1\05D8\05D5\05E8\05D9 \05D9\05D5\05DE\05D9',              'days',  6, 4,  5, 15),
      (v_br2, U&'\05DE\05E2\05E0\05D4 \05DC\05D4\05D5\05D3\05E2\05D5\05EA',          'count', 5, 4, 15, 15)
    ) as h(branch_id, title, mode, wtarget, impact, minutes, ord)
   where not exists (
     select 1 from public.focus_nodes x
      where x.user_id = v_user and x.parent_id = h.branch_id and x.title = h.title
   );
  get diagnostics v_h = row_count;
  raise notice 'Habits inserted: % (0 = both already present).', v_h;

  -- -- 4. the 10 bank items -----------------------------------------
  -- The habits above are already visible to this statement (same DO block,
  -- earlier statement), so a first run inserts habit + items together and a
  -- second run inserts neither. The join is pinned to the branch as well as
  -- the habit title, so a same-named habit under another branch cannot
  -- accidentally collect these items.
  insert into public.focus_nodes (user_id, parent_id, node_type, title, tags, sort_order)
  select v_user, hb.id, 'task', k.title, array[U&'\05D1\05E0\05E7'], k.ord
    from (values
      -- branch_id, habit title, bank item title, sort
      (v_br1::uuid, U&'\05E1\05D8\05D5\05E8\05D9 \05D9\05D5\05DE\05D9', U&'\05DE\05D0\05D7\05D5\05E8\05D9 \05D4\05E7\05DC\05E2\05D9\05DD',                 10),
      (v_br1, U&'\05E1\05D8\05D5\05E8\05D9 \05D9\05D5\05DE\05D9', U&'\05D8\05D9\05E4 \05E7\05E6\05E8',                                                     20),
      (v_br1, U&'\05E1\05D8\05D5\05E8\05D9 \05D9\05D5\05DE\05D9', U&'\05DE\05EA\05D0\05DE\05DF \05D1\05E4\05E2\05D5\05DC\05D4',                            30),
      (v_br1, U&'\05E1\05D8\05D5\05E8\05D9 \05D9\05D5\05DE\05D9', U&'\05E9\05D0\05DC\05D4 \05DC\05E7\05D4\05DC',                                           40),
      (v_br1, U&'\05E1\05D8\05D5\05E8\05D9 \05D9\05D5\05DE\05D9', U&'\05DC\05E4\05E0\05D9 \05D5\05D0\05D7\05E8\05D9',                                      50),
      (v_br1, U&'\05E1\05D8\05D5\05E8\05D9 \05D9\05D5\05DE\05D9', U&'\05D4\05DB\05E8\05D6\05D4 \05E2\05DC \05DE\05E9\05D4\05D5 \05E9\05DE\05D2\05D9\05E2', 60),
      (v_br2, U&'\05DE\05E2\05E0\05D4 \05DC\05D4\05D5\05D3\05E2\05D5\05EA', U&'\05DE\05E2\05E0\05D4 \05DC\05D4\05D5\05D3\05E2\05D4 \05D7\05D3\05E9\05D4',   10),
      (v_br2, U&'\05DE\05E2\05E0\05D4 \05DC\05D4\05D5\05D3\05E2\05D5\05EA', U&'\05DE\05E2\05E0\05D4 \05DC\05EA\05D2\05D5\05D1\05D5\05EA',                   20),
      (v_br2, U&'\05DE\05E2\05E0\05D4 \05DC\05D4\05D5\05D3\05E2\05D5\05EA', U&'\05E4\05E0\05D9\05D9\05D4 \05DC\05DE\05D9 \05E9\05E6\05E4\05D4 \05D1\05E1\05D8\05D5\05E8\05D9', 30),
      (v_br2, U&'\05DE\05E2\05E0\05D4 \05DC\05D4\05D5\05D3\05E2\05D5\05EA', U&'\05DE\05E2\05E7\05D1 \05D0\05D7\05E8\05D9 \05DE\05D9 \05E9\05D4\05D2\05D9\05D1',              40)
    ) as k(branch_id, habit, title, ord)
    join public.focus_nodes hb
      on hb.user_id = v_user and hb.parent_id = k.branch_id
     and hb.node_type = 'task' and hb.title = k.habit
   where not exists (
     select 1 from public.focus_nodes x
      where x.user_id = v_user and x.parent_id = hb.id and x.title = k.title
   );
  get diagnostics v_k = row_count;
  raise notice 'Bank items inserted: % (0 = all already present).', v_k;

  raise notice 'Done. Habits: %, bank items: %.', v_h, v_k;
end $$;
