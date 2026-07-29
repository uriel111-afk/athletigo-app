import { supabase } from './supabaseClient';

export async function getPlanWithDetails(planId) {
  const { data: plan, error: pErr } = await supabase
    .from('training_plans').select('*')
    .eq('id', planId).neq('status', 'deleted').single();
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
    .eq('id', planId).neq('status', 'deleted').single();
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

// ── Plan duplication — the ONLY implementation in the app ────────────
// Every "שכפל" / "העתק לתלמיד" entry point routes here. Three call
// sites used to do their own `insert({ ...rest })` shallow copy, which
// produced a plan row with ZERO sections and ZERO exercises that was
// otherwise byte-identical to its source (same assigned_to, coach_id,
// created_by, parent_plan_id). That made the copy indistinguishable
// from the original in every list, which is how a coach came to delete
// the source believing it was the copy. See the 2026-07-29 incident.
//
// Invariants this function guarantees:
//   1. DEEP — a new training_sections row per source section and a new
//      exercises row per source exercise. Every id is freshly minted by
//      the DB; no source uuid is ever reused in the copy.
//   2. IDENTIFIABLE — parent_plan_id is ALWAYS set (source's own parent
//      when the source is itself a copy, else the source id). A copy can
//      never inherit a null parent_plan_id, so the עותק badge always
//      renders and the delete confirmation always knows what it is.
//   3. NON-DESTRUCTIVE — reads the source, writes only new rows. Nothing
//      in this function updates or deletes anything keyed to the source.
//
// Exercises are fetched by training_plan_id (the live link, always
// populated) rather than through the section list, so an exercise whose
// training_section_id is null still lands in the copy and the source /
// copy exercise counts always match.
export async function duplicatePlan(sourcePlanId, options = {}) {
  const {
    traineeId,          // undefined → keep the source's assignee
    traineeName,        // optional display name for the new assignee
    nameSuffix = ' (עותק)',
  } = options;

  const { data: source, error: sErr } = await supabase
    .from('training_plans').select('*')
    .eq('id', sourcePlanId).neq('status', 'deleted').single();
  if (sErr) throw sErr;

  const [{ data: srcSections }, { data: srcExercises }] = await Promise.all([
    supabase.from('training_sections').select('*')
      .eq('training_plan_id', sourcePlanId).order('order', { ascending: true }),
    supabase.from('exercises').select('*')
      .eq('training_plan_id', sourcePlanId).order('order', { ascending: true }),
  ]);

  // Invariant 2 — a copy is ALWAYS attributable to a root plan.
  const rootId = source.parent_plan_id || source.id;

  const {
    id: _srcId, created_at: _sc, updated_at: _su,
    best_score: _sb, execution_count: _se, ...rest
  } = source;

  const baseName = source.plan_name || source.title || 'תוכנית';
  const { data: newPlan, error: pErr } = await supabase
    .from('training_plans')
    .insert({
      ...rest,
      parent_plan_id: rootId,
      assigned_to: traineeId ?? source.assigned_to ?? null,
      assigned_to_name: traineeId
        ? (traineeName ?? null)
        : (source.assigned_to_name ?? null),
      plan_name: baseName + nameSuffix,
      title: (source.title || baseName) + nameSuffix,
      best_score: null,
      execution_count: 0,
    })
    .select().single();
  if (pErr) throw pErr;

  // Explicit oldSectionId → newSectionId map. Never reuse a source uuid.
  const sectionIdMap = new Map();
  for (const sec of srcSections || []) {
    const { id: oldSecId, training_plan_id: _stp, created_at: _sca, ...secRest } = sec;
    const { data: newSec, error: secErr } = await supabase
      .from('training_sections')
      .insert({ ...secRest, training_plan_id: newPlan.id })
      .select().single();
    if (secErr) throw secErr;
    sectionIdMap.set(oldSecId, newSec.id);
  }

  for (const ex of srcExercises || []) {
    const {
      id: srcExId, training_section_id: oldSecId, training_plan_id: _etp,
      created_at: _eca, completed: _ec, source_exercise_id: srcLink, ...exRest
    } = ex;
    const { error: exErr } = await supabase.from('exercises').insert({
      ...exRest,
      training_plan_id: newPlan.id,
      training_section_id: oldSecId ? (sectionIdMap.get(oldSecId) ?? null) : null,
      // Always point at the FAMILY ROOT, never at the intermediate copy
      // we happen to be duplicating. If the source is itself a copy it
      // already carries the root id — inherit it. Otherwise the source
      // IS the root. So alpha -> A -> B all resolve to the alpha id.
      source_exercise_id: srcLink ?? srcExId,
      // `completed` is deliberately NOT written. Per-execution
      // completion lives in exercise_executions.is_completed, keyed by
      // workout_execution_id — the column on `exercises` is global
      // across every trainee and every run, so it is never authored.
    });
    if (exErr) throw exErr;
  }

  return newPlan;
}

// ── Soft delete ──────────────────────────────────────────────────────
// The ONLY way a plan is removed. Flips status to 'deleted' on that one
// row and touches nothing else — no cascade into training_sections,
// exercises or workout_executions. Every list read filters the value
// OUT with .neq('status','deleted') rather than filtering an active
// value IN, because statuses are mixed Hebrew and English.
//
// There is no deleted_at column on training_plans; do not add one to
// this payload — the write is silently dropped.
export async function softDeletePlan(planId) {
  const { error } = await supabase
    .from('training_plans').update({ status: 'deleted' }).eq('id', planId);
  if (error) throw error;
}

// Does any live plan point at this one as its parent?
export async function planHasCopies(planId) {
  const { data, error } = await supabase
    .from('training_plans').select('id')
    .eq('parent_plan_id', planId).neq('status', 'deleted').limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

// Delete confirmation text. Copies and originals-with-copies get an
// explicit reassurance about what is NOT affected. No variant claims
// the action is irreversible — soft delete is recoverable.
export async function buildPlanDeleteMessage(plan) {
  const name = plan?.plan_name || plan?.title || '';
  if (plan?.parent_plan_id) {
    return 'למחוק את העותק בלבד? תוכנית המקור לא תושפע.';
  }
  if (plan?.id && await planHasCopies(plan.id)) {
    return 'לתוכנית הזאת יש עותקים. מחיקה שלה לא תמחק אותם.';
  }
  return `למחוק את התוכנית "${name}"?`;
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
