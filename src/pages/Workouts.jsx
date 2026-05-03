import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageLoader from '@/components/PageLoader';
import PermGate from '@/components/PermGate';
import WorkoutFolder from '@/components/training/WorkoutFolder';
import WorkoutExecution from '@/components/training/WorkoutExecution';
import WorkoutExecutionReadOnly from '@/components/training/WorkoutExecutionReadOnly';
import { getPlansForTrainee, getPlanWithDetails } from '@/lib/plansApi';
import { getExecutionsForPlan } from '@/lib/workoutExecutionApi';

export function WorkoutsInner({ showHeader = true } = {}) {
  const queryClient = useQueryClient();
  const [view, setView] = useState({ mode: 'list' }); // 'list' | 'execute' | 'review'

  const { data: user } = useQuery({
    queryKey: ['current-user-workouts'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const traineeId = user?.id;

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

  const handleStart = (plan) => {
    const detailed = planDetails[plan.id] || plan;
    setView({ mode: 'execute', plan: detailed });
  };

  const handleReview = (plan) => (exec) => {
    const detailed = planDetails[plan.id] || plan;
    setView({ mode: 'review', plan: detailed, executionId: exec.id });
  };

  const handleBack = () => setView({ mode: 'list' });

  const handleCompleted = () => {
    queryClient.invalidateQueries({ queryKey: ['workouts-executions'] });
    queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
    setView({ mode: 'list' });
  };

  if (plansLoading) return <PageLoader />;

  if (view.mode === 'execute') {
    return (
      <WorkoutExecution
        plan={view.plan}
        traineeId={traineeId}
        onBack={handleBack}
        onCompleted={handleCompleted}
      />
    );
  }
  if (view.mode === 'review') {
    return (
      <WorkoutExecutionReadOnly
        plan={view.plan}
        executionId={view.executionId}
        onBack={handleBack}
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
          visiblePlans.map((plan) => {
            const detailed = planDetails[plan.id];
            const sections = detailed?.sections || [];
            const exCount = sections.reduce((s, sec) => s + (sec.exercises?.length || 0), 0);
            return (
              <WorkoutFolder
                key={plan.id}
                plan={plan}
                sectionsCount={sections.length}
                exercisesCount={exCount}
                executions={executionsByPlan[plan.id] || []}
                onStart={handleStart}
                onReview={handleReview(detailed || plan)}
              />
            );
          })
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
