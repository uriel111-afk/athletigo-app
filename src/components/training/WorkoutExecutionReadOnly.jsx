import React from 'react';
import WorkoutExecution from './WorkoutExecution';

// Thin wrapper — the active execution component already supports a
// `readOnly` mode that disables checkboxes, set inputs, notes, and the
// finish button, and skips the section / workout popups (popups only
// open from interactions that are blocked when readOnly).
export default function WorkoutExecutionReadOnly({ plan, execution, onBack }) {
  return (
    <WorkoutExecution
      plan={plan}
      execution={execution}
      readOnly
      onBack={onBack}
    />
  );
}
