import React from 'react';
import UnifiedPlanBuilder from './UnifiedPlanBuilder';

// Trainee active-workout view. UnifiedPlanBuilder is the same component
// the coach edits with — passing canEdit={false} and isCoach={false}
// hides every edit/add affordance and renders the trainee execution
// surface. The component already provides:
//   - collapsible section cards with the same UX coaches see
//   - exercise list with orange checkboxes (when isCoach=false)
//   - per-exercise notes input
//   - section completion popup ("סיימת סקשן! 🎯", white card,
//     orange 1–10 slider) wired to its own save flow
//   - workout completion popup ("סיימת את האימון! 🏆", dark theme,
//     score + stats grid) wired to saveWorkoutExecution()
//
// We keep this wrapper so Workouts.jsx and any future caller has a
// stable "WorkoutExecution" mount point — and to centralize the
// onBack ↔ onCompleted mapping (UnifiedPlanBuilder doesn't differentiate
// the two; both end on the user navigating back).
export default function WorkoutExecution({ plan, onBack, onCompleted }) {
  const handleBack = () => {
    if (onCompleted) onCompleted();
    else if (onBack) onBack();
  };
  return (
    <UnifiedPlanBuilder
      plan={plan}
      isCoach={false}
      canEdit={false}
      onBack={handleBack}
    />
  );
}
