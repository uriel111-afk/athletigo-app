import React from 'react';
import SummaryBar from '../SummaryBar';
import { BRAND, COPY } from '../profitabilityConstants';
import {
  categoryBreakdown,
  categoryTotal,
  grandTotalMonthly,
  grandTotalYearly,
  rowTotal,
} from '../profitabilityModel';
import { draftToScenario } from './wizardDraft';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

// Read-only review of what is about to be saved, plus its own save button
// (the shell footer offers the same action).
export default function Step5Summary({ value, onSave }) {
  const scenario = draftToScenario(value);

  return (
    <div style={{ minWidth: 0 }}>
      <SummaryBar
        monthly={grandTotalMonthly(scenario)}
        yearly={grandTotalYearly(scenario)}
        segments={categoryBreakdown(scenario)}
      />

      <div style={{ display: 'grid', gap: 8 }}>
        {scenario.items.map((category) => (
          <div
            key={category.id}
            style={{
              background: BRAND.cream,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 12,
              padding: 10,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 800, color: BRAND.textPrimary }}>
                {category.name}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: BRAND.orange }}>
                {COPY.currency}
                {fmt(categoryTotal(category))}
              </span>
            </div>

            {(category.lines || []).map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 13,
                  color: BRAND.textSecondary,
                  padding: '3px 0',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.name}
                </span>
                <span style={{ flexShrink: 0, fontWeight: 700, color: BRAND.textPrimary }}>
                  {COPY.currency}
                  {fmt(rowTotal(row))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onSave && onSave()}
        style={{
          width: '100%',
          minHeight: 44,
          marginTop: 12,
          borderRadius: 10,
          border: 'none',
          background: BRAND.orange,
          color: '#fff',
          fontSize: 16,
          fontWeight: 800,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        {COPY.wizardSave}
      </button>
    </div>
  );
}
