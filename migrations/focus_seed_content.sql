-- ═══════════════════════════════════════════════════════════════════
-- Focus Map — real content seed (products + services with task chains)
-- Idempotent: each branch is guarded by an `if not exists (title=...)`
-- check, and the block raises if the skeleton nodes are missing. Adds
-- content under the existing skeleton (מוצרים פיזיים / מוצרים דיגיטליים /
-- שירותים). Safe to re-run. Run in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════
do $$
declare
  v_user uuid := '67b0093d-d4ca-4059-8572-26f020bef1eb';
  v_phys uuid; v_dig uuid; v_serv uuid;
  v_dm uuid; v_p49 uuid; v_pt uuid; v_tb uuid;
begin
  select id into v_phys from public.focus_nodes where user_id=v_user and title='מוצרים פיזיים' and status='active' limit 1;
  select id into v_dig  from public.focus_nodes where user_id=v_user and title='מוצרים דיגיטליים' and status='active' limit 1;
  select id into v_serv from public.focus_nodes where user_id=v_user and title='שירותים' and status='active' limit 1;
  if v_phys is null or v_dig is null or v_serv is null then
    raise exception 'skeleton nodes not found';
  end if;

  if not exists (select 1 from public.focus_nodes where user_id=v_user and title='מכונת חלום') then
    insert into public.focus_nodes (user_id,parent_id,node_type,title,tags,metric_target,metric_unit,cycle_start,cycle_end)
      values (v_user,v_phys,'branch','מכונת חלום','{מוצר}',10,'מכונות','2026-07-21','2026-10-18') returning id into v_dm;
    insert into public.focus_nodes (user_id,parent_id,node_type,title,is_fear_task,priority,due_date,frequency,sort_order) values
      (v_user,v_dm,'task','תסריט סרטון מוצר',false,1,null,null,1),
      (v_user,v_dm,'task','צילום סרטון מוצר',true,1,null,null,2),
      (v_user,v_dm,'task','עריכה ופרסום',false,0,null,null,3),
      (v_user,v_dm,'task','עמוד מוצר עם תשלום',true,2,'2026-07-24',null,4),
      (v_user,v_dm,'task','סגירת מחירי משלוחים',false,0,null,null,5),
      (v_user,v_dm,'task','שיחה יומית עם מתעניין',true,1,null,'daily',6);
  end if;

  if not exists (select 1 from public.focus_nodes where user_id=v_user and title='מוצר הפריצה 49') then
    insert into public.focus_nodes (user_id,parent_id,node_type,title,tags,metric_target,metric_unit,cycle_start,cycle_end)
      values (v_user,v_dig,'branch','מוצר הפריצה 49','{מוצר}',20,'מכירות','2026-07-21','2026-10-18') returning id into v_p49;
    insert into public.focus_nodes (user_id,parent_id,node_type,title,sort_order) values
      (v_user,v_p49,'task','כתיבת תוכן שבעת הימים',1),
      (v_user,v_p49,'task','עמוד נחיתה עם תשלום',2),
      (v_user,v_p49,'task','הטמעה באשף הלידים',3);
  end if;

  if not exists (select 1 from public.focus_nodes where user_id=v_user and title='אימון אישי') then
    insert into public.focus_nodes (user_id,parent_id,node_type,title,tags,metric_target,metric_unit,cycle_start,cycle_end)
      values (v_user,v_serv,'branch','אימון אישי','{שירות}',3,'לקוחות','2026-07-21','2026-10-18') returning id into v_pt;
    insert into public.focus_nodes (user_id,parent_id,node_type,title,is_fear_task,priority,due_date,sort_order) values
      (v_user,v_pt,'task','סגירת תנאים סופיים עם אולגה',true,2,'2026-07-21',1),
      (v_user,v_pt,'task','שיעור ניסיון ראשון',false,1,null,2);
  end if;

  if not exists (select 1 from public.focus_nodes where user_id=v_user and title='תנועה בכיף') then
    insert into public.focus_nodes (user_id,parent_id,node_type,title,tags,metric_target,metric_unit,cycle_start,cycle_end)
      values (v_user,v_serv,'branch','תנועה בכיף','{שירות}',12,'נרשמים','2026-07-21','2026-10-18') returning id into v_tb;
    insert into public.focus_nodes (user_id,parent_id,node_type,title,sort_order) values
      (v_user,v_tb,'task','סגירת לוח שיעורים עם אולגה',1),
      (v_user,v_tb,'task','עיצוב והדפסת פלייר',2),
      (v_user,v_tb,'task','הפצה דרך הילית',3),
      (v_user,v_tb,'task','שיעור פתוח ראשון',4);
  end if;
end $$;
