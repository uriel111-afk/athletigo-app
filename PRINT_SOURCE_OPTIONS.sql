-- ═══════════════════════════════════════════════════════════════════
-- Print the options array of "איך הגיע אלינו?" (node id = 'source')
-- from the ACTIVE intake schema (highest version).
-- Run before AND after deleting "thbxydro" in the app.
-- ═══════════════════════════════════════════════════════════════════
select s.version,
       jsonb_pretty(n->'options') as source_options
from public.intake_schema s,
     lateral jsonb_array_elements(s.schema) n
where s.version = (select max(version) from public.intake_schema)
  and n->>'id' = 'source';

-- Where does 'thbxydro' live right now? (any node, any option)
select s.version, n->>'id' as node_id, n->>'q' as question, o as option
from public.intake_schema s,
     lateral jsonb_array_elements(s.schema) n,
     lateral jsonb_array_elements(n->'options') o
where s.version = (select max(version) from public.intake_schema)
  and o::text ilike '%thbxydro%';

-- Existing lead answers that reference the option — these must stay
-- untouched by the delete. Run before and after; the rows must match.
select id, name, source, extra_details, updated_at
from public.leads
where source ilike '%thbxydro%'
   or extra_details ilike '%thbxydro%'
order by updated_at desc;
