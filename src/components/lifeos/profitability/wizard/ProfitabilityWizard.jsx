import React, { useState } from 'react';
import WizardShell from './WizardShell';
import Step1Audiences from './Step1Audiences';
import Step2Services from './Step2Services';
import Step3Pricing from './Step3Pricing';
import Step4Factors from './Step4Factors';
import Step5Summary from './Step5Summary';
import { draftToScenario, emptyDraft, pairsOf } from './wizardDraft';
import { COPY, WIZARD_STEP_TITLES } from '../profitabilityConstants';

// Composes the shell with the five steps and emits ONE complete scenario
// object — `{ items, factors }` in the exact shape stored in
// `calculator_data.data`.
export default function ProfitabilityWizard({ onComplete, onCancel }) {
  const [draft, setDraft] = useState(emptyDraft);

  const finish = () => {
    if (typeof onComplete === 'function') onComplete(draftToScenario(draft));
  };

  const steps = [
    {
      title: WIZARD_STEP_TITLES[0],
      hint: COPY.step1Hint,
      isValid: (v) => ((v && v.audiences) || []).length > 0,
      render: (v, onChange) => <Step1Audiences value={v} onChange={onChange} />,
    },
    {
      title: WIZARD_STEP_TITLES[1],
      hint: COPY.step2Hint,
      isValid: (v) => pairsOf(v).length > 0,
      render: (v, onChange) => <Step2Services value={v} onChange={onChange} />,
    },
    {
      title: WIZARD_STEP_TITLES[2],
      hint: COPY.step3Hint,
      isValid: () => true,
      render: (v, onChange) => <Step3Pricing value={v} onChange={onChange} />,
    },
    {
      title: WIZARD_STEP_TITLES[3],
      hint: COPY.step4Hint,
      isValid: () => true,
      render: (v, onChange) => <Step4Factors value={v} onChange={onChange} />,
    },
    {
      title: WIZARD_STEP_TITLES[4],
      hint: COPY.step5Hint,
      isValid: () => true,
      render: (v) => <Step5Summary value={v} onSave={finish} />,
    },
  ];

  return (
    <WizardShell
      steps={steps}
      value={draft}
      onChange={setDraft}
      onFinish={finish}
      onCancel={onCancel}
    />
  );
}
