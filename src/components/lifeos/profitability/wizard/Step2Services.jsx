import React from 'react';
import { Chip } from './Step1Audiences';
import { BRAND, SERVICE_OPTIONS } from '../profitabilityConstants';

// Multi-select chips of services, per selected audience.
export default function Step2Services({ value, onChange }) {
  const audiences = (value && value.audiences) || [];
  const services = (value && value.services) || {};

  const toggle = (audience, label) => {
    const current = services[audience] || [];
    const next = current.includes(label)
      ? current.filter((s) => s !== label)
      : [...current, label];
    onChange({ ...value, services: { ...services, [audience]: next } });
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {audiences.map((audience) => (
        <div
          key={audience}
          style={{
            background: BRAND.cream,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 12,
            padding: 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: BRAND.textPrimary,
              marginBottom: 8,
            }}
          >
            {audience}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SERVICE_OPTIONS.map((svc) => (
              <Chip
                key={svc.label}
                label={svc.label}
                on={(services[audience] || []).includes(svc.label)}
                onClick={() => toggle(audience, svc.label)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
