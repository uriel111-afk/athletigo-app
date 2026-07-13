import { supabase } from '@/lib/supabaseClient';
import { DEFAULT_INTAKE_TREE } from '@/lib/lifeos/intake-tree-schema';

// Active intake tree — the highest-version row, or the bundled default
// (version 0) when the table is empty / unreachable. The conversation
// screen and the editor both read through here.
export async function loadIntakeSchema() {
  try {
    const { data, error } = await supabase
      .from('intake_schema')
      .select('schema, version')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.schema && Array.isArray(data.schema)) return { schema: data.schema, version: data.version };
  } catch (e) {
    console.warn('[intakeSchema] load failed, using bundled default:', e?.message);
  }
  return { schema: DEFAULT_INTAKE_TREE, version: 0 };
}

// Persist an edited tree as a NEW version (append — history is kept).
// Returns the new version number.
export async function saveIntakeSchema(schema, userId) {
  const { data: latest } = await supabase
    .from('intake_schema')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (latest?.version || 0) + 1;
  const { error } = await supabase
    .from('intake_schema')
    .insert({ schema, version, updated_by: userId || null });
  if (error) throw error;
  return version;
}

// Restore the bundled default as a fresh version.
export function restoreDefaultSchema(userId) {
  return saveIntakeSchema(DEFAULT_INTAKE_TREE, userId);
}
