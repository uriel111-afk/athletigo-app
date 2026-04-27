import React from "react";

// Casual-onboarding progress indicator — single source of truth for
// the four-step trainee flow. Mounted at the top of every onboarding
// surface so the trainee always sees how far along they are:
//   1. פרטים           (Onboarding.jsx step 1)
//   2. היכרות          (Onboarding.jsx step 2 — the questionnaire)
//   3. הצהרת בריאות    (HealthDeclarationForm dialog)
//   4. תשלום ואישור    (TraineeHome banner once health is signed)
//
// The questionnaire keeps its own internal 4-dot indicator for its
// sub-screens; this bar represents the *outer* progress.

export const ONBOARDING_STEPS = [
  { id: 'details',       label: 'פרטים' },
  { id: 'questionnaire', label: 'היכרות' },
  { id: 'pre_health',    label: 'בריאות' },
  { id: 'health',        label: 'הצהרה' },
  { id: 'payment',       label: 'אישור' },
];

export default function OnboardingProgressBar({ currentStep }) {
  const stepIndex = Math.max(0, ONBOARDING_STEPS.findIndex(s => s.id === currentStep));
  const progressPct = ((stepIndex + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div style={{ padding: '12px 16px', fontFamily: "'Barlow', 'Heebo', 'Assistant', sans-serif" }} dir="rtl">
      <div style={{
        height: 4, background: '#F0E4D0', borderRadius: 2,
        overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{
          height: '100%', background: '#FF6F20',
          width: `${progressPct}%`, borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {ONBOARDING_STEPS.map((step, i) => {
          const reached = i <= stepIndex;
          const done = i < stepIndex;
          return (
            <div key={step.id} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                margin: '0 auto 4px',
                background: reached ? '#FF6F20' : '#F0E4D0',
                color: reached ? '#FFFFFF' : '#888',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600,
                transition: 'background 0.25s ease',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{
                fontSize: 10,
                color: reached ? '#FF6F20' : '#888',
                fontWeight: reached ? 600 : 500,
              }}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
