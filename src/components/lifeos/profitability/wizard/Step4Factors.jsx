import React from 'react';
import FactorsPanel from '../FactorsPanel';
import { DEFAULT_FACTORS } from '../profitabilityConstants';
import { grandTotalMonthly } from '../profitabilityModel';
import { draftToScenario } from './wizardDraft';

export default function Step4Factors({ value, onChange }) {
  const factors = { ...DEFAULT_FACTORS, ...((value && value.factors) || {}) };
  const gross = grandTotalMonthly(draftToScenario(value));

  return (
    <FactorsPanel
      factors={factors}
      gross={gross}
      onChange={(key, v) => onChange({ ...value, factors: { ...factors, [key]: v } })}
    />
  );
}
