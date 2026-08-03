import React from 'react';
import NumberField from './NumberField';
import { BRAND, CARD_SHADOW, COPY, DEFAULT_FACTORS, FACTOR_LABELS } from './profitabilityConstants';
import { applyFactors } from './profitabilityModel';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

function Tile({ label, children }) {
  return (
    <div
      style={{
        minWidth: 0,
        background: BRAND.cream,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.textSecondary, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// Four tiles in a two-column grid. Occupancy / collection / expenses are
// percent fields; net profit is read-only.
export default function FactorsPanel({ factors, gross = 0, onChange }) {
  const f = { ...DEFAULT_FACTORS, ...(factors || {}) };
  const net = applyFactors(gross, f);
  const set = (key) => (v) => onChange && onChange(key, v);

  return (
    <div
      style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 14,
        boxShadow: CARD_SHADOW,
        padding: 12,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
        }}
      >
        <Tile label={FACTOR_LABELS.occupancy}>
          <NumberField
            value={f.occupancy}
            onChange={set('occupancy')}
            suffix={COPY.percent}
            ariaLabel={FACTOR_LABELS.occupancy}
          />
        </Tile>

        <Tile label={FACTOR_LABELS.collection}>
          <NumberField
            value={f.collection}
            onChange={set('collection')}
            suffix={COPY.percent}
            ariaLabel={FACTOR_LABELS.collection}
          />
        </Tile>

        <Tile label={FACTOR_LABELS.expenses}>
          <NumberField
            value={f.expenses}
            onChange={set('expenses')}
            suffix={COPY.percent}
            ariaLabel={FACTOR_LABELS.expenses}
          />
        </Tile>

        <Tile label={FACTOR_LABELS.net}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: 44,
              boxSizing: 'border-box',
              padding: '0 10px',
              borderRadius: 10,
              background: BRAND.card,
              border: `1px solid ${BRAND.border}`,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: BRAND.success,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {COPY.currency}
              {fmt(net)}
            </span>
          </div>
        </Tile>
      </div>
    </div>
  );
}
