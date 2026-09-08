import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageLoader from '@/components/PageLoader';
import PermGate from '@/components/PermGate';
import WorkoutFolder from '@/components/training/WorkoutFolder';
import WorkoutFolderDetail from '@/components/training/WorkoutFolderDetail';
import PlanFamilyDetail from '@/components/training/PlanFamilyDetail';
import { readOpenWorkout, writeOpenWorkout, clearOpenWorkout } from '@/lib/workoutResume';
import UnifiedPlanBuilder from '@/components/training/UnifiedPlanBuilder';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { getPlansForTrainee, getPlanWithDetails, softDeletePlan, buildPlanDeleteMessage, groupPlansIntoFamilies, getFamilyProgress } from '@/lib/plansApi';
import { getExecutionsForPlan, createDuplicatedExecution } from '@/lib/workoutExecutionApi';

// Persist the (view, openPlanId) tuple in sessionStorage so a reload
// drops the trainee back on the same plan folder they were just
// reading instead of bouncing them to the list. sessionStorage (not
// the URL) is deliberate: a previous attempt at URL-backed state via
// useSearchParams crashed the mobile card-tap path through the
// ErrorBoundary (reverted in 9585fd0). sessionStorage doesn't touch
// router or card rendering at all.
//
// All read/write/remove calls are wrapped in try/catch — private mode,
// quota errors, or environments without window.sessionStorage all
// silently fall back to the previous "no persistence" behaviour.
const NAV_STORAGE_KEY = 'athletigo_workouts_nav';

function readNavStorage() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeNavStorage(value) {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (value == null) {
      window.sessionStorage.removeItem(NAV_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    // No-op: private mode / quota / blocked storage. The trainee just
    // loses persistence for this session; no UI degradation.
  }
}

// Optional props:
//   traineeId — when set, the folder list belongs to this user (the
//               coach is viewing somebody else's plans). Defaults to
//               the currently-logged-in user, which is the normal
//               trainee-viewing-own-plans flow.
//   isCoach   — overrides role detection. Pass `true` when the caller
//               knows the viewer is a coach (e.g. TraineeProfile).
//               Defaults to deriving from the current user.
export function WorkoutsInner({
  showHeader = true,
  traineeId: traineeIdProp = null,
  isCoach: isCoachProp = null,
} = {}) {
  const queryClient = useQueryClient();
  // Lazy-init both from sessionStorage so a reload restores immediately
  // on first render — no flash of the list before the folder mounts.
  // selectedPlan starts as a minimal { id } placeholder until plans
  // load; the existing planDetails[selectedPlan.id] || selectedPlan
  // fallback inside the folder render handles the gap.
  // readNavStorage is sessionStorage, which dies with the browsing
  // context — precisely what happens when Android reclaims the WebView
  // after the screen goes off. readOpenWorkout is the localStorage
  // pointer that survives that, so it is consulted first and the
  // session copy is kept only as a same-session fallback.
  const [view, setView] = useState(() => {
    const open = readOpenWorkout();
    if (open?.planId) return 'folder';
    const stored = readNavStorage();
    return stored?.view === 'folder' && stored?.planId ? 'folder' : 'list';
  });
  const [selectedPlan, setSelectedPlan] = useState(() => {
    const open = readOpenWorkout();
    if (open?.planId) return { id: open.planId };
    const stored = readNavStorage();
    return stored?.view === 'folder' && stored?.planId
      ? { id: stored.planId }
      : null;
  });
  // Coach-only plan editing surface. When set, replaces every other
  // view with a full-screen UnifiedPlanBuilder mounted with
  // canEdit=true / isCoach=true. Both the list-card edit chip and the
  // master-card "ערוך תוכנית" button route through this state.
  const [editingPlan, setEditingPlan] = useState(null);
  // Which FAMILY folder is open, by root id. Null on the list.
  const [openFamilyId, setOpenFamilyId] = useState(null);

  const { data: currentUser } = useQuery({
    queryKey: ['current-user-workouts'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const traineeId = traineeIdProp || currentUser?.id;
  const isCoach = isCoachProp != null
    ? isCoachProp
    : (currentUser?.role === 'coach' || currentUser?.is_coach === true || currentUser?.role === 'admin');

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['workouts-plans', traineeId],
    queryFn: () => getPlansForTrainee(traineeId),
    enabled: !!traineeId,
  });

  const { data: planDetails = {}, isLoading: detailsLoading } = useQuery({
    queryKey: ['workouts-plan-details', plans.map((p) => p.id).join(',')],
    queryFn: async () => {
      const result = {};
      for (const p of plans) {
        try {
          result[p.id] = await getPlanWithDetails(p.id);
        } catch {
          result[p.id] = { ...p, sections: [] };
        }
      }
      return result;
    },
    enabled: plans.length > 0,
  });

  const { data: executionsByPlan = {}, isLoading: execLoading } = useQuery({
    queryKey: ['workouts-executions', traineeId, plans.map((p) => p.id).join(',')],
    queryFn: async () => {
      const result = {};
      for (const p of plans) {
        try {
          result[p.id] = await getExecutionsForPlan(p.id, traineeId);
        } catch {
          result[p.id] = [];
        }
      }
      return result;
    },
    enabled: plans.length > 0 && !!traineeId,
  });

  // The list groups by FAMILY: the coach's original is the folder, its
  // duplicates are the performances inside it. Purely client-side —
  // parent_plan_id already points every copy at the root, so no extra
  // query and no schema change.
  const visibleForFamilies = (plans || []).filter(
    (p) => p && p.status !== 'deleted' && !p.deleted_at,
  );
  const families = React.useMemo(
    () => groupPlansIntoFamilies(visibleForFamilies),
    // Keyed on the ids and their parents, so the fold reruns only
    // when the family shape actually changes — not on every refetch
    // that returns an equal-but-new array.
    [visibleForFamilies.map((p) => `${p.id}:${p.parent_plan_id || ''}`).join(',')],
  );
  const openFamily = openFamilyId
    ? families.find((f) => f.rootId === openFamilyId) || null
    : null;

  // The progress cue for the OPEN folder only — two queries for the
  // whole family, and nothing at all while the list is showing.
  const { data: familyProgress = {} } = useQuery({
    queryKey: ['family-progress', openFamilyId, traineeId,
      openFamily?.performances.map((p) => p.id).join(',')],
    queryFn: () => getFamilyProgress(openFamily.performances.map((p) => p.id), traineeId),
    enabled: !!openFamily && !!traineeId,
  });

  const handleSelectFamily = (family) => {
    setOpenFamilyId(family.rootId);
    setView('family');
  };

  const handleSelect = (plan) => {
    setSelectedPlan(plan);
    setView('folder');
  };

  const handleEditPlan = (plan) => {
    if (!plan) return;
    const detailed = planDetails[plan.id] || plan;
    setEditingPlan(detailed);
  };

  const handleEditDone = () => {
    setEditingPlan(null);
    // Refresh the list so any edits show up in the folder details +
    // exercise counts immediately.
    queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
    queryClient.invalidateQueries({ queryKey: ['workouts-plan-details'] });
    toast.success('התוכנית עודכנה בהצלחה ✅');
  };

  const handleDuplicateExecution = async (plan) => {
    console.log('[handleDuplicateExecution] entry', { planId: plan?.id, traineeId, isCoach });
    // Never fail silently: surface the reason instead of a bare `return`.
    if (!plan?.id) {
      console.warn('[handleDuplicateExecution] aborted — missing plan id');
      toast.error('לא נמצאה תוכנית לשכפול');
      return;
    }
    if (!traineeId) {
      console.warn('[handleDuplicateExecution] aborted — missing traineeId');
      toast.error('לא נמצא מתאמן פעיל — רענן את הדף ונסה שוב');
      return;
    }
    try {
      const created = await createDuplicatedExecution({
        planId: plan.id,
        traineeId,
        note: isCoach ? 'שוכפל על ידי המאמן' : 'שוכפל על ידי המתאמן',
      });
      console.log('[handleDuplicateExecution] created execution', created);
      toast.success('האימון שוכפל ✅');
      // Refresh the executions list (prefix match invalidates the
      // keyed ['workouts-executions', traineeId, ...] query) so the new
      // blank execution shows up immediately.
      queryClient.invalidateQueries({ queryKey: ['workouts-executions'] });
    } catch (e) {
      console.error('[handleDuplicateExecution] failed', e);
      toast.error('שכפול האימון נכשל: ' + (e?.message || 'נסה שוב'));
    }
  };

  // Coach-only: SOFT-delete the plan. One status flip on one row —
  // no cascade into exercises, training_sections or workout_executions.
  const handleDeletePlan = async (plan) => {
    if (!plan?.id) return;
    const message = await buildPlanDeleteMessage(plan);
    if (!window.confirm(message)) return;
    try {
      await softDeletePlan(plan.id);
      toast.success('התוכנית נמחקה ✅');
      queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-plan-details'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-executions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
    } catch (e) {
      console.error('[Workouts] delete plan failed:', e);
      toast.error('מחיקה נכשלה: ' + (e?.message || 'נסה שוב'));
    }
  };

  // Coach-only: delete a single past execution + its set logs.
  const handleDeleteExecution = async (execution) => {
    if (!execution?.id) return;
    if (!window.confirm('למחוק ביצוע זה לצמיתות?')) return;
    try {
      await supabase.from('exercise_set_logs').delete().eq('execution_id', execution.id);
      const { error } = await supabase.from('workout_executions').delete().eq('id', execution.id);
      if (error) throw error;
      toast.success('הביצוע נמחק ✅');
      queryClient.invalidateQueries({ queryKey: ['workouts-executions'] });
    } catch (e) {
      console.error('[Workouts] delete execution failed:', e);
      toast.error('מחיקה נכשלה: ' + (e?.message || 'נסה שוב'));
    }
  };

  const handleBack = () => {
    // Out of a performance, back to the folder it lives in — not all
    // the way to the list. Falls through to the list when the family
    // is unknown (a restored sessionStorage planId, say).
    const root = selectedPlan?.parent_plan_id || selectedPlan?.id;
    const family = root ? families.find((f) => f.rootId === root) : null;
    setSelectedPlan(null);
    if (family) { setOpenFamilyId(family.rootId); setView('family'); return; }
    setOpenFamilyId(null);
    setView('list');
  };

  const handleBackToList = () => {
    setOpenFamilyId(null);
    setSelectedPlan(null);
    setView('list');
  };

  // Persist (view, planId) every time the user navigates between the
  // list and a folder. The effect also clears storage on transitions
  // back to the list so a stale planId never resurrects after the
  // trainee has explicitly left a folder.
  useEffect(() => {
    if (view === 'folder' && selectedPlan?.id) {
      writeNavStorage({ view: 'folder', planId: selectedPlan.id });
      // Coach browsing a trainee's plans is not "in a workout" and must
      // not be dragged back into one on the next launch.
      if (!isCoach) {
        const open = readOpenWorkout();
        // Preserve the sheet-open flag the folder itself maintains;
        // this effect only records WHICH plan.
        writeOpenWorkout(selectedPlan.id, open?.planId === selectedPlan.id ? open.active : false);
      }
    } else {
      writeNavStorage(null);
      if (!isCoach) clearOpenWorkout();
    }
  }, [view, selectedPlan?.id, isCoach]);

  // Once plans have finished loading, validate the restored planId. If
  // the trainee no longer has that plan assigned (deleted, unshared,
  // role change) we drop back to the list silently — no error, no
  // crash, no orphaned folder header.
  useEffect(() => {
    if (plansLoading) return;
    if (view !== 'folder' || !selectedPlan?.id) return;
    const exists = (plans || []).some((p) => p.id === selectedPlan.id);
    if (!exists) {
      setView('list');
      setSelectedPlan(null);
    }
  }, [plansLoading, plans, view, selectedPlan?.id]);

  // Folder calls this whenever a workout finishes inside it (the user
  // navigates back from UnifiedPlanBuilder). We invalidate queries so
  // the new execution shows up in the list and the graph immediately.
  const handleWorkoutFinished = () => {
    queryClient.invalidateQueries({ queryKey: ['workouts-executions'] });
    queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
  };

  if (plansLoading) return <PageLoader />;

  // Editing takes precedence over folder/list views — when a coach
  // taps either the folder-card "עריכה" chip or the master-card
  // "ערוך תוכנית" button, we replace the screen entirely.
  if (editingPlan) {
    return (
      <UnifiedPlanBuilder
        plan={editingPlan}
        canEdit={true}
        isCoach={true}
        onBack={handleEditDone}
      />
    );
  }

  if (view === 'family' && openFamily) {
    return (
      <PlanFamilyDetail
        family={openFamily}
        progress={familyProgress}
        isCoach={isCoach}
        onBack={handleBackToList}
        onOpenPerformance={handleSelect}
        onCreated={(created) => {
          queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
          queryClient.invalidateQueries({ queryKey: ['workouts-plan-details'] });
          // Straight into the new performance, the same move the plan
          // sheet's own אימון חדש makes.
          handleSelect(created);
        }}
      />
    );
  }

  if (view === 'folder' && selectedPlan) {
    const detailed = planDetails[selectedPlan.id] || selectedPlan;
    const sections = detailed?.sections || [];
    const exCount = sections.reduce((s, sec) => s + (sec.exercises?.length || 0), 0);
    return (
      <WorkoutFolderDetail
        plan={detailed}
        sectionsCount={sections.length}
        exercisesCount={exCount}
        executions={executionsByPlan[selectedPlan.id] || []}
        isCoach={isCoach}
        onBack={handleBack}
        onWorkoutFinished={handleWorkoutFinished}
        onEditPlan={handleEditPlan}
        onDuplicateExecution={handleDuplicateExecution}
        onDeleteExecution={handleDeleteExecution}
      />
    );
  }

  const visiblePlans = (plans || []).filter((p) => p && p.status !== 'deleted' && !p.deleted_at);
  const detailsReady = !detailsLoading && Object.keys(planDetails).length === visiblePlans.length;

  return (
    <div dir="rtl" style={{ minHeight: showHeader ? '100vh' : 'auto', background: showHeader ? '#FAFAFA' : 'transparent', paddingBottom: showHeader ? 80 : 0 }}>
      {showHeader && (
        <div style={{ padding: '16px 14px 8px', background: 'white', borderBottom: '1px solid #EEE' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#1a1a1a' }}>אימונים</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            תיקיית האימונים שלך — כל תוכנית היא תיקייה עם היסטוריית ביצועים
          </div>
        </div>
      )}
      <div style={{ padding: showHeader ? '14px' : '0' }}>
        {visiblePlans.length === 0 ? (
          <div style={{
            padding: 24, background: 'white', borderRadius: 16,
            border: '1px dashed #DDD', textAlign: 'center', color: '#888',
          }}>
            עדיין אין לך תוכניות. המאמן יקצה לך כשהוא מוכן.
          </div>
        ) : !detailsReady ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#FF6F20', display: 'inline-block' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* One card per FAMILY. The root's title, how many
                performances it has, and when the latest one was made.
                A plan with no duplicates is a family of one. */}
            {families.map((family, i) => {
              const rootPlan = family.root;
              const detailed = planDetails[rootPlan.id];
              const sections = detailed?.sections || [];
              const exCount = sections.reduce((s, sec) => s + (sec.exercises?.length || 0), 0);
              return (
                <React.Fragment key={family.rootId}>
                  <WorkoutFolder
                    plan={detailed || rootPlan}
                    sectionsCount={sections.length}
                    exercisesCount={exCount}
                    performanceCount={family.count}
                    lastPerformedAt={family.latest}
                    isCoach={isCoach}
                    onSelect={() => handleSelectFamily(family)}
                    onEdit={handleEditPlan}
                    onDelete={handleDeletePlan}
                  />
                  {i < families.length - 1 && (
                    <div style={{ height: 1, background: '#EEE', margin: '0 8px' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {execLoading && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 14px',
          borderRadius: 999, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <Loader2 className="w-4 h-4 animate-spin" /> טוען...
        </div>
      )}
    </div>
  );
}

export default function Workouts() {
  return (
    <PermGate permission="view_training_plan" label="אימונים">
      <WorkoutsInner />
    </PermGate>
  );
}
