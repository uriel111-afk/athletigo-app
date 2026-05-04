import { supabase } from './supabaseClient';

export async function getPlanWithDetails(planId) {
  const { data: plan, error: pErr } = await supabase
    .from('training_plans').select('*').eq('id', planId).single();
  if (pErr) throw pErr;

  const { data: sections } = await supabase
    .from('training_sections').select('*')
    .eq('training_plan_id', planId).order('order', { ascending: true });

  const sectionIds = (sections || []).map(s => s.id);
  let exercises = [];
  if (sectionIds.length > 0) {
    const { data: exData } = await supabase
      .from('exercises').select('*')
      .in('training_section_id', sectionIds).order('order', { ascending: true });
    exercises = exData || [];
  }

  return {
    ...plan,
    sections: (sections || []).map(sec => ({
      ...sec,
      exercises: exercises.filter(ex => ex.training_section_id === sec.id),
    })),
  };
}

export async function getPlansForTrainee(traineeId) {
  const { data, error } = await supabase
    .from('training_plans').select('*')
    .eq('assigned_to', traineeId).neq('status', 'deleted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPlanFamily(planId) {
  const { data: plan } = await supabase
    .from('training_plans').select('id, parent_plan_id')
    .eq('id', planId).single();
  if (!plan) return [];
  const rootId = plan.parent_plan_id || plan.id;
  const { data } = await supabase
    .from('training_plans').select('*')
    .or(`id.eq.${rootId},parent_plan_id.eq.${rootId}`)
    .neq('status', 'deleted').order('created_at', { ascending: true });
  return data || [];
}

export async function updateCoachNotes(table, id, notes) {
  const { error } = await supabase.from(table).update({ coach_private_notes: notes }).eq('id', id);
  if (error) throw error;
}

export async function duplicatePlan(sourcePlanId, traineeId) {
  const source = await getPlanWithDetails(sourcePlanId);
  const rootId = source.parent_plan_id || source.id;
  const { id, created_at, updated_at, best_score, execution_count, sections, ...rest } = source;

  const { data: newPlan, error: pErr } = await supabase
    .from('training_plans')
    .insert({ ...rest, parent_plan_id: rootId, assigned_to: traineeId,
      plan_name: (source.plan_name || 'תוכנית') + ' (חזרה)',
      title: (source.title || source.plan_name || 'תוכנית') + ' (חזרה)',
      best_score: null, execution_count: 0 })
    .select().single();
  if (pErr) throw pErr;

  if (sections) {
    for (const sec of sections) {
      const { id: secId, training_plan_id, created_at: sca, exercises: secEx, ...secRest } = sec;
      const { data: newSec } = await supabase
        .from('training_sections').insert({ ...secRest, training_plan_id: newPlan.id }).select().single();
      if (secEx) {
        for (const ex of secEx) {
          const { id: exId, training_section_id, training_plan_id: epid, created_at: eca, completed, ...exRest } = ex;
          await supabase.from('exercises').insert({ ...exRest, training_section_id: newSec.id, training_plan_id: newPlan.id, completed: false });
        }
      }
    }
  }
  return newPlan;
}

// 10-entry palette so plans with up to 10 sections give every
// section a unique color before the cycle repeats. Order: brand
// orange first, then a perceptually distinct rotation. Each entry
// keeps the {bg, border, text} shape getSectionColor consumers
// expect (SectionCard's trainee branch reads all three).
export const SECTION_COLORS = [
  { bg: '#FFF5EE', border: '#FF6F20', text: '#FF6F20' }, // כתום
  { bg: '#EFF6FF', border: '#3B82F6', text: '#3B82F6' }, // כחול
  { bg: '#D1FAE5', border: '#22C55E', text: '#16A34A' }, // ירוק
  { bg: '#EDE9FE', border: '#A855F7', text: '#7C3AED' }, // סגול
  { bg: '#FEE2E2', border: '#EF4444', text: '#DC2626' }, // אדום
  { bg: '#FEF3C7', border: '#F59E0B', text: '#B45309' }, // צהוב
  { bg: '#CFFAFE', border: '#06B6D4', text: '#0E7490' }, // טורקיז
  { bg: '#FCE7F3', border: '#EC4899', text: '#DB2777' }, // ורוד
  { bg: '#ECFCCB', border: '#84CC16', text: '#4D7C0F' }, // ליים
  { bg: '#FFEDD5', border: '#F97316', text: '#C2410C' }, // כתום כהה
];

export function getSectionColor(index) {
  return SECTION_COLORS[index % SECTION_COLORS.length];
}

export async function setTraineeCanEdit(planId, canEdit) {
  const { error } = await supabase.from('training_plans').update({ trainee_can_edit: canEdit }).eq('id', planId);
  if (error) throw error;
}
