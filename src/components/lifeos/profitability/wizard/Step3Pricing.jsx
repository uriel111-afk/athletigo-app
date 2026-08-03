import React from 'react';
import NumberField from '../NumberField';
import QuantityStepper from '../QuantityStepper';
import { BRAND, COPY } from '../profitabilityConstants';
import { toNum } from '../profitabilityModel';
import { pairsOf } from './wizardDraft';

// One quantity stepper + one price field per audience × service pair.
export default function Step3Pricing({ value, onChange }) {
  const pricing = (value && value.pricing) || {};
  const pairs = pairsOf(value);

  const set = (key, field) => (v) =>
    onChange({
      ...value,
      pricing: { ...pricing, [key]: { ...(pricing[key] || {}), [field]: v } },
    });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {pairs.map(({ audience, service, key }) => {
        const cell = pricing[key] || {};
        return (
          <div
            key={key}
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
                gap: 6,
                marginBottom: 8,
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 800, color: BRAND.textPrimary }}>
                {audience}
              </span>
              <span style={{ fontSize: 13, color: BRAND.textSecondary }}>{service}</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={labelStyle}>{COPY.quantity}</div>
                <QuantityStepper
                  value={toNum(cell.qty)}
                  onChange={set(key, 'qty')}
                  ariaLabel={COPY.quantity}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={labelStyle}>{COPY.price}</div>
                <NumberField
                  value={toNum(cell.price)}
                  onChange={set(key, 'price')}
                  suffix={COPY.currency}
                  ariaLabel={COPY.price}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: BRAND.textSecondary,
  marginBottom: 4,
};
