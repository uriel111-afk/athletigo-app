// ═══════════════════════════════════════════════════════════════════
// Goals hierarchy — JSONB on the users row.
// ═══════════════════════════════════════════════════════════════════
// Shape:
//   {
//     annual_target: number,
//     categories: [
//       {
//         id:       string,
//         name:     string,
//         target:   number,
//         products: [
//           { id, name, target }
//         ]
//       }
//     ]
//   }
//
// Stored in users.goals_hierarchy. If that column doesn't exist
// yet (42703), getGoalsHierarchy returns the empty default and
// updateGoalsHierarchy throws — the caller surfaces the error so
// the user knows to run the ALTER TABLE.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

const COLUMN_MISSING_CODE = '42703';

export const DEFAULT_HIERARCHY = { annual_target: 0, categories: [] };

export async function getGoalsHierarchy(userId) {
  if (!userId) return DEFAULT_HIERARCHY;
  const { data, error } = await supabase
    .from('users')
    .select('goals_hierarchy')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    if (error.code === COLUMN_MISSING_CODE) return DEFAULT_HIERARCHY;
    throw error;
  }
  const value = data?.goals_hierarchy;
  if (!value || typeof value !== 'object') return DEFAULT_HIERARCHY;
  // Merge with defaults so a partial row (e.g. {annual_target} but no
  // categories) doesn't break the UI's .map() calls.
  return {
    annual_target: Number(value.annual_target) || 0,
    categories: Array.isArray(value.categories) ? value.categories : [],
  };
}

export async function updateGoalsHierarchy(userId, hierarchy) {
  if (!userId) throw new Error('userId required');
  if (!hierarchy || typeof hierarchy !== 'object') {
    throw new Error('hierarchy must be an object');
  }
  // Normalise before write so the DB never holds a malformed shape.
  const payload = {
    annual_target: Number(hierarchy.annual_target) || 0,
    categories: (Array.isArray(hierarchy.categories) ? hierarchy.categories : []).map(c => ({
      id:     String(c.id || ''),
      name:   String(c.name || ''),
      target: Number(c.target) || 0,
      products: (Array.isArray(c.products) ? c.products : []).map(p => ({
        id:     String(p.id || ''),
        name:   String(p.name || ''),
        target: Number(p.target) || 0,
      })),
    })),
  };
  const { error } = await supabase
    .from('users')
    .update({ goals_hierarchy: payload })
    .eq('id', userId);
  if (error) throw error;
  return payload;
}
