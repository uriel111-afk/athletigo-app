// ═══════════════════════════════════════════════════════════════════
// Sales scripts — Supabase API + TanStack Query hooks
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SCRIPTS } from '@/data/sales-scripts-seed';

export const scriptsKey = ['sales-scripts'];

// 42703 unknown-column retry (same contract as base44Client).
function missingColumn(error) {
  const msg = error?.message || '';
  if (error?.code !== '42703' && !/does not exist|in the schema cache/i.test(msg)) return null;
  const m = msg.match(/column\s+"?([\w.]+)"?\s+of\s+relation/i)
         || msg.match(/column\s+"?([\w.]+)"?\s+does not exist/i)
         || msg.match(/['"`]([\w.]+)['"`]\s+column/i);
  return m?.[1]?.split('.').pop() || null;
}
async function safeInsert(payload) {
  let body = { ...payload };
  for (let i = 0; i < 6; i++) {
    const { data, error } = await supabase.from('sales_scripts').insert(body).select().single();
    if (!error) return data;
    const col = missingColumn(error);
    if (!col || !(col in body)) throw error;
    delete body[col];
  }
  throw new Error('[sales-scripts] insert exhausted retries');
}
async function safeUpdate(id, patch) {
  let body = { ...patch };
  for (let i = 0; i < 6; i++) {
    const { data, error } = await supabase.from('sales_scripts').update(body).eq('id', id).select().single();
    if (!error) return data;
    const col = missingColumn(error);
    if (!col || !(col in body)) throw error;
    delete body[col];
  }
  throw new Error('[sales-scripts] update exhausted retries');
}

export async function listScripts() {
  const { data, error } = await supabase
    .from('sales_scripts')
    .select('*')
    .order('section', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Hook — loads scripts and exposes getters that fall back to the
// hardcoded defaults while the table is empty or still loading.
export function useSalesScripts(coachId) {
  const { data: scripts = [], isLoading } = useQuery({
    queryKey: scriptsKey,
    queryFn: listScripts,
  });

  const source = scripts.length ? scripts : DEFAULT_SCRIPTS;

  // getScript(section, key) → content string (default fallback).
  const getScript = (section, key) => {
    const hit = source.find((s) => s.section === section && s.key === key);
    if (hit) return hit.content;
    const def = DEFAULT_SCRIPTS.find((s) => s.section === section && s.key === key);
    return def ? def.content : '';
  };

  // getSection(section) → ordered array of rows in that section.
  const getSection = (section) =>
    source.filter((s) => s.section === section)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return { scripts, getScript, getSection, isLoading, coachId };
}

// Mutations for the editor.
export function useScriptMutations(coachId) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: scriptsKey });
  const scope = coachId ? { coach_id: coachId } : {};

  return {
    addScript: useMutation({
      mutationFn: ({ section, key, content, sort_order = 0 }) =>
        safeInsert({ ...scope, section, key, content, sort_order }),
      onSuccess: invalidate,
    }),
    updateScript: useMutation({
      mutationFn: ({ id, ...patch }) => safeUpdate(id, patch),
      onSuccess: invalidate,
    }),
    deleteScript: useMutation({
      mutationFn: async (id) => {
        const { error } = await supabase.from('sales_scripts').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    reorderScripts: useMutation({
      mutationFn: async (orderedIds) => {
        await Promise.all(orderedIds.map((id, i) => safeUpdate(id, { sort_order: i + 1 })));
      },
      onSuccess: invalidate,
    }),
  };
}
