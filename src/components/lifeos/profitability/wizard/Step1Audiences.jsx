import React from 'react';
import { AUDIENCE_OPTIONS, BRAND } from '../profitabilityConstants';

export function Chip({ label, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 44,
        padding: '0 14px',
        borderRadius: 22,
        border: `1px solid ${on ? BRAND.orange : BRAND.border}`,
        background: on ? BRAND.selected : BRAND.card,
        color: on ? BRAND.orange : BRAND.textSecondary,
        fontSize: 15,
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// Multi-select chips of audiences. At least one is required (validity is
// declared by the wizard composer, not here).
export default function Step1Audiences({ value, onChange }) {
  const selected = (value && value.audiences) || [];

  const toggle = (label) => {
    const next = selected.includes(label)
      ? selected.filter((a) => a !== label)
      : [...selected, label];

    // dropping an audience drops its services + pricing with it
    const services = { ...((value && value.services) || {}) };
    if (!next.includes(label)) delete services[label];

    onChange({ ...value, audiences: next, services });
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {AUDIENCE_OPTIONS.map((label) => (
        <Chip key={label} label={label} on={selected.includes(label)} onClick={() => toggle(label)} />
      ))}
    </div>
  );
}
