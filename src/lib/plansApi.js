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

// AthletiGo brand palette — 10 perceptually distinct hex strings
// keyed off the section's index in its plan. Brand orange first,
// navy second so the two most-distinctive AthletiGo tones bookend
// the most-visible sections. Returned as a flat string by
// getSectionColor so SectionCard's both branches drive every
// derived style (border / accent / text / chevron) from one value.
export const SECTION_COLORS = [
  '#FF6F20',   // כתום — צבע המותג
  '#1E3A5F',   // נייבי כהה
  '#22c55e',   // ירוק
  '#FF6F20CC', // כתום שקוף (גוון שני)
  '#0EA5E9',   // תכלת
  '#F59E0B',   // זהב
  '#7C3AED',   // סגול
  '#EF4444',   // אדום
  '#0D9488',   // ירוק-כחול
  '#1E3A5F99', // נייבי בהיר
];

export function getSectionColor(index) {
  return SECTION_COLORS[index % SECTION_COLORS.length];
}

export async function setTraineeCanEdit(planId, canEdit) {
  const { error } = await supabase.from('training_plans').update({ trainee_can_edit: canEdit }).eq('id', planId);
  if (error) throw error;
}
