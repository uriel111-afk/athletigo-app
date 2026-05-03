import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageLoader from '@/components/PageLoader';
import PermGate from '@/components/PermGate';
import WorkoutFolder from '@/components/training/WorkoutFolder';
import WorkoutFolderDetail from '@/components/training/WorkoutFolderDetail';
import { getPlansForTrainee, getPlanWithDetails } from '@/lib/plansApi';
import { getExecutionsForPlan } from '@/lib/workoutExecutionApi';

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
  const [view, setView] = useState('list');
  const [selectedPlan, setSelectedPlan] = useState(null);

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

  const handleSelect = (plan) => {
    setSelectedPlan(plan);
    setView('folder');
  };

  const handleBack = () => {
    setView('list');
    setSelectedPlan(null);
  };

  // Folder calls this whenever a workout finishes inside it (the user
  // navigates back from UnifiedPlanBuilder). We invalidate queries so
  // the new execution shows up in the list and the graph immediately.
  const handleWorkoutFinished = () => {
    queryClient.invalidateQueries({ queryKey: ['workouts-executions'] });
    queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
  };

  if (plansLoading) return <PageLoader />;

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
            {visiblePlans.map((plan, i) => {
              const detailed = planDetails[plan.id];
              const sections = detailed?.sections || [];
              const exCount = sections.reduce((s, sec) => s + (sec.exercises?.length || 0), 0);
              return (
                <React.Fragment key={plan.id}>
                  <WorkoutFolder
                    plan={detailed || plan}
                    sectionsCount={sections.length}
                    exercisesCount={exCount}
                    executions={executionsByPlan[plan.id] || []}
                    onSelect={handleSelect}
                  />
                  {i < visiblePlans.length - 1 && (
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
